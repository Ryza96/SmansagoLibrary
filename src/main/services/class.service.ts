import { ClassRepository } from '../repositories/class.repository'
import { AcademicYearRepository } from '../repositories/academic-year.repository'
import { CurriculumRepository } from '../repositories/curriculum.repository'
import { MemberRepository } from '../repositories/member.repository'
import type { ClassDTO, CreateClassDTO, UpdateClassDTO, CloneClassResult } from '../../shared/dto/academic'
import { EDUCATION_LEVELS } from '../../shared/config/education-level'
import { getPrisma } from '../repositories/base/prisma'
import { runTransaction } from '../repositories/base/transaction'
import { AppError } from '../../../electron/main/errorHandler'

function toDTO(record: NonNullable<Awaited<ReturnType<ClassRepository['findById']>>>): ClassDTO {
  return {
    id: record.id,
    academicYearId: record.academicYearId,
    curriculumId: record.curriculumId,
    educationLevel: record.educationLevel,
    parallel: record.parallel,
    displayName: `${record.educationLevel} ${record.parallel}`,
    homeroomTeacher: record.homeroomTeacher,
    isActive: record.isActive,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  }
}

export class ClassService {
  constructor(
    private repository: ClassRepository,
    private academicYearRepository: AcademicYearRepository,
    private curriculumRepository: CurriculumRepository,
    private memberRepository: MemberRepository
  ) {}

  async findMany(search?: string, page?: number, limit?: number) {
    const result = await this.repository.findMany({ search, pagination: { page, limit } })
    return {
      ...result,
      data: result.data.map(toDTO)
    }
  }

  async findById(id: string): Promise<ClassDTO> {
    const record = await this.repository.findById(id)
    if (!record) {
      throw new AppError(404, 'Not Found', `Kelas ${id} tidak ditemukan`)
    }
    return toDTO(record)
  }

  async create(input: CreateClassDTO): Promise<ClassDTO> {
    const educationLevel = input.educationLevel.trim().toUpperCase()
    if (!EDUCATION_LEVELS.has(educationLevel)) {
      throw new AppError(400, 'Conflict', `Tingkat pendidikan ${input.educationLevel} tidak valid (X/XI/XII)`)
    }

    const ayExists = await this.academicYearRepository.existsById(input.academicYearId)
    if (!ayExists) {
      throw new AppError(400, 'Conflict', `Tahun Ajaran ${input.academicYearId} tidak ditemukan`)
    }

    const curExists = await this.curriculumRepository.existsById(input.curriculumId)
    if (!curExists) {
      throw new AppError(400, 'Conflict', `Kurikulum ${input.curriculumId} tidak ditemukan`)
    }

    const dup = await this.repository.findDuplicate(
      input.academicYearId,
      input.curriculumId,
      educationLevel,
      input.parallel
    )
    if (dup) {
      throw new AppError(400, 'Conflict', `Kelas ${educationLevel} ${input.parallel} sudah ada di tahun ajaran dan kurikulum yang sama`)
    }

    const record = await this.repository.create({
      academicYearId: input.academicYearId,
      curriculumId: input.curriculumId,
      educationLevel,
      parallel: input.parallel,
      homeroomTeacher: input.homeroomTeacher,
      isActive: input.isActive
    })

    return toDTO(record)
  }

  async update(id: string, input: UpdateClassDTO): Promise<ClassDTO> {
    const existing = await this.repository.findById(id)
    if (!existing) {
      throw new AppError(404, 'Not Found', `Kelas ${id} tidak ditemukan`)
    }

    if (input.educationLevel !== undefined || input.parallel !== undefined) {
      throw new AppError(400, 'Conflict', `Kelas ${existing.educationLevel} ${existing.parallel} tidak dapat diubah (educationLevel/parallel immutable — buat kelas baru untuk rename)`)
    }

    const academicYearId = input.academicYearId ?? existing.academicYearId
    const curriculumId = input.curriculumId ?? existing.curriculumId

    const comboChanged =
      input.academicYearId !== undefined || input.curriculumId !== undefined

    if (comboChanged) {
      if (input.academicYearId) {
        const ayExists = await this.academicYearRepository.existsById(input.academicYearId)
        if (!ayExists) throw new AppError(400, 'Conflict', `Tahun Ajaran ${input.academicYearId} tidak ditemukan`)
      }

      if (input.curriculumId) {
        const curExists = await this.curriculumRepository.existsById(input.curriculumId)
        if (!curExists) throw new AppError(400, 'Conflict', `Kurikulum ${input.curriculumId} tidak ditemukan`)
      }

      const dup = await this.repository.findDuplicate(academicYearId, curriculumId, existing.educationLevel, existing.parallel, id)
      if (dup) {
        throw new AppError(400, 'Conflict', `Kelas ${existing.educationLevel} ${existing.parallel} sudah ada di tahun ajaran dan kurikulum yang sama`)
      }
    }

    const updated = await this.repository.update(id, {
      academicYearId: input.academicYearId,
      curriculumId: input.curriculumId,
      homeroomTeacher: input.homeroomTeacher,
      isActive: input.isActive
    })

    return toDTO(updated)
  }

  async delete(id: string): Promise<void> {
    const existing = await this.repository.findById(id)
    if (!existing) {
      throw new AppError(404, 'Not Found', `Kelas ${id} tidak ditemukan`)
    }

    const memberCount = await this.memberRepository.countByClass(id)
    if (memberCount > 0) {
      throw new AppError(400, 'Conflict', `Kelas ${existing.educationLevel} ${existing.parallel} tidak dapat dihapus karena masih memiliki ${memberCount} anggota`)
    }

    await this.repository.delete(id)
  }

  // WO-9 CL-2b: clone struktur kelas (tanpa enrollment) ke tahun ajaran baru — RFC §7.
  // Hanya menyalin curriculumId, educationLevel, parallel.
  // Kelas baru: homeroomTeacher = null, isActive = true.
  async cloneToYear(sourceAcademicYearId: string, targetAcademicYearId: string): Promise<CloneClassResult> {
    if (sourceAcademicYearId === targetAcademicYearId) {
      throw new AppError(400, 'Conflict', 'Tahun ajaran sumber dan target tidak boleh sama')
    }

    const [sourceExists, targetExists] = await Promise.all([
      this.academicYearRepository.existsById(sourceAcademicYearId),
      this.academicYearRepository.existsById(targetAcademicYearId)
    ])
    if (!sourceExists) {
      throw new AppError(400, 'Conflict', `Tahun Ajaran ${sourceAcademicYearId} tidak ditemukan`)
    }
    if (!targetExists) {
      throw new AppError(400, 'Conflict', `Tahun Ajaran ${targetAcademicYearId} tidak ditemukan`)
    }

    const sourceClasses = await this.repository.findByAcademicYear(sourceAcademicYearId)

    return runTransaction(getPrisma(), async (tx) => {
      let created = 0
      let skipped = 0
      for (const source of sourceClasses) {
        const dup = await tx.class.findFirst({
          where: {
            academicYearId: targetAcademicYearId,
            curriculumId: source.curriculumId,
            educationLevel: source.educationLevel,
            parallel: source.parallel
          }
        })
        if (dup) {
          skipped += 1
          continue
        }
        await tx.class.create({
          data: {
            academicYearId: targetAcademicYearId,
            curriculumId: source.curriculumId,
            educationLevel: source.educationLevel,
            parallel: source.parallel,
            homeroomTeacher: null,
            isActive: true
          }
        })
        created += 1
      }
      return { created, skipped }
    })
  }
}
