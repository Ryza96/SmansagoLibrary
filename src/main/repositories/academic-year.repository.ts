import { BaseRepository } from './base/base.repository'
import { getPaginationParams, toPaginatedResult } from './base/pagination'
import type { FindOptions } from './base/repository.types'
import type { AcademicYear } from '@prisma/client'

type CreateAcademicYearData = Pick<AcademicYear, 'name' | 'startDate' | 'endDate'> & {
  isActive?: boolean
}

type UpdateAcademicYearData = Partial<Pick<AcademicYear, 'name' | 'startDate' | 'endDate' | 'isActive'>>

export class AcademicYearRepository extends BaseRepository {
  async create(data: CreateAcademicYearData): Promise<AcademicYear> {
    return this.prisma.academicYear.create({ data })
  }

  async update(id: string, data: UpdateAcademicYearData): Promise<AcademicYear> {
    return this.prisma.academicYear.update({ where: { id }, data })
  }

  // WO-4 AY-1a: guard exclusive-active. Menonaktifkan seluruh tahun aktif lain
  // lalu membuat/update target sebagai SATU-SATUNYA tahun aktif dalam satu transaksi.
  async createExclusiveActive(data: CreateAcademicYearData & { isActive: true }): Promise<AcademicYear> {
    return this.prisma.$transaction(async (tx) => {
      await tx.academicYear.updateMany({ where: { isActive: true }, data: { isActive: false } })
      return tx.academicYear.create({ data })
    })
  }

  async updateExclusiveActive(id: string, data: UpdateAcademicYearData & { isActive: true }): Promise<AcademicYear> {
    return this.prisma.$transaction(async (tx) => {
      await tx.academicYear.updateMany({ where: { isActive: true }, data: { isActive: false } })
      return tx.academicYear.update({ where: { id }, data })
    })
  }

  async delete(id: string): Promise<void> {
    await this.prisma.academicYear.delete({ where: { id } })
  }

  async findById(id: string): Promise<AcademicYear | null> {
    return this.prisma.academicYear.findUnique({ where: { id } })
  }

  async findActive(): Promise<AcademicYear | null> {
    return this.prisma.academicYear.findFirst({
      where: { isActive: true },
      orderBy: { startDate: 'desc' }
    })
  }

  async findMany(options?: FindOptions) {
    const { skip, take } = getPaginationParams(options?.pagination)

    const where = options?.search
      ? { name: { contains: options.search } }
      : {}

    const [data, total] = await Promise.all([
      this.prisma.academicYear.findMany({
        where,
        skip,
        take,
        orderBy: { name: 'asc' }
      }),
      this.prisma.academicYear.count({ where })
    ])

    return toPaginatedResult(data, total, options?.pagination)
  }

  async existsByName(name: string): Promise<boolean> {
    const count = await this.prisma.academicYear.count({ where: { name } })
    return count > 0
  }

  async existsById(id: string): Promise<boolean> {
    const count = await this.prisma.academicYear.count({ where: { id } })
    return count > 0
  }

  async count(): Promise<number> {
    return this.prisma.academicYear.count()
  }
}
