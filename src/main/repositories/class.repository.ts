import { BaseRepository } from './base/base.repository'
import { getPaginationParams, toPaginatedResult } from './base/pagination'
import type { FindOptions } from './base/repository.types'
import type { Class, Prisma } from '@prisma/client'

type CreateClassData = Pick<Class, 'academicYearId' | 'curriculumId' | 'educationLevel' | 'parallel'> & {
  homeroomTeacher?: string
  isActive?: boolean
}

type UpdateClassData = Partial<Pick<Class, 'academicYearId' | 'curriculumId' | 'educationLevel' | 'parallel' | 'homeroomTeacher' | 'isActive'>>

export class ClassRepository extends BaseRepository {
  async create(data: CreateClassData): Promise<Class> {
    return this.prisma.class.create({ data })
  }

  async update(id: string, data: UpdateClassData): Promise<Class> {
    return this.prisma.class.update({ where: { id }, data })
  }

  async delete(id: string): Promise<void> {
    await this.prisma.class.delete({ where: { id } })
  }

  async findById(id: string): Promise<Class | null> {
    return this.prisma.class.findUnique({ where: { id } })
  }

  async findMany(options?: FindOptions) {
    const { skip, take } = getPaginationParams(options?.pagination)

    const where = options?.search
      ? { parallel: { contains: options.search } }
      : {}

    const [data, total] = await Promise.all([
      this.prisma.class.findMany({
        where,
        skip,
        take,
        orderBy: { parallel: 'asc' }
      }),
      this.prisma.class.count({ where })
    ])

    return toPaginatedResult(data, total, options?.pagination)
  }

  async findByAcademicYear(academicYearId: string): Promise<Class[]> {
    return this.prisma.class.findMany({
      where: { academicYearId },
      orderBy: { parallel: 'asc' }
    })
  }

  // WO P-2 — varian findByAcademicYear yang menerima TransactionClient untuk
  // baca kelas kandidat target TERBARU di dalam transaksi eksekusi promosi
  // (RFC §7.1/§8 re-validate).
  async findByAcademicYearWithTx(tx: Prisma.TransactionClient, academicYearId: string): Promise<Class[]> {
    return tx.class.findMany({
      where: { academicYearId },
      orderBy: { parallel: 'asc' }
    })
  }

  // WO-17 MI-1 — kelas pada kombinasi AcademicYear + Curriculum (RFC §12.1 step 4).
  // WO-20 MI-4 — skop kurikulum WAJIB (tidak ada jalur tanpa kurikulum).
  async findByAcademicYearAndCurriculum(academicYearId: string, curriculumId: string): Promise<Class[]> {
    return this.prisma.class.findMany({
      where: {
        academicYearId,
        curriculumId
      },
      orderBy: { parallel: 'asc' }
    })
  }

  async findDuplicate(
    academicYearId: string,
    curriculumId: string,
    educationLevel: string,
    parallel: string,
    excludeId?: string
  ): Promise<Class | null> {
    return this.prisma.class.findFirst({
      where: {
        academicYearId,
        curriculumId,
        educationLevel,
        parallel,
        id: excludeId ? { not: excludeId } : undefined
      }
    })
  }

  async countByAcademicYear(academicYearId: string): Promise<number> {
    return this.prisma.class.count({ where: { academicYearId } })
  }

  async countByCurriculum(curriculumId: string): Promise<number> {
    return this.prisma.class.count({ where: { curriculumId } })
  }

  async count(): Promise<number> {
    return this.prisma.class.count()
  }
}
