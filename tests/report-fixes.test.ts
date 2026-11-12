// Sesi A — perbaikan backend Laporan (P1, P2, P5, P6, P7).
// Membuktikan: ringkasan mengikuti filter status (layar + cetak), label
// "nomor · nama" pada kolom Nama Anggota cetak, fallback kelas kolektif,
// trim pencarian, dan validasi periode from > to (AppError 400).
import { randomUUID } from 'crypto'
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { getPrisma } from '../src/main/repositories/base/prisma'
import { ReportRepository } from '../src/main/repositories/report.repository'
import { ReportService } from '../src/main/services/report.service'
import { ReportPrintService } from '../src/main/services/report-print.service'
import { AppError } from '../electron/main/errorHandler'

const prisma = getPrisma()
const repository = new ReportRepository()
const reportService = new ReportService(repository)
const settingsProvider = {
  get: async () => ({
    libraryName: 'Perpustakaan Uji',
    schoolName: 'SD Uji',
    address: 'Jl. Uji No. 1',
    phone: '0800',
    email: 'uji@example.test',
    librarianName: 'Pustakawan Uji',
    principalName: 'Kepala Uji',
    librarianNip: '19800101 001',
    principalNip: '19750101 001'
  })
}
const printService = new ReportPrintService(repository, settingsProvider)

const DAY_MS = 86_400_000
function daysAgo(n: number, hour = 12): Date {
  const d = new Date(Date.now() - n * DAY_MS)
  d.setHours(hour, 0, 0, 0)
  return d
}
function daysFromNow(n: number, hour = 12): Date {
  const d = new Date(Date.now() + n * DAY_MS)
  d.setHours(hour, 0, 0, 0)
  return d
}
function iso(d: Date): string {
  return d.toISOString()
}

async function cleanup() {
  await prisma.borrowDetail.deleteMany()
  await prisma.borrow.deleteMany()
  await prisma.bookCopy.deleteMany()
  await prisma.book.deleteMany()
  await prisma.member.deleteMany()
  await prisma.setting.deleteMany()
}

beforeEach(async () => {
  await cleanup()
})

afterAll(async () => {
  await cleanup()
  await prisma.$disconnect()
})

async function seedMember(overrides: Partial<{
  memberNumber: string
  fullName: string
}> = {}) {
  return prisma.member.create({
    data: {
      id: randomUUID(),
      memberNumber: overrides.memberNumber ?? 'S-FIX-0001',
      memberType: 'student',
      fullName: overrides.fullName ?? 'Siti Aminah',
      gender: 'P',
      phone: '081200000000',
      email: 'siti@example.test',
      status: 'ACTIVE'
    }
  })
}

async function seedBook(title: string) {
  return prisma.book.create({
    data: { id: randomUUID(), isbn: `978-FIX-${randomUUID().slice(0, 8)}`, title, publicationYear: 2024 }
  })
}

async function seedCopy(bookId: string, n: number) {
  return prisma.bookCopy.create({
    data: {
      id: randomUUID(),
      bookId,
      inventoryNumber: `INV-FIX-${randomUUID().slice(0, 8)}-${n}`,
      barcode: `INV-FIX-${randomUUID().slice(0, 8)}-${n}`,
      status: 'AVAILABLE',
      condition: 'GOOD',
      shelfLocation: 'A-1',
      acquisitionCost: 10000
    }
  })
}

interface BorrowSeed {
  borrowNumber: string
  memberId: string
  memberName: string
  memberNumber: string
  borrowDate: Date
  dueDate: Date
  returnDate: Date | null
  className?: string | null
  collectiveClassName?: string | null
}

async function seedBorrow(s: BorrowSeed) {
  return prisma.borrow.create({ data: { id: randomUUID(), ...s } })
}

async function seedDetail(borrowId: string, bookCopyId: string, bookTitle: string, returnedAt: Date | null = null) {
  return prisma.borrowDetail.create({
    data: { id: randomUUID(), borrowId, bookCopyId, bookTitle, returnedAt, conditionBack: returnedAt ? 'BAIK' : null }
  })
}

function printTotals(data: { totals: { label: string; value: string }[] }): Record<string, number> {
  return Object.fromEntries(data.totals.map((t) => [t.label, Number(t.value)]))
}

describe('P1 — Ringkasan Peminjaman mengikuti filter status (layar + cetak)', () => {
  it('tanpa filter: perilaku lama (Total = Aktif + Selesai; Terlambat ⊆ Aktif)', async () => {
    const member = await seedMember({ memberNumber: 'S-FIX-1000', fullName: 'Budi' })
    const book = await seedBook('Buku Ringkasan')
    const copy = await seedCopy(book.id, 1)
    const mk = (n: string, due: Date, ret: Date | null) => seedBorrow({
      borrowNumber: n,
      memberId: member.id,
      memberName: member.fullName,
      memberNumber: member.memberNumber,
      borrowDate: daysAgo(3),
      dueDate: due,
      returnDate: ret
    })
    const b1 = await mk('PJ-FIX-A1', daysFromNow(5), null)   // aktif
    const b2 = await mk('PJ-FIX-A2', daysAgo(1), null)       // aktif + terlambat
    const b3 = await mk('PJ-FIX-C1', daysFromNow(5), daysAgo(1))
    const b4 = await mk('PJ-FIX-C2', daysFromNow(5), daysAgo(1))
    const b5 = await mk('PJ-FIX-C3', daysFromNow(5), daysAgo(1))
    for (const b of [b1, b2, b3, b4, b5]) await seedDetail(b.id, copy.id, book.title, b.returnDate)

    const period = { from: iso(daysAgo(10)), to: iso(daysFromNow(10)) }
    const screen = await reportService.getBorrowingReport({ ...period, limit: 100 })
    expect(screen.summary).toEqual({ total: 5, active: 2, completed: 3, overdue: 1 })
    expect(screen.summary.total).toBe(screen.summary.active + screen.summary.completed)

    const printed = await printService.buildData({ type: 'borrowings', filter: period })
    const totals = printTotals(printed)
    expect(totals['Total Transaksi']).toBe(totals['Aktif'] + totals['Selesai'])
    expect(totals['Terlambat']).toBeLessThanOrEqual(totals['Aktif'])
    expect(totals['Total Transaksi']).toBe(5)
  })

  it('filter ACTIVE/COMPLETED/OVERDUE: Total = Aktif + Selesai tetap berlaku (layar + cetak)', async () => {
    const member = await seedMember({ memberNumber: 'S-FIX-2000', fullName: 'Ani' })
    const book = await seedBook('Buku Filter')
    const copy = await seedCopy(book.id, 2)
    const mk = (n: string, due: Date, ret: Date | null) => seedBorrow({
      borrowNumber: n,
      memberId: member.id,
      memberName: member.fullName,
      memberNumber: member.memberNumber,
      borrowDate: daysAgo(3),
      dueDate: due,
      returnDate: ret
    })
    const b1 = await mk('PJ-FIX-F1', daysFromNow(5), null)
    const b2 = await mk('PJ-FIX-F2', daysAgo(1), null)
    const b3 = await mk('PJ-FIX-F3', daysFromNow(5), daysAgo(1))
    const b4 = await mk('PJ-FIX-F4', daysFromNow(5), daysAgo(1))
    for (const b of [b1, b2, b3, b4]) await seedDetail(b.id, copy.id, book.title, b.returnDate)

    const period = { from: iso(daysAgo(10)), to: iso(daysFromNow(10)) }

    const cases = [
      { status: 'ACTIVE' as const, total: 2, active: 2, completed: 0, overdue: 1 },
      { status: 'COMPLETED' as const, total: 2, active: 0, completed: 2, overdue: 0 },
      { status: 'OVERDUE' as const, total: 1, active: 1, completed: 0, overdue: 1 }
    ]

    for (const c of cases) {
      const screen = await reportService.getBorrowingReport({ ...period, status: c.status, limit: 100 })
      expect(screen.summary, `layar ${c.status}`).toEqual({
        total: c.total, active: c.active, completed: c.completed, overdue: c.overdue
      })
      expect(screen.summary.total, `layar ${c.status}`).toBe(screen.summary.active + screen.summary.completed)

      const printed = await printService.buildData({ type: 'borrowings', filter: { ...period, status: c.status } })
      const totals = printTotals(printed)
      expect(totals['Total Transaksi'], `cetak ${c.status}`).toBe(totals['Aktif'] + totals['Selesai'])
      expect(totals['Total Transaksi'], `cetak ${c.status}`).toBe(c.total)
      expect(totals['Aktif'], `cetak ${c.status}`).toBe(c.active)
      expect(totals['Selesai'], `cetak ${c.status}`).toBe(c.completed)
      expect(totals['Terlambat'], `cetak ${c.status}`).toBe(c.overdue)
      expect(totals['Terlambat'], `cetak ${c.status}`).toBeLessThanOrEqual(totals['Aktif'])
    }
  })
})

describe('P2 — Kolom "Nama Anggota" cetak = "nomor · nama" (3 laporan)', () => {
  it('Peminjaman, Pengembalian, Keterlambatan (active & returned) memakai snapshot Borrow.memberNumber', async () => {
    const member = await seedMember({ memberNumber: 'S-FIX-3000', fullName: 'Budi Santoso' })
    const book = await seedBook('Buku Label')
    const copy1 = await seedCopy(book.id, 3)
    const copy2 = await seedCopy(book.id, 4)
    const copy3 = await seedCopy(book.id, 5)
    const copy4 = await seedCopy(book.id, 6)

    const active = await seedBorrow({
      borrowNumber: 'PJ-FIX-L1', memberId: member.id, memberName: member.fullName,
      memberNumber: member.memberNumber, borrowDate: daysAgo(10), dueDate: daysFromNow(5), returnDate: null
    })
    await seedDetail(active.id, copy1.id, book.title)

    const returned = await seedBorrow({
      borrowNumber: 'PJ-FIX-L2', memberId: member.id, memberName: member.fullName,
      memberNumber: member.memberNumber, borrowDate: daysAgo(20), dueDate: daysAgo(12), returnDate: daysAgo(1)
    })
    await seedDetail(returned.id, copy2.id, book.title, daysAgo(1))

    const overdueActive = await seedBorrow({
      borrowNumber: 'PJ-FIX-L3', memberId: member.id, memberName: member.fullName,
      memberNumber: member.memberNumber, borrowDate: daysAgo(10), dueDate: daysAgo(2), returnDate: null
    })
    await seedDetail(overdueActive.id, copy3.id, book.title)

    const overdueReturned = await seedBorrow({
      borrowNumber: 'PJ-FIX-L4', memberId: member.id, memberName: member.fullName,
      memberNumber: member.memberNumber, borrowDate: daysAgo(20), dueDate: daysAgo(12), returnDate: daysAgo(1)
    })
    await seedDetail(overdueReturned.id, copy4.id, book.title, daysAgo(1))

    const period = { from: iso(daysAgo(25)), to: iso(daysFromNow(10)) }
    const expected = `${member.memberNumber} · ${member.fullName}`

    const borrowings = await printService.buildData({ type: 'borrowings', filter: period })
    expect(borrowings.rows[0][2]).toBe(expected)

    const returns = await printService.buildData({ type: 'returns', filter: period })
    expect(returns.rows[0][2]).toBe(expected)

    const overdues = await printService.buildData({ type: 'overdues', filter: period })
    const labels = overdues.rows.map((r) => r[2])
    expect(labels).toContain(expected)
    expect(labels.every((l) => l === expected)).toBe(true)
  })
})

describe('P5 — Kelas kosong memakai collectiveClassName (layar + cetak)', () => {
  it('Peminjaman/Pengembalian/Keterlambatan: className null → collectiveClassName tampil', async () => {
    const member = await seedMember({ memberNumber: 'S-FIX-4000', fullName: 'Citra' })
    const book = await seedBook('Buku Kolektif')
    const copy = await seedCopy(book.id, 7)

    const borrowActive = await seedBorrow({
      borrowNumber: 'PJ-FIX-K1', memberId: member.id, memberName: member.fullName,
      memberNumber: member.memberNumber, borrowDate: daysAgo(3), dueDate: daysFromNow(5),
      returnDate: null, className: null, collectiveClassName: 'VII A'
    })
    await seedDetail(borrowActive.id, copy.id, book.title)

    const borrowReturned = await seedBorrow({
      borrowNumber: 'PJ-FIX-K2', memberId: member.id, memberName: member.fullName,
      memberNumber: member.memberNumber, borrowDate: daysAgo(20), dueDate: daysAgo(12),
      returnDate: daysAgo(1), className: null, collectiveClassName: 'VIII B'
    })
    await seedDetail(borrowReturned.id, copy.id, book.title, daysAgo(1))

    const overdueActive = await seedBorrow({
      borrowNumber: 'PJ-FIX-K3', memberId: member.id, memberName: member.fullName,
      memberNumber: member.memberNumber, borrowDate: daysAgo(10), dueDate: daysAgo(2),
      returnDate: null, className: null, collectiveClassName: 'IX C'
    })
    await seedDetail(overdueActive.id, copy.id, book.title)

    const overdueReturned = await seedBorrow({
      borrowNumber: 'PJ-FIX-K4', memberId: member.id, memberName: member.fullName,
      memberNumber: member.memberNumber, borrowDate: daysAgo(20), dueDate: daysAgo(12),
      returnDate: daysAgo(1), className: null, collectiveClassName: 'IX D'
    })
    await seedDetail(overdueReturned.id, copy.id, book.title, daysAgo(1))

    const period = { from: iso(daysAgo(25)), to: iso(daysFromNow(10)) }

    // Layar
    const screenBorrow = await reportService.getBorrowingReport({ ...period, limit: 100 })
    expect(screenBorrow.rows.find((r) => r.borrowNumber === 'PJ-FIX-K1')?.className).toBe('VII A')
    const screenReturn = await reportService.getReturnReport({ ...period, limit: 100 })
    expect(screenReturn.rows.find((r) => r.borrowNumber === 'PJ-FIX-K2')?.className).toBe('VIII B')
    const screenOverdue = await reportService.getOverdueReport({ ...period, limit: 100 })
    expect(screenOverdue.rows.find((r) => r.borrowNumber === 'PJ-FIX-K3')?.className).toBe('IX C')
    expect(screenOverdue.rows.find((r) => r.borrowNumber === 'PJ-FIX-K4')?.className).toBe('IX D')

    // Cetak
    const printedBorrow = await printService.buildData({ type: 'borrowings', filter: period })
    expect(printedBorrow.rows.find((r) => r[1] === 'PJ-FIX-K1')?.[3]).toBe('VII A')
    const printedReturn = await printService.buildData({ type: 'returns', filter: period })
    expect(printedReturn.rows.find((r) => r[1] === 'PJ-FIX-K2')?.[3]).toBe('VIII B')
    const printedOverdue = await printService.buildData({ type: 'overdues', filter: period })
    expect(printedOverdue.rows.find((r) => r[1] === 'PJ-FIX-K3')?.[3]).toBe('IX C')
    expect(printedOverdue.rows.find((r) => r[1] === 'PJ-FIX-K4')?.[3]).toBe('IX D')
  })
})

describe('P6 — Pencarian dengan spasi awal/akhir == tanpa spasi (4 laporan)', () => {
  it('Peminjaman, Pengembalian, Anggota, Koleksi: trim menghasilkan hasil identik', async () => {
    const member = await seedMember({ memberNumber: 'S-FIX-5000', fullName: 'Siti Aminah' })
    const book = await seedBook('Matematika Lanjutan')
    const copy = await seedCopy(book.id, 8)

    const borrow = await seedBorrow({
      borrowNumber: 'PJ-FIX-S1', memberId: member.id, memberName: member.fullName,
      memberNumber: member.memberNumber, borrowDate: daysAgo(3), dueDate: daysAgo(1), returnDate: daysAgo(1)
    })
    await seedDetail(borrow.id, copy.id, book.title, daysAgo(1))

    const period = { from: iso(daysAgo(10)), to: iso(daysFromNow(10)) }

    const borrowPadded = await reportService.getBorrowingReport({ ...period, search: '  Siti Aminah  ', limit: 100 })
    const borrowTrimmed = await reportService.getBorrowingReport({ ...period, search: 'Siti Aminah', limit: 100 })
    expect(borrowPadded.rows).toHaveLength(1)
    expect(borrowPadded.rows[0].borrowNumber).toBe(borrowTrimmed.rows[0].borrowNumber)

    const returnPadded = await reportService.getReturnReport({ ...period, search: '  Siti Aminah  ', limit: 100 })
    const returnTrimmed = await reportService.getReturnReport({ ...period, search: 'Siti Aminah', limit: 100 })
    expect(returnPadded.rows).toHaveLength(1)
    expect(returnPadded.rows[0].borrowNumber).toBe(returnTrimmed.rows[0].borrowNumber)

    const memberPadded = await reportService.getMemberReport({ search: '  Siti Aminah  ', limit: 100 })
    const memberTrimmed = await reportService.getMemberReport({ search: 'Siti Aminah', limit: 100 })
    expect(memberPadded.pagination.total).toBe(1)
    expect(memberPadded.pagination.total).toBe(memberTrimmed.pagination.total)

    const collectionPadded = await reportService.getCollectionReport({ search: '  Matematika Lanjutan  ', limit: 100 })
    const collectionTrimmed = await reportService.getCollectionReport({ search: 'Matematika Lanjutan', limit: 100 })
    expect(collectionPadded.pagination.total).toBe(1)
    expect(collectionPadded.pagination.total).toBe(collectionTrimmed.pagination.total)
  })
})

describe('P7 — from > to ditolak AppError 400 (layar + cetak)', () => {
  const bad = { from: iso(daysFromNow(5)), to: iso(daysAgo(5)) }

  it('layar Peminjaman & Pengembalian melempar AppError 400 berpesan Indonesia', async () => {
    await expect(reportService.getBorrowingReport(bad)).rejects.toMatchObject({
      statusCode: 400,
      message: 'Tanggal mulai tidak boleh setelah tanggal akhir.'
    })
    await expect(reportService.getReturnReport(bad)).rejects.toMatchObject({
      statusCode: 400,
      message: 'Tanggal mulai tidak boleh setelah tanggal akhir.'
    })
  })

  it('cetak Peminjaman & Pengembalian melempar AppError 400 berpesan Indonesia', async () => {
    await expect(printService.buildData({ type: 'borrowings', filter: bad })).rejects.toMatchObject({
      statusCode: 400,
      message: 'Tanggal mulai tidak boleh setelah tanggal akhir.'
    })
    await expect(printService.buildData({ type: 'returns', filter: bad })).rejects.toMatchObject({
      statusCode: 400,
      message: 'Tanggal mulai tidak boleh setelah tanggal akhir.'
    })
  })

  it('error adalah instance AppError', async () => {
    const err = await reportService.getBorrowingReport(bad).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(AppError)
  })

  it('from == to (sama hari) TIDAK ditolak', async () => {
    const same = { from: iso(daysAgo(1)), to: iso(daysAgo(1)) }
    await expect(reportService.getBorrowingReport(same)).resolves.toBeDefined()
  })
})
