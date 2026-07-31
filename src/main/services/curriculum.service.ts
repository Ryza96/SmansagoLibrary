import { CurriculumRepository } from '../repositories/curriculum.repository'
import { ClassRepository } from '../repositories/class.repository'
import type { CurriculumDTO, CreateCurriculumDTO, UpdateCurriculumDTO } from '../../shared/dto/academic'
import { AppError } from '../../../electron/main/errorHandler'

function toDTO(record: NonNullable<Awaited<ReturnType<CurriculumRepository['findById']>>>): CurriculumDTO {
  return {
    id: record.id,
    name: record.name,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  }
}

export class CurriculumService {
  constructor(
    private repository: CurriculumRepository,
    private classRepository: ClassRepository
  ) {}

  async findMany(search?: string, page?: number, limit?: number) {
    const result = await this.repository.findMany({ search, pagination: { page, limit } })
    return {
      ...result,
      data: result.data.map(toDTO)
    }
  }

  async findById(id: string): Promise<CurriculumDTO> {
    const record = await this.repository.findById(id)
    if (!record) {
      throw new AppError(404, 'Not Found', `Kurikulum ${id} tidak ditemukan`)
    }
    return toDTO(record)
  }

  async create(input: CreateCurriculumDTO): Promise<CurriculumDTO> {
    const name = input.name.trim()
    const taken = await this.repository.existsByName(name)
    if (taken) {
      throw new AppError(400, 'Conflict', `Kurikulum "${name}" sudah digunakan`)
    }

    const record = await this.repository.create({ name })
    return toDTO(record)
  }

  async update(id: string, input: UpdateCurriculumDTO): Promise<CurriculumDTO> {
    const existing = await this.repository.findById(id)
    if (!existing) {
      throw new AppError(404, 'Not Found', `Kurikulum ${id} tidak ditemukan`)
    }

    const name = input.name?.trim()
    if (name && name !== existing.name) {
      const taken = await this.repository.existsByName(name)
      if (taken) {
        throw new AppError(400, 'Conflict', `Kurikulum "${name}" sudah digunakan`)
      }
    }

    const updated = await this.repository.update(id, { name })
    return toDTO(updated)
  }

  async delete(id: string): Promise<void> {
    const existing = await this.repository.findById(id)
    if (!existing) {
      throw new AppError(404, 'Not Found', `Kurikulum ${id} tidak ditemukan`)
    }

    const classCount = await this.classRepository.countByCurriculum(id)
    if (classCount > 0) {
      throw new AppError(400, 'Conflict', `Kurikulum "${existing.name}" tidak dapat dihapus karena masih digunakan oleh ${classCount} kelas`)
    }

    await this.repository.delete(id)
  }
}
