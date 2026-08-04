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
import type { CanonicalRow, ImportResultDTO, ValidatedWorkbook } from '../src/types/import'
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

async function state(prisma: PrismaClient) {
  const [books, copies, authors, publishers, categories] = await Promise.all([
    prisma.book.findMany({ orderBy: { title: 'asc' } }),
    prisma.bookCopy.findMany({ orderBy: { inventoryNumber: 'asc' } }),
    prisma.author.findMany({ orderBy: { name: 'asc' } }),
    prisma.publisher.findMany({ orderBy: { name: 'asc' } }),
    prisma.category.findMany({ orderBy: { name: 'asc' } }),
  ])
  return { books, copies, authors, publishers, categories }
}

function failedKeys(result: ImportResultDTO): string[] {
  return result.failedRows.map((f) => f.messageKey)
}

async function main(): Promise<void> {
  const prisma = getPrisma()

  const engine = new MatchingEngineService(createProductionStrategies())
  const autoCreate = new AutoCreateService(new AuthorRepository(), new PublisherRepository(), new CategoryRepository())
  const bookImport = new BookImportService(new BookRepository(), new BookCopyRepository(), autoCreate)

  const runImport = async (rows: CanonicalRow[]): Promise<ImportResultDTO> => {
    const wb = toValidatedWorkbook(rows)
    const matched = await engine.match(wb)
    return bookImport.importBooks(matched)
  }

  const before = await state(prisma)
  check('fresh DB: kosong', before.books.length === 0 && before.copies.length === 0, `books=${before.books.length}`)

  // STEP 1 — S1 normal + B1: summary dihitung backend (copyCount 2)
  const r1 = await runImport([
    {
      rowNumber: 1,
      values: {
        title: 'WO21 Normal',
        isbn: '978-000-000-001-0',
        authors: 'WO21 Penulis A',
        publisher: 'WO21 Penerbit A',
        category: 'WO21 Kategori A',
        copyCount: 2,
      },
    },
  ])
  {
    const after = await state(prisma)
    check('S1: B1 totalRows=1', r1.totalRows === 1, `total=${r1.totalRows}`)
    check('S1: B1 importedBooks=1', r1.importedBooks === 1, `books=${r1.importedBooks}`)
    check('S1: B1 importedCopies=2 (copyCount dihormati)', r1.importedCopies === 2, `copies=${r1.importedCopies}`)
    check('S1: B1 failedRows=[]', r1.failedRows.length === 0, `failed=${JSON.stringify(r1.failedRows)}`)
    check('S1: DB book=1', after.books.length === 1)
    check('S1: DB copy=2 (INV-000001, INV-000002)', after.copies.length === 2, after.copies.map((c) => c.inventoryNumber).join(','))
    check('S1: barcode===inventoryNumber', after.copies.every((c) => c.barcode === c.inventoryNumber))
    check('S1: entitas dibuat', after.authors.length === 1 && after.publishers.length === 1 && after.categories.length === 1)
  }

  // STEP 2 — S5b (2 baris ISBN sama, entitas baru) + B2: baris gagal TIDAK membuat entitas yatim
  const r2 = await runImport([
    {
      rowNumber: 1,
      values: {
        title: 'WO21 Dup A',
        isbn: '978-000-000-009-1',
        authors: 'WO21 Penulis B',
        publisher: 'WO21 Penerbit B',
        category: 'WO21 Kategori B',
      },
    },
    {
      rowNumber: 2,
      values: {
        title: 'WO21 Dup B',
        isbn: '978-000-000-009-1',
        authors: 'WO21 Penulis YATIM B',
        publisher: 'WO21 Penerbit YATIM B',
        category: 'WO21 Kategori YATIM B',
      },
    },
  ])
  {
    const after = await state(prisma)
    check('S5b: B1 totalRows=2', r2.totalRows === 2, `total=${r2.totalRows}`)
    check('S5b: B1 importedBooks=1', r2.importedBooks === 1, `books=${r2.importedBooks}`)
    check('S5b: B1 importedCopies=1', r2.importedCopies === 1, `copies=${r2.importedCopies}`)
    check('S5b: B1 failedRows baris 2 isbnDuplicate', r2.failedRows.length === 1 && r2.failedRows[0].rowNumber === 2 && r2.failedRows[0].messageKey === 'bookImport.isbnDuplicate', `failed=${JSON.stringify(r2.failedRows)}`)
    check('S5b: DB buku Dup A ada', after.books.some((b) => b.title === 'WO21 Dup A'))
    check('S5b: DB buku Dup B TIDAK ada', !after.books.some((b) => b.title === 'WO21 Dup B'))
    check('S5b (B2): Penulis YATIM B tidak dibuat', !after.authors.some((a) => a.name === 'WO21 Penulis YATIM B'))
    check('S5b (B2): Penerbit YATIM B tidak dibuat', !after.publishers.some((p) => p.name === 'WO21 Penerbit YATIM B'))
    check('S5b (B2): Kategori YATIM B tidak dibuat', !after.categories.some((c) => c.name === 'WO21 Kategori YATIM B'))
    check('S5b: entitas baris sukses dibuat (Penulis B)', after.authors.some((a) => a.name === 'WO21 Penulis B'))
  }

  // STEP 3 — S5 (ISBN sudah ada di DB) + B2: entitas baru baris gagal TIDAK dibuat
  const r3 = await runImport([
    {
      rowNumber: 1,
      values: {
        title: 'WO21 ISBN Lama',
        isbn: '978-000-000-001-0',
        authors: 'WO21 Penulis YATIM C',
        publisher: 'WO21 Penerbit YATIM C',
        category: 'WO21 Kategori YATIM C',
      },
    },
  ])
  {
    const after = await state(prisma)
    check('S5: B1 importedBooks=0', r3.importedBooks === 0, `books=${r3.importedBooks}`)
    check('S5: B1 failedRows isbnDuplicate', failedKeys(r3).includes('bookImport.isbnDuplicate'), `failed=${JSON.stringify(r3.failedRows)}`)
    check('S5: DB book tetap 2', after.books.length === 2, `books=${after.books.length}`)
    check('S5 (B2): Penulis YATIM C tidak dibuat', !after.authors.some((a) => a.name === 'WO21 Penulis YATIM C'))
    check('S5 (B2): Penerbit YATIM C tidak dibuat', !after.publishers.some((p) => p.name === 'WO21 Penerbit YATIM C'))
    check('S5 (B2): Kategori YATIM C tidak dibuat', !after.categories.some((c) => c.name === 'WO21 Kategori YATIM C'))
  }

  // STEP 4 — S7 (penerbit kosong) + B2: entitas baru baris gagal TIDAK dibuat
  const r4 = await runImport([
    {
      rowNumber: 1,
      values: {
        title: 'WO21 No Publisher',
        isbn: '978-000-000-002-0',
        authors: 'WO21 Penulis YATIM D',
        publisher: '',
        category: 'WO21 Kategori YATIM D',
      },
    },
  ])
  {
    const after = await state(prisma)
    check('S7: B1 failedRows entityMissing', failedKeys(r4).includes('bookImport.entityMissing'), `failed=${JSON.stringify(r4.failedRows)}`)
    check('S7: B1 importedBooks=0', r4.importedBooks === 0, `books=${r4.importedBooks}`)
    check('S7: DB book tetap 2', after.books.length === 2, `books=${after.books.length}`)
    check('S7 (B2): Penulis YATIM D tidak dibuat', !after.authors.some((a) => a.name === 'WO21 Penulis YATIM D'))
    check('S7 (B2): Kategori YATIM D tidak dibuat', !after.categories.some((c) => c.name === 'WO21 Kategori YATIM D'))
  }

  // STEP 5 — S6 (judul kosong) + B2: entitas baru baris gagal TIDAK dibuat
  const r5 = await runImport([
    {
      rowNumber: 1,
      values: {
        title: '',
        isbn: '978-000-000-003-0',
        authors: 'WO21 Penulis YATIM E',
        publisher: 'WO21 Penerbit YATIM E',
        category: 'WO21 Kategori YATIM E',
      },
    },
  ])
  {
    const after = await state(prisma)
    check('S6: B1 failedRows titleMissing', failedKeys(r5).includes('bookImport.titleMissing'), `failed=${JSON.stringify(r5.failedRows)}`)
    check('S6: B1 importedBooks=0', r5.importedBooks === 0, `books=${r5.importedBooks}`)
    check('S6: DB book tetap 2', after.books.length === 2, `books=${after.books.length}`)
    check('S6 (B2): Penulis YATIM E tidak dibuat', !after.authors.some((a) => a.name === 'WO21 Penulis YATIM E'))
    check('S6 (B2): Penerbit YATIM E tidak dibuat', !after.publishers.some((p) => p.name === 'WO21 Penerbit YATIM E'))
    check('S6 (B2): Kategori YATIM E tidak dibuat', !after.categories.some((c) => c.name === 'WO21 Kategori YATIM E'))
  }

  // STEP 6 — S10 (multi-baris reuse + baru) + B1: summary konsisten dengan DB
  const r10 = await runImport([
    { rowNumber: 1, values: { title: 'WO21 Tiga A', isbn: '978-000-000-010-1', authors: 'WO21 Penulis A', publisher: 'WO21 Penerbit A', category: 'WO21 Kategori F' } },
    { rowNumber: 2, values: { title: 'WO21 Tiga B', isbn: '978-000-000-010-2', authors: 'WO21 Penulis G', publisher: 'WO21 Penerbit A', category: 'WO21 Kategori A' } },
    { rowNumber: 3, values: { title: 'WO21 Tiga C', isbn: '978-000-000-010-3', authors: 'WO21 Penulis A', publisher: 'WO21 Penerbit H', category: 'WO21 Kategori F' } },
  ])
  {
    const after = await state(prisma)
    check('S10: B1 importedBooks=3', r10.importedBooks === 3, `books=${r10.importedBooks}`)
    check('S10: B1 importedCopies=3', r10.importedCopies === 3, `copies=${r10.importedCopies}`)
    check('S10: B1 failedRows=[]', r10.failedRows.length === 0, `failed=${JSON.stringify(r10.failedRows)}`)
    check('S10: DB book=5', after.books.length === 5, `books=${after.books.length}`)
    check('S10: DB copy=6', after.copies.length === 6, `copies=${after.copies.length}`)
    check('S10: reuse entitas (author=3)', after.authors.length === 3, `authors=${after.authors.length}`)
    check('S10: reuse entitas (publisher=3)', after.publishers.length === 3, `publishers=${after.publishers.length}`)
    check('S10: reuse entitas (category=3)', after.categories.length === 3, `categories=${after.categories.length}`)
  }

  // STEP 7 — copyCount default 1 + B1 invariant: importedBooks==jumlah book DB, importedCopies==jumlah copy DB
  const r11 = await runImport([
    {
      rowNumber: 1,
      values: {
        title: 'WO21 Tanpa Copy',
        isbn: '978-000-000-011-0',
        authors: 'WO21 Penulis I',
        publisher: 'WO21 Penerbit I',
        category: 'WO21 Kategori I',
      },
    },
  ])
  {
    const after = await state(prisma)
    check('default copy: importedCopies=1', r11.importedCopies === 1, `copies=${r11.importedCopies}`)
    const sumBooks = r1.importedBooks + r2.importedBooks + r3.importedBooks + r4.importedBooks + r5.importedBooks + r10.importedBooks + r11.importedBooks
    const sumCopies = r1.importedCopies + r2.importedCopies + r3.importedCopies + r4.importedCopies + r5.importedCopies + r10.importedCopies + r11.importedCopies
    check('B1 invariant: jumlah importedBooks == DB books', sumBooks === after.books.length, `sum=${sumBooks} db=${after.books.length}`)
    check('B1 invariant: jumlah importedCopies == DB copies', sumCopies === after.copies.length, `sum=${sumCopies} db=${after.copies.length}`)
    check('B1: tidak ada baris yatim di failedRows (rowNumber selalu ada)', r1.failedRows.every((f) => f.rowNumber !== null))
  }

  console.log('FINAL_DB ' + JSON.stringify({
    books: (await state(prisma)).books.length,
    copies: (await state(prisma)).copies.length,
  }))

  await prisma.$disconnect()

  console.log(`IMPORT B1/B2 RESULT: ${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
