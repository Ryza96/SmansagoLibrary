import { promises as fsp } from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { BookRepository } from '../repositories/book.repository'
import { AppError } from '../errorHandler'
import type { BookListItemDTO, BookDetailDTO, CreateBookDTO, UpdateBookDTO } from '../../../src/shared/dto/book'
import {
  COVER_IMAGE_MIME,
  validateBookCoverFile,
} from '../../../src/main/infrastructure/asset/book-cover-config'
import { resizeBookCoverImage } from '../../../src/main/infrastructure/asset/book-cover-resize'
import { moveFilePreserving, resolveWithin } from '../../../src/main/infrastructure/restore/fs-utils'

// WO SAM: SAMPUL BUKU — gambar sampul buku diperluas pada BookService existing.
// Mengikuti pola RFC_LOGO_MANAGEMENT_ARCHITECTURE.md (LOCKED) yang sama dengan
// logo sekolah:
//   • ctor menerima assetBookCoversDir (direktori penyimpanan sampul);
//   • saveCover / removeCover — satu-satunya manipulasi file sampul;
//   • validasi & resize di main (download-only ≤ 512×512, contain);
//   • invariant: file sampul lama TIDAK dihapus sebelum DB commit; gagal di
//     tengah → rollback penuh (kondisi seperti sebelum replace);
//   • renderer TIDAK pernah menyentuh file; semua error via AppError(err.message).
// Path yang disimpan di DB = relatif ('assets/book-covers/<file>'), bukan absolut.

const COVER_ERROR_MESSAGES: Record<string, string> = {
  UNSUPPORTED_FORMAT: 'Format file tidak didukung. Gunakan PNG, JPG, JPEG, atau WEBP.',
  EMPTY: 'File sampul kosong.',
  TOO_LARGE: 'Ukuran file sampul melebihi 2 MB.',
}

export class BookService {
  constructor(
    private repository: BookRepository,
    private assetBookCoversDir: string
  ) {}

  async getAllBooks(): Promise<BookListItemDTO[]> {
    const books = await this.repository.findManyWithCount()
    return books.map((book) => ({
      id: book.id,
      title: book.title,
      isbn: book.isbn,
      categoryName: book.category?.name ?? null,
      publisherName: book.publisher?.name ?? null,
      publicationYear: book.publicationYear,
      copyCount: book._count.bookCopies
    }))
  }

  async getBookById(id: string): Promise<BookDetailDTO | null> {
    const book = await this.repository.findByIdWithDetails(id)
    if (!book) return null

    return {
      id: book.id,
      title: book.title,
      isbn: book.isbn,
      category: book.category,
      publisher: book.publisher,
      publicationYear: book.publicationYear,
      edition: null,
      language: null,
      pageCount: null,
      description: book.description,
      coverImage: book.coverImagePath,
      authors: book.author ? [book.author] : [],
      copies: book.bookCopies.map((c) => ({
        id: c.id,
        inventoryNumber: c.inventoryNumber,
        barcode: c.barcode,
        shelfLocation: c.shelfLocation,
        condition: c.condition,
        status: c.status,
        hasBorrowingHistory: c._count.borrowDetails > 0
      })),
      createdAt: book.createdAt.toISOString(),
      updatedAt: book.updatedAt.toISOString()
    }
  }

  async createBook(input: CreateBookDTO): Promise<BookDetailDTO> {
    if (input.isbn) {
      const exists = await this.repository.existsByIsbn(input.isbn)
      if (exists) {
        throw new AppError(409, 'Duplicate', `ISBN ${input.isbn} sudah digunakan oleh buku lain.`)
      }
    }

    const book = await this.repository.createWithAuthors({
      title: input.title,
      isbn: input.isbn,
      categoryId: input.categoryId,
      publisherId: input.publisherId,
      publicationYear: input.publicationYear,
      description: input.description,
      authorIds: input.authorIds
    })

    // WO SAM — simpan sampul (jika dipilih pada form) setelah buku dibuat.
    if (typeof input.coverUpload === 'string' && input.coverUpload.length > 0) {
      await this.saveCover(book.id, input.coverUpload)
    }

    return (await this.getBookById(book.id))!
  }

  async updateBook(id: string, input: UpdateBookDTO): Promise<BookDetailDTO | null> {
    const existing = await this.repository.findById(id)
    if (!existing) return null

    if (input.isbn) {
      const duplicate = await this.repository.existsByIsbn(input.isbn, id)
      if (duplicate) {
        throw new AppError(409, 'Duplicate', `ISBN ${input.isbn} sudah digunakan oleh buku lain.`)
      }
    }

    const { authorIds, coverUpload, ...bookData } = input

    const updateData: Record<string, unknown> = {}
    if (bookData.title !== undefined) updateData.title = bookData.title
    if (bookData.isbn !== undefined) updateData.isbn = bookData.isbn
    if (bookData.categoryId !== undefined) updateData.categoryId = bookData.categoryId
    if (bookData.publisherId !== undefined) updateData.publisherId = bookData.publisherId
    if (bookData.publicationYear !== undefined) updateData.publicationYear = bookData.publicationYear
    if (bookData.description !== undefined) updateData.description = bookData.description

    if (authorIds !== undefined) {
      await this.repository.replaceAuthors(id, authorIds)
    }

    await this.repository.updateBook(id, updateData as any)

    // WO SAM — ganti sampul (jika dipilih pada form edit).
    if (typeof coverUpload === 'string' && coverUpload.length > 0) {
      await this.saveCover(id, coverUpload)
    }

    return this.getBookById(id)
  }

  async deleteBook(id: string): Promise<boolean> {
    const existing = await this.repository.findById(id)
    if (!existing) return false

    const copyCount = await this.repository.countCopies(id)
    if (copyCount > 0) {
      throw new AppError(
        400,
        'Validation Error',
        `Buku tidak dapat dihapus karena masih memiliki ${copyCount} eksemplar.`
      )
    }

    await this.repository.deleteWithAuthors(id)
    return true
  }

  // WO SAM — preview hasil dialog pilih file sampul (main-side), pola
  // SettingService.pickLogoPreview: validasi → resize → data URI untuk renderer.
  async pickCoverPreview(filePath: string): Promise<{
    filePath: string
    sizeBytes: number
    previewUri: string
  }> {
    const extension = path.extname(filePath).toLowerCase()
    const sizeBytes = (await fsp.stat(filePath)).size
    this.assertValidCover(extension, sizeBytes)
    const buffer = await this.resizeWithError(filePath)
    const mime = COVER_IMAGE_MIME[extension]
    const previewUri = `data:${mime};base64,${buffer.toString('base64')}`
    return { filePath, sizeBytes, previewUri }
  }

  // WO SAM — simpan sampul dengan pola atomic save logo (RFC §10):
  // validasi → resize → tulis temp → sisihkan target lama ke backup →
  // rename temp ke target → update DB → sukses: hapus backup + file lama.
  // Gagal di tengah → rollback penuh (disk & DB kembali ke keadaan sebelum save).
  async saveCover(bookId: string, sourcePath: string): Promise<void> {
    const extension = path.extname(sourcePath).toLowerCase()
    const sizeBytes = (await fsp.stat(sourcePath)).size
    this.assertValidCover(extension, sizeBytes)
    const buffer = await this.resizeWithError(sourcePath)

    const dir = this.assetBookCoversDir
    await fsp.mkdir(dir, { recursive: true })
    const targetName = `book-cover-${bookId}${extension}`
    const target = resolveWithin(dir, targetName)
    const temp = resolveWithin(dir, `.${targetName}.tmp-${randomUUID()}`)
    const oldBackup = resolveWithin(dir, `.${targetName}.old-${randomUUID()}`)
    const hadTarget = await this.pathExists(target)
    // Tangkap path sampul lama SEBELUM updateBook menimpa coverImagePath di DB
    // (file lama bisa beda ekstensi �?" book-cover-<id>.jpg vs .png). Bila dibaca
    // setelah update, nama lama === nama baru sehingga file lama tak pernah bersih.
    const existingBefore = await this.repository.findById(bookId)
    const previousCoverPath = existingBefore?.coverImagePath ?? null

    try {
      await fsp.writeFile(temp, buffer)
      if (hadTarget) {
        // replace di tempat (ext sama): sisihkan sampul lama agar tidak tertimpa
        // rename �?" backup inilah yang dipulihkan bila operasi gagal.
        await fsp.rename(target, oldBackup)
      }
      moveFilePreserving(temp, target)
      await this.repository.updateBook(bookId, { coverImagePath: `assets/book-covers/${targetName}` })
    } catch {
      // ROLLBACK — kembalikan ke keadaan sebelum save:
      //   hadTarget + backup ada → target = file baru → hapus, lalu pulihkan lama;
      //   hadTarget + backup tidak ada (rename sisih gagal) → target masih lama → jangan sentuh;
      //   !hadTarget → target (jika ada) = file baru → hapus.
      if (hadTarget) {
        if (await this.pathExists(oldBackup)) {
          await this.tryUnlink(target)
          try {
            await fsp.rename(oldBackup, target)
          } catch {
            // best-effort — backup dipertahankan (satu-satunya salinan sampul lama)
          }
        }
      } else {
        await this.tryUnlink(target)
      }
      await this.tryUnlink(temp)
      throw new AppError(500, 'CoverSaveError', 'Gagal menyimpan sampul buku.')
    }

    // SUCCESS — DB sudah menunjuk target: hapus backup (ext sama) + file sampul
    // lama yang tak terpakai (book-cover-* ext beda, ditangkap sebelum update).
    try {
      await this.tryUnlink(oldBackup)
      if (previousCoverPath) {
        const previousName = path.basename(previousCoverPath)
        if (previousName !== targetName) {
          await this.tryUnlink(resolveWithin(dir, previousName))
        }
      }
    } catch {
      // best-effort — sampul baru sudah tersimpan & DB sudah commit
    }
  }

  // WO SAM — hapus sampul buku. DB di-null-kan TERLEBIH DAHULU (commit sumber
  // kebenaran), lalu file dihapus best-effort.
  async removeCover(bookId: string): Promise<void> {
    const existing = await this.repository.findById(bookId)
    if (!existing) return
    if (!existing.coverImagePath) return

    await this.repository.updateBook(bookId, { coverImagePath: null })

    const dir = this.assetBookCoversDir
    const fileName = path.basename(existing.coverImagePath)
    try {
      await fsp.unlink(resolveWithin(dir, fileName))
    } catch {
      // best-effort — DB sudah commit; file mungkin sudah tidak ada
    }
  }

  // WO SAM — baca sampul sebagai data URI untuk renderer (detail buku).
  async getCoverDataUri(bookId: string): Promise<string | null> {
    const existing = await this.repository.findById(bookId)
    if (!existing || !existing.coverImagePath) return null

    const dir = this.assetBookCoversDir
    const fileName = path.basename(existing.coverImagePath)
    const extension = path.extname(fileName).toLowerCase()
    const buffer = await fsp.readFile(resolveWithin(dir, fileName))
    const mime = COVER_IMAGE_MIME[extension] ?? 'image/webp'
    return `data:${mime};base64,${buffer.toString('base64')}`
  }

  private assertValidCover(extension: string, sizeBytes: number): void {
    const error = validateBookCoverFile({ extension, sizeBytes })
    if (error) {
      throw new AppError(400, 'CoverValidationError', COVER_ERROR_MESSAGES[error])
    }
  }

  private async resizeWithError(sourcePath: string): Promise<Buffer> {
    try {
      return await resizeBookCoverImage(sourcePath)
    } catch {
      throw new AppError(400, 'CoverValidationError', 'File tidak dapat diproses sebagai gambar.')
    }
  }

  private async pathExists(filePath: string): Promise<boolean> {
    try {
      await fsp.access(filePath)
      return true
    } catch {
      return false
    }
  }

  private async tryUnlink(filePath: string): Promise<void> {
    try {
      await fsp.unlink(filePath)
    } catch {
      // best-effort
    }
  }
}
