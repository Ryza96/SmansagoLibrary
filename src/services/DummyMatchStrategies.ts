import type { MatchStrategy } from '../shared/match-strategy'
import {
  DummyAuthorMatchProvider,
  DummyCategoryMatchProvider,
  DummyIsbnMatchProvider,
  DummyPublisherMatchProvider,
} from './DummyMatchProviders'
import { ContainsAuthorStrategy } from './strategies/ContainsAuthorStrategy'
import { ContainsCategoryStrategy } from './strategies/ContainsCategoryStrategy'
import { ContainsPublisherStrategy } from './strategies/ContainsPublisherStrategy'
import { ExactBookStrategy } from './strategies/ExactBookStrategy'

export const dummyMatchStrategies: MatchStrategy[] = [
  new ExactBookStrategy(new DummyIsbnMatchProvider()),
  new ContainsAuthorStrategy(new DummyAuthorMatchProvider()),
  new ContainsPublisherStrategy(new DummyPublisherMatchProvider()),
  new ContainsCategoryStrategy(new DummyCategoryMatchProvider()),
]
