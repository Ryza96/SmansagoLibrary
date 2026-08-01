import type { AuthorMatchProvider, MatchCandidate } from '../../shared/match-provider'
import type { AuthorRepository } from '../repositories/author.repository'

export class PrismaAuthorMatchProvider implements AuthorMatchProvider {
  readonly id = 'prisma-author'
  readonly field = 'authors'
  readonly label = 'Prisma Author'

  constructor(private readonly repository: AuthorRepository) {}

  async findMatches(value: string): Promise<MatchCandidate[]> {
    return this.findContains(value)
  }

  async findExact(value: string): Promise<MatchCandidate[]> {
    const result = await this.repository.findExact(value)
    return result.map((author) => ({ id: author.id, label: author.name }))
  }

  async findContains(value: string): Promise<MatchCandidate[]> {
    const result = await this.repository.findContains(value)
    return result.map((author) => ({ id: author.id, label: author.name }))
  }

  async findPrefix(value: string): Promise<MatchCandidate[]> {
    const result = await this.repository.findPrefix(value)
    return result.map((author) => ({ id: author.id, label: author.name }))
  }

  async findAll(limit?: number): Promise<MatchCandidate[]> {
    const result = await this.repository.findAll(limit)
    return result.map((author) => ({ id: author.id, label: author.name }))
  }
}
