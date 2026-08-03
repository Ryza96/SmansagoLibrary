import { AcademicYearRepository } from '../repositories/academic-year.repository'
import { ClassRepository } from '../repositories/class.repository'
import type { AcademicYearDTO, CreateAcademicYearDTO, UpdateAcademicYearDTO } from '../../shared/dto/academic'
import { AppError } from '../../../electron/main/errorHandler'

function toDTO(record: NonNullable<Awaited<ReturnType<AcademicYearRepository['findById']>>>): AcademicYearDTO {
  return {
    id: record.id,
    name: record.name,
    startDate: record.startDate.toISOString(),
    endDate: record.endDate.toISOString(),
    isActive: record.isActive,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  }
}

export class AcademicYearService {
  constructor(
    private repository: AcademicYearRepository,
    private classRepository: ClassRepository
  ) {}

  async findMany(search?: string, page?: number, limit?: number) {
    const result = await this.repository.findMany({ search, pagination: { page, limit } })
    return {
      ...result,
      data: result.data.map(toDTO)
    }
  }

  async findById(id: string): Promise<AcademicYearDTO> {
    const record = await this.repository.findById(id)
    if (!record) {
      throw new AppError(404, 'Not Found', `Tahun Ajaran ${id} tidak ditemukan`)
    }
    return toDTO(record)
  }

  async create(input: CreateAcademicYearDTO): Promise<AcademicYearDTO> {
    const name = input.name.trim()
    const taken = await this.repository.existsByName(name)
    if (taken) {
      throw new AppError(400, 'Conflict', `Tahun Ajaran "${name}" sudah digunakan`)
    }

    const record =
      input.isActive === true
        ? await this.repository.createExclusiveActive({
            name,
            startDate: new Date(input.startDate),
            endDate: new Date(input.endDate),
            isActive: true
          })
        : await this.repository.create({
            name,
            startDate: new Date(input.startDate),
            endDate: new Date(input.endDate),
            isActive: input.isActive
          })

    return toDTO(record)
  }

  async update(id: string, input: UpdateAcademicYearDTO): Promise<AcademicYearDTO> {
    const existing = await this.repository.findById(id)
    if (!existing) {
      throw new AppError(404, 'Not Found', `Tahun Ajaran ${id} tidak ditemukan`)
    }

    if (input.isActive !== undefined && input.isActive !== existing.isActive) {
      throw new AppError(
        400,
        'Conflict',
        'Status aktif Tahun Ajaran hanya dapat diubah melalui operasi Buka/Tutup Tahun (activate/deactivate)'
      )
    }

    const name = input.name?.trim()
    if (name && name !== existing.name) {
      const taken = await this.repository.existsByName(name)
      if (taken) {
        throw new AppError(400, 'Conflict', `Tahun Ajaran "${name}" sudah digunakan`)
      }
    }

    const updated = await this.repository.update(id, {
      name,
      startDate: input.startDate ? new Date(input.startDate) : undefined,
      endDate: input.endDate ? new Date(input.endDate) : undefined
    })

    return toDTO(updated)
  }

  async activate(id: string): Promise<AcademicYearDTO> {
    const existing = await this.repository.findById(id)
    if (!existing) {
      throw new AppError(404, 'Not Found', `Tahun Ajaran ${id} tidak ditemukan`)
    }

    const updated = await this.repository.updateExclusiveActive(id, { isActive: true })

    return toDTO(updated)
  }

  async deactivate(id: string): Promise<AcademicYearDTO> {
    const existing = await this.repository.findById(id)
    if (!existing) {
      throw new AppError(404, 'Not Found', `Tahun Ajaran ${id} tidak ditemukan`)
    }

    if (!existing.isActive) {
      throw new AppError(400, 'Conflict', `Tahun Ajaran "${existing.name}" sudah tidak aktif`)
    }

    const active = await this.repository.findActive()
    if (!active || active.id === existing.id) {
      throw new AppError(
        400,
        'Conflict',
        `Tahun Ajaran "${existing.name}" adalah satu-satunya tahun aktif. Aktifkan tahun baru terlebih dahulu untuk perpindahan tahun`
      )
    }

    const updated = await this.repository.update(id, { isActive: false })

    return toDTO(updated)
  }

  async delete(id: string): Promise<void> {
    const existing = await this.repository.findById(id)
    if (!existing) {
      throw new AppError(404, 'Not Found', `Tahun Ajaran ${id} tidak ditemukan`)
    }

    const classCount = await this.classRepository.countByAcademicYear(id)
    if (classCount > 0) {
      throw new AppError(400, 'Conflict', `Tahun Ajaran "${existing.name}" tidak dapat dihapus karena masih digunakan oleh ${classCount} kelas`)
    }

    await this.repository.delete(id)
  }
}
