export interface MatchCandidate {
  id: string
  label: string
}

export interface MatchProvider {
  readonly id: string
  readonly field: string
  readonly label: string
  /** @deprecated Transition method. Delegates to explicit operations. Removed in WO-5. */
  findMatches(value: string): Promise<MatchCandidate[]>
}

export interface NamedMatchProvider extends MatchProvider {
  findExact(value: string): Promise<MatchCandidate[]>
  findContains(value: string): Promise<MatchCandidate[]>
  findPrefix(value: string): Promise<MatchCandidate[]>
  findAll(limit?: number): Promise<MatchCandidate[]>
}

export interface AuthorMatchProvider extends NamedMatchProvider {
  readonly field: 'authors'
}

export interface PublisherMatchProvider extends NamedMatchProvider {
  readonly field: 'publisher'
}

export interface CategoryMatchProvider extends NamedMatchProvider {
  readonly field: 'category'
}

export interface BookMatchProvider extends MatchProvider {
  readonly field: 'isbn'
  findByISBN(isbn: string): Promise<MatchCandidate[]>
  findAll(limit?: number): Promise<MatchCandidate[]>
}
