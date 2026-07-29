import { prisma } from '../database'
import { Prisma } from '@prisma/client'

const borrowingInclude = {
  member: { select: { id: true, fullName: true, number: true } },
  items: {
    include: {
      bookCopy: {
        include: { book: { select: { title: true } } },
        select: { id: true, barcode: true, inventoryNumber: true, book: { select: { title: true } } }
      }
    },
    orderBy: { createdAt: 'asc' as const }
  },
  returns: { orderBy: { returnDate: 'asc' as const } }
}

export class BorrowingRepository {
  findMany() {
    return prisma.borrowing.findMany({
      include: borrowingInclude,
      orderBy: { createdAt: 'desc' }
    })
  }

  findById(id: string) {
    return prisma.borrowing.findUnique({
      where: { id },
      include: borrowingInclude
    })
  }

  findByBorrowingNumber(borrowingNumber: string) {
    return prisma.borrowing.findUnique({
      where: { borrowingNumber },
      include: borrowingInclude
    })
  }

  findActiveByMemberId(memberId: string) {
    return prisma.borrowing.findMany({
      where: { memberId, status: 'ACTIVE' },
      include: borrowingInclude
    })
  }

  create(data: Prisma.BorrowingCreateInput) {
    return prisma.borrowing.create({ data })
  }

  update(id: string, data: Prisma.BorrowingUpdateInput) {
    return prisma.borrowing.update({ where: { id }, data })
  }

  async getLastBorrowingNumber(): Promise<string | null> {
    const last = await prisma.borrowing.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { borrowingNumber: true }
    })
    return last?.borrowingNumber ?? null
  }
}
