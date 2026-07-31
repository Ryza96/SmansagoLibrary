import { PublisherRepository } from '../repositories/publisher.repository'
import { BookRepository } from '../repositories/book.repository'
import { normalizeName } from '../shared/string-utils'
import { DuplicateResourceError, ResourceInUseError } from '../shared/errors'
import type { FindPublishersQueryDTO, PublisherDTO, CreatePublisherDTO, UpdatePublisherDTO } from '../../../src/shared/dto/master'

export class PublisherService {
  constructor(
    private repository: PublisherRepository,
    private bookRepository: BookRepository
  ) {}

  async getAll(query?: FindPublishersQueryDTO): Promise<PublisherDTO[]> {
    const publishers = await this.repository.findMany(query)
    return publishers.map((p) => ({
      id: p.id,
      name: p.name,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString()
    }))
  }

  async getById(id: string) {
    return this.repository.findById(id)
  }

  async create(data: CreatePublisherDTO): Promise<PublisherDTO> {
    const name = normalizeName(data.name)

    const existing = await this.repository.existsByName(name)
    if (existing) {
      throw new DuplicateResourceError('Publisher', 'name', name)
    }

    const publisher = await this.repository.create({ name })
    return {
      id: publisher.id,
      name: publisher.name,
      createdAt: publisher.createdAt.toISOString(),
      updatedAt: publisher.updatedAt.toISOString()
    }
  }

  async update(id: string, data: UpdatePublisherDTO): Promise<PublisherDTO> {
    const name = normalizeName(data.name)

    const existing = await this.repository.existsByName(name, id)
    if (existing) {
      throw new DuplicateResourceError('Publisher', 'name', name)
    }

    const publisher = await this.repository.update(id, { name })
    return {
      id: publisher.id,
      name: publisher.name,
      createdAt: publisher.createdAt.toISOString(),
      updatedAt: publisher.updatedAt.toISOString()
    }
  }

  async delete(id: string): Promise<void> {
    const publisher = await this.repository.findById(id)
    if (!publisher) return

    const inUse = await this.bookRepository.existsByPublisherId(id)
    if (inUse) {
      throw new ResourceInUseError('Publisher', publisher.name)
    }

    await this.repository.delete(id)
  }
}
