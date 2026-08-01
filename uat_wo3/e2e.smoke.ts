import readXlsxFile from 'read-excel-file/node'
import { validationEngineService } from '../src/services/ValidationEngineService'
import type { RawWorkbook, CanonicalRow, MatchedWorkbook, ValidatedWorkbook } from '../src/types/import'
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
import type { PrismaClient } from '@prisma/client'

function toValidatedWorkbook(canonicalRows: CanonicalRow[]): ValidatedWorkbook {
  return {
    rawWorkbook: { sheets: [] },
    normalizedHeaders: [],
    rowResults: [],
    canonicalRows,
    validationResult: { valid: true, errors: [], warnings: [] },
  }
}

let pass = 0
let fail = 0

function check(name: string, ok: boolean, detail?: string): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`)
  if (ok) pass += 1
  else fail += 1
}

async function main(): Promise<void> {
  const filePath = process.env.UAT_XLSX_PATH
  if (!filePath) {
    console.error('UAT_XLSX_PATH env required')
    process.exit(1)
  }

  // STEP 1 — Reader (read-excel-file) -> RawWorkbook, mapping SAMA dengan WorkbookReaderService
  const sheets = await readXlsxFile(filePath)
  const rawWorkbook: RawWorkbook = {
    sheets: (sheets ?? []).map((sheet) => ({
      name: sheet.sheet,
      rows: (sheet.data ?? []) as RawWorkbook['sheets'][number]['rows'],
    })),
  }
  check('E2E step1: reader menghasilkan 1 sheet', rawWorkbook.sheets.length === 1, `sheets=${rawWorkbook.sheets.length}`)
  check('E2E step1: sheet bernama Sheet1', rawWorkbook.sheets[0]?.name === 'Sheet1')
  check('E2E step1: 3 baris (header + 2 data)', rawWorkbook.sheets[0]?.rows.length === 3, `rows=${rawWorkbook.sheets[0]?.rows.length}`)

  // STEP 2 — ValidationEngineService (produksi), persis seperti useBookImportWorkflow.parseAndValidate
  const validated = validationEngineService.validate(rawWorkbook)
  check('E2E step2: validationResult.valid', validated.validationResult.valid)
  check('E2E step2: 2 canonical rows', validated.canonicalRows.length === 2, `rows=${validated.canonicalRows.length}`)
  const t1 = validated.canonicalRows.find((r) => r.values.title === 'UAT XLSX Buku A')
  const t2 = validated.canonicalRows.find((r) => r.values.title === 'UAT XLSX Buku B')
  check(
    'E2E step2: canonical values utuh (judul/penerbit/isbn)',
    t1?.values.publisher === 'UAT XLSX Penerbit A' && t2?.values.isbn === '978-000-300-000-2'
  )

  // STEP 3 — Pipeline imports:match (strategies produksi + autoCreate + importBooks)
  const prisma = getPrisma()
  const strategies = createProductionStrategies()
  const engine = new MatchingEngineService(strategies)
  const autoCreate = new AutoCreateService(
    new AuthorRepository(),
    new PublisherRepository(),
    new CategoryRepository()
  )
  const bookImport = new BookImportService(new BookRepository(), new BookCopyRepository())

  const matched: MatchedWorkbook = await engine.match(toValidatedWorkbook(validated.canonicalRows))
  check('E2E step3: matching tanpa error', matched.matchingResult.errors.length === 0, `errors=${matched.matchingResult.errors.map((e) => e.messageKey).join(',')}`)
  await autoCreate.apply(matched)
  const imported = await bookImport.importBooks(matched)
  check('E2E step3: importBooks tanpa error', imported.matchingResult.errors.length === 0, `errors=${imported.matchingResult.errors.map((e) => e.messageKey).join(',')}`)

  // STEP 4 — Verifikasi state DB
  const [books, copies, authors, publishers, categories] = await Promise.all([
    prisma.book.findMany({ orderBy: { title: 'asc' } }),
    prisma.bookCopy.findMany({ orderBy: { inventoryNumber: 'asc' } }),
    prisma.author.findMany({ orderBy: { name: 'asc' } }),
    prisma.publisher.findMany({ orderBy: { name: 'asc' } }),
    prisma.category.findMany({ orderBy: { name: 'asc' } }),
  ])
  check('E2E step4: 2 Book dibuat', books.length === 2, `books=${books.length}`)
  check('E2E step4: 2 BookCopy dibuat', copies.length === 2, `copies=${copies.length}`)
  check('E2E step4: 2 Author dibuat', authors.length === 2, `authors=${authors.length}`)
  check('E2E step4: 2 Publisher dibuat', publishers.length === 2, `publishers=${publishers.length}`)
  check('E2E step4: 2 Category dibuat', categories.length === 2, `categories=${categories.length}`)
  const bkA = books.find((b) => b.title === 'UAT XLSX Buku A')
  const bkB = books.find((b) => b.title === 'UAT XLSX Buku B')
  check('E2E step4: Buku A ada', Boolean(bkA))
  check('E2E step4: Buku B ada', Boolean(bkB))
  check(
    'E2E step4: relasi Buku A lengkap',
    bkA?.authorId === authors.find((a) => a.name === 'UAT XLSX Penulis A')?.id &&
      bkA?.publisherId === publishers.find((p) => p.name === 'UAT XLSX Penerbit A')?.id &&
      bkA?.categoryId === categories.find((c) => c.name === 'UAT XLSX Kategori A')?.id
  )
  check(
    'E2E step4: relasi Buku B lengkap',
    bkB?.authorId === authors.find((a) => a.name === 'UAT XLSX Penulis B')?.id &&
      bkB?.publisherId === publishers.find((p) => p.name === 'UAT XLSX Penerbit B')?.id &&
      bkB?.categoryId === categories.find((c) => c.name === 'UAT XLSX Kategori B')?.id
  )
  const copyA = copies.find((c) => c.bookId === bkA?.id)
  const copyB = copies.find((c) => c.bookId === bkB?.id)
  check('E2E step4: tiap Book punya 1 BookCopy', copies.length === 2 && Boolean(copyA) && Boolean(copyB))
  check('E2E step4: barcode === inventoryNumber (Buku A)', copyA?.barcode === copyA?.inventoryNumber, `barcode=${copyA?.barcode}`)
  check('E2E step4: barcode === inventoryNumber (Buku B)', copyB?.barcode === copyB?.inventoryNumber, `barcode=${copyB?.barcode}`)

  console.log('FINAL_DB ' + JSON.stringify({ books: books.length, copies: copies.length, authors: authors.length, publishers: publishers.length, categories: categories.length }))

  await prisma.$disconnect()

  console.log(`E2E RESULT: ${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
