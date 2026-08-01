import { createProductionStrategies } from '../src/main/strategies'
import { MatchingEngineService } from '../src/services/MatchingEngineService'
import { AutoCreateService } from '../src/main/services/auto-create.service'
import { BookImportService } from '../src/main/services/book-import.service'
import { BookRepository } from '../src/main/repositories/book.repository'
import { BookCopyRepository } from '../src/main/repositories/book-copy.repository'
import { AuthorRepository } from '../src/main/repositories/author.repository'
import { PublisherRepository } from '../src/main/repositories/publisher.repository'
import { CategoryRepository } from '../src/main/repositories/category.repository'
import { getPrisma } from '../src/main/repositories/base/prisma'
import { ValidationEngineService } from '../src/services/ValidationEngineService'
import readXlsxFile from 'read-excel-file/node'
import type { RawSheet, ValidatedWorkbook } from '../src/types/import'

function toValidatedWorkbook(canonicalRows: ValidatedWorkbook['canonicalRows']): ValidatedWorkbook {
  return {
    rawWorkbook: { sheets: [] },
    normalizedHeaders: [],
    rowResults: [],
    canonicalRows,
    validationResult: { valid: true, errors: [], warnings: [] },
  }
}

async function readRawSheets(filePath: string): Promise<RawSheet[]> {
  const result = await readXlsxFile(filePath)
  const sheetObjects = result as Array<{ sheet: string; data: unknown[][] }>
  return sheetObjects.map((s) => ({ name: s.sheet, rows: s.data as (string | number | boolean | Date | null)[][] }))
}

async function main(): Promise<void> {
  const prisma = getPrisma()

  const strategies = createProductionStrategies()
  const engine = new MatchingEngineService(strategies)
  const autoCreate = new AutoCreateService(
    new AuthorRepository(),
    new PublisherRepository(),
    new CategoryRepository()
  )
  const bookImport = new BookImportService(new BookRepository(), new BookCopyRepository())

  const sheets = await readRawSheets(process.env.TEMPLATE_PATH!)
  const rawWorkbook = { sheets }
  const validated = new ValidationEngineService().validate(rawWorkbook)

  console.log('VALIDATION_VALID=' + validated.validationResult.valid)
  console.log('VALIDATION_ERRORS=' + JSON.stringify(validated.validationResult.errors))
  console.log('CANONICAL_ROWS=' + JSON.stringify(validated.canonicalRows))

  const wb = toValidatedWorkbook(validated.canonicalRows)
  const matched = await engine.match(wb)
  await autoCreate.apply(matched)
  const result = await bookImport.importBooks(matched)

  console.log('MATCHING_ERRORS=' + JSON.stringify(result.matchingResult.errors))
  console.log('MATCHING_WARNINGS=' + JSON.stringify(result.matchingResult.warnings))
  console.log('MATCHED_ROWS=' + JSON.stringify(
    result.matchedRows.map((m) => ({
      rowNumber: m.rowNumber,
      matches: m.matches.map((x) => ({ field: x.field, status: x.status, resolved: x.resolvedEntity })),
      issues: m.issues,
    }))
  ))

  const [books, copies, authors, publishers, categories, seq] = await Promise.all([
    prisma.book.findMany({ orderBy: { title: 'asc' } }),
    prisma.bookCopy.findMany({ orderBy: { inventoryNumber: 'asc' } }),
    prisma.author.findMany({ orderBy: { name: 'asc' } }),
    prisma.publisher.findMany({ orderBy: { name: 'asc' } }),
    prisma.category.findMany({ orderBy: { name: 'asc' } }),
    prisma.inventorySequence.findMany(),
  ])
  console.log('DB_BOOKS=' + JSON.stringify(books.map((b) => ({ id: b.id, title: b.title, isbn: b.isbn }))))
  console.log('DB_COPIES=' + JSON.stringify(copies.map((c) => ({ id: c.id, bookId: c.bookId, inventoryNumber: c.inventoryNumber, barcode: c.barcode }))))
  console.log('DB_COUNTS=' + JSON.stringify({ books: books.length, copies: copies.length, authors: authors.length, publishers: publishers.length, categories: categories.length, seq: seq.length }))

  await prisma.$disconnect()
}

main().catch((error) => {
  console.error('PROBE_ERROR')
  console.error(error)
  process.exit(1)
})
