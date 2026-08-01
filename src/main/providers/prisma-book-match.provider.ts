import type { BookMatchProvider, MatchCandidate } from '../../shared/match-provider'
import type { BookRepository } from '../repositories/book.repository'

export class PrismaBookMatchProvider implements BookMatchProvider {
  readonly id = 'prisma-book'
  readonly field = 'isbn'
  readonly label = 'Prisma Book'

  constructor(private readonly repository: BookRepository) {}

  async findMatches(value: string): Promise<MatchCandidate[]> {
    return this.findByISBN(value)
  }

  async findByISBN(isbn: string): Promise<MatchCandidate[]> {
    const book = await this.repository.findByISBN(isbn)
    return book ? [{ id: book.id, label: book.title }] : []
  }

  async findAll(limit?: number): Promise<MatchCandidate[]> {
    const result = await this.repository.findAll(limit)
    return result.map((book) => ({ id: book.id, label: book.title }))
  }
}
