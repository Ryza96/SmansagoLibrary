import type { MatchCandidate } from '../shared/match-provider'
import type {
  AuthorMatchProvider,
  BookMatchProvider,
  CategoryMatchProvider,
  PublisherMatchProvider,
} from './MatchProviders'

function normalize(value: string): string {
  return value.trim().toLowerCase()
}

export class DummyIsbnMatchProvider implements BookMatchProvider {
  readonly id = 'dummy-isbn'
  readonly field = 'isbn'
  readonly label = 'Dummy ISBN'

  private readonly records: Array<{ id: string; label: string; isbn: string }> = [
    { id: 'isbn-9789793062792', label: '978-979-3062-79-2', isbn: '9789793062792' },
    { id: 'isbn-9781234567890-a', label: '978-123-4567-89-0 (Edisi A)', isbn: '9781234567890' },
    { id: 'isbn-9781234567890-b', label: '978-123-4567-89-0 (Edisi B)', isbn: '9781234567890' },
  ]

  async findMatches(value: string): Promise<MatchCandidate[]> {
    return this.findByISBN(value)
  }

  async findByISBN(isbn: string): Promise<MatchCandidate[]> {
    const needle = normalize(isbn)
    return this.records
      .filter((record) => normalize(record.isbn) === needle)
      .map((record) => ({ id: record.id, label: record.label }))
  }

  async findAll(limit?: number): Promise<MatchCandidate[]> {
    const take = Math.min(500, Math.max(1, limit ?? 500))
    return this.records.slice(0, take).map((record) => ({ id: record.id, label: record.label }))
  }
}

export class DummyAuthorMatchProvider implements AuthorMatchProvider {
  readonly id = 'dummy-author'
  readonly field = 'authors'
  readonly label = 'Dummy Author'

  private readonly records: MatchCandidate[] = [
    { id: 'author-andrea-hirata', label: 'Andrea Hirata' },
    { id: 'author-pramoedya-ananta-toer', label: 'Pramoedya Ananta Toer' },
  ]

  async findMatches(value: string): Promise<MatchCandidate[]> {
    return this.findContains(value)
  }

  async findExact(value: string): Promise<MatchCandidate[]> {
    const needle = normalize(value)
    return this.records.filter((record) => normalize(record.label) === needle)
  }

  async findContains(value: string): Promise<MatchCandidate[]> {
    const needle = normalize(value)
    return this.records.filter((record) => normalize(record.label).includes(needle))
  }

  async findPrefix(value: string): Promise<MatchCandidate[]> {
    const needle = normalize(value)
    return this.records.filter((record) => normalize(record.label).startsWith(needle))
  }

  async findAll(limit?: number): Promise<MatchCandidate[]> {
    const take = Math.min(500, Math.max(1, limit ?? 500))
    return this.records.slice(0, take)
  }
}

export class DummyPublisherMatchProvider implements PublisherMatchProvider {
  readonly id = 'dummy-publisher'
  readonly field = 'publisher'
  readonly label = 'Dummy Publisher'

  private readonly records: MatchCandidate[] = [
    { id: 'publisher-gramedia', label: 'Gramedia Pustaka Utama' },
    { id: 'publisher-bentang-pustaka', label: 'Bentang Pustaka' },
  ]

  async findMatches(value: string): Promise<MatchCandidate[]> {
    return this.findContains(value)
  }

  async findExact(value: string): Promise<MatchCandidate[]> {
    const needle = normalize(value)
    return this.records.filter((record) => normalize(record.label) === needle)
  }

  async findContains(value: string): Promise<MatchCandidate[]> {
    const needle = normalize(value)
    return this.records.filter((record) => normalize(record.label).includes(needle))
  }

  async findPrefix(value: string): Promise<MatchCandidate[]> {
    const needle = normalize(value)
    return this.records.filter((record) => normalize(record.label).startsWith(needle))
  }

  async findAll(limit?: number): Promise<MatchCandidate[]> {
    const take = Math.min(500, Math.max(1, limit ?? 500))
    return this.records.slice(0, take)
  }
}

export class DummyCategoryMatchProvider implements CategoryMatchProvider {
  readonly id = 'dummy-category'
  readonly field = 'category'
  readonly label = 'Dummy Category'

  private readonly records: MatchCandidate[] = [
    { id: 'category-fiksi', label: 'Fiksi' },
    { id: 'category-sejarah', label: 'Sejarah' },
  ]

  async findMatches(value: string): Promise<MatchCandidate[]> {
    return this.findContains(value)
  }

  async findExact(value: string): Promise<MatchCandidate[]> {
    const needle = normalize(value)
    return this.records.filter((record) => normalize(record.label) === needle)
  }

  async findContains(value: string): Promise<MatchCandidate[]> {
    const needle = normalize(value)
    return this.records.filter((record) => normalize(record.label).includes(needle))
  }

  async findPrefix(value: string): Promise<MatchCandidate[]> {
    const needle = normalize(value)
    return this.records.filter((record) => normalize(record.label).startsWith(needle))
  }

  async findAll(limit?: number): Promise<MatchCandidate[]> {
    const take = Math.min(500, Math.max(1, limit ?? 500))
    return this.records.slice(0, take)
  }
}

export const dummyMatchProviders = [
  new DummyIsbnMatchProvider(),
  new DummyAuthorMatchProvider(),
  new DummyPublisherMatchProvider(),
  new DummyCategoryMatchProvider(),
]
