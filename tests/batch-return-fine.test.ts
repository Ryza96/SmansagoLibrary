import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { getPrisma } from '../src/main/repositories/base/prisma'
import { ReturnService } from '../src/main/services/return.service'
import { BorrowRepository } from '../src/main/repositories/borrow.repository'
import { BorrowDetailRepository } from '../src/main/repositories/borrow-detail.repository'
import { BookCopyRepository } from '../src/main/repositories/book-copy.repository'

const prisma = getPrisma()

async function cleanup() {
  await prisma.fine.deleteMany()
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

function createReturnService() {
  return new ReturnService(new BorrowRepository(), new BorrowDetailRepository(), new BookCopyRepository())
}

let counter = 0
async function seed(acquisitionCost?: number | null, dueInDays = 7) {
  counter++
  const ay = await prisma.academicYear.create({ data: { name: `Y${counter}`, startDate: new Date('2026-07-01'), endDate: new Date('2027-06-30'), isActive: true } })
  const cur = await prisma.curriculum.create({ data: { name: `C${counter}` } })
  const cls = await prisma.class.create({ data: { academicYearId: ay.id, curriculumId: cur.id, educationLevel: 'X', parallel: '1', homeroomTeacher: 'T', isActive: true } })
  const student = await prisma.member.create({ data: { memberNumber: `S-${counter}`, memberType: 'student', fullName: 'Test Student', status: 'ACTIVE' } })
  const book = await prisma.book.create({ data: { title: `Book ${counter}` } })
  const copy = await prisma.bookCopy.create({ data: { bookId: book.id, inventoryNumber: `INV-${String(counter).padStart(6, '0')}`, barcode: `INV-${String(counter).padStart(6, '0')}`, status: 'BORROWED', condition: 'GOOD', shelfLocation: 'Rak A', acquisitionCost: acquisitionCost === null ? undefined : acquisitionCost } })
  const borrow = await prisma.borrow.create({ data: { borrowNumber: `PJ/${counter}`, memberId: student.id, borrowDate: new Date(), dueDate: new Date(Date.now() + dueInDays * 86400000), memberName: 'Test', memberNumber: `S-${counter}` } })
  const detail = await prisma.borrowDetail.create({ data: { borrowId: borrow.id, bookCopyId: copy.id, bookTitle: book.title } })
  return { student, book, copy, borrow, detail }
}

beforeEach(async () => {
  await cleanup()
  counter = 0
})

afterAll(async () => {
  await cleanup()
  await prisma.$disconnect()
})

describe('batchReturn — denda', () => {
  it('a. HILANG dengan acquisitionCost 75000 → Fine LOST 75000, copy LOST', async () => {
    const { copy, borrow, detail } = await seed(75000)
    await createReturnService().batchReturn({ borrowingId: borrow.id, books: [{ borrowDetailId: detail.id, condition: 'HILANG' }] })
    const fine = await prisma.fine.findFirst({ where: { borrowId: borrow.id } })
    expect(fine?.type).toBe('LOST')
    expect(fine?.amount).toBe(75000)
    expect(fine?.status).toBe('UNPAID')
    expect((await prisma.bookCopy.findUnique({ where: { id: copy.id } }))?.status).toBe('LOST')
  })

  it('b. RUSAK_BERAT dengan acquisitionCost null → Fine HEAVY_DAMAGE 25000, copy REMOVED', async () => {
    const { copy, borrow, detail } = await seed(null)
    await createReturnService().batchReturn({ borrowingId: borrow.id, books: [{ borrowDetailId: detail.id, condition: 'RUSAK_BERAT' }] })
    const fine = await prisma.fine.findFirst({ where: { borrowId: borrow.id } })
    expect(fine?.type).toBe('HEAVY_DAMAGE')
    expect(fine?.amount).toBe(25000)
    expect((await prisma.bookCopy.findUnique({ where: { id: copy.id } }))?.status).toBe('REMOVED')
  })

  it('c. RUSAK_BERAT dengan acquisitionCost 0 → amount 25000', async () => {
    const { borrow, detail } = await seed(0)
    await createReturnService().batchReturn({ borrowingId: borrow.id, books: [{ borrowDetailId: detail.id, condition: 'RUSAK_BERAT' }] })
    const fine = await prisma.fine.findFirst({ where: { borrowId: borrow.id } })
    expect(fine?.amount).toBe(25000)
  })

  it('d. Tepat waktu, semua BAIK → tidak ada Fine', async () => {
    const { borrow, detail } = await seed(undefined, 7)
    await createReturnService().batchReturn({ borrowingId: borrow.id, books: [{ borrowDetailId: detail.id, condition: 'BAIK' }] })
    expect(await prisma.fine.count()).toBe(0)
  })

  it('e. Terlambat 3 hari, 2 buku satu panggilan → SATU Fine LATE 3000', async () => {
    const ay = await prisma.academicYear.create({ data: { name: 'Y-e', startDate: new Date('2026-07-01'), endDate: new Date('2027-06-30'), isActive: true } })
    const cur = await prisma.curriculum.create({ data: { name: 'C-e' } })
    await prisma.class.create({ data: { academicYearId: ay.id, curriculumId: cur.id, educationLevel: 'X', parallel: '1', homeroomTeacher: 'T', isActive: true } })
    const student = await prisma.member.create({ data: { memberNumber: 'S-e', memberType: 'student', fullName: 'S', status: 'ACTIVE' } })
    const book = await prisma.book.create({ data: { title: 'B-e' } })
    const c1 = await prisma.bookCopy.create({ data: { bookId: book.id, inventoryNumber: 'INV-e1', barcode: 'INV-e1', status: 'BORROWED', condition: 'GOOD', shelfLocation: 'R' } })
    const c2 = await prisma.bookCopy.create({ data: { bookId: book.id, inventoryNumber: 'INV-e2', barcode: 'INV-e2', status: 'BORROWED', condition: 'GOOD', shelfLocation: 'R' } })
    const borrow = await prisma.borrow.create({ data: { borrowNumber: 'PJ/e', memberId: student.id, borrowDate: new Date(Date.now() - 10 * 86400000), dueDate: new Date(Date.now() - 3 * 86400000), memberName: 'S', memberNumber: 'S-e' } })
    const d1 = await prisma.borrowDetail.create({ data: { borrowId: borrow.id, bookCopyId: c1.id, bookTitle: 'B' } })
    const d2 = await prisma.borrowDetail.create({ data: { borrowId: borrow.id, bookCopyId: c2.id, bookTitle: 'B' } })
    await createReturnService().batchReturn({ borrowingId: borrow.id, books: [{ borrowDetailId: d1.id, condition: 'BAIK' }, { borrowDetailId: d2.id, condition: 'BAIK' }] })
    const fines = await prisma.fine.findMany({ where: { borrowId: borrow.id } })
    expect(fines.length).toBe(1)
    expect(fines[0].type).toBe('LATE')
    expect(fines[0].amount).toBe(3000)
    expect(fines[0].lateDays).toBe(3)
  })

  it('f. Buku 1 lalu buku 2 → satu Fine LATE dihitung dari panggilan kedua', async () => {
    const ay = await prisma.academicYear.create({ data: { name: 'Y-f', startDate: new Date('2026-07-01'), endDate: new Date('2027-06-30'), isActive: true } })
    const cur = await prisma.curriculum.create({ data: { name: 'C-f' } })
    await prisma.class.create({ data: { academicYearId: ay.id, curriculumId: cur.id, educationLevel: 'X', parallel: '1', homeroomTeacher: 'T', isActive: true } })
    const student = await prisma.member.create({ data: { memberNumber: 'S-f', memberType: 'student', fullName: 'S', status: 'ACTIVE' } })
    const book = await prisma.book.create({ data: { title: 'B-f' } })
    const c1 = await prisma.bookCopy.create({ data: { bookId: book.id, inventoryNumber: 'INV-f1', barcode: 'INV-f1', status: 'BORROWED', condition: 'GOOD', shelfLocation: 'R' } })
    const c2 = await prisma.bookCopy.create({ data: { bookId: book.id, inventoryNumber: 'INV-f2', barcode: 'INV-f2', status: 'BORROWED', condition: 'GOOD', shelfLocation: 'R' } })
    const borrow = await prisma.borrow.create({ data: { borrowNumber: 'PJ/f', memberId: student.id, borrowDate: new Date(Date.now() - 10 * 86400000), dueDate: new Date(Date.now() - 2 * 86400000), memberName: 'S', memberNumber: 'S-f' } })
    const d1 = await prisma.borrowDetail.create({ data: { borrowId: borrow.id, bookCopyId: c1.id, bookTitle: 'B' } })
    const d2 = await prisma.borrowDetail.create({ data: { borrowId: borrow.id, bookCopyId: c2.id, bookTitle: 'B' } })
    const svc = createReturnService()
    await svc.batchReturn({ borrowingId: borrow.id, books: [{ borrowDetailId: d1.id, condition: 'BAIK' }] })
    expect(await prisma.fine.count()).toBe(0) // belum allReturned
    await svc.batchReturn({ borrowingId: borrow.id, books: [{ borrowDetailId: d2.id, condition: 'BAIK' }] })
    const fines = await prisma.fine.findMany({ where: { borrowId: borrow.id } })
    expect(fines.length).toBe(1)
    expect(fines[0].type).toBe('LATE')
    expect(fines[0].amount).toBe(2000) // 2 hari * 1000
  })

  it('g. Terlambat + satu RUSAK_BERAT → dua Fine (LATE dan HEAVY_DAMAGE)', async () => {
    const ay = await prisma.academicYear.create({ data: { name: 'Y-g', startDate: new Date('2026-07-01'), endDate: new Date('2027-06-30'), isActive: true } })
    const cur = await prisma.curriculum.create({ data: { name: 'C-g' } })
    await prisma.class.create({ data: { academicYearId: ay.id, curriculumId: cur.id, educationLevel: 'X', parallel: '1', homeroomTeacher: 'T', isActive: true } })
    const student = await prisma.member.create({ data: { memberNumber: 'S-g', memberType: 'student', fullName: 'S', status: 'ACTIVE' } })
    const book = await prisma.book.create({ data: { title: 'B-g' } })
    const c1 = await prisma.bookCopy.create({ data: { bookId: book.id, inventoryNumber: 'INV-g1', barcode: 'INV-g1', status: 'BORROWED', condition: 'GOOD', shelfLocation: 'R', acquisitionCost: 50000 } })
    const borrow = await prisma.borrow.create({ data: { borrowNumber: 'PJ/g', memberId: student.id, borrowDate: new Date(Date.now() - 10 * 86400000), dueDate: new Date(Date.now() - 2 * 86400000), memberName: 'S', memberNumber: 'S-g' } })
    const d1 = await prisma.borrowDetail.create({ data: { borrowId: borrow.id, bookCopyId: c1.id, bookTitle: 'B' } })
    await createReturnService().batchReturn({ borrowingId: borrow.id, books: [{ borrowDetailId: d1.id, condition: 'RUSAK_BERAT' }] })
    const fines = await prisma.fine.findMany({ where: { borrowId: borrow.id }, orderBy: { type: 'asc' } })
    expect(fines.length).toBe(2)
    const types = fines.map((f) => f.type).sort()
    expect(types).toEqual(['HEAVY_DAMAGE', 'LATE'])
  })

  it('h. Setting.lateFee = 2000 → 2 hari terlambat = 4000, ratePerDay 2000', async () => {
    await prisma.setting.create({ data: { lateFee: 2000 } })
    const ay = await prisma.academicYear.create({ data: { name: 'Y-h', startDate: new Date('2026-07-01'), endDate: new Date('2027-06-30'), isActive: true } })
    const cur = await prisma.curriculum.create({ data: { name: 'C-h' } })
    await prisma.class.create({ data: { academicYearId: ay.id, curriculumId: cur.id, educationLevel: 'X', parallel: '1', homeroomTeacher: 'T', isActive: true } })
    const student = await prisma.member.create({ data: { memberNumber: 'S-h', memberType: 'student', fullName: 'S', status: 'ACTIVE' } })
    const book = await prisma.book.create({ data: { title: 'B-h' } })
    const c1 = await prisma.bookCopy.create({ data: { bookId: book.id, inventoryNumber: 'INV-h1', barcode: 'INV-h1', status: 'BORROWED', condition: 'GOOD', shelfLocation: 'R' } })
    const borrow = await prisma.borrow.create({ data: { borrowNumber: 'PJ/h', memberId: student.id, borrowDate: new Date(Date.now() - 10 * 86400000), dueDate: new Date(Date.now() - 2 * 86400000), memberName: 'S', memberNumber: 'S-h' } })
    const d1 = await prisma.borrowDetail.create({ data: { borrowId: borrow.id, bookCopyId: c1.id, bookTitle: 'B' } })
    await createReturnService().batchReturn({ borrowingId: borrow.id, books: [{ borrowDetailId: d1.id, condition: 'BAIK' }] })
    const fine = await prisma.fine.findFirst({ where: { borrowId: borrow.id } })
    expect(fine?.amount).toBe(4000)
    expect(fine?.ratePerDay).toBe(2000)
    expect(fine?.lateDays).toBe(2)
  })

  it('i. RUSAK_RINGAN → tidak ada Fine, copy AVAILABLE', async () => {
    const { copy, borrow, detail } = await seed(75000)
    await createReturnService().batchReturn({ borrowingId: borrow.id, books: [{ borrowDetailId: detail.id, condition: 'RUSAK_RINGAN' }] })
    expect(await prisma.fine.count()).toBe(0)
    expect((await prisma.bookCopy.findUnique({ where: { id: copy.id } }))?.status).toBe('AVAILABLE')
  })

  it('j. Atomicity: dedupeKey duplikat manual → seluruh batchReturn batal', async () => {
    const { copy, borrow, detail } = await seed(null, -3)
    // Seed manual fine dengan dedupeKey yang SAMA dengan yang akan dibuat batchReturn
    await prisma.fine.create({ data: { borrowId: borrow.id, type: 'LATE', amount: 999, dedupeKey: `LATE:${borrow.id}` } })
    await expect(
      createReturnService().batchReturn({ borrowingId: borrow.id, books: [{ borrowDetailId: detail.id, condition: 'RUSAK_BERAT' }] })
    ).rejects.toThrow()
    const d = await prisma.borrowDetail.findUnique({ where: { id: detail.id } })
    expect(d?.returnedAt).toBeNull()
    expect((await prisma.bookCopy.findUnique({ where: { id: copy.id } }))?.status).toBe('BORROWED')
    const b = await prisma.borrow.findUnique({ where: { id: borrow.id } })
    expect(b?.returnDate).toBeNull()
  })
})
