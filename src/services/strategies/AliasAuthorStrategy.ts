import type { MatchCandidate } from '../../shared/match-provider'
import type { AuthorMatchProvider } from '../../shared/match-provider'
import type { AuthorMatchStrategy } from '../../shared/match-strategy'
import { dedupeById } from './dedupe'
import { normalizeForComparison } from './similarity'

export class AliasAuthorStrategy implements AuthorMatchStrategy {
  readonly id = 'alias-author'
  readonly field = 'authors'
  readonly label = 'Alias Author'
  readonly providerId: string

  constructor(
    private readonly provider: AuthorMatchProvider,
    private readonly aliases: Record<string, string[]>
  ) {
    this.providerId = provider.id
  }

  async findMatches(value: string): Promise<MatchCandidate[]> {
    const key = normalizeForComparison(value)
    const expansions = this.aliases[key] ?? [value.trim()]
    const results = await Promise.all(expansions.map((expansion) => this.provider.findExact(expansion)))
    return dedupeById(results.flat())
  }
}
