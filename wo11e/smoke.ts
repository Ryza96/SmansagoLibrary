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
import { validationEngineService } from '../src/services/ValidationEngineService'
import { BOOK_IMPORT_TEMPLATE, LEGACY_BOOK_IMPORT_TEMPLATE } from '../src/config/bookImport.template'
import type {
  CanonicalRow,
  ImportCellValue,
  ImportResultDTO,
  RawWorkbook,
  ValidatedWorkbook,
} from '../src/types/import'

const V2_HEADER = BOOK_IMPORT_TEMPLATE.columns.map((c) => c.label)
const V1_HEADER = LEGACY_BOOK_IMPORT_TEMPLATE.columns.map((c) => c.label)

function toValidatedWorkbook(canonicalRows: CanonicalRow[]): ValidatedWorkbook {
  return {
    rawWorkbook: { sheets: [] },
    normalizedHeaders: [],
    rowResults: [],
    canonicalRows,
    validationResult: { valid: true, errors: [], warnings: [] },
  }
}

function v2Row(overrides: Partial<Record<number, ImportCellValue>> = {}): ImportCellValue[] {
  const row: ImportCellValue[] = [
    'WO11E Judul',
    'WO11E Penulis',
    'WO11E Penerbit',
    2024,
    'WO11E Kategori',
    1,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
  ]
  for (const [index, value] of Object.entries(overrides)) {
    row[Number(index)] = value
  }
  return row
}

function v2Workbook(rows: ImportCellValue[][]): RawWorkbook {
  return { sheets: [{ name: 'Sheet1', rows: [V2_HEADER, ...rows] }] }
}

let pass = 0
let fail = 0

function check(name: string, ok: boolean, detail?: string): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`)
  if (ok) pass += 1
  else fail += 1
}

function issueCodes(workbook: RawWorkbook): string[] {
  const result = validationEngineService.validate(workbook)
  const rowCodes = result.rowResults.flatMap((r) => r.issues.map((i) => i.code))
  return [...result.validationResult.errors.map((e) => e.code), ...rowCodes]
}

async function main(): Promise<void> {
  const prisma = getPrisma()

  {
    const r = validationEngineService.validate(v2Workbook([v2Row({ 5: 5 })]))
    check('V1: copyCount=5 valid', r.validationResult.valid, `errors=${r.validationResult.errors.map((e) => e.code).join(',')}`)
    check('V1: rowResult valid', r.rowResults[0]?.valid === true)
    check('V1: canonical row memuat copyCount=5', r.canonicalRows[0]?.values['copyCount'] === 5)
  }
  {
    const codes = issueCodes(v2Workbook([v2Row({ 5: 1001 })]))
    check('V2: copyCount=1001 -> IMP-015', codes.includes('IMP-015'), codes.join(','))
  }
  {
    const codes = issueCodes(v2Workbook([v2Row({ 5: 0 })]))
    check('V3: copyCount=0 -> IMP-015', codes.includes('IMP-015'), codes.join(','))
  }
  {
    const codes = issueCodes(v2Workbook([v2Row({ 5: 2.5 })]))
    check('V4: copyCount=2.5 (bukan integer) -> IMP-015', codes.includes('IMP-015'), codes.join(','))
  }
  {
    const r = validationEngineService.validate(v2Workbook([v2Row({ 5: 1000 })]))
    check('V5: copyCount=1000 (batas atas) valid', r.validationResult.valid, `errors=${r.validationResult.errors.map((e) => e.code).join(',')}`)
  }
  {
    const wb: RawWorkbook = { sheets: [{ name: 'Sheet1', rows: [V1_HEADER, ['WO11E V1', 'WO11E Penulis', 'WO11E Penerbit', 2024, 'WO11E Kategori', null]] }] }
    const r = validationEngineService.validate(wb)
    check('V6: v1 tanpa kolom copyCount valid (regresi)', r.validationResult.valid && r.rowResults[0]?.valid === true, `errors=${r.validationResult.errors.map((e) => e.code).join(',')}`)
  }

  const strategies = createProductionStrategies()
  const engine = new MatchingEngineService(strategies)
  const autoCreate = new AutoCreateService(
    new AuthorRepository(),
    new PublisherRepository(),
    new CategoryRepository()
  )
  const bookImport = new BookImportService(new BookRepository(), new BookCopyRepository(), autoCreate)

  const runImport = async (rows: CanonicalRow[]): Promise<ImportResultDTO> => {
    const wb = toValidatedWorkbook(rows)
    const matched = await engine.match(wb)
    return bookImport.importBooks(matched)
  }

  const r1 = await runImport([
    {
      rowNumber: 1,
      values: {
        title: 'WO11E Satu Copy',
        isbn: '978-000-200-000-1',
        authors: 'WO11E Penulis',
        publisher: 'WO11E Penerbit',
        category: 'WO11E Kategori',
        year: 2024,
        copyCount: 1,
      },
    },
  ])
  {
    const book = await prisma.book.findUnique({ where: { isbn: '978-000-200-000-1' } })
    const copies = book ? await prisma.bookCopy.findMany({ where: { bookId: book.id } }) : []
    check('P1: tidak ada error', r1.failedRows.length === 0, r1.failedRows.map((e) => e.messageKey).join(','))
    check('P1: Book dibuat', book !== null)
    check('P1: copyCount=1 -> 1 copy', copies.length === 1, `count=${copies.length}`)
    check('P1: inventoryNumber=INV-000001', copies[0]?.inventoryNumber === 'INV-000001', copies[0]?.inventoryNumber)
    check('P1: barcode === inventoryNumber', copies[0]?.barcode === copies[0]?.inventoryNumber)
  }

  const r2 = await runImport([
    {
      rowNumber: 1,
      values: {
        title: 'WO11E Sepuluh Copy',
        isbn: '978-000-200-000-2',
        authors: 'WO11E Penulis',
        publisher: 'WO11E Penerbit',
        category: 'WO11E Kategori',
        year: 2024,
        copyCount: 10,
      },
    },
  ])
  {
    const book = await prisma.book.findUnique({ where: { isbn: '978-000-200-000-2' } })
    const copies = book ? await prisma.bookCopy.findMany({ where: { bookId: book.id }, orderBy: { inventoryNumber: 'asc' } }) : []
    const expected = Array.from({ length: 10 }, (_, i) => `INV-${String(i + 2).padStart(6, '0')}`)
    const actual = copies.map((c) => c.inventoryNumber)
    check('P2: tidak ada error', r2.failedRows.length === 0, r2.failedRows.map((e) => e.messageKey).join(','))
    check('P2: copyCount=10 -> 10 copy', copies.length === 10, `count=${copies.length}`)
    check('P2: nomor berurutan INV-000002..000011', JSON.stringify(actual) === JSON.stringify(expected), actual.join(','))
    check('P2: semua barcode === inventoryNumber', copies.every((c) => c.barcode === c.inventoryNumber))
    check('P2: inventory unik (set 10)', new Set(actual).size === 10)
  }

  const r3 = await runImport([
    {
      rowNumber: 1,
      values: {
        title: 'WO11E V1 Default',
        isbn: '978-000-200-000-3',
        authors: 'WO11E Penulis',
        publisher: 'WO11E Penerbit',
        category: 'WO11E Kategori',
        year: 2024,
      },
    },
  ])
  {
    const book = await prisma.book.findUnique({ where: { isbn: '978-000-200-000-3' } })
    const copies = book ? await prisma.bookCopy.findMany({ where: { bookId: book.id } }) : []
    check('P3: tidak ada error', r3.failedRows.length === 0, r3.failedRows.map((e) => e.messageKey).join(','))
    check('P3: v1 (tanpa copyCount) -> 1 copy', copies.length === 1, `count=${copies.length}`)
    check('P3: inventoryNumber=INV-000012', copies[0]?.inventoryNumber === 'INV-000012', copies[0]?.inventoryNumber)
  }

  const r4 = await runImport([
    {
      rowNumber: 1,
      values: {
        title: 'WO11E Defensive',
        isbn: '978-000-200-000-4',
        authors: 'WO11E Penulis',
        publisher: 'WO11E Penerbit',
        category: 'WO11E Kategori',
        year: 2024,
        copyCount: 1001,
      },
    },
  ])
  {
    const keys = r4.failedRows.map((e) => e.messageKey)
    const book = await prisma.book.findUnique({ where: { isbn: '978-000-200-000-4' } })
    check('P4: copyCount=1001 ditolak guard', keys.includes('bookImport.copyCreateFailed'), keys.join(','))
    check('P4: tidak ada Book dibuat', book === null)
    const seq = await prisma.inventorySequence.findUnique({ where: { id: 'default' } })
    check('P4: sequence tidak berubah (12)', seq?.lastNumber === 12, `lastNumber=${seq?.lastNumber}`)
  }

  const seedBook = await prisma.book.create({
    data: { title: 'WO11E Seed Rollback', isbn: 'SEED-ROLLBACK-000' },
  })
  for (let n = 13; n <= 42; n++) {
    const inv = `INV-${String(n).padStart(6, '0')}`
    await prisma.bookCopy.create({
      data: { bookId: seedBook.id, inventoryNumber: inv, barcode: inv, shelfLocation: 'Rak Rollback' },
    })
  }
  const copiesBefore = await prisma.bookCopy.count()
  check('P5: pra-kondisi 42 copy (12 import + 30 seed)', copiesBefore === 42, `count=${copiesBefore}`)

  const r5 = await runImport([
    {
      rowNumber: 1,
      values: {
        title: 'WO11E Rollback',
        isbn: '978-000-200-000-5',
        authors: 'WO11E Penulis',
        publisher: 'WO11E Penerbit',
        category: 'WO11E Kategori',
        year: 2024,
        copyCount: 10,
      },
    },
  ])
  {
    const book = await prisma.book.findUnique({ where: { isbn: '978-000-200-000-5' } })
    const newCopies = book ? await prisma.bookCopy.findMany({ where: { bookId: book.id }, orderBy: { inventoryNumber: 'asc' } }) : []
    const expected = Array.from({ length: 10 }, (_, i) => `INV-${String(43 + i).padStart(6, '0')}`)
    const copiesAfter = await prisma.bookCopy.count()
    const seq = await prisma.inventorySequence.findUnique({ where: { id: 'default' } })
    check('P5: healing urutan — tidak ada error', r5.failedRows.length === 0, r5.failedRows.map((e) => e.messageKey).join(','))
    check('P5: Book dibuat', book !== null)
    check('P5: alokasi lanjut INV-000043..000052 (healing lewat seed)', JSON.stringify(newCopies.map((c) => c.inventoryNumber)) === JSON.stringify(expected), newCopies.map((c) => c.inventoryNumber).join(','))
    check('P5: total copy 52 (42 + 10)', copiesAfter === 52, `count=${copiesAfter}`)
    check('P5: sequence healed ke 52', seq?.lastNumber === 52, `lastNumber=${seq?.lastNumber}`)
  }

  {
    const all = await prisma.bookCopy.findMany()
    const inventorySet = new Set(all.map((c) => c.inventoryNumber))
    const barcodeSet = new Set(all.map((c) => c.barcode))
    check('P6: seluruh inventoryNumber unik', inventorySet.size === all.length, `count=${all.length}, set=${inventorySet.size}`)
    check('P7: seluruh barcode unik', barcodeSet.size === all.length, `count=${all.length}, set=${barcodeSet.size}`)
  }

  await prisma.$disconnect()

  console.log(`WO11E RESULT: ${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
