import { createProductionStrategies } from '../src/main/strategies/index'
import { disconnectPrisma, getPrisma } from '../src/main/repositories/base/prisma'
import { dummyMatchStrategies } from '../src/services/DummyMatchStrategies'
import { matchingEngineService } from '../src/services/MatchingEngineService'
import type { MatchCandidate } from '../src/shared/match-provider'
import type { MatchStrategy } from '../src/shared/match-strategy'
import type { MatchStatus, ValidatedWorkbook } from '../src/types/import'

let passed = 0
let failed = 0

function statusOf(candidates: MatchCandidate[]): MatchStatus {
  return candidates.length === 0 ? 'NOT_FOUND' : candidates.length === 1 ? 'FOUND' : 'AMBIGUOUS'
}

function expectCandidates(
  label: string,
  candidates: MatchCandidate[],
  expected: MatchStatus,
  expectedId?: string
): void {
  const status = statusOf(candidates)
  const ok = status === expected && (expectedId === undefined || candidates[0]?.id === expectedId)
  if (ok) {
    passed += 1
    console.log(`[PASS] ${label} -> ${status} (${candidates.length})${expectedId ? ` id=${expectedId}` : ''}`)
  } else {
    failed += 1
    console.error(
      `[FAIL] ${label} -> ${status} (${candidates.length}) expected ${expected}${expectedId ? ` id=${expectedId}` : ''}`
    )
  }
}

async function expectStatus(
  label: string,
  strategy: MatchStrategy,
  value: string,
  expected: MatchStatus,
  expectedId?: string
): Promise<void> {
  expectCandidates(label, await strategy.findMatches(value), expected, expectedId)
}

async function seed(): Promise<void> {
  const prisma = getPrisma()

  await prisma.$transaction([
    prisma.bookCopy.deleteMany(),
    prisma.book.deleteMany(),
    prisma.author.deleteMany(),
    prisma.publisher.deleteMany(),
    prisma.category.deleteMany(),
  ])

  await prisma.$transaction([
    prisma.category.create({ data: { id: 'category1', code: 'NOVEL', name: 'Novel' } }),
    prisma.category.create({ data: { id: 'category2', code: 'FIKSI', name: 'Fiksi' } }),
    prisma.publisher.create({ data: { id: 'publisher1', name: 'Bentang Pustaka' } }),
    prisma.publisher.create({ data: { id: 'publisher2', name: 'Gramedia Pustaka Utama' } }),
    prisma.author.create({ data: { id: 'author1', name: 'Andrea Hirata' } }),
    prisma.author.create({ data: { id: 'author2', name: 'Ahmad Fuadi' } }),
    prisma.book.create({
      data: {
        id: 'book1',
        isbn: '978-602-8519-93-9',
        title: 'Laskar Pelangi',
        authorId: 'author1',
        publisherId: 'publisher1',
        categoryId: 'category1',
      },
    }),
    prisma.book.create({
      data: {
        id: 'book2',
        isbn: null,
        title: 'Negeri 5 Menara',
        authorId: 'author2',
        publisherId: 'publisher2',
        categoryId: 'category1',
      },
    }),
  ])
}

function strategiesByField(strategies: readonly MatchStrategy[]): Map<string, MatchStrategy> {
  return new Map(strategies.map((s) => [s.field, s]))
}

async function run(): Promise<void> {
  await seed()
  console.log('')

  console.log('[WO-7] PRODUCTION COMPOSITION ROOT (createProductionStrategies)')
  const production = createProductionStrategies()
  if (production.length !== 4) {
    throw new Error(`expected 4 production strategies, got ${production.length}`)
  }
  const prod = strategiesByField(production)
  const prodIsbn = prod.get('isbn')
  const prodAuthors = prod.get('authors')
  const prodPublisher = prod.get('publisher')
  const prodCategory = prod.get('category')
  if (!prodIsbn || !prodAuthors || !prodPublisher || !prodCategory) {
    throw new Error('production composition root missing a field strategy')
  }
  await expectStatus('isbn 978-602-8519-93-9', prodIsbn, '978-602-8519-93-9', 'FOUND', 'book1')
  await expectStatus('authors andrea', prodAuthors, 'andrea', 'FOUND', 'author1')
  await expectStatus('publisher bentang', prodPublisher, 'bentang', 'FOUND', 'publisher1')
  await expectStatus('category novel', prodCategory, 'novel', 'FOUND', 'category1')
  await expectStatus('authors xyzzy (negative)', prodAuthors, 'xyzzy', 'NOT_FOUND')
  console.log('')

  console.log('[WO-7] DUMMY COMPOSITION ROOT (dummyMatchStrategies)')
  if (dummyMatchStrategies.length !== 4) {
    throw new Error(`expected 4 dummy strategies, got ${dummyMatchStrategies.length}`)
  }
  const dummy = strategiesByField(dummyMatchStrategies)
  const dummyIsbn = dummy.get('isbn')
  const dummyAuthors = dummy.get('authors')
  const dummyPublisher = dummy.get('publisher')
  const dummyCategory = dummy.get('category')
  if (!dummyIsbn || !dummyAuthors || !dummyPublisher || !dummyCategory) {
    throw new Error('dummy composition root missing a field strategy')
  }
  await expectStatus('isbn 9789793062792', dummyIsbn, '9789793062792', 'FOUND', 'isbn-9789793062792')
  await expectStatus('isbn 9781234567890 (ambiguous)', dummyIsbn, '9781234567890', 'AMBIGUOUS')
  await expectStatus('authors andrea', dummyAuthors, 'andrea', 'FOUND', 'author-andrea-hirata')
  await expectStatus('publisher bentang', dummyPublisher, 'bentang', 'FOUND', 'publisher-bentang-pustaka')
  await expectStatus('category fiksi', dummyCategory, 'fiksi', 'FOUND', 'category-fiksi')
  await expectStatus('authors xyzzy (negative)', dummyAuthors, 'xyzzy', 'NOT_FOUND')
  console.log('')

  console.log('[WO-7] ENGINE END-TO-END (default dummy composition root)')
  const workbook: ValidatedWorkbook = {
    rawWorkbook: {
      sheets: [
        {
          name: 'Buku',
          rows: [['9789793062792', 'Andrea Hirata', 'Bentang Pustaka', 'Fiksi']],
        },
      ],
    },
    normalizedHeaders: ['isbn', 'authors', 'publisher', 'category'],
    rowResults: [{ rowNumber: 2, valid: true, issues: [] }],
    canonicalRows: [
      {
        rowNumber: 2,
        values: { isbn: '9789793062792', authors: 'Andrea Hirata', publisher: 'Bentang Pustaka', category: 'Fiksi' },
      },
    ],
    validationResult: { valid: true, errors: [], warnings: [] },
  }
  const result = await matchingEngineService.match(workbook)
  const matches = result.matchedRows[0].matches
  const byField = new Map(matches.map((m) => [m.field, m]))
  const expectedProviders: Record<string, string> = {
    isbn: 'dummy-isbn',
    authors: 'dummy-author',
    publisher: 'dummy-publisher',
    category: 'dummy-category',
  }
  for (const field of ['isbn', 'authors', 'publisher', 'category']) {
    const match = byField.get(field)
    if (!match) {
      failed += 1
      console.error(`[FAIL] engine missing match for field ${field}`)
      continue
    }
    expectCandidates(`engine ${field}`, match.candidates, 'FOUND')
    if (match.provider === expectedProviders[field]) {
      passed += 1
      console.log(`[PASS] engine ${field} provider=${match.provider}`)
    } else {
      failed += 1
      console.error(`[FAIL] engine ${field} provider expected ${expectedProviders[field]} got ${match.provider}`)
    }
  }
  console.log('')

  console.log(`[WO-7] RESULT: ${passed} passed, ${failed} failed`)
}

run()
  .then(async () => {
    console.log(failed === 0 ? 'SMOKE TEST PASSED' : 'SMOKE TEST FAILED')
    await disconnectPrisma()
  })
  .then(() => {
    process.exit(failed === 0 ? 0 : 1)
  })
  .catch(async (error) => {
    console.error('SMOKE TEST ERROR:', error)
    await disconnectPrisma()
    process.exit(1)
  })
