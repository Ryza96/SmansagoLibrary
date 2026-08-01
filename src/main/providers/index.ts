import type { MatchProvider } from '../../shared/match-provider'
import { AuthorRepository } from '../repositories/author.repository'
import { BookRepository } from '../repositories/book.repository'
import { CategoryRepository } from '../repositories/category.repository'
import { PublisherRepository } from '../repositories/publisher.repository'
import { PrismaAuthorMatchProvider } from './prisma-author-match.provider'
import { PrismaBookMatchProvider } from './prisma-book-match.provider'
import { PrismaCategoryMatchProvider } from './prisma-category-match.provider'
import { PrismaPublisherMatchProvider } from './prisma-publisher-match.provider'

/** @deprecated Use createProductionStrategies from src/main/strategies/index.ts instead. */
export function createPrismaMatchProviders(): MatchProvider[] {
  return [
    new PrismaBookMatchProvider(new BookRepository()),
    new PrismaAuthorMatchProvider(new AuthorRepository()),
    new PrismaPublisherMatchProvider(new PublisherRepository()),
    new PrismaCategoryMatchProvider(new CategoryRepository()),
  ]
}

export {
  PrismaAuthorMatchProvider,
  PrismaBookMatchProvider,
  PrismaCategoryMatchProvider,
  PrismaPublisherMatchProvider,
}
