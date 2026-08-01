import type { MatchStrategy } from '../../shared/match-strategy'
import { AuthorRepository } from '../repositories/author.repository'
import { BookRepository } from '../repositories/book.repository'
import { CategoryRepository } from '../repositories/category.repository'
import { PublisherRepository } from '../repositories/publisher.repository'
import { PrismaAuthorMatchProvider } from '../providers/prisma-author-match.provider'
import { PrismaBookMatchProvider } from '../providers/prisma-book-match.provider'
import { PrismaCategoryMatchProvider } from '../providers/prisma-category-match.provider'
import { PrismaPublisherMatchProvider } from '../providers/prisma-publisher-match.provider'
import { ContainsAuthorStrategy } from '../../services/strategies/ContainsAuthorStrategy'
import { ContainsCategoryStrategy } from '../../services/strategies/ContainsCategoryStrategy'
import { ContainsPublisherStrategy } from '../../services/strategies/ContainsPublisherStrategy'
import { ExactBookStrategy } from '../../services/strategies/ExactBookStrategy'

export function createProductionStrategies(): MatchStrategy[] {
  const book = new PrismaBookMatchProvider(new BookRepository())
  const author = new PrismaAuthorMatchProvider(new AuthorRepository())
  const publisher = new PrismaPublisherMatchProvider(new PublisherRepository())
  const category = new PrismaCategoryMatchProvider(new CategoryRepository())

  return [
    new ExactBookStrategy(book),
    new ContainsAuthorStrategy(author),
    new ContainsPublisherStrategy(publisher),
    new ContainsCategoryStrategy(category),
  ]
}
