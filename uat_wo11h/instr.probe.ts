import { createProductionStrategies } from '../src/main/strategies'
import { MatchingEngineService } from '../src/services/MatchingEngineService'
import { AutoCreateService } from '../src/main/services/auto-create.service'
import { BookRepository } from '../src/main/repositories/book.repository'
import { BookCopyRepository } from '../src/main/repositories/book-copy.repository'
import { AuthorRepository } from '../src/main/repositories/author.repository'
import { PublisherRepository } from '../src/main/repositories/publisher.repository'
import { CategoryRepository } from '../src/main/repositories/category.repository'
import { getPrisma } from '../src/main/repositories/base/prisma'
import { runTransaction } from '../src/main/repositories/base/transaction'
import { InventoryAllocator } from '../src/main/services/inventory-allocator'
import { ValidationEngineService } from '../src/services/ValidationEngineService'
import readXlsxFile from 'read-excel-file/node'
import type { RawSheet, ValidatedWorkbook, MatchedRow, ImportCellValue } from '../src/types/import'

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

function valueToString(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function valueToNumber(value: ImportCellValue): number | undefined {
  if (value === null || value === undefined) return undefined
  const num = typeof value === 'number' ? value : Number(String(value).trim())
  return Number.isFinite(num) ? num : undefined
}

function valueToDate(value: ImportCellValue): Date | undefined {
  if (value instanceof Date) return value
  return undefined
}

function resolvedId(row: MatchedRow, field: string): string | null {
  const match = row.matches.find((m) => m.field === field)
  return match?.resolvedEntity?.id ?? null
}

async function createBookWithCopies(
  bookData: { title: string; isbn?: string; authorId: string; publisherId: string; categoryId: string; publicationYear?: number; description?: string },
  copyCount: number,
  values: Record<string, ImportCellValue>
): Promise<void> {
  const bookRepo = new BookRepository()
  const copyRepo = new BookCopyRepository()
  const allocator = new InventoryAllocator()
  const shelfLocation = valueToString(values['shelfLocation']) || ''
  const acquisitionSource = valueToString(values['acquisitionSource']) || undefined
  const acquisitionDate = valueToDate(values['acquisitionDate'])
  const acquisitionCost = valueToNumber(values['acquisitionCost'])

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await runTransaction(getPrisma(), async (tx) => {
        const book = await bookRepo.createWithTx(tx, bookData)
        console.log('  [tx] book created id=' + book.id)
        const inventoryNumbers = await allocator.allocate(tx, copyCount)
        console.log('  [tx] inv allocated=' + JSON.stringify(inventoryNumbers))
        await copyRepo.createManyWithTx(
          tx,
          inventoryNumbers.map((inventoryNumber) => ({
            bookId: book.id,
            inventoryNumber,
            barcode: inventoryNumber,
            shelfLocation,
            acquisitionSource,
            acquisitionDate,
            acquisitionCost,
          }))
        )
        console.log('  [tx] copies created=' + copyCount)
      })
      return
    } catch (error) {
      const code = (error as { code?: string })?.code
      console.error('  [tx] ATTEMPT ' + attempt + ' FAILED code=' + code + ' msg=' + (error as Error).message)
      if (code === 'P2002' && attempt < 2) continue
      throw error
    }
  }
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

  const sheets = await readRawSheets(process.env.TEMPLATE_PATH!)
  const validated = new ValidationEngineService().validate({ sheets })
  const wb = toValidatedWorkbook(validated.canonicalRows)
  const matched = await engine.match(wb)
  await autoCreate.apply(matched)

  for (const row of matched.matchedRows) {
    const title = valueToString(row.canonicalRow.values['title'])
    if (!title) continue
    const authorId = resolvedId(row, 'authors')
    const publisherId = resolvedId(row, 'publisher')
    const categoryId = resolvedId(row, 'category')
    console.log('ROW ' + row.rowNumber + ' title=' + title + ' authorId=' + authorId + ' pubId=' + publisherId + ' catId=' + categoryId)
    if (!authorId || !publisherId || !categoryId) {
      console.log('  SKIP entityMissing')
      continue
    }
    const isbnValue = row.canonicalRow.values['isbn']
    const isbn = isbnValue === null || isbnValue === undefined ? null : String(isbnValue).trim() || null
    const copyCount = valueToNumber(row.canonicalRow.values['copyCount']) ?? 1
    try {
      await createBookWithCopies(
        {
          title,
          isbn: isbn ?? undefined,
          authorId,
          publisherId,
          categoryId,
          publicationYear: valueToNumber(row.canonicalRow.values['year']),
          description: valueToString(row.canonicalRow.values['description']) || undefined,
        },
        copyCount,
        row.canonicalRow.values
      )
      console.log('  ROW ' + row.rowNumber + ' OK')
    } catch (e) {
      console.error('  ROW ' + row.rowNumber + ' FAILED code=' + (e as { code?: string }).code + ' msg=' + (e as Error).message)
    }
  }

  const counts = await Promise.all([
    prisma.book.count(),
    prisma.bookCopy.count(),
    prisma.author.count(),
    prisma.publisher.count(),
    prisma.category.count(),
    prisma.inventorySequence.count(),
  ])
  console.log('DB_COUNTS=' + JSON.stringify({ books: counts[0], copies: counts[1], authors: counts[2], publishers: counts[3], categories: counts[4], seq: counts[5] }))
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error('PROBE_ERROR ' + e.message)
  process.exit(1)
})
