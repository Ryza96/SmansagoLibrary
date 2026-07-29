import { prisma } from '../database'
import { Prisma } from '@prisma/client'

export class BorrowingItemRepository {
  findById(id: string) {
    return prisma.borrowingItem.findUnique({
      where: { id },
      include: {
        bookCopy: {
          include: { book: { select: { title: true } } }
        }
      }
    })
  }

  findByBorrowingId(borrowingId: string) {
    return prisma.borrowingItem.findMany({
      where: { borrowingId },
      include: {
        bookCopy: {
          include: { book: { select: { title: true } } }
        }
      },
      orderBy: { createdAt: 'asc' }
    })
  }

  findByBookCopyId(bookCopyId: string) {
    return prisma.borrowingItem.findMany({
      where: { bookCopyId },
      include: {
        borrowing: { select: { id: true, borrowingNumber: true, status: true } }
      },
      orderBy: { createdAt: 'desc' }
    })
  }

  findActiveByBookCopyId(bookCopyId: string) {
    return prisma.borrowingItem.findFirst({
      where: { bookCopyId, status: 'BORROWED' }
    })
  }

  createMany(data: Prisma.BorrowingItemCreateManyInput[]) {
    return prisma.borrowingItem.createMany({ data })
  }

  update(id: string, data: Prisma.BorrowingItemUpdateInput) {
    return prisma.borrowingItem.update({ where: { id }, data })
  }

  async countActiveByBorrowingId(borrowingId: string): Promise<number> {
    return prisma.borrowingItem.count({
      where: { borrowingId, status: 'BORROWED' }
    })
  }

  async countActiveByMemberId(memberId: string): Promise<number> {
    return prisma.borrowingItem.count({
      where: {
        status: 'BORROWED',
        borrowing: { memberId, status: 'ACTIVE' }
      }
    })
  }

  async hasOverdueByMemberId(memberId: string): Promise<boolean> {
    const count = await prisma.borrowingItem.count({
      where: {
        status: 'BORROWED',
        borrowing: {
          memberId,
          status: 'ACTIVE',
          dueDate: { lt: new Date() }
        }
      }
    })
    return count > 0
  }

  async getNearestDueDateByMemberId(memberId: string): Promise<Date | null> {
    const borrowing = await prisma.borrowing.findFirst({
      where: { memberId, status: 'ACTIVE', dueDate: { gte: new Date() } },
      orderBy: { dueDate: 'asc' },
      select: { dueDate: true }
    })
    return borrowing?.dueDate ?? null
  }
}
