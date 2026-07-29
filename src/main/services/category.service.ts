import { CategoryRepository } from '../repositories/category.repository'
import { BookRepository } from '../repositories/book.repository'
import { normalizeName } from '../shared/string-utils'
import { DuplicateResourceError, ResourceInUseError } from '../shared/errors'
import type { FindCategoriesQueryDTO, CategoryDTO, CreateCategoryDTO, UpdateCategoryDTO } from '../../shared/dto/master'

export class CategoryService {
  constructor(
    private repository: CategoryRepository,
    private bookRepository: BookRepository
  ) {}

  async getAll(query?: FindCategoriesQueryDTO): Promise<CategoryDTO[]> {
    const categories = await this.repository.findMany(query)
    return categories.map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      description: c.description,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString()
    }))
  }

  async getById(id: string) {
    return this.repository.findById(id)
  }

  async create(data: CreateCategoryDTO): Promise<CategoryDTO> {
    const code = data.code.trim()
    const name = normalizeName(data.name)

    const existingCode = await this.repository.existsByCode(code)
    if (existingCode) {
      throw new DuplicateResourceError('Category', 'code', code)
    }

    const existingName = await this.repository.existsByName(name)
    if (existingName) {
      throw new DuplicateResourceError('Category', 'name', name)
    }

    const category = await this.repository.create({
      code,
      name,
      description: data.description?.trim() || undefined
    })
    return {
      id: category.id,
      code: category.code,
      name: category.name,
      description: category.description,
      createdAt: category.createdAt.toISOString(),
      updatedAt: category.updatedAt.toISOString()
    }
  }

  async update(id: string, data: UpdateCategoryDTO): Promise<CategoryDTO> {
    const code = data.code.trim()
    const name = normalizeName(data.name)

    const existingCode = await this.repository.existsByCode(code, id)
    if (existingCode) {
      throw new DuplicateResourceError('Category', 'code', code)
    }

    const existingName = await this.repository.existsByName(name, id)
    if (existingName) {
      throw new DuplicateResourceError('Category', 'name', name)
    }

    const category = await this.repository.update(id, {
      code,
      name,
      description: data.description?.trim() || null
    })
    return {
      id: category.id,
      code: category.code,
      name: category.name,
      description: category.description,
      createdAt: category.createdAt.toISOString(),
      updatedAt: category.updatedAt.toISOString()
    }
  }

  async delete(id: string): Promise<void> {
    const category = await this.repository.findById(id)
    if (!category) return

    const inUse = await this.bookRepository.existsByCategoryId(id)
    if (inUse) {
      throw new ResourceInUseError('Category', category.name)
    }

    await this.repository.delete(id)
  }
}
