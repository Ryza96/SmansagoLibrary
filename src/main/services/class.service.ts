import { ClassRepository } from '../repositories/class.repository'
import { AcademicYearRepository } from '../repositories/academic-year.repository'
import { CurriculumRepository } from '../repositories/curriculum.repository'
import { MemberRepository } from '../repositories/member.repository'
import type { ClassDTO, CreateClassDTO, UpdateClassDTO } from '../../shared/dto/academic'
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
      input.educationLevel,
      input.parallel
    )
    if (dup) {
      throw new AppError(400, 'Conflict', `Kelas ${input.educationLevel} ${input.parallel} sudah ada di tahun ajaran dan kurikulum yang sama`)
    }

    const record = await this.repository.create({
      academicYearId: input.academicYearId,
      curriculumId: input.curriculumId,
      educationLevel: input.educationLevel,
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

    const academicYearId = input.academicYearId ?? existing.academicYearId
    const curriculumId = input.curriculumId ?? existing.curriculumId
    const educationLevel = input.educationLevel ?? existing.educationLevel
    const parallel = input.parallel ?? existing.parallel

    const comboChanged =
      input.academicYearId !== undefined || input.curriculumId !== undefined ||
      input.educationLevel !== undefined || input.parallel !== undefined

    if (comboChanged) {
      if (input.academicYearId) {
        const ayExists = await this.academicYearRepository.existsById(input.academicYearId)
        if (!ayExists) throw new AppError(400, 'Conflict', `Tahun Ajaran ${input.academicYearId} tidak ditemukan`)
      }

      if (input.curriculumId) {
        const curExists = await this.curriculumRepository.existsById(input.curriculumId)
        if (!curExists) throw new AppError(400, 'Conflict', `Kurikulum ${input.curriculumId} tidak ditemukan`)
      }

      const dup = await this.repository.findDuplicate(academicYearId, curriculumId, educationLevel, parallel, id)
      if (dup) {
        throw new AppError(400, 'Conflict', `Kelas ${educationLevel} ${parallel} sudah ada di tahun ajaran dan kurikulum yang sama`)
      }
    }

    const updated = await this.repository.update(id, {
      academicYearId: input.academicYearId,
      curriculumId: input.curriculumId,
      educationLevel: input.educationLevel,
      parallel: input.parallel,
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
}
