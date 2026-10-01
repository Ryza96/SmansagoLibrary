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

function createReturnService() {
  const borrowRepo = new BorrowRepository()
  const borrowDetailRepo = new BorrowDetailRepository()
  const bookCopyRepo = new BookCopyRepository()
  return new ReturnService(borrowRepo, borrowDetailRepo, bookCopyRepo)
}

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

  for (const bookCopyId of bookCopyIds) {
    await prisma.bookCopy.update({
      where: { id: bookCopyId },
      data: { status: 'BORROWED' },
    })
  }

  return borrow
}

describe('ReturnService.batchReturn', () => {
  let service: ReturnService

  beforeEach(async () => {
    await cleanup()
    service = createReturnService()
  })

  afterAll(async () => {
    await cleanup()
    await prisma.$disconnect()
  })

  it('1. should return ALL books (2 books) in one call with condition BAIK', async () => {
    const { student, copy1, copy2 } = await createBaseData()
    const borrow = await createBorrowWithBooks(student.id, [copy1.id, copy2.id], new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))

    const result = await service.batchReturn({
      borrowingId: borrow.id,
      books: [
        { borrowDetailId: (await prisma.borrowDetail.findFirst({ where: { bookCopyId: copy1.id } }))!.id, condition: 'BAIK' },
        { borrowDetailId: (await prisma.borrowDetail.findFirst({ where: { bookCopyId: copy2.id } }))!.id, condition: 'BAIK' },
      ],
    })

    // Cek dari database
    const updatedBorrow = await prisma.borrow.findUnique({ where: { id: borrow.id } })
    expect(updatedBorrow?.returnDate).not.toBeNull()
    expect(updatedBorrow?.returnDate).toBeInstanceOf(Date)

    const updatedCopy1 = await prisma.bookCopy.findUnique({ where: { id: copy1.id } })
    const updatedCopy2 = await prisma.bookCopy.findUnique({ where: { id: copy2.id } })
    expect(updatedCopy1?.status).toBe('AVAILABLE')
    expect(updatedCopy2?.status).toBe('AVAILABLE')

    const details = await prisma.borrowDetail.findMany({ where: { borrowId: borrow.id } })
    for (const detail of details) {
      expect(detail.returnedAt).not.toBeNull()
      expect(detail.conditionBack).toBe('BAIK')
    }

    expect(result.returnedCount).toBe(2)
    expect(result.stillBorrowedCount).toBe(0)
  })

  it('2. should return PARTIAL (1 of 2): returnDate stays null, returned copy AVAILABLE, other BORROWED', async () => {
    const { student, copy1, copy2 } = await createBaseData()
    const borrow = await createBorrowWithBooks(student.id, [copy1.id, copy2.id], new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))

    const detail1 = await prisma.borrowDetail.findFirst({ where: { bookCopyId: copy1.id } })

    await service.batchReturn({
      borrowingId: borrow.id,
      books: [{ borrowDetailId: detail1!.id, condition: 'BAIK' }],
    })

    const updatedBorrow = await prisma.borrow.findUnique({ where: { id: borrow.id } })
    expect(updatedBorrow?.returnDate).toBeNull()

    const updatedCopy1 = await prisma.bookCopy.findUnique({ where: { id: copy1.id } })
    const updatedCopy2 = await prisma.bookCopy.findUnique({ where: { id: copy2.id } })
    expect(updatedCopy1?.status).toBe('AVAILABLE')
    expect(updatedCopy2?.status).toBe('BORROWED')
  })

  it('3. should set returnDate only after second call (partial then rest)', async () => {
    const { student, copy1, copy2 } = await createBaseData()
    const borrow = await createBorrowWithBooks(student.id, [copy1.id, copy2.id], new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))

    const detail1 = await prisma.borrowDetail.findFirst({ where: { bookCopyId: copy1.id } })
    const detail2 = await prisma.borrowDetail.findFirst({ where: { bookCopyId: copy2.id } })

    // First call: return 1 book
    await service.batchReturn({
      borrowingId: borrow.id,
      books: [{ borrowDetailId: detail1!.id, condition: 'BAIK' }],
    })

    let updatedBorrow = await prisma.borrow.findUnique({ where: { id: borrow.id } })
    expect(updatedBorrow?.returnDate).toBeNull()

    // Second call: return the rest
    await service.batchReturn({
      borrowingId: borrow.id,
      books: [{ borrowDetailId: detail2!.id, condition: 'BAIK' }],
    })

    updatedBorrow = await prisma.borrow.findUnique({ where: { id: borrow.id } })
    expect(updatedBorrow?.returnDate).not.toBeNull()
  })

  it('4. should set copy status to LOST when condition is HILANG', async () => {
    const { student, copy1 } = await createBaseData()
    const borrow = await createBorrowWithBooks(student.id, [copy1.id], new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))

    const detail1 = await prisma.borrowDetail.findFirst({ where: { bookCopyId: copy1.id } })

    await service.batchReturn({
      borrowingId: borrow.id,
      books: [{ borrowDetailId: detail1!.id, condition: 'HILANG' }],
    })

    const updatedCopy = await prisma.bookCopy.findUnique({ where: { id: copy1.id } })
    expect(updatedCopy?.status).toBe('LOST')

    const updatedBorrow = await prisma.borrow.findUnique({ where: { id: borrow.id } })
    expect(updatedBorrow?.returnDate).not.toBeNull()
  })

  // KETIDAKSEMPURNAAN YANG DIKETAHUI, bukan perilaku yang diinginkan
  it('5. KNOWN ISSUE: condition RUSAK sets status to AVAILABLE and BookCopy.condition is not updated', async () => {
    const { student, copy1 } = await createBaseData()
    const borrow = await createBorrowWithBooks(student.id, [copy1.id], new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))

    const detail1 = await prisma.borrowDetail.findFirst({ where: { bookCopyId: copy1.id } })

    await service.batchReturn({
      borrowingId: borrow.id,
      books: [{ borrowDetailId: detail1!.id, condition: 'RUSAK' }],
    })

    const updatedCopy = await prisma.bookCopy.findUnique({ where: { id: copy1.id } })
    // Status jadi AVAILABLE (bukan tetap BORROWED atau jadi rusak)
    expect(updatedCopy?.status).toBe('AVAILABLE')
    // KETIDAKSEMPURNAAN: BookCopy.condition tidak diupdate (tetap GOOD)
    // Seharusnya condition diupdate ke HEAVY_DAMAGE
    expect(updatedCopy?.condition).toBe('GOOD')

    const updatedDetail = await prisma.borrowDetail.findFirst({ where: { bookCopyId: copy1.id } })
    expect(updatedDetail?.conditionBack).toBe('RUSAK')
  })

  it('6. should document behavior when returning an already-returned item', async () => {
    const { student, copy1 } = await createBaseData()
    const borrow = await createBorrowWithBooks(student.id, [copy1.id], new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))

    const detail1 = await prisma.borrowDetail.findFirst({ where: { bookCopyId: copy1.id } })

    // First return
    await service.batchReturn({
      borrowingId: borrow.id,
      books: [{ borrowDetailId: detail1!.id, condition: 'BAIK' }],
    })

    // Second return of same detail — batchReturn MENOLAK dengan throw
    // karena ia memfilter returnedAt !== null (baris 193-200)
    await expect(
      service.batchReturn({
        borrowingId: borrow.id,
        books: [{ borrowDetailId: detail1!.id, condition: 'BAIK' }],
      })
    ).rejects.toThrow('1 buku sudah dikembalikan sebelumnya.')
  })

  it('7. should document behavior for invalid inputs', async () => {
    const { student, copy1, copy2 } = await createBaseData()
    const borrow = await createBorrowWithBooks(student.id, [copy1.id, copy2.id], new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))

    const detail1 = await prisma.borrowDetail.findFirst({ where: { bookCopyId: copy1.id } })

    // Detail bukan milik borrowingId tersebut
    const fakeBorrow = await prisma.borrow.create({
      data: {
        borrowNumber: 'PJ/202610/9999',
        memberId: student.id,
        borrowDate: new Date(),
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        memberName: 'Test Student',
        memberNumber: 'S-000001',
      },
    })

    await expect(
      service.batchReturn({
        borrowingId: fakeBorrow.id,
        books: [{ borrowDetailId: detail1!.id, condition: 'BAIK' }],
      })
    ).rejects.toThrow('Beberapa buku tidak ditemukan dalam transaksi ini.')

    // Array books kosong — TIDAK ada validasi eksplisit
    const emptyResult = await service.batchReturn({
      borrowingId: borrow.id,
      books: [],
    })
    expect(emptyResult.returnedCount).toBe(0)

    // Condition di luar daftar — TIDAK ada validasi, diperlakukan sebagai AVAILABLE
    const invalidCondResult = await service.batchReturn({
      borrowingId: borrow.id,
      books: [{ borrowDetailId: detail1!.id, condition: 'INVALID' as any }],
    })
    const updatedCopy = await prisma.bookCopy.findUnique({ where: { id: copy1.id } })
    expect(updatedCopy?.status).toBe('AVAILABLE')
  })

  it('8. should succeed for overdue return and document that no fine is created', async () => {
    const { student, copy1 } = await createBaseData()
    const pastDueDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) // 5 hari lalu
    const borrow = await createBorrowWithBooks(student.id, [copy1.id], pastDueDate)

    const detail1 = await prisma.borrowDetail.findFirst({ where: { bookCopyId: copy1.id } })

    const result = await service.batchReturn({
      borrowingId: borrow.id,
      books: [{ borrowDetailId: detail1!.id, condition: 'BAIK' }],
    })

    // Pengembalian tetap berhasil
    expect(result.returnedCount).toBe(1)

    const updatedBorrow = await prisma.borrow.findUnique({ where: { id: borrow.id } })
    expect(updatedBorrow?.returnDate).not.toBeNull()

    // Dokumentasi: saat ini TIDAK ada denda yang dibuat
    // Setting.lateFee ada di schema tapi tidak dikonsumsi oleh return flow
    const setting = await prisma.setting.findFirst()
    // lateFee default = 1000, tapi tidak ada tabel Fine yang menyimpan denda
    expect(setting).toBeNull() // Setting belum di-create di test ini
  })
})
