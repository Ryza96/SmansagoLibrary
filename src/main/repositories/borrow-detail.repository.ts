import { BaseRepository } from './base/base.repository'
import type { BorrowDetail, Prisma } from '@prisma/client'

type CreateBorrowDetailData = Pick<BorrowDetail, 'borrowId' | 'bookCopyId' | 'bookTitle'> & {
  returnedAt?: Date
  conditionBack?: string
  note?: string
}

type UpdateBorrowDetailData = Partial<CreateBorrowDetailData>

type BorrowDetailWithRelations = Prisma.BorrowDetailGetPayload<{
  include: { bookCopy: true; borrow: true }
}>

const borrowDetailInclude = {
  bookCopy: true,
  borrow: true
} as const

export class BorrowDetailRepository extends BaseRepository {
  async create(data: CreateBorrowDetailData): Promise<BorrowDetail> {
    return this.prisma.borrowDetail.create({ data })
  }

  async update(id: string, data: UpdateBorrowDetailData): Promise<BorrowDetail> {
    return this.prisma.borrowDetail.update({ where: { id }, data })
  }

  async delete(id: string): Promise<void> {
    await this.prisma.borrowDetail.delete({ where: { id } })
  }

  async findById(id: string): Promise<BorrowDetailWithRelations | null> {
    return this.prisma.borrowDetail.findUnique({
      where: { id },
      include: borrowDetailInclude
    })
  }

  async findByBorrow(borrowId: string): Promise<BorrowDetail[]> {
    return this.prisma.borrowDetail.findMany({
      where: { borrowId },
      orderBy: { createdAt: 'asc' }
    })
  }

  async findByBookCopy(bookCopyId: string): Promise<BorrowDetail[]> {
    return this.prisma.borrowDetail.findMany({
      where: { bookCopyId },
      orderBy: { createdAt: 'asc' }
    })
  }

  async countActiveByMemberId(memberId: string): Promise<number> {
    return this.prisma.borrowDetail.count({
      where: {
        returnedAt: null,
        borrow: {
          memberId,
          returnDate: null
        }
      }
    })
  }

  async findActiveByBookCopyId(bookCopyId: string) {
    return this.prisma.borrowDetail.findFirst({
      where: { bookCopyId, returnedAt: null },
      include: {
        borrow: {
          include: { member: true }
        },
        bookCopy: {
          include: { book: true }
        }
      }
    })
  }

  async count(): Promise<number> {
    return this.prisma.borrowDetail.count()
  }
}
