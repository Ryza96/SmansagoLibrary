import { prisma } from '../database'
import { Prisma } from '@prisma/client'
import type { FindCategoriesQueryDTO } from '../../shared/dto/master'

export class CategoryRepository {
  findMany(query?: FindCategoriesQueryDTO) {
    const where: Prisma.CategoryWhereInput = {}
    if (query?.search) {
      where.name = { contains: query.search }
    }
    return prisma.category.findMany({ where, orderBy: { name: 'asc' } })
  }

  findById(id: string) {
    return prisma.category.findUnique({ where: { id } })
  }

  async existsByName(name: string, excludeId?: string): Promise<boolean> {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT id FROM Category WHERE LOWER(name) = LOWER(${name}) ${excludeId ? Prisma.sql`AND id != ${excludeId}` : Prisma.empty} LIMIT 1`
    )
    return rows.length > 0
  }

  async existsByCode(code: string, excludeId?: string): Promise<boolean> {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT id FROM Category WHERE code = ${code} ${excludeId ? Prisma.sql`AND id != ${excludeId}` : Prisma.empty} LIMIT 1`
    )
    return rows.length > 0
  }

  create(data: Prisma.CategoryCreateInput) {
    return prisma.category.create({ data })
  }

  update(id: string, data: Prisma.CategoryUpdateInput) {
    return prisma.category.update({ where: { id }, data })
  }

  delete(id: string) {
    return prisma.category.delete({ where: { id } })
  }
}
