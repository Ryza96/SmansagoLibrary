import { BookRepository } from '../repositories/book.repository'
import { AppError } from '../errorHandler'
import type { BookListItemDTO, BookDetailDTO, CreateBookDTO, UpdateBookDTO } from '../../../src/shared/dto/book'

export class BookService {
  constructor(private repository: BookRepository) {}

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
      coverImage: null,
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

    const { authorIds, ...bookData } = input

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
}
