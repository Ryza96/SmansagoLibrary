import type { MatchCandidate } from '../../shared/match-provider'
import type { AuthorMatchProvider } from '../../shared/match-provider'
import type { AuthorMatchStrategy } from '../../shared/match-strategy'

export class PrefixAuthorStrategy implements AuthorMatchStrategy {
  readonly id = 'prefix-author'
  readonly field = 'authors'
  readonly label = 'Prefix Author'
  readonly providerId: string

  constructor(private readonly provider: AuthorMatchProvider) {
    this.providerId = provider.id
  }

  async findMatches(value: string): Promise<MatchCandidate[]> {
    return this.provider.findPrefix(value.trim())
  }
}
