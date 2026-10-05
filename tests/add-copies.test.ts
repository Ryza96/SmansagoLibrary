import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { initDatabase, closeDatabase, prisma } from '../electron/main/database'
import { BookCopyService } from '../electron/main/services/book-copy.service'
import { InventoryAllocator } from '../electron/main/services/inventory-allocator'
import { BookCopyRepository } from '../electron/main/repositories/book-copy.repository'
import { BookRepository } from '../electron/main/repositories/book.repository'
import { AssetEventRepository } from '../electron/main/repositories/asset-event.repository'

await initDatabase()

const service = new BookCopyService(
  new BookCopyRepository(),
  new BookRepository(),
  new InventoryAllocator(),
  new AssetEventRepository()
)

async function cleanup() {
  await prisma.assetEvent.deleteMany()
  await prisma.borrowDetail.deleteMany()
  await prisma.borrow.deleteMany()
  await prisma.memberEnrollment.deleteMany()
  await prisma.bookCopy.deleteMany()
  await prisma.book.deleteMany()
  await prisma.member.deleteMany()
  await prisma.class.deleteMany()
  await prisma.curriculum.deleteMany()
  await prisma.academicYear.deleteMany()
  await prisma.inventorySequence.deleteMany()
  await prisma.setting.deleteMany()
}

async function createBook() {
  return prisma.book.create({ data: { title: 'Test Book', isbn: '978-1234567890' } })
}

beforeEach(async () => {
  await cleanup()
})

afterAll(async () => {
  await cleanup()
  await closeDatabase()
})

describe('BookCopyService.addCopies — batas jumlah', () => {
  it('accepts 1000 copies: 1000 rows, unique inventory numbers', async () => {
    const book = await createBook()
    const start = Date.now()
    await service.addCopies(book.id, { quantity: 1000, shelfLocation: 'Rak A' })
    const durationMs = Date.now() - start
    console.log(`[add-copies] 1000 copies in ${durationMs}ms`)

    const rows = await prisma.bookCopy.findMany({ where: { bookId: book.id } })
    expect(rows.length).toBe(1000)
    expect(new Set(rows.map((r) => r.inventoryNumber)).size).toBe(1000)
  }, 60000)

  it('rejects 1001 and creates 0 rows', async () => {
    const book = await createBook()
    await expect(
      service.addCopies(book.id, { quantity: 1001, shelfLocation: 'Rak A' })
    ).rejects.toThrow('Jumlah eksemplar harus bilangan bulat antara 1 dan 1000.')
    expect(await prisma.bookCopy.count({ where: { bookId: book.id } })).toBe(0)
  })

  it('rejects 0 and 1.5', async () => {
    const book = await createBook()
    await expect(
      service.addCopies(book.id, { quantity: 0, shelfLocation: 'Rak A' })
    ).rejects.toThrow('Jumlah eksemplar harus bilangan bulat antara 1 dan 1000.')
    await expect(
      service.addCopies(book.id, { quantity: 1.5, shelfLocation: 'Rak A' })
    ).rejects.toThrow('Jumlah eksemplar harus bilangan bulat antara 1 dan 1000.')
    expect(await prisma.bookCopy.count({ where: { bookId: book.id } })).toBe(0)
  })

  it('rejects a future acquisition date', async () => {
    const book = await createBook()
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    await expect(
      service.addCopies(book.id, { quantity: 1, shelfLocation: 'Rak A', acquisitionDate: tomorrow })
    ).rejects.toThrow('Tanggal perolehan tidak boleh di masa depan.')
    expect(await prisma.bookCopy.count({ where: { bookId: book.id } })).toBe(0)
  })
})
