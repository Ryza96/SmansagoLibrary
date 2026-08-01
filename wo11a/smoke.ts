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

  // P1 — publikasi tahun + deskripsi disediakan -> HARUS tersimpan
  const r1 = await runImport([
    {
      rowNumber: 1,
      values: {
        title: 'WO11A Buku Dengan Meta',
        isbn: '978-000-110-000-1',
        authors: 'WO11A Penulis Meta',
        publisher: 'WO11A Penerbit Meta',
        category: 'WO11A Kategori Meta',
        year: 2021,
        description: 'Deskripsi resmi buku uji WO-11-A.',
      },
    },
  ])
  {
    const book = await prisma.book.findUnique({ where: { isbn: '978-000-110-000-1' } })
    check('P1: tidak ada error', r1.matchingResult.errors.length === 0, `errors=${r1.matchingResult.errors.map((e) => e.messageKey).join(',')}`)
    check('P1: Book dibuat', book !== null)
    check('P1: publicationYear tersimpan (2021)', book?.publicationYear === 2021, `year=${book?.publicationYear}`)
    check('P1: description tersimpan', book?.description === 'Deskripsi resmi buku uji WO-11-A.', `desc=${book?.description}`)
    const copy = await prisma.bookCopy.findFirst({ where: { bookId: book!.id } })
    check('P1: BookCopy tetap dibuat (1)', copy !== null)
    check('P1: barcode === inventoryNumber', copy?.barcode === copy?.inventoryNumber)
  }

  // P2 — year sebagai string angka ("1999") -> tetap dikonversi ke number
  const r2 = await runImport([
    {
      rowNumber: 1,
      values: {
        title: 'WO11A Buku Tahun String',
        isbn: '978-000-110-000-2',
        authors: 'WO11A Penulis Meta',
        publisher: 'WO11A Penerbit Meta',
        category: 'WO11A Kategori Meta',
        year: '1999',
        description: '',
      },
    },
  ])
  {
    const book = await prisma.book.findUnique({ where: { isbn: '978-000-110-000-2' } })
    check('P2: tidak ada error', r2.matchingResult.errors.length === 0)
    check('P2: publicationYear dikonversi (1999)', book?.publicationYear === 1999, `year=${book?.publicationYear}`)
    check('P2: description kosong -> null (bukan string kosong)', book?.description === null, `desc=${JSON.stringify(book?.description)}`)
  }

  // P3 — tanpa year/description -> tetap null (regresi: tidak berubah)
  const r3 = await runImport([
    {
      rowNumber: 1,
      values: {
        title: 'WO11A Buku Tanpa Meta',
        isbn: '978-000-110-000-3',
        authors: 'WO11A Penulis Meta',
        publisher: 'WO11A Penerbit Meta',
        category: 'WO11A Kategori Meta',
      },
    },
  ])
  {
    const book = await prisma.book.findUnique({ where: { isbn: '978-000-110-000-3' } })
    check('P3: tidak ada error', r3.matchingResult.errors.length === 0)
    check('P3: publicationYear null (default)', book?.publicationYear === null, `year=${book?.publicationYear}`)
    check('P3: description null (default)', book?.description === null, `desc=${JSON.stringify(book?.description)}`)
  }

  await prisma.$disconnect()

  console.log(`WO11A RESULT: ${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
