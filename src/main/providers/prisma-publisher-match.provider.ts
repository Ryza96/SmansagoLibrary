import type { PublisherMatchProvider, MatchCandidate } from '../../shared/match-provider'
import type { PublisherRepository } from '../repositories/publisher.repository'

export class PrismaPublisherMatchProvider implements PublisherMatchProvider {
  readonly id = 'prisma-publisher'
  readonly field = 'publisher'
  readonly label = 'Prisma Publisher'

  constructor(private readonly repository: PublisherRepository) {}

  async findMatches(value: string): Promise<MatchCandidate[]> {
    return this.findContains(value)
  }

  async findExact(value: string): Promise<MatchCandidate[]> {
    const result = await this.repository.findExact(value)
    return result.map((publisher) => ({ id: publisher.id, label: publisher.name }))
  }

  async findContains(value: string): Promise<MatchCandidate[]> {
    const result = await this.repository.findContains(value)
    return result.map((publisher) => ({ id: publisher.id, label: publisher.name }))
  }

  async findPrefix(value: string): Promise<MatchCandidate[]> {
    const result = await this.repository.findPrefix(value)
    return result.map((publisher) => ({ id: publisher.id, label: publisher.name }))
  }

  async findAll(limit?: number): Promise<MatchCandidate[]> {
    const result = await this.repository.findAll(limit)
    return result.map((publisher) => ({ id: publisher.id, label: publisher.name }))
  }
}
