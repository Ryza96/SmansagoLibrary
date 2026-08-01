import { getPrisma } from '../src/main/repositories/base/prisma'
import { runTransaction } from '../src/main/repositories/base/transaction'
import { InventoryAllocator } from '../src/main/services/inventory-allocator'
import { BookRepository } from '../src/main/repositories/book.repository'
import { BookCopyRepository } from '../src/main/repositories/book-copy.repository'

async function main(): Promise<void> {
  const prisma = getPrisma()
  const bookRepo = new BookRepository()
  const copyRepo = new BookCopyRepository()
  const allocator = new InventoryAllocator()

  for (const [title, isbn] of [
    ['Laskar Pelangi', '9789793062792'],
    ['Atomic Habits', '9786020633176'],
  ] as const) {
    try {
      const book = await bookRepo.create({
        title,
        isbn,
        authorId: '583b3b45-c56a-4d95-8224-90e1668a81f7',
        publisherId: 'd6af2a97-8be0-445a-a341-89936803e1cd',
        categoryId: '542bcd51-e080-4bd5-a29c-d0c4a007418d',
        publicationYear: 2005,
        description: 'test',
      })
      console.log('BOOK_CREATED=' + book.id + ' ' + book.title)
      const inv = await allocator.allocate(prisma, 1)
      console.log('INV_ALLOCATED=' + JSON.stringify(inv))
      await copyRepo.create({
        bookId: book.id,
        inventoryNumber: inv[0],
        barcode: inv[0],
        shelfLocation: 'Rak A-1',
      })
      console.log('COPY_CREATED=' + inv[0])
    } catch (e) {
      console.error('STEP_FAILED title=' + title + ' code=' + (e as { code?: string }).code + ' msg=' + (e as Error).message)
    }
  }

  const [books, copies] = await Promise.all([
    prisma.book.findMany(),
    prisma.bookCopy.findMany(),
  ])
  console.log('DB_COUNTS=' + JSON.stringify({ books: books.length, copies: copies.length }))
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error('PROBE_ERROR ' + e.message)
  process.exit(1)
})
