import type { MatchCandidate } from '../../shared/match-provider'
import type { AuthorMatchProvider } from '../../shared/match-provider'
import type { AuthorMatchStrategy } from '../../shared/match-strategy'
import { levenshteinRatio, normalizeForComparison } from './similarity'

export interface FuzzyAuthorOptions {
  threshold?: number
  limit?: number
  scanLimit?: number
}

export class FuzzyAuthorStrategy implements AuthorMatchStrategy {
  readonly id = 'fuzzy-author'
  readonly field = 'authors'
  readonly label = 'Fuzzy Author'
  readonly providerId: string

  constructor(
    private readonly provider: AuthorMatchProvider,
    private readonly options: FuzzyAuthorOptions = {}
  ) {
    this.providerId = provider.id
  }

  async findMatches(value: string): Promise<MatchCandidate[]> {
    const needle = normalizeForComparison(value)
    const threshold = this.options.threshold ?? 0.8
    const limit = this.options.limit ?? 10
    const scanLimit = this.options.scanLimit ?? 500

    const all = await this.provider.findAll(scanLimit)

    return all
      .map((candidate) => ({
        candidate,
        score: levenshteinRatio(needle, normalizeForComparison(candidate.label)),
      }))
      .filter((item) => item.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((item) => item.candidate)
  }
}
