import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { getPrisma } from '../src/main/repositories/base/prisma'
import { FineRepository } from '../src/main/repositories/fine.repository'
import { summarizeReceiptFines } from '../src/shared/utils/receipt-fines'
import { formatRupiah } from '../src/shared/utils/format-rupiah'

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

async function seedFine() {
  const member = await prisma.member.create({ data: { memberNumber: 'S-1', memberType: 'student', fullName: 'M', status: 'ACTIVE' } })
  const book = await prisma.book.create({ data: { title: 'B' } })
  const copy = await prisma.bookCopy.create({ data: { bookId: book.id, inventoryNumber: 'INV-1', barcode: 'INV-1', status: 'BORROWED', condition: 'GOOD', shelfLocation: 'R' } })
  const borrow = await prisma.borrow.create({ data: { borrowNumber: 'PJ/1', memberId: member.id, borrowDate: new Date(), dueDate: new Date(), memberName: 'M', memberNumber: 'S-1' } })
  const detail = await prisma.borrowDetail.create({ data: { borrowId: borrow.id, bookCopyId: copy.id, bookTitle: 'B' } })
  await prisma.fine.create({ data: { borrowId: borrow.id, borrowDetailId: detail.id, type: 'HEAVY_DAMAGE', amount: 75000, status: 'UNPAID', dedupeKey: `DETAIL:${detail.id}` } })
  await prisma.fine.create({ data: { borrowId: borrow.id, type: 'LATE', amount: 5000, status: 'PAID', dedupeKey: `LATE:${borrow.id}` } })
  return { borrow, detail }
}

beforeEach(async () => {
  await cleanup()
})

afterAll(async () => {
  await cleanup()
  await prisma.$disconnect()
})

describe('summarizeReceiptFines', () => {
  const base = [
    { type: 'HEAVY_DAMAGE', amount: 75000, status: 'UNPAID', borrowDetailId: 'd1' },
    { type: 'LOST', amount: 25000, status: 'PAID', borrowDetailId: 'd2' },
    { type: 'LATE', amount: 5000, status: 'UNPAID', borrowDetailId: null, lateDays: 5, ratePerDay: 1000 },
    { type: 'WAIVED', amount: 3000, status: 'WAIVED', borrowDetailId: 'd3' }
  ]

  it('(a) detailIds membatasi denda rusak/hilang per buku, LATE tetap ikut', () => {
    const s = summarizeReceiptFines(base, new Set(['d1']))
    expect(s.items.map((i) => i.type).sort()).toEqual(['HEAVY_DAMAGE', 'LATE'])
  })

  it('(b) denda LATE (borrowDetailId null) selalu ikut walau detailIds', () => {
    const s = summarizeReceiptFines(base, ['d99'])
    expect(s.items.length).toBe(1)
    expect(s.items[0].type).toBe('LATE')
  })

  it('(c) PAID dan WAIVED tidak masuk totalUnpaid', () => {
    const s = summarizeReceiptFines(base)
    expect(s.totalUnpaid).toBe(75000 + 5000)
  })

  it('(d) tanpa denda → items kosong, totalUnpaid 0', () => {
    expect(summarizeReceiptFines([])).toEqual({ items: [], totalUnpaid: 0 })
  })
})

describe('formatRupiah', () => {
  it('format angka', () => {
    expect(formatRupiah(0)).toBe('Rp 0')
    expect(formatRupiah(1000)).toBe('Rp 1.000')
    expect(formatRupiah(75000)).toBe('Rp 75.000')
    expect(formatRupiah(1250000)).toBe('Rp 1.250.000')
  })
})

describe('FineRepository.findByBorrowId', () => {
  it('mengambil denda per borrowId', async () => {
    const { borrow } = await seedFine()
    const rows = await new FineRepository().findByBorrowId(borrow.id)
    expect(rows.length).toBe(2)
    expect(rows.map((r) => r.type).sort()).toEqual(['HEAVY_DAMAGE', 'LATE'])
  })
})
