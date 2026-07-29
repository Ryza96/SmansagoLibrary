import { AuthorRepository } from '../repositories/author.repository'
import { BookRepository } from '../repositories/book.repository'
import { normalizeName } from '../shared/string-utils'
import { DuplicateResourceError, ResourceInUseError } from '../shared/errors'
import type { FindAuthorsQueryDTO, AuthorDTO, CreateAuthorDTO, UpdateAuthorDTO } from '../../shared/dto/master'

export class AuthorService {
  constructor(
    private repository: AuthorRepository,
    private bookRepository: BookRepository
  ) {}

  async getAll(query?: FindAuthorsQueryDTO): Promise<AuthorDTO[]> {
    const authors = await this.repository.findMany(query)
    return authors.map((a) => ({
      id: a.id,
      name: a.name,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString()
    }))
  }

  async getById(id: string) {
    return this.repository.findById(id)
  }

  async create(data: CreateAuthorDTO): Promise<AuthorDTO> {
    const name = normalizeName(data.name)

    const existing = await this.repository.existsByName(name)
    if (existing) {
      throw new DuplicateResourceError('Author', 'name', name)
    }

    const author = await this.repository.create({ name })
    return {
      id: author.id,
      name: author.name,
      createdAt: author.createdAt.toISOString(),
      updatedAt: author.updatedAt.toISOString()
    }
  }

  async update(id: string, data: UpdateAuthorDTO): Promise<AuthorDTO> {
    const name = normalizeName(data.name)

    const existing = await this.repository.existsByName(name, id)
    if (existing) {
      throw new DuplicateResourceError('Author', 'name', name)
    }

    const author = await this.repository.update(id, { name })
    return {
      id: author.id,
      name: author.name,
      createdAt: author.createdAt.toISOString(),
      updatedAt: author.updatedAt.toISOString()
    }
  }

  async delete(id: string): Promise<void> {
    const author = await this.repository.findById(id)
    if (!author) return

    const inUse = await this.bookRepository.existsByAuthorId(id)
    if (inUse) {
      throw new ResourceInUseError('Author', author.name)
    }

    await this.repository.delete(id)
  }
}
