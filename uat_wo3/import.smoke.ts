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

function errorsOf(result: MatchedWorkbook): string[] {
  return result.matchingResult.errors.map((e) => e.messageKey)
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

  const before = await state(prisma)

  // S1 — Import normal (semua data valid), entitas baru
  const r1 = await runImport([
    {
      rowNumber: 1,
      values: {
        title: 'UAT Satu Judul',
        isbn: '978-000-100-000-1',
        authors: 'UAT Satu Penulis',
        publisher: 'UAT Satu Penerbit',
        category: 'UAT Satu Kategori',
      },
    },
  ])
  {
    const after = await state(prisma)
    const book = after.books.find((b) => b.title === 'UAT Satu Judul')
    const copy = after.copies.find((c) => c.bookId === book?.id)
    check('S1: tidak ada error', r1.matchingResult.errors.length === 0, `errors=${errorsOf(r1).join(',')}`)
    check('S1: Book dibuat (1)', after.books.length === before.books.length + 1)
    check('S1: BookCopy dibuat (1)', after.copies.length === before.copies.length + 1)
    check('S1: Author baru dibuat', after.authors.some((a) => a.name === 'UAT Satu Penulis'))
    check('S1: Publisher baru dibuat', after.publishers.some((p) => p.name === 'UAT Satu Penerbit'))
    check('S1: Category baru dibuat', after.categories.some((c) => c.name === 'UAT Satu Kategori'))
    check(
      'S1: relasi Book->Author benar',
      book?.authorId === after.authors.find((a) => a.name === 'UAT Satu Penulis')?.id
    )
    check(
      'S1: relasi Book->Publisher benar',
      book?.publisherId === after.publishers.find((p) => p.name === 'UAT Satu Penerbit')?.id
    )
    check(
      'S1: relasi Book->Category benar',
      book?.categoryId === after.categories.find((c) => c.name === 'UAT Satu Kategori')?.id
    )
    check('S1: BookCopy->Book benar', copy?.bookId === book?.id)
    check('S1: barcode === inventoryNumber', copy?.barcode === copy?.inventoryNumber, `barcode=${copy?.barcode}`)
  }

  // S2/S3/S4 — Author/Publisher/Category baru (semua entitas belum ada)
  const r2 = await runImport([
    {
      rowNumber: 1,
      values: {
        title: 'UAT Dua Judul',
        isbn: '978-000-100-000-2',
        authors: 'UAT Dua Penulis',
        publisher: 'UAT Dua Penerbit',
        category: 'UAT Dua Kategori',
      },
    },
  ])
  {
    const after = await state(prisma)
    check('S2/S3/S4: tidak ada error', r2.matchingResult.errors.length === 0)
    check('S2/S3/S4: Book dibuat (1)', after.books.length === before.books.length + 2)
    check('S2: Author baru dibuat (UAT Dua Penulis)', after.authors.some((a) => a.name === 'UAT Dua Penulis'))
    check('S3: Publisher baru dibuat (UAT Dua Penerbit)', after.publishers.some((p) => p.name === 'UAT Dua Penerbit'))
    check('S4: Category baru dibuat (UAT Dua Kategori)', after.categories.some((c) => c.name === 'UAT Dua Kategori'))
    check('S2: author count = 2', after.authors.length === 2, `authors=${after.authors.length}`)
    check('S3: publisher count = 2', after.publishers.length === 2, `publishers=${after.publishers.length}`)
    check('S4: category count = 2', after.categories.length === 2, `categories=${after.categories.length}`)
  }

  // S10 — Lebih dari satu buku (campuran entity reuse + baru)
  const r10 = await runImport([
    { rowNumber: 1, values: { title: 'UAT Tiga Judul A', isbn: '978-000-100-000-3', authors: 'UAT Satu Penulis', publisher: 'UAT Dua Penerbit', category: 'UAT Tiga Kategori A' } },
    { rowNumber: 2, values: { title: 'UAT Tiga Judul B', isbn: '978-000-100-000-4', authors: 'UAT Tiga Penulis B', publisher: 'UAT Dua Penerbit', category: 'UAT Dua Kategori' } },
    { rowNumber: 3, values: { title: 'UAT Tiga Judul C', isbn: '978-000-100-000-5', authors: 'UAT Tiga Penulis C', publisher: 'UAT Tiga Penerbit C', category: 'UAT Tiga Kategori A' } },
  ])
  {
    const after = await state(prisma)
    const a = after.books.find((b) => b.title === 'UAT Tiga Judul A')
    const b = after.books.find((x) => x.title === 'UAT Tiga Judul B')
    const c = after.books.find((x) => x.title === 'UAT Tiga Judul C')
    check('S10: tidak ada error', r10.matchingResult.errors.length === 0, `errors=${errorsOf(r10).join(',')}`)
    check('S10: Book dibuat (3)', after.books.length === before.books.length + 5)
    check('S10: BookCopy dibuat (3)', after.copies.length === before.copies.length + 5)
    check('S10: author baru hanya 2 (reuse UAT Satu Penulis)', after.authors.length === 4, `authors=${after.authors.length}`)
    check('S10: publisher baru hanya 1 (reuse UAT Dua Penerbit)', after.publishers.length === 3, `publishers=${after.publishers.length}`)
    check('S10: category baru hanya 1 (reuse UAT Tiga Kategori A)', after.categories.length === 3, `categories=${after.categories.length}`)
    check('S10: relasi A->author UAT Satu Penulis', a?.authorId === after.authors.find((x) => x.name === 'UAT Satu Penulis')?.id)
    check('S10: relasi A->publisher UAT Dua Penerbit', a?.publisherId === after.publishers.find((x) => x.name === 'UAT Dua Penerbit')?.id)
    check('S10: relasi B->category UAT Dua Kategori', b?.categoryId === after.categories.find((x) => x.name === 'UAT Dua Kategori')?.id)
    check('S10: relasi C->publisher UAT Tiga Penerbit C', c?.publisherId === after.publishers.find((x) => x.name === 'UAT Tiga Penerbit C')?.id)
    check('S10: relasi A->category UAT Tiga Kategori A', a?.categoryId === after.categories.find((x) => x.name === 'UAT Tiga Kategori A')?.id)
    check('S10: tiap buku punya 1 BookCopy', after.books.every((bk) => after.copies.filter((cp) => cp.bookId === bk.id).length === 1))
  }

  // S5 — ISBN sudah ada (di DB) -> baris gagal, tidak dibuat
  const r5 = await runImport([
    { rowNumber: 1, values: { title: 'UAT ISBN Duplikat', isbn: '978-000-100-000-1', authors: 'UAT Satu Penulis', publisher: 'UAT Satu Penerbit', category: 'UAT Satu Kategori' } },
  ])
  {
    const after = await state(prisma)
    check('S5 (ISBN sudah ada): error bookImport.isbnDuplicate', errorsOf(r5).includes('bookImport.isbnDuplicate'), `errors=${errorsOf(r5).join(',')}`)
    check('S5: Book TIDAK dibuat', after.books.length === before.books.length + 5)
    check('S5: BookCopy TIDAK dibuat', after.copies.length === before.copies.length + 5)
  }

  // S5b — dua baris ISBN sama dalam satu import -> baris pertama dibuat, baris kedua gagal
  const r5b = await runImport([
    { rowNumber: 1, values: { title: 'UAT Dup A', isbn: '978-000-100-000-9', authors: 'UAT Satu Penulis', publisher: 'UAT Satu Penerbit', category: 'UAT Satu Kategori' } },
    { rowNumber: 2, values: { title: 'UAT Dup B', isbn: '978-000-100-000-9', authors: 'UAT Satu Penulis', publisher: 'UAT Satu Penerbit', category: 'UAT Satu Kategori' } },
  ])
  {
    const after = await state(prisma)
    check('S5b: 1 baris berhasil, 1 baris isbnDuplicate', errorsOf(r5b).filter((k) => k === 'bookImport.isbnDuplicate').length === 1, `errors=${errorsOf(r5b).join(',')}`)
    check('S5b: Book dibuat (1)', after.books.length === before.books.length + 6)
    check('S5b: BookCopy dibuat (1)', after.copies.length === before.copies.length + 6)
    check('S5b: UAT Dup A ada', after.books.some((x) => x.title === 'UAT Dup A'))
    check('S5b: UAT Dup B TIDAK ada', !after.books.some((x) => x.title === 'UAT Dup B'))
  }

  // S7 — Publisher kosong (guard backend, bila lolos validasi) -> entityMissing
  const r7 = await runImport([
    { rowNumber: 1, values: { title: 'UAT No Publisher', isbn: '978-000-100-000-6', authors: 'UAT Satu Penulis', publisher: '', category: 'UAT Satu Kategori' } },
  ])
  {
    const after = await state(prisma)
    check('S7 (publisher kosong): error bookImport.entityMissing', errorsOf(r7).includes('bookImport.entityMissing'), `errors=${errorsOf(r7).join(',')}`)
    check('S7: Book TIDAK dibuat', after.books.length === before.books.length + 6)
    check('S7: BookCopy TIDAK dibuat', after.copies.length === before.copies.length + 6)
  }

  // S6 — Judul kosong (guard backend) -> titleMissing
  const r6 = await runImport([
    { rowNumber: 1, values: { title: '', isbn: '978-000-100-000-7', authors: 'UAT Satu Penulis', publisher: 'UAT Satu Penerbit', category: 'UAT Satu Kategori' } },
  ])
  {
    const after = await state(prisma)
    check('S6 (judul kosong): error bookImport.titleMissing', errorsOf(r6).includes('bookImport.titleMissing'), `errors=${errorsOf(r6).join(',')}`)
    check('S6: Book TIDAK dibuat', after.books.length === before.books.length + 6)
    check('S6: BookCopy TIDAK dibuat', after.copies.length === before.copies.length + 6)
  }

  // Tally akhir
  const final = await state(prisma)
  console.log('FINAL_DB ' + JSON.stringify({
    books: final.books.length,
    copies: final.copies.length,
    authors: final.authors.length,
    publishers: final.publishers.length,
    categories: final.categories.length,
  }))
  check('Tally: books=6', final.books.length === 6, `books=${final.books.length}`)
  check('Tally: copies=6', final.copies.length === 6, `copies=${final.copies.length}`)
  check('Tally: authors=4', final.authors.length === 4, `authors=${final.authors.length}`)
  check('Tally: publishers=3', final.publishers.length === 3, `publishers=${final.publishers.length}`)
  check('Tally: categories=3', final.categories.length === 3, `categories=${final.categories.length}`)

  await prisma.$disconnect()

  console.log(`IMPORT RESULT: ${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
