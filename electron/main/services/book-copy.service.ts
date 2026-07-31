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

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  [BookCopyStatus.AVAILABLE]: [BookCopyStatus.BORROWED, BookCopyStatus.LOST, BookCopyStatus.REMOVED],
  [BookCopyStatus.BORROWED]: [BookCopyStatus.AVAILABLE, BookCopyStatus.LOST, BookCopyStatus.REMOVED],
  [BookCopyStatus.LOST]: [BookCopyStatus.REMOVED],
  [BookCopyStatus.REMOVED]: []
}

const VALID_CONDITIONS = [
  BookCopyCondition.GOOD,
  BookCopyCondition.LIGHT_DAMAGE,
  BookCopyCondition.HEAVY_DAMAGE
]

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

    const copies = await this.executeAddCopiesTransaction(bookId, input.quantity, input.shelfLocation.trim(), condition)

    return this.getCopiesByBookId(bookId)
  }

  private async executeAddCopiesTransaction(
    bookId: string,
    quantity: number,
    shelfLocation: string,
    condition: string
  ): Promise<Array<{ inventoryNumber: string; barcode: string }>> {
    const MAX_RETRIES = 3

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        return await prisma.$transaction(async (tx) => {
          const inventoryNumbers = await this.allocator.allocate(tx, quantity)

          const barcodes = this.generateBarcodes(quantity)

          const copiesData = inventoryNumbers.map((invNum, i) => ({
            id: crypto.randomUUID(),
            bookId,
            inventoryNumber: invNum,
            barcode: barcodes[i],
            shelfLocation,
            condition,
            status: BookCopyStatus.AVAILABLE
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
    const copy = await this.repository.findById(id)
    if (!copy) {
      throw new AppError(404, 'Not Found', 'Eksemplar tidak ditemukan.')
    }

    this.validateStatusTransition(copy.status, BookCopyStatus.REMOVED)

    if (copy._count.borrowDetails > 0) {
      await this.repository.updateStatus(prisma, id, BookCopyStatus.REMOVED)
      return
    }

    await this.repository.deleteById(id)
  }

  async updateStatus(
    id: string,
    newStatus: string,
    tx?: any
  ): Promise<void> {
    const client = tx ?? prisma

    const copy = await this.repository.findByIdWithTx(client, id)
    if (!copy) {
      throw new AppError(404, 'Not Found', 'Eksemplar tidak ditemukan.')
    }

    this.validateStatusTransition(copy.status, newStatus)

    await this.repository.updateStatus(client, id, newStatus)
  }

  async updateCondition(id: string, newCondition: string): Promise<void> {
    if (!VALID_CONDITIONS.includes(newCondition as any)) {
      throw new AppError(400, 'Validation Error', `Kondisi "${newCondition}" tidak valid.`)
    }

    const copy = await this.repository.findById(id)
    if (!copy) {
      throw new AppError(404, 'Not Found', 'Eksemplar tidak ditemukan.')
    }

    const oldCondition = copy.condition

    await prisma.$transaction(async (tx) => {
      await this.repository.updateCondition(tx, id, newCondition)

      await this.eventRepo.record(tx, {
        bookCopyId: id,
        eventType: AssetEventType.CONDITION_CHANGED,
        actorType: ActorType.USER,
        metadata: JSON.stringify({
          oldCondition,
          newCondition
        })
      })
    })
  }

  private generateBarcodes(count: number): string[] {
    const barcodes = new Set<string>()

    while (barcodes.size < count) {
      const hex = crypto.randomBytes(6).toString('hex').toUpperCase()
      barcodes.add(`BC-${hex}`)
    }

    return Array.from(barcodes)
  }

  private validateStatusTransition(currentStatus: string, newStatus: string): void {
    if (currentStatus === newStatus) return

    const allowed = ALLOWED_TRANSITIONS[currentStatus]
    if (!allowed) {
      throw new AppError(400, 'Invalid Transition', `Status "${currentStatus}" tidak dikenal.`)
    }

    if (!allowed.includes(newStatus)) {
      throw new AppError(
        400,
        'Invalid Transition',
        `Tidak dapat mengubah status dari "${currentStatus}" ke "${newStatus}".`
      )
    }
  }
}
