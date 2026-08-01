import type { CategoryMatchProvider, MatchCandidate } from '../../shared/match-provider'
import type { CategoryRepository } from '../repositories/category.repository'

export class PrismaCategoryMatchProvider implements CategoryMatchProvider {
  readonly id = 'prisma-category'
  readonly field = 'category'
  readonly label = 'Prisma Category'

  constructor(private readonly repository: CategoryRepository) {}

  async findMatches(value: string): Promise<MatchCandidate[]> {
    return this.findContains(value)
  }

  async findExact(value: string): Promise<MatchCandidate[]> {
    const result = await this.repository.findExact(value)
    return result.map((category) => ({ id: category.id, label: category.name }))
  }

  async findContains(value: string): Promise<MatchCandidate[]> {
    const result = await this.repository.findContains(value)
    return result.map((category) => ({ id: category.id, label: category.name }))
  }

  async findPrefix(value: string): Promise<MatchCandidate[]> {
    const result = await this.repository.findPrefix(value)
    return result.map((category) => ({ id: category.id, label: category.name }))
  }

  async findAll(limit?: number): Promise<MatchCandidate[]> {
    const result = await this.repository.findAll(limit)
    return result.map((category) => ({ id: category.id, label: category.name }))
  }
}
