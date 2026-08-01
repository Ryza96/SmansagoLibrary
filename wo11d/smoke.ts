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
import type { CanonicalRow, MatchedWorkbook, ValidatedWorkbook } from '../src/types/import'

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
  const prisma = getPrisma()

  const strategies = createProductionStrategies()
  const engine = new MatchingEngineService(strategies)
  const autoCreate = new AutoCreateService(
    new AuthorRepository(),
    new PublisherRepository(),
    new CategoryRepository()
  )
  const bookImport = new BookImportService(new BookRepository(), new BookCopyRepository())

  const runImport = async (rows: CanonicalRow[]): Promise<MatchedWorkbook> => {
    const wb = toValidatedWorkbook(rows)
    const matched = await engine.match(wb)
    await autoCreate.apply(matched)
    return bookImport.importBooks(matched)
  }

  const acquisitionDate = new Date('2005-07-01T00:00:00.000Z')

  const r1 = await runImport([
    {
      rowNumber: 1,
      values: {
        title: 'WO11D Buku Penuh',
        isbn: '978-000-120-000-1',
        authors: 'WO11D Penulis',
        publisher: 'WO11D Penerbit',
        category: 'WO11D Kategori',
        year: 2005,
        description: 'Deskripsi lengkap WO-11-D.',
        shelfLocation: 'Rak A-1',
        acquisitionSource: 'PEMBELIAN',
        acquisitionDate,
        acquisitionCost: 85000,
      },
    },
  ])
  {
    const book = await prisma.book.findUnique({ where: { isbn: '978-000-120-000-1' } })
    check('B1: tidak ada error', r1.matchingResult.errors.length === 0, `errors=${r1.matchingResult.errors.map((e) => e.messageKey).join(',')}`)
    check('B1: Book dibuat', book !== null)
    check('B1: publicationYear tersimpan (2005)', book?.publicationYear === 2005, `year=${book?.publicationYear}`)
    check('B1: description tersimpan', book?.description === 'Deskripsi lengkap WO-11-D.', `desc=${book?.description}`)
    check('B1: title tersimpan', book?.title === 'WO11D Buku Penuh', `title=${book?.title}`)
    const copy = await prisma.bookCopy.findFirst({ where: { bookId: book!.id } })
    check('B1: BookCopy dibuat', copy !== null)
    check('B1: shelfLocation tersimpan (Rak A-1)', copy?.shelfLocation === 'Rak A-1', `shelf=${copy?.shelfLocation}`)
    check('B1: acquisitionSource tersimpan (PEMBELIAN)', copy?.acquisitionSource === 'PEMBELIAN', `source=${copy?.acquisitionSource}`)
    check('B1: acquisitionDate tersimpan', copy?.acquisitionDate?.toISOString() === '2005-07-01T00:00:00.000Z', `date=${copy?.acquisitionDate?.toISOString()}`)
    check('B1: acquisitionCost tersimpan (85000)', copy?.acquisitionCost === 85000, `cost=${copy?.acquisitionCost}`)
    check('B1: barcode === inventoryNumber (regresi)', copy?.barcode === copy?.inventoryNumber)
  }

  const r2 = await runImport([
    {
      rowNumber: 1,
      values: {
        title: 'WO11D Buku Opsional Kosong',
        isbn: '978-000-120-000-2',
        authors: 'WO11D Penulis',
        publisher: 'WO11D Penerbit',
        category: 'WO11D Kategori',
        year: 2020,
        description: '',
        shelfLocation: '',
        acquisitionSource: null,
        acquisitionDate: null,
        acquisitionCost: null,
      },
    },
  ])
  {
    const book = await prisma.book.findUnique({ where: { isbn: '978-000-120-000-2' } })
    check('B2: tidak ada error', r2.matchingResult.errors.length === 0)
    check('B2: description kosong -> null', book?.description === null, `desc=${JSON.stringify(book?.description)}`)
    const copy = await prisma.bookCopy.findFirst({ where: { bookId: book!.id } })
    check('B2: shelfLocation kosong -> string kosong', copy?.shelfLocation === '', `shelf=${JSON.stringify(copy?.shelfLocation)}`)
    check('B2: acquisitionSource null', copy?.acquisitionSource === null, `source=${JSON.stringify(copy?.acquisitionSource)}`)
    check('B2: acquisitionDate null', copy?.acquisitionDate === null, `date=${JSON.stringify(copy?.acquisitionDate)}`)
    check('B2: acquisitionCost null', copy?.acquisitionCost === null, `cost=${JSON.stringify(copy?.acquisitionCost)}`)
  }

  const r3 = await runImport([
    {
      rowNumber: 1,
      values: {
        title: 'WO11D Buku Tanpa Meta',
        isbn: '978-000-120-000-3',
        authors: 'WO11D Penulis',
        publisher: 'WO11D Penerbit',
        category: 'WO11D Kategori',
      },
    },
  ])
  {
    const book = await prisma.book.findUnique({ where: { isbn: '978-000-120-000-3' } })
    check('B3: tidak ada error', r3.matchingResult.errors.length === 0)
    check('B3: publicationYear null (default)', book?.publicationYear === null, `year=${book?.publicationYear}`)
    check('B3: description null (default)', book?.description === null, `desc=${JSON.stringify(book?.description)}`)
  }

  await prisma.$disconnect()

  console.log(`WO11D RESULT: ${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
