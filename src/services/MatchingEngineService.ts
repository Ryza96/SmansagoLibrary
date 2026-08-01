import type {
  CanonicalRow,
  FieldMatch,
  MatchedRow,
  MatchedWorkbook,
  MatchingResult,
  MatchStatus,
  ValidatedWorkbook,
} from '../types/import'
import type { MatchStrategy } from '../shared/match-strategy'
import { dummyMatchStrategies } from './DummyMatchStrategies'

export class MatchingEngineService {
  constructor(private readonly strategies: readonly MatchStrategy[] = dummyMatchStrategies) {}

  async match(validatedWorkbook: ValidatedWorkbook): Promise<MatchedWorkbook> {
    const canonicalRows = validatedWorkbook.canonicalRows

    const matchedRows: MatchedRow[] = await Promise.all(
      canonicalRows.map(async (canonicalRow) => ({
        rowNumber: canonicalRow.rowNumber,
        canonicalRow,
        matches: await this.matchRow(canonicalRow),
        issues: [],
      }))
    )

    const matchingResult: MatchingResult = {
      valid: true,
      errors: [],
      warnings: [],
    }

    return { canonicalRows, matchedRows, matchingResult }
  }

  private async matchRow(canonicalRow: CanonicalRow): Promise<FieldMatch[]> {
    return Promise.all(
      this.strategies.map(async (strategy) => {
        const value = canonicalRow.values[strategy.field]
        if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
          return { field: strategy.field, provider: strategy.providerId, status: 'SKIPPED' as const, candidates: [] }
        }

        const candidates = await strategy.findMatches(String(value).trim())
        const status: MatchStatus =
          candidates.length === 0 ? 'NOT_FOUND' : candidates.length === 1 ? 'FOUND' : 'AMBIGUOUS'

        return { field: strategy.field, provider: strategy.providerId, status, candidates }
      })
    )
  }
}

export const matchingEngineService = new MatchingEngineService()
