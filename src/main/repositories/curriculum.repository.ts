import { BaseRepository } from './base/base.repository'
import { getPaginationParams, toPaginatedResult } from './base/pagination'
import type { FindOptions } from './base/repository.types'
import type { Curriculum } from '@prisma/client'

type CreateCurriculumData = Pick<Curriculum, 'name'>
type UpdateCurriculumData = Partial<Pick<Curriculum, 'name'>>

export class CurriculumRepository extends BaseRepository {
  async create(data: CreateCurriculumData): Promise<Curriculum> {
    return this.prisma.curriculum.create({ data })
  }

  async update(id: string, data: UpdateCurriculumData): Promise<Curriculum> {
    return this.prisma.curriculum.update({ where: { id }, data })
  }

  async delete(id: string): Promise<void> {
    await this.prisma.curriculum.delete({ where: { id } })
  }

  async findById(id: string): Promise<Curriculum | null> {
    return this.prisma.curriculum.findUnique({ where: { id } })
  }

  async findMany(options?: FindOptions) {
    const { skip, take } = getPaginationParams(options?.pagination)

    const where = options?.search
      ? { name: { contains: options.search } }
      : {}

    const [data, total] = await Promise.all([
      this.prisma.curriculum.findMany({
        where,
        skip,
        take,
        orderBy: { name: 'asc' }
      }),
      this.prisma.curriculum.count({ where })
    ])

    return toPaginatedResult(data, total, options?.pagination)
  }

  async existsByName(name: string): Promise<boolean> {
    const count = await this.prisma.curriculum.count({ where: { name } })
    return count > 0
  }

  async existsById(id: string): Promise<boolean> {
    const count = await this.prisma.curriculum.count({ where: { id } })
    return count > 0
  }

  async count(): Promise<number> {
    return this.prisma.curriculum.count()
  }
}
