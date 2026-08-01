import type { MatchCandidate } from '../../shared/match-provider'
import type { BookMatchProvider } from '../../shared/match-provider'
import type { BookMatchStrategy } from '../../shared/match-strategy'

export class ExactBookStrategy implements BookMatchStrategy {
  readonly id = 'exact-book'
  readonly field = 'isbn'
  readonly label = 'Exact Book'
  readonly providerId: string

  constructor(private readonly provider: BookMatchProvider) {
    this.providerId = provider.id
  }

  async findMatches(value: string): Promise<MatchCandidate[]> {
    return this.provider.findByISBN(value.trim())
  }
}
