import { prisma } from '../database'
import { Prisma } from '@prisma/client'
import type { FindPublishersQueryDTO } from '../../../src/shared/dto/master'

export class PublisherRepository {
  findMany(query?: FindPublishersQueryDTO) {
    const where: Prisma.PublisherWhereInput = {}
    if (query?.search) {
      where.name = { contains: query.search }
    }
    return prisma.publisher.findMany({ where, orderBy: { name: 'asc' } })
  }

  findById(id: string) {
    return prisma.publisher.findUnique({ where: { id } })
  }

  async existsByName(name: string, excludeId?: string): Promise<boolean> {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT id FROM Publisher WHERE LOWER(name) = LOWER(${name}) ${excludeId ? Prisma.sql`AND id != ${excludeId}` : Prisma.empty} LIMIT 1`
    )
    return rows.length > 0
  }

  create(data: Prisma.PublisherCreateInput) {
    return prisma.publisher.create({ data })
  }

  update(id: string, data: Prisma.PublisherUpdateInput) {
    return prisma.publisher.update({ where: { id }, data })
  }

  delete(id: string) {
    return prisma.publisher.delete({ where: { id } })
  }
}
