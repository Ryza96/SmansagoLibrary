import { prisma } from '../database'
import { Prisma } from '@prisma/client'
import type { FindAuthorsQueryDTO } from '../../shared/dto/master'

export class AuthorRepository {
  findMany(query?: FindAuthorsQueryDTO) {
    const where: Prisma.AuthorWhereInput = {}
    if (query?.search) {
      where.name = { contains: query.search }
    }
    return prisma.author.findMany({ where, orderBy: { name: 'asc' } })
  }

  findById(id: string) {
    return prisma.author.findUnique({ where: { id } })
  }

  async existsByName(name: string, excludeId?: string): Promise<boolean> {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT id FROM Author WHERE LOWER(name) = LOWER(${name}) ${excludeId ? Prisma.sql`AND id != ${excludeId}` : Prisma.empty} LIMIT 1`
    )
    return rows.length > 0
  }

  create(data: Prisma.AuthorCreateInput) {
    return prisma.author.create({ data })
  }

  update(id: string, data: Prisma.AuthorUpdateInput) {
    return prisma.author.update({ where: { id }, data })
  }

  delete(id: string) {
    return prisma.author.delete({ where: { id } })
  }
}
