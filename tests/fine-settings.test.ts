import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { getPrisma } from '../src/main/repositories/base/prisma'
import { validateFineSettings } from '../src/shared/utils/fine-settings'
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

async function seed(acquisitionCost?: number | null) {
  const ay = await prisma.academicYear.create({ data: { name: 'Y', startDate: new Date('2026-07-01'), endDate: new Date('2027-06-30'), isActive: true } })
  const cur = await prisma.curriculum.create({ data: { name: 'C' } })
  await prisma.class.create({ data: { academicYearId: ay.id, curriculumId: cur.id, educationLevel: 'X', parallel: '1', homeroomTeacher: 'T', isActive: true } })
  const student = await prisma.member.create({ data: { memberNumber: 'S-1', memberType: 'student', fullName: 'S', status: 'ACTIVE' } })
  const book = await prisma.book.create({ data: { title: 'B' } })
  const copy = await prisma.bookCopy.create({ data: { bookId: book.id, inventoryNumber: 'INV-1', barcode: 'INV-1', status: 'BORROWED', condition: 'GOOD', shelfLocation: 'R', acquisitionCost: acquisitionCost === null ? undefined : acquisitionCost } })
  return { student, copy, book }
}

beforeEach(async () => {
  await cleanup()
})

afterAll(async () => {
  await cleanup()
  await prisma.$disconnect()
})

describe('validateFineSettings', () => {
  it('accepts valid boundaries', () => {
    expect(validateFineSettings({ lateFee: 0, defaultBookValue: 1 }).ok).toBe(true)
    expect(validateFineSettings({ lateFee: 1_000_000, defaultBookValue: 100_000_000 }).ok).toBe(true)
  })

  it('rejects invalid', () => {
    expect(validateFineSettings({ lateFee: -1, defaultBookValue: 1000 }).ok).toBe(false)
    expect(validateFineSettings({ lateFee: 1000, defaultBookValue: 0 }).ok).toBe(false)
    expect(validateFineSettings({ lateFee: 1.5, defaultBookValue: 1000 }).ok).toBe(false)
    expect(validateFineSettings({ lateFee: 1000, defaultBookValue: 100_000_001 }).ok).toBe(false)
    expect(validateFineSettings({ lateFee: 1_000_001, defaultBookValue: 1000 }).ok).toBe(false)
    expect(validateFineSettings({ lateFee: Number.NaN, defaultBookValue: 1000 }).ok).toBe(false)
  })
})

describe('fine settings used by batchReturn', () => {
  it('(b) terlambat memakai lateFee dari Setting', async () => {
    await prisma.setting.create({ data: { lateFee: 2000, defaultBookValue: 25000 } })
    const { student, copy } = await seed()
    const borrow = await prisma.borrow.create({ data: { borrowNumber: 'PJ/1', memberId: student.id, borrowDate: new Date(Date.now() - 10 * 86400000), dueDate: new Date(Date.now() - 2 * 86400000), memberName: 'S', memberNumber: 'S-1' } })
    const detail = await prisma.borrowDetail.create({ data: { borrowId: borrow.id, bookCopyId: copy.id, bookTitle: 'B' } })
    await createReturnService().batchReturn({ borrowingId: borrow.id, books: [{ borrowDetailId: detail.id, condition: 'BAIK' }] })
    const fine = await prisma.fine.findFirst({ where: { borrowId: borrow.id } })
    expect(fine?.type).toBe('LATE')
    expect(fine?.ratePerDay).toBe(2000)
    expect(fine?.amount).toBe(4000)
  })

  it('(c) lateFee 0 → tidak ada denda LATE', async () => {
    await prisma.setting.create({ data: { lateFee: 0, defaultBookValue: 25000 } })
    const { student, copy } = await seed()
    const borrow = await prisma.borrow.create({ data: { borrowNumber: 'PJ/1', memberId: student.id, borrowDate: new Date(Date.now() - 10 * 86400000), dueDate: new Date(Date.now() - 2 * 86400000), memberName: 'S', memberNumber: 'S-1' } })
    const detail = await prisma.borrowDetail.create({ data: { borrowId: borrow.id, bookCopyId: copy.id, bookTitle: 'B' } })
    await createReturnService().batchReturn({ borrowingId: borrow.id, books: [{ borrowDetailId: detail.id, condition: 'BAIK' }] })
    expect(await prisma.fine.count()).toBe(0)
  })

  it('(d) Hilang tanpa harga memakai defaultBookValue dari Setting', async () => {
    await prisma.setting.create({ data: { lateFee: 1000, defaultBookValue: 40000 } })
    const { student, copy } = await seed(null)
    const borrow = await prisma.borrow.create({ data: { borrowNumber: 'PJ/1', memberId: student.id, borrowDate: new Date(), dueDate: new Date(Date.now() + 7 * 86400000), memberName: 'S', memberNumber: 'S-1' } })
    const detail = await prisma.borrowDetail.create({ data: { borrowId: borrow.id, bookCopyId: copy.id, bookTitle: 'B' } })
    await createReturnService().batchReturn({ borrowingId: borrow.id, books: [{ borrowDetailId: detail.id, condition: 'HILANG' }] })
    const fine = await prisma.fine.findFirst({ where: { borrowId: borrow.id } })
    expect(fine?.type).toBe('LOST')
    expect(fine?.amount).toBe(40000)
  })

  it('(e) mengubah lateFee setelah denda terbit tidak mengubah Fine lama', async () => {
    await prisma.setting.create({ data: { lateFee: 1000, defaultBookValue: 25000 } })
    const { student, copy } = await seed()
    const borrow = await prisma.borrow.create({ data: { borrowNumber: 'PJ/1', memberId: student.id, borrowDate: new Date(Date.now() - 10 * 86400000), dueDate: new Date(Date.now() - 2 * 86400000), memberName: 'S', memberNumber: 'S-1' } })
    const detail = await prisma.borrowDetail.create({ data: { borrowId: borrow.id, bookCopyId: copy.id, bookTitle: 'B' } })
    await createReturnService().batchReturn({ borrowingId: borrow.id, books: [{ borrowDetailId: detail.id, condition: 'BAIK' }] })
    const before = await prisma.fine.findFirst({ where: { borrowId: borrow.id } })
    expect(before?.amount).toBe(2000)

    await prisma.setting.updateMany({ data: { lateFee: 5000 } })
    const after = await prisma.fine.findFirst({ where: { borrowId: borrow.id } })
    expect(after?.amount).toBe(2000)
    expect(after?.ratePerDay).toBe(1000)
  })
})
