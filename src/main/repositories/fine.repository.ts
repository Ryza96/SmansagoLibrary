import { BaseRepository } from './base/base.repository'
import type { Fine } from '@prisma/client'

export class FineRepository extends BaseRepository {
  async findByBorrowId(borrowId: string): Promise<Fine[]> {
    return this.prisma.fine.findMany({
      where: { borrowId },
      orderBy: { createdAt: 'asc' }
    })
  }
}
