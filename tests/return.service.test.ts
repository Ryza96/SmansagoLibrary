import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { getPrisma } from '../src/main/repositories/base/prisma'
import { ReturnService } from '../src/main/services/return.service'
import { BorrowRepository } from '../src/main/repositories/borrow.repository'
import { BorrowDetailRepository } from '../src/main/repositories/borrow-detail.repository'
import { BookCopyRepository } from '../src/main/repositories/book-copy.repository'

const prisma = getPrisma()

async function cleanup() {
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

async function createBaseData() {
  const academicYear = await prisma.academicYear.create({
    data: {
      name: '2026/2027',
      startDate: new Date('2026-07-01'),
      endDate: new Date('2027-06-30'),
      isActive: true,
    },
  })

  const curriculum = await prisma.curriculum.create({
    data: { name: 'Kurikulum Merdeka' },
  })

  const classEntity = await prisma.class.create({
    data: {
      academicYearId: academicYear.id,
      curriculumId: curriculum.id,
      educationLevel: 'X',
      parallel: '1',
      homeroomTeacher: 'Test Teacher',
      isActive: true,
    },
  })

  const student = await prisma.member.create({
    data: {
      memberNumber: 'S-000001',
      memberType: 'student',
      fullName: 'Test Student',
      status: 'ACTIVE',
    },
  })

  const book = await prisma.book.create({
    data: {
      title: 'Test Book',
      isbn: '978-1234567890',
    },
  })

  const copy1 = await prisma.bookCopy.create({
    data: {
      bookId: book.id,
      inventoryNumber: 'INV-000001',
      barcode: 'INV-000001',
      status: 'AVAILABLE',
      condition: 'GOOD',
      shelfLocation: 'Rak A',
    },
  })

  const copy2 = await prisma.bookCopy.create({
    data: {
      bookId: book.id,
      inventoryNumber: 'INV-000002',
      barcode: 'INV-000002',
      status: 'AVAILABLE',
      condition: 'GOOD',
      shelfLocation: 'Rak A',
    },
  })

  return { academicYear, curriculum, classEntity, student, book, copy1, copy2 }
}

async function createActiveEnrollment(memberId: string, classId: string, academicYearId: string) {
  return prisma.memberEnrollment.create({
    data: {
      memberId,
      classId,
      academicYearId,
      status: 'ACTIVE',
    },
  })
}

function createReturnService() {
  const borrowRepo = new BorrowRepository()
  const borrowDetailRepo = new BorrowDetailRepository()
  const bookCopyRepo = new BookCopyRepository()
  return new ReturnService(borrowRepo, borrowDetailRepo, bookCopyRepo)
}

// Helper: buat pinjaman dengan N buku
async function createBorrowWithBooks(
  memberId: string,
  bookCopyIds: string[],
  dueDate: Date
) {
  const borrow = await prisma.borrow.create({
    data: {
      borrowNumber: `PJ/202610/${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`,
      memberId,
      borrowDate: new Date(),
      dueDate,
      memberName: 'Test Student',
      memberNumber: 'S-000001',
    },
  })

  for (const bookCopyId of bookCopyIds) {
    await prisma.borrowDetail.create({
      data: {
        borrowId: borrow.id,
        bookCopyId,
        bookTitle: 'Test Book',
      },
    })
  }

  // Update status copy jadi BORROWED
  for (const bookCopyId of bookCopyIds) {
    await prisma.bookCopy.update({
      where: { id: bookCopyId },
      data: { status: 'BORROWED' },
    })
  }

  return borrow
}

describe('ReturnService', () => {
  let service: ReturnService

  beforeEach(async () => {
    await cleanup()
    service = createReturnService()
  })

  afterAll(async () => {
    await cleanup()
    await prisma.$disconnect()
  })

  it('should return 1 of 2 books: Borrow.returnDate stays null, returned copy becomes AVAILABLE', async () => {
    const { student, copy1, copy2 } = await createBaseData()
    const borrow = await createBorrowWithBooks(student.id, [copy1.id, copy2.id], new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))

    await service.returnBook({
      bookCopyId: copy1.id,
      condition: 'GOOD',
    })

    // Borrow.returnDate harus masih null (1 dari 2 buku) - cek dari DB
    const updatedBorrow = await prisma.borrow.findUnique({ where: { id: borrow.id } })
    expect(updatedBorrow?.returnDate).toBeNull()

    // Copy yang dikembalikan jadi AVAILABLE
    const updatedCopy = await prisma.bookCopy.findUnique({ where: { id: copy1.id } })
    expect(updatedCopy?.status).toBe('AVAILABLE')

    // Copy yang tidak dikembalikan tetap BORROWED
    const unchangedCopy = await prisma.bookCopy.findUnique({ where: { id: copy2.id } })
    expect(unchangedCopy?.status).toBe('BORROWED')
  })

  it('should return all books: Borrow.returnDate is set', async () => {
    const { student, copy1, copy2 } = await createBaseData()
    const borrow = await createBorrowWithBooks(student.id, [copy1.id, copy2.id], new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))

    // Kembalikan buku pertama
    await service.returnBook({
      bookCopyId: copy1.id,
      condition: 'GOOD',
    })

    // Kembalikan buku kedua
    await service.returnBook({
      bookCopyId: copy2.id,
      condition: 'GOOD',
    })

    // Cek dari DB: returnDate harus terisi dan instanceof Date
    const updatedBorrow = await prisma.borrow.findUnique({ where: { id: borrow.id } })
    expect(updatedBorrow?.returnDate).not.toBeNull()
    expect(updatedBorrow?.returnDate).toBeInstanceOf(Date)

    // Kedua copy jadi AVAILABLE
    const updatedCopy1 = await prisma.bookCopy.findUnique({ where: { id: copy1.id } })
    const updatedCopy2 = await prisma.bookCopy.findUnique({ where: { id: copy2.id } })
    expect(updatedCopy1?.status).toBe('AVAILABLE')
    expect(updatedCopy2?.status).toBe('AVAILABLE')
  })

  it('should set copy status to LOST when condition is HILANG', async () => {
    const { student, copy1 } = await createBaseData()
    const borrow = await createBorrowWithBooks(student.id, [copy1.id], new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))

    await service.returnBook({
      bookCopyId: copy1.id,
      condition: 'HILANG',
    })

    // Cek dari DB: returnDate harus terisi
    const updatedBorrow = await prisma.borrow.findUnique({ where: { id: borrow.id } })
    expect(updatedBorrow?.returnDate).not.toBeNull()
    expect(updatedBorrow?.returnDate).toBeInstanceOf(Date)

    const updatedCopy = await prisma.bookCopy.findUnique({ where: { id: copy1.id } })
    expect(updatedCopy?.status).toBe('LOST')
  })

  // KETIDAKSEMPURNAAN YANG DIKETAHUI, bukan perilaku yang diinginkan
  it('KNOWN ISSUE: condition HEAVY_DAMAGE sets status to AVAILABLE and BookCopy.condition is not updated', async () => {
    const { student, copy1 } = await createBaseData()
    const borrow = await createBorrowWithBooks(student.id, [copy1.id], new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))

    // Condition sebelum return
    const beforeCopy = await prisma.bookCopy.findUnique({ where: { id: copy1.id } })
    expect(beforeCopy?.condition).toBe('GOOD')

    await service.returnBook({
      bookCopyId: copy1.id,
      condition: 'HEAVY_DAMAGE',
    })

    // Cek dari DB: returnDate harus terisi
    const updatedBorrow = await prisma.borrow.findUnique({ where: { id: borrow.id } })
    expect(updatedBorrow?.returnDate).not.toBeNull()
    expect(updatedBorrow?.returnDate).toBeInstanceOf(Date)

    // Status jadi AVAILABLE (bukan tetap BORROWED atau jadi rusak)
    const updatedCopy = await prisma.bookCopy.findUnique({ where: { id: copy1.id } })
    expect(updatedCopy?.status).toBe('AVAILABLE')

    // KETIDAKSEMPURNAAN: BookCopy.condition tidak diupdate (tetap GOOD)
    // Seharusnya condition diupdate ke HEAVY_DAMAGE
    expect(updatedCopy?.condition).toBe('GOOD')
  })

  it('should document behavior when returning an already-returned item', async () => {
    const { student, copy1 } = await createBaseData()
    await createBorrowWithBooks(student.id, [copy1.id], new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))

    // Kembalikan pertama kali
    await service.returnBook({
      bookCopyId: copy1.id,
      condition: 'GOOD',
    })

    // Coba kembalikan lagi (item sudah dikembalikan)
    // returnBook mencari active detail (returnedAt = null), jadi akan throw "Not Borrowed"
    await expect(
      service.returnBook({
        bookCopyId: copy1.id,
        condition: 'GOOD',
      })
    ).rejects.toThrow('Buku tidak sedang dipinjam.')
  })
})
