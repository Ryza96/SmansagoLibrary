import { BaseRepository } from './base/base.repository'
import { getPaginationParams, toPaginatedResult } from './base/pagination'
import type { FindOptions } from './base/repository.types'
import type { Book, Prisma } from '@prisma/client'

type CreateBookData = Pick<Book, 'title'> & {
  isbn?: string
  authorId?: string
  publisherId?: string
  categoryId?: string
  publicationYear?: number
  description?: string
}

type UpdateBookData = Partial<CreateBookData>

type BookWithRelations = Prisma.BookGetPayload<{
  include: { author: true; publisher: true; category: true }
}>

const bookInclude = {
  author: true,
  publisher: true,
  category: true
} as const

export class BookRepository extends BaseRepository {
  async create(data: CreateBookData): Promise<Book> {
    return this.prisma.book.create({ data })
  }

  async createWithTx(tx: Prisma.TransactionClient, data: CreateBookData): Promise<Book> {
    return tx.book.create({ data })
  }

  async update(id: string, data: UpdateBookData): Promise<Book> {
    return this.prisma.book.update({ where: { id }, data })
  }

  async delete(id: string): Promise<void> {
    await this.prisma.book.delete({ where: { id } })
  }

  async findById(id: string): Promise<BookWithRelations | null> {
    return this.prisma.book.findUnique({
      where: { id },
      include: bookInclude
    })
  }

  async findByISBN(isbn: string): Promise<Book | null> {
    return this.prisma.book.findUnique({ where: { isbn } })
  }

  async findMany(options?: FindOptions) {
    const { skip, take } = getPaginationParams(options?.pagination)

    const where = options?.search
      ? {
          OR: [
            { isbn: { contains: options.search } },
            { title: { contains: options.search } }
          ]
        }
      : {}

    const [data, total] = await Promise.all([
      this.prisma.book.findMany({
        where,
        skip,
        take,
        orderBy: { title: 'asc' }
      }),
      this.prisma.book.count({ where })
    ])

    return toPaginatedResult(data, total, options?.pagination)
  }

  async findAll(limit = 500): Promise<Book[]> {
    return this.prisma.book.findMany({
      take: Math.min(500, Math.max(1, limit)),
      orderBy: { title: 'asc' }
    })
  }

  async existsByISBN(isbn: string): Promise<boolean> {
    const count = await this.prisma.book.count({ where: { isbn } })
    return count > 0
  }

  async count(): Promise<number> {
    return this.prisma.book.count()
  }
}
