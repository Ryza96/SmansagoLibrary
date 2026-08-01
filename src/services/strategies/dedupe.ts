import type { MatchCandidate } from '../../shared/match-provider'

export function dedupeById(candidates: MatchCandidate[]): MatchCandidate[] {
  const seen = new Set<string>()
  return candidates.filter((candidate) => {
    if (seen.has(candidate.id)) return false
    seen.add(candidate.id)
    return true
  })
}
