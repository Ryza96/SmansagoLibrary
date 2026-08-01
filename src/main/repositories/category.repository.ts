import { BaseRepository } from './base/base.repository'
import { getPaginationParams, toPaginatedResult } from './base/pagination'
import type { FindOptions } from './base/repository.types'
import type { Category } from '@prisma/client'

type CreateCategoryData = Pick<Category, 'name' | 'code'>
type UpdateCategoryData = Partial<Pick<Category, 'name' | 'code'>>

export class CategoryRepository extends BaseRepository {
  async create(data: CreateCategoryData): Promise<Category> {
    return this.prisma.category.create({ data })
  }

  async update(id: string, data: UpdateCategoryData): Promise<Category> {
    return this.prisma.category.update({ where: { id }, data })
  }

  async delete(id: string): Promise<void> {
    await this.prisma.category.delete({ where: { id } })
  }

  async findById(id: string): Promise<Category | null> {
    return this.prisma.category.findUnique({ where: { id } })
  }

  async findMany(options?: FindOptions) {
    const { skip, take } = getPaginationParams(options?.pagination)

    const where = options?.search
      ? { name: { contains: options.search } }
      : {}

    const [data, total] = await Promise.all([
      this.prisma.category.findMany({
        where,
        skip,
        take,
        orderBy: { name: 'asc' }
      }),
      this.prisma.category.count({ where })
    ])

    return toPaginatedResult(data, total, options?.pagination)
  }

  async findExact(name: string): Promise<Category[]> {
    return this.prisma.category.findMany({
      where: { name: { equals: name } },
      take: 10,
      orderBy: { name: 'asc' }
    })
  }

  async findContains(name: string): Promise<Category[]> {
    return this.prisma.category.findMany({
      where: { name: { contains: name } },
      take: 10,
      orderBy: { name: 'asc' }
    })
  }

  async findPrefix(name: string): Promise<Category[]> {
    return this.prisma.category.findMany({
      where: { name: { startsWith: name } },
      take: 10,
      orderBy: { name: 'asc' }
    })
  }

  async findAll(limit = 500): Promise<Category[]> {
    return this.prisma.category.findMany({
      take: Math.min(500, Math.max(1, limit)),
      orderBy: { name: 'asc' }
    })
  }

  async existsByName(name: string): Promise<boolean> {
    const count = await this.prisma.category.count({ where: { name } })
    return count > 0
  }

  async count(): Promise<number> {
    return this.prisma.category.count()
  }
}
