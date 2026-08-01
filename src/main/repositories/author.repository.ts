import { BaseRepository } from './base/base.repository'
import { getPaginationParams, toPaginatedResult } from './base/pagination'
import type { FindOptions } from './base/repository.types'
import type { Author } from '@prisma/client'

type CreateAuthorData = Pick<Author, 'name'>
type UpdateAuthorData = Partial<Pick<Author, 'name'>>

export class AuthorRepository extends BaseRepository {
  async create(data: CreateAuthorData): Promise<Author> {
    return this.prisma.author.create({ data })
  }

  async update(id: string, data: UpdateAuthorData): Promise<Author> {
    return this.prisma.author.update({ where: { id }, data })
  }

  async delete(id: string): Promise<void> {
    await this.prisma.author.delete({ where: { id } })
  }

  async findById(id: string): Promise<Author | null> {
    return this.prisma.author.findUnique({ where: { id } })
  }

  async findMany(options?: FindOptions) {
    const { skip, take } = getPaginationParams(options?.pagination)

    const where = options?.search
      ? { name: { contains: options.search } }
      : {}

    const [data, total] = await Promise.all([
      this.prisma.author.findMany({
        where,
        skip,
        take,
        orderBy: { name: 'asc' }
      }),
      this.prisma.author.count({ where })
    ])

    return toPaginatedResult(data, total, options?.pagination)
  }

  async findExact(name: string): Promise<Author[]> {
    return this.prisma.author.findMany({
      where: { name: { equals: name } },
      take: 10,
      orderBy: { name: 'asc' }
    })
  }

  async findContains(name: string): Promise<Author[]> {
    return this.prisma.author.findMany({
      where: { name: { contains: name } },
      take: 10,
      orderBy: { name: 'asc' }
    })
  }

  async findPrefix(name: string): Promise<Author[]> {
    return this.prisma.author.findMany({
      where: { name: { startsWith: name } },
      take: 10,
      orderBy: { name: 'asc' }
    })
  }

  async findAll(limit = 500): Promise<Author[]> {
    return this.prisma.author.findMany({
      take: Math.min(500, Math.max(1, limit)),
      orderBy: { name: 'asc' }
    })
  }

  async existsByName(name: string): Promise<boolean> {
    const count = await this.prisma.author.count({ where: { name } })
    return count > 0
  }

  async count(): Promise<number> {
    return this.prisma.author.count()
  }
}
