import type { MatchCandidate } from '../../shared/match-provider'
import type { CategoryMatchProvider } from '../../shared/match-provider'
import type { CategoryMatchStrategy } from '../../shared/match-strategy'

export class ContainsCategoryStrategy implements CategoryMatchStrategy {
  readonly id = 'contains-category'
  readonly field = 'category'
  readonly label = 'Contains Category'
  readonly providerId: string

  constructor(private readonly provider: CategoryMatchProvider) {
    this.providerId = provider.id
  }

  async findMatches(value: string): Promise<MatchCandidate[]> {
    return this.provider.findContains(value.trim())
  }
}
