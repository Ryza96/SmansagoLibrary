import type { MatchCandidate } from '../../shared/match-provider'
import type { PublisherMatchProvider } from '../../shared/match-provider'
import type { PublisherMatchStrategy } from '../../shared/match-strategy'

export class ContainsPublisherStrategy implements PublisherMatchStrategy {
  readonly id = 'contains-publisher'
  readonly field = 'publisher'
  readonly label = 'Contains Publisher'
  readonly providerId: string

  constructor(private readonly provider: PublisherMatchProvider) {
    this.providerId = provider.id
  }

  async findMatches(value: string): Promise<MatchCandidate[]> {
    return this.provider.findContains(value.trim())
  }
}
