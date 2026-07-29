import { prisma } from '../database'
import { Prisma } from '@prisma/client'

export class ReturnRepository {
  findById(id: string) {
    return prisma.return.findUnique({
      where: { id },
      include: {
        borrowing: {
          include: {
            member: { select: { id: true, fullName: true, number: true } }
          }
        }
      }
    })
  }

  findByBorrowingId(borrowingId: string) {
    return prisma.return.findMany({
      where: { borrowingId },
      orderBy: { returnDate: 'desc' }
    })
  }

  create(data: Prisma.ReturnCreateInput) {
    return prisma.return.create({ data })
  }

  async createReturnTransaction(params: {
    borrowingItemId: string
    bookCopyId: string
    borrowingId: string
    condition: string
    notes?: string
  }): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.borrowingItem.update({
        where: { id: params.borrowingItemId },
        data: {
          status: 'RETURNED',
          condition: params.condition,
          notes: params.notes ?? null,
          returnedAt: new Date()
        }
      })

      await tx.bookCopy.update({
        where: { id: params.bookCopyId },
        data: { status: 'AVAILABLE' }
      })

      const remainingActive = await tx.borrowingItem.count({
        where: { borrowingId: params.borrowingId, status: 'BORROWED' }
      })

      if (remainingActive === 0) {
        await tx.borrowing.update({
          where: { id: params.borrowingId },
          data: { status: 'COMPLETED' }
        })
      }

      await tx.return.create({
        data: {
          borrowingId: params.borrowingId,
          returnDate: new Date(),
          notes: params.notes ?? null
        }
      })
    })
  }
}
