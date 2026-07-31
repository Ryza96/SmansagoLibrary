import { BaseRepository } from './base/base.repository'
import { getPaginationParams, toPaginatedResult } from './base/pagination'
import type { FindOptions } from './base/repository.types'
import type { Borrow, Prisma } from '@prisma/client'

type CreateBorrowData = Pick<Borrow, 'borrowNumber' | 'memberId' | 'borrowDate' | 'dueDate' | 'memberName' | 'memberNumber'> & {
  returnDate?: Date
  notes?: string
  className?: string
}

type UpdateBorrowData = Partial<CreateBorrowData>

const borrowInclude = {
  details: {
    include: {
      bookCopy: {
        include: { book: true }
      }
    }
  },
  member: true
} as const

type BorrowWithRelations = Prisma.BorrowGetPayload<{
  include: typeof borrowInclude
}>

export class BorrowRepository extends BaseRepository {
  async create(data: CreateBorrowData): Promise<Borrow> {
    return this.prisma.borrow.create({ data })
  }

  async update(id: string, data: UpdateBorrowData): Promise<Borrow> {
    return this.prisma.borrow.update({ where: { id }, data })
  }

  async delete(id: string): Promise<void> {
    await this.prisma.borrow.delete({ where: { id } })
  }

  async findById(id: string): Promise<BorrowWithRelations | null> {
    return this.prisma.borrow.findUnique({
      where: { id },
      include: borrowInclude
    })
  }

  async findByBorrowNumber(borrowNumber: string): Promise<Borrow | null> {
    return this.prisma.borrow.findUnique({ where: { borrowNumber } })
  }

  async findMany(options?: FindOptions) {
    const { skip, take } = getPaginationParams(options?.pagination)

    const where = options?.search
      ? {
          OR: [
            { borrowNumber: { contains: options.search } },
            { memberName: { contains: options.search } },
            { memberNumber: { contains: options.search } }
          ]
        }
      : {}

    const [data, total] = await Promise.all([
      this.prisma.borrow.findMany({
        where,
        skip,
        take,
        orderBy: { borrowDate: 'desc' },
        include: {
          _count: { select: { details: true } }
        }
      }),
      this.prisma.borrow.count({ where })
    ])

    return toPaginatedResult(data, total, options?.pagination)
  }

  async existsByBorrowNumber(borrowNumber: string): Promise<boolean> {
    const count = await this.prisma.borrow.count({ where: { borrowNumber } })
    return count > 0
  }

  async getLastBorrowNumber(): Promise<string | null> {
    const last = await this.prisma.borrow.findFirst({
      orderBy: { borrowNumber: 'desc' },
      select: { borrowNumber: true }
    })
    return last?.borrowNumber ?? null
  }

  async createWithItems(
    borrowData: {
      borrowNumber: string
      memberId: string
      memberName: string
      memberNumber: string
      borrowDate: Date
      dueDate: Date
      className?: string
      notes?: string
    },
    itemsData: Array<{ bookCopyId: string; bookTitle: string }>
  ) {
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.borrow.create({
        data: {
          borrowNumber: borrowData.borrowNumber,
          memberId: borrowData.memberId,
          memberName: borrowData.memberName,
          memberNumber: borrowData.memberNumber,
          borrowDate: borrowData.borrowDate,
          dueDate: borrowData.dueDate,
          returnDate: null,
          notes: borrowData.notes ?? null,
          className: borrowData.className ?? null,
          details: {
            createMany: {
              data: itemsData.map((item) => ({
                bookCopyId: item.bookCopyId,
                bookTitle: item.bookTitle
              }))
            }
          }
        },
        include: {
          details: {
            include: {
              bookCopy: {
                include: { book: true }
              }
            }
          },
          member: true
        }
      })

      await tx.bookCopy.updateMany({
        where: { id: { in: itemsData.map((i) => i.bookCopyId) } },
        data: { status: 'BORROWED' }
      })

      return created
    })
  }

  async getNearestDueDateByMemberId(memberId: string): Promise<Date | null> {
    const borrow = await this.prisma.borrow.findFirst({
      where: { memberId, returnDate: null, dueDate: { gte: new Date() } },
      orderBy: { dueDate: 'asc' },
      select: { dueDate: true }
    })
    return borrow?.dueDate ?? null
  }

  async processReturn(
    detailId: string,
    conditionBack: string,
    note: string | null
  ) {
    return this.prisma.$transaction(async (tx) => {
      const detail = await tx.borrowDetail.update({
        where: { id: detailId },
        data: {
          returnedAt: new Date(),
          conditionBack,
          note
        }
      })

      await tx.bookCopy.update({
        where: { id: detail.bookCopyId },
        data: { status: 'AVAILABLE' }
      })

      const remainingActive = await tx.borrowDetail.count({
        where: {
          borrowId: detail.borrowId,
          returnedAt: null
        }
      })

      if (remainingActive === 0) {
        await tx.borrow.update({
          where: { id: detail.borrowId },
          data: { returnDate: new Date() }
        })
      }

      return tx.borrow.findUnique({
        where: { id: detail.borrowId },
        include: {
          details: {
            include: {
              bookCopy: {
                include: { book: true }
              }
            }
          },
          member: true
        }
      })
    })
  }

  async count(): Promise<number> {
    return this.prisma.borrow.count()
  }
}
