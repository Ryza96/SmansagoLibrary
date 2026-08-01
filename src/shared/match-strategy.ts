import type { MatchCandidate } from './match-provider'

export interface MatchStrategy {
  readonly id: string
  readonly field: string
  readonly label: string
  readonly providerId: string
  findMatches(value: string): Promise<MatchCandidate[]>
}

export interface AuthorMatchStrategy extends MatchStrategy {
  readonly field: 'authors'
}

export interface PublisherMatchStrategy extends MatchStrategy {
  readonly field: 'publisher'
}

export interface CategoryMatchStrategy extends MatchStrategy {
  readonly field: 'category'
}

export interface BookMatchStrategy extends MatchStrategy {
  readonly field: 'isbn'
}
