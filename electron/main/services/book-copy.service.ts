import { prisma } from '../database'
import { AppError } from '../errorHandler'
import { BookCopyRepository } from '../repositories/book-copy.repository'
import { BookRepository } from '../repositories/book.repository'
import { BookCopyStatus } from '../shared/book-copy-status'
import { BookCopyCondition } from '../shared/book-copy-condition'
import { AssetEventRepository } from '../repositories/asset-event.repository'
import { AssetEventType } from '../shared/asset-event-type'
import { ActorType } from '../shared/actor-type'
import { InventoryAllocator } from './inventory-allocator'
import type { BookCopyDTO, CreateBookCopiesDTO } from '../../../src/shared/dto/book'
import crypto from 'crypto'

const VALID_CONDITIONS = [
  BookCopyCondition.GOOD,
  BookCopyCondition.LIGHT_DAMAGE,
  BookCopyCondition.HEAVY_DAMAGE
]

const VALID_ACQUISITION_SOURCES = ['PEMBELIAN', 'DONASI', 'HIBAH', 'BANTUAN_PEMERINTAH', 'LAINNYA']

export class BookCopyService {
  constructor(
    private repository: BookCopyRepository,
    private bookRepository: BookRepository,
    private allocator: InventoryAllocator,
    private eventRepo: AssetEventRepository
  ) {}

  async getBookCopyById(id: string) {
    const copy = await this.repository.findByIdWithBookDetails(id)
    if (!copy) {
      throw new AppError(404, 'Not Found', 'Eksemplar tidak ditemukan.')
    }
    return copy
  }

  async getCopiesByBookId(bookId: string): Promise<BookCopyDTO[]> {
    const copies = await this.repository.findManyByBookId(bookId)
    return copies.map((c) => ({
      id: c.id,
      inventoryNumber: c.inventoryNumber,
      barcode: c.barcode,
      shelfLocation: c.shelfLocation,
      condition: c.condition,
      status: c.status,
      hasBorrowingHistory: c._count.borrowDetails > 0
    }))
  }

  async addCopies(bookId: string, input: CreateBookCopiesDTO): Promise<BookCopyDTO[]> {
    const book = await this.bookRepository.findById(bookId)
    if (!book) {
      throw new AppError(404, 'Not Found', 'Buku tidak ditemukan.')
    }

    if (input.quantity < 1 || input.quantity > 100) {
      throw new AppError(400, 'Validation Error', 'Jumlah eksemplar harus antara 1 dan 100.')
    }

    if (!input.shelfLocation || !input.shelfLocation.trim()) {
      throw new AppError(400, 'Validation Error', 'Lokasi rak wajib diisi.')
    }

    const condition = input.condition ?? BookCopyCondition.GOOD
    if (!VALID_CONDITIONS.includes(condition as any)) {
      throw new AppError(400, 'Validation Error', `Kondisi "${condition}" tidak valid.`)
    }

    if (input.acquisitionCost !== undefined && input.acquisitionCost !== null) {
      if (!Number.isInteger(input.acquisitionCost) || input.acquisitionCost < 0) {
        throw new AppError(400, 'Validation Error', 'Harga perolehan harus berupa bilangan bulat positif.')
      }
    }

    if (input.acquisitionSource !== undefined && input.acquisitionSource !== null) {
      if (!VALID_ACQUISITION_SOURCES.includes(input.acquisitionSource)) {
        throw new AppError(400, 'Validation Error', 'Sumber perolehan tidak valid.')
      }
    }

    const copies = await this.executeAddCopiesTransaction(
      bookId,
      input.quantity,
      input.shelfLocation.trim(),
      condition,
      input.acquisitionDate,
      input.acquisitionSource,
      input.acquisitionCost,
      input.acquisitionSourceDetail,
      input.acquisitionNotes
    )

    return this.getCopiesByBookId(bookId)
  }

  private async executeAddCopiesTransaction(
    bookId: string,
    quantity: number,
    shelfLocation: string,
    condition: string,
    acquisitionDate?: string,
    acquisitionSource?: string,
    acquisitionCost?: number,
    acquisitionSourceDetail?: string,
    acquisitionNotes?: string
  ): Promise<Array<{ inventoryNumber: string; barcode: string }>> {
    const MAX_RETRIES = 3

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        return await prisma.$transaction(async (tx) => {
          const allocations = await this.allocator.allocate(tx, quantity)

          const copiesData = allocations.map(({ inventoryNumber, barcode }) => ({
            id: crypto.randomUUID(),
            bookId,
            inventoryNumber,
            barcode,
            shelfLocation,
            condition,
            status: BookCopyStatus.AVAILABLE,
            acquisitionDate: acquisitionDate ? new Date(acquisitionDate) : undefined,
            acquisitionSource,
            acquisitionCost,
            acquisitionSourceDetail,
            acquisitionNotes
          }))

          await this.repository.createManyWithTx(tx, copiesData)

          for (const copy of copiesData) {
            await this.eventRepo.record(tx, {
              bookCopyId: copy.id!,
              eventType: AssetEventType.COPY_CREATED,
              actorType: ActorType.SYSTEM
            })
          }

          return copiesData
        })
      } catch (error: any) {
        if (error?.code === 'P2002' && attempt < MAX_RETRIES - 1) {
          continue
        }
        throw error
      }
    }

    throw new AppError(500, 'Internal Error', 'Gagal membuat eksemplar setelah beberapa kali percobaan.')
  }

  async decommissionCopy(id: string): Promise<void> {
    throw new Error('decommissionCopy dipindah ke stack baru (src/main/services/book-copy.service.ts) — jalur IPC bookCopies:decommissionCopy sudah dialihkan.')
  }
}
