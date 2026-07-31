import { BaseRepository } from './base/base.repository'
import { getPaginationParams, toPaginatedResult } from './base/pagination'
import type { FindOptions } from './base/repository.types'
import type { Publisher } from '@prisma/client'

type CreatePublisherData = Pick<Publisher, 'name'>
type UpdatePublisherData = Partial<Pick<Publisher, 'name'>>

export class PublisherRepository extends BaseRepository {
  async create(data: CreatePublisherData): Promise<Publisher> {
    return this.prisma.publisher.create({ data })
  }

  async update(id: string, data: UpdatePublisherData): Promise<Publisher> {
    return this.prisma.publisher.update({ where: { id }, data })
  }

  async delete(id: string): Promise<void> {
    await this.prisma.publisher.delete({ where: { id } })
  }

  async findById(id: string): Promise<Publisher | null> {
    return this.prisma.publisher.findUnique({ where: { id } })
  }

  async findMany(options?: FindOptions) {
    const { skip, take } = getPaginationParams(options?.pagination)

    const where = options?.search
      ? { name: { contains: options.search } }
      : {}

    const [data, total] = await Promise.all([
      this.prisma.publisher.findMany({
        where,
        skip,
        take,
        orderBy: { name: 'asc' }
      }),
      this.prisma.publisher.count({ where })
    ])

    return toPaginatedResult(data, total, options?.pagination)
  }

  async existsByName(name: string): Promise<boolean> {
    const count = await this.prisma.publisher.count({ where: { name } })
    return count > 0
  }

  async count(): Promise<number> {
    return this.prisma.publisher.count()
  }
}
