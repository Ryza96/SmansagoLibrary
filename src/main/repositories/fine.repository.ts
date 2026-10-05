import { BaseRepository } from './base/base.repository'
import type { Fine, Prisma } from '@prisma/client'

export interface FineListQuery {
  status?: 'UNPAID' | 'PAID' | 'WAIVED'
  search?: string
}

export class FineRepository extends BaseRepository {
  async findByBorrowId(borrowId: string): Promise<Fine[]> {
    return this.prisma.fine.findMany({
      where: { borrowId },
      orderBy: { createdAt: 'asc' }
    })
  }

  async findAll(filter?: FineListQuery): Promise<Prisma.FineGetPayload<{ include: { borrow: true; borrowDetail: true } }>[]> {
    const where: Prisma.FineWhereInput = {}
    if (filter?.status) where.status = filter.status
    const search = filter?.search?.trim()
    if (search) {
      where.AND = [
        {
          OR: [
            { borrow: { borrowNumber: { contains: search } } },
            { borrow: { memberName: { contains: search } } },
            { borrow: { memberNumber: { contains: search } } }
          ]
        }
      ]
    }
    return this.prisma.fine.findMany({
      where,
      include: { borrow: true, borrowDetail: true },
      orderBy: { createdAt: 'desc' }
    })
  }

  async findById(id: string): Promise<Fine | null> {
    return this.prisma.fine.findUnique({ where: { id } })
  }

  async markPaid(id: string, paidAt: Date): Promise<Fine> {
    return this.prisma.fine.update({
      where: { id },
      data: { status: 'PAID', paidAt }
    })
  }

  async markWaived(id: string, reason: string): Promise<Fine> {
    return this.prisma.fine.update({
      where: { id },
      data: { status: 'WAIVED', waivedReason: reason }
    })
  }
}
