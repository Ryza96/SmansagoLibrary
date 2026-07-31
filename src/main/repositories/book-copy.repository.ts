import { BaseRepository } from './base/base.repository'
import { getPaginationParams, toPaginatedResult } from './base/pagination'
import type { FindOptions } from './base/repository.types'
import type { BookCopy, Prisma } from '@prisma/client'

type CreateBookCopyData = Pick<BookCopy, 'bookId' | 'inventoryNumber' | 'barcode' | 'shelfLocation'> & {
  condition?: string
  status?: string
  acquisitionDate?: Date
  notes?: string
}

type UpdateBookCopyData = Partial<CreateBookCopyData>

type BookCopyWithBook = Prisma.BookCopyGetPayload<{
  include: { book: true }
}>

const bookCopyInclude = {
  book: true
} as const

export class BookCopyRepository extends BaseRepository {
  async create(data: CreateBookCopyData): Promise<BookCopy> {
    return this.prisma.bookCopy.create({ data })
  }

  async update(id: string, data: UpdateBookCopyData): Promise<BookCopy> {
    return this.prisma.bookCopy.update({ where: { id }, data })
  }

  async delete(id: string): Promise<void> {
    await this.prisma.bookCopy.delete({ where: { id } })
  }

  async findById(id: string): Promise<BookCopyWithBook | null> {
    return this.prisma.bookCopy.findUnique({
      where: { id },
      include: bookCopyInclude
    })
  }

  async findByBarcode(barcode: string): Promise<BookCopy | null> {
    return this.prisma.bookCopy.findUnique({ where: { barcode } })
  }

  async findByBarcodeWithBook(barcode: string): Promise<BookCopyWithBook | null> {
    return this.prisma.bookCopy.findUnique({
      where: { barcode },
      include: bookCopyInclude
    })
  }

  async findByInventoryNumber(inventoryNumber: string): Promise<BookCopy | null> {
    return this.prisma.bookCopy.findUnique({ where: { inventoryNumber } })
  }

  async findByBook(bookId: string): Promise<BookCopy[]> {
    return this.prisma.bookCopy.findMany({
      where: { bookId },
      orderBy: { inventoryNumber: 'asc' }
    })
  }

  async findMany(options?: FindOptions) {
    const { skip, take } = getPaginationParams(options?.pagination)

    const conditions: Record<string, unknown>[] = []

    if (options?.search) {
      conditions.push({
        OR: [
          { barcode: { contains: options.search } },
          { inventoryNumber: { contains: options.search } }
        ]
      })
    }

    if (options?.where) {
      conditions.push(options.where)
    }

    const where = conditions.length > 0 ? { AND: conditions } : {}
    const orderBy = options?.sort ?? { inventoryNumber: 'asc' }

    const [data, total] = await Promise.all([
      this.prisma.bookCopy.findMany({
        where,
        skip,
        take,
        orderBy,
        include: { book: { select: { title: true } } }
      }),
      this.prisma.bookCopy.count({ where })
    ])

    return toPaginatedResult(data, total, options?.pagination)
  }

  async existsByBarcode(barcode: string): Promise<boolean> {
    const count = await this.prisma.bookCopy.count({ where: { barcode } })
    return count > 0
  }

  async existsByInventoryNumber(inventoryNumber: string): Promise<boolean> {
    const count = await this.prisma.bookCopy.count({ where: { inventoryNumber } })
    return count > 0
  }

  async count(where?: Record<string, unknown>): Promise<number> {
    return this.prisma.bookCopy.count({ where: where ?? {} })
  }
}
