import { randomUUID } from 'crypto'
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { getPrisma } from '../src/main/repositories/base/prisma'
import { ReportRepository, assertReportPrintRowLimit } from '../src/main/repositories/report.repository'
import { ReportService } from '../src/main/services/report.service'
import { ReportPrintService } from '../src/main/services/report-print.service'
import { REPORT_PRINT_MAX_ROWS } from '../src/shared/config/report-print'

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
  await prisma.class.deleteMany()
  await prisma.curriculum.deleteMany()
  await prisma.academicYear.deleteMany()
  await prisma.category.deleteMany()
  await prisma.setting.deleteMany()
}

beforeEach(async () => {
  await cleanup()
})

afterAll(async () => {
  await cleanup()
  await prisma.$disconnect()
})

// Seed bulk dengan createMany (id dibuat sendiri agar FK bisa diisi).
async function seedMembers(count: number, prefix = 'S') {
  const members = Array.from({ length: count }, (_, i) => ({
    id: randomUUID(),
    memberNumber: `${prefix}-EXP-${String(i + 1).padStart(4, '0')}`,
    memberType: 'student',
    fullName: `Anggota ${prefix} ${i + 1}`,
    gender: 'L',
    phone: `0812${String(i).padStart(6, '0')}`,
    email: `anggota${i}@example.test`,
    status: 'ACTIVE'
  }))
  await prisma.member.createMany({ data: members })
  return members
}

async function seedBooks(count: number) {
  const books = Array.from({ length: count }, (_, i) => ({
    id: randomUUID(),
    isbn: `978-EXP-${String(i + 1).padStart(6, '0')}`,
    title: `Buku Ekspor ${i + 1}`,
    publicationYear: 2020 + (i % 5)
  }))
  await prisma.book.createMany({ data: books })
  return books
}

async function seedCopies(books: { id: string }[], count: number, status = 'AVAILABLE') {
  const copies = Array.from({ length: count }, (_, i) => ({
    id: randomUUID(),
    bookId: books[i % books.length].id,
    inventoryNumber: `INV-EXP-${String(i + 1).padStart(5, '0')}`,
    barcode: `INV-EXP-${String(i + 1).padStart(5, '0')}`,
    status,
    condition: 'GOOD',
    shelfLocation: 'A-1',
    acquisitionCost: 10000
  }))
  await prisma.bookCopy.createMany({ data: copies })
  return copies
}

describe('ReportPrintService — kolom & judul (keputusan pemilik)', () => {
  it('kolom cetak sama persis dengan kolom layar untuk 5 laporan', async () => {
    const period = { from: iso(daysAgo(3)), to: iso(new Date()) }
    const borrowings = await printService.buildData({ type: 'borrowings', filter: period })
    expect(borrowings.columns.map((c) => c.label)).toEqual([
      'Tanggal', 'Nomor Transaksi', 'Nama Anggota', 'Kelas', 'Judul Buku', 'Jatuh Tempo', 'Status'
    ])
    expect(borrowings.title).toBe('Laporan Peminjaman')
    expect(borrowings.orientation).toBe('landscape')

    const returns = await printService.buildData({ type: 'returns', filter: period })
    expect(returns.columns.map((c) => c.label)).toEqual([
      'Tanggal Kembali', 'Nomor Transaksi', 'Nama Anggota', 'Kelas', 'Judul Buku', 'Lama Pinjam', 'Status'
    ])

    const overdues = await printService.buildData({ type: 'overdues', filter: period })
    expect(overdues.columns.map((c) => c.label)).toEqual([
      'Tanggal Pinjam', 'Nomor Transaksi', 'Nama Anggota', 'Kelas', 'Judul Buku', 'Jatuh Tempo', 'Hari Terlambat', 'Status'
    ])
    expect(overdues.orientation).toBe('landscape')

    const members = await printService.buildData({ type: 'members', filter: {} })
    expect(members.columns.map((c) => c.label)).toEqual([
      'Nomor Anggota', 'Nama', 'Kelas', 'Status Keanggotaan', 'Tanggal Bergabung'
    ])
    expect(members.columns.map((c) => c.key)).toEqual(['memberNumber', 'fullName', 'className', 'membershipStatus', 'joinedAt'])

    const collections = await printService.buildData({ type: 'collections', filter: {} })
    expect(collections.columns.map((c) => c.label)).toEqual([
      'ISBN', 'Judul', 'Penulis', 'Penerbit', 'Kategori', 'Tahun', 'Jumlah Eksemplar', 'Tersedia', 'Dipinjam', 'Hilang', 'Rusak'
    ])
    expect(collections.orientation).toBe('landscape')
    expect(collections.institution.libraryName).toBe('Perpustakaan Uji')
  })
})

describe('ReportPrintService — ekspor tidak ter-clamp 100', () => {
  it('Peminjaman: 120 transaksi → 120 baris cetak (melebihi clamp layar 100)', async () => {
    const members = await seedMembers(1)
    const books = await seedBooks(2)
    const copies = await seedCopies(books, 3)
    const borrows = Array.from({ length: 120 }, (_, i) => ({
      id: randomUUID(),
      borrowNumber: `PJ-EXP-${String(i + 1).padStart(4, '0')}`,
      memberId: members[0].id,
      memberName: members[0].fullName,
      memberNumber: members[0].memberNumber,
      borrowDate: daysAgo(2),
      dueDate: daysFromNow(5),
      returnDate: null as Date | null
    }))
    await prisma.borrow.createMany({ data: borrows })
    const details = borrows.map((b, i) => ({
      id: randomUUID(),
      borrowId: b.id,
      bookCopyId: copies[i % copies.length].id,
      bookTitle: books[i % books.length].title,
      returnedAt: null as Date | null
    }))
    await prisma.borrowDetail.createMany({ data: details })

    const data = await printService.buildData({
      type: 'borrowings',
      filter: { from: iso(daysAgo(5)), to: iso(new Date()) }
    })
    expect(data.rows).toHaveLength(120)
    expect(data.totalRows).toBe(120)
    expect(data.totals.find((t) => t.label === 'Total Transaksi')?.value).toBe('120')
  })

  it('Peminjaman: 1 transaksi 2 buku = 2 baris, tetapi totals.transaksi = 1', async () => {
    const members = await seedMembers(1)
    const books = await seedBooks(2)
    const copies = await seedCopies(books, 2)
    const borrowId = randomUUID()
    await prisma.borrow.create({ data: {
      id: borrowId,
      borrowNumber: 'PJ-EXP-2BUKU',
      memberId: members[0].id,
      memberName: members[0].fullName,
      memberNumber: members[0].memberNumber,
      borrowDate: daysAgo(1),
      dueDate: daysFromNow(6),
      returnDate: null
    } })
    await prisma.borrowDetail.createMany({ data: [
      { id: randomUUID(), borrowId, bookCopyId: copies[0].id, bookTitle: books[0].title, returnedAt: null },
      { id: randomUUID(), borrowId, bookCopyId: copies[1].id, bookTitle: books[1].title, returnedAt: null }
    ] })

    const data = await printService.buildData({
      type: 'borrowings',
      filter: { from: iso(daysAgo(3)), to: iso(new Date()) }
    })
    expect(data.rows).toHaveLength(2)
    expect(data.totalRows).toBe(2)
    expect(data.totals.find((t) => t.label === 'Total Transaksi')?.value).toBe('1')
  })

  it('Pengembalian: 105 pengembalian → 105 baris (melebihi clamp 100)', async () => {
    const members = await seedMembers(1)
    const books = await seedBooks(1)
    const copies = await seedCopies(books, 105)
    const borrows = Array.from({ length: 105 }, (_, i) => ({
      id: randomUUID(),
      borrowNumber: `PJ-RET-${String(i + 1).padStart(4, '0')}`,
      memberId: members[0].id,
      memberName: members[0].fullName,
      memberNumber: members[0].memberNumber,
      borrowDate: daysAgo(10),
      dueDate: daysFromNow(2),
      returnDate: daysAgo(1)
    }))
    await prisma.borrow.createMany({ data: borrows })
    await prisma.borrowDetail.createMany({ data: borrows.map((b, i) => ({
      id: randomUUID(),
      borrowId: b.id,
      bookCopyId: copies[i].id,
      bookTitle: books[0].title,
      returnedAt: daysAgo(1),
      conditionBack: 'BAIK'
    })) })

    const data = await printService.buildData({
      type: 'returns',
      filter: { from: iso(daysAgo(5)), to: iso(new Date()) }
    })
    expect(data.rows).toHaveLength(105)
    expect(data.rows[0][6]).toBe('Tepat Waktu')
    expect(data.totals.find((t) => t.label === 'Total Pengembalian')?.value).toBe('105')
  })

  it('Anggota: 110 anggota → 110 baris, tanpa periode & tanpa telepon/email/gender', async () => {
    await seedMembers(110)
    const data = await printService.buildData({ type: 'members', filter: {} })
    expect(data.rows).toHaveLength(110)
    expect(data.columns.map((c) => c.key)).not.toContain('phone')
    expect(data.columns.map((c) => c.key)).not.toContain('email')
    expect(data.columns.map((c) => c.key)).not.toContain('gender')
    expect(data.filterSummary.some((f) => f.label === 'Periode')).toBe(false)
    expect(data.totals.find((t) => t.label === 'Total Anggota')?.value).toBe('110')
  })

  it('Koleksi: 110 judul → 110 baris; totals memuat Nilai Aset berformat rupiah', async () => {
    const books = await seedBooks(110)
    await seedCopies(books, 110)
    const data = await printService.buildData({ type: 'collections', filter: {} })
    expect(data.rows).toHaveLength(110)
    expect(data.totals.find((t) => t.label === 'Total Judul')?.value).toBe('110')
    expect(data.totals.find((t) => t.label === 'Nilai Aset')?.value).toMatch(/^Rp /)
  })
})

describe('ReportPrintService — Keterlambatan: periode hanya memfilter yang sudah dikembalikan (R-4)', () => {
  it('ACTIVE selalu tampil meski borrowDate di luar periode; RETURNED di luar periode disaring', async () => {
    const members = await seedMembers(1)
    const books = await seedBooks(3)
    const copies = await seedCopies(books, 3)

    // ACTIVE: pinjam 10 hari lalu, jatuh tempo 2 hari lalu, belum kembali.
    const activeBorrowId = randomUUID()
    await prisma.borrow.create({ data: {
      id: activeBorrowId,
      borrowNumber: 'PJ-OD-ACTIVE',
      memberId: members[0].id,
      memberName: members[0].fullName,
      memberNumber: members[0].memberNumber,
      borrowDate: daysAgo(10),
      dueDate: daysAgo(2),
      returnDate: null
    } })
    await prisma.borrowDetail.create({ data: {
      id: randomUUID(), borrowId: activeBorrowId, bookCopyId: copies[0].id, bookTitle: books[0].title, returnedAt: null
    } })

    // RETURNED terlambat, returnedAt DI DALAM periode (1 hari lalu).
    const inPeriodId = randomUUID()
    await prisma.borrow.create({ data: {
      id: inPeriodId,
      borrowNumber: 'PJ-OD-IN',
      memberId: members[0].id,
      memberName: members[0].fullName,
      memberNumber: members[0].memberNumber,
      borrowDate: daysAgo(20),
      dueDate: daysAgo(12),
      returnDate: daysAgo(1)
    } })
    await prisma.borrowDetail.create({ data: {
      id: randomUUID(), borrowId: inPeriodId, bookCopyId: copies[1].id, bookTitle: books[1].title,
      returnedAt: daysAgo(1), conditionBack: 'BAIK'
    } })

    // RETURNED terlambat, returnedAt DI LUAR periode (30 hari lalu) → disaring.
    const outPeriodId = randomUUID()
    await prisma.borrow.create({ data: {
      id: outPeriodId,
      borrowNumber: 'PJ-OD-OUT',
      memberId: members[0].id,
      memberName: members[0].fullName,
      memberNumber: members[0].memberNumber,
      borrowDate: daysAgo(45),
      dueDate: daysAgo(40),
      returnDate: daysAgo(30)
    } })
    await prisma.borrowDetail.create({ data: {
      id: randomUUID(), borrowId: outPeriodId, bookCopyId: copies[2].id, bookTitle: books[2].title,
      returnedAt: daysAgo(30), conditionBack: 'BAIK'
    } })

    const data = await printService.buildData({
      type: 'overdues',
      filter: { from: iso(daysAgo(5)), to: iso(new Date()) }
    })
    expect(data.rows).toHaveLength(2)
    expect(data.rows.map((r) => r[1])).toEqual(['PJ-OD-ACTIVE', 'PJ-OD-IN'])
    expect(data.rows[0][7]).toBe('Masih Terlambat')
    expect(data.rows[1][7]).toBe('Sudah Dikembalikan Terlambat')
    expect(data.notes).toEqual([
      'Periode hanya berlaku untuk buku yang sudah dikembalikan. Buku yang masih terlambat selalu ditampilkan.'
    ])
    expect(data.totals.find((t) => t.label === 'Total Terlambat')?.value).toBe('2')
  })
})

describe('Batas ekspor 5000 baris', () => {
  it('assertReportPrintRowLimit: tepat 5000 lolos, 5001 ditolak dengan pesan Indonesia', () => {
    expect(REPORT_PRINT_MAX_ROWS).toBe(5000)
    expect(() => assertReportPrintRowLimit(5000)).not.toThrow()
    expect(() => assertReportPrintRowLimit(5001)).toThrow(/5001 baris/)
    expect(() => assertReportPrintRowLimit(5001)).toThrow(/5000 baris/)
    expect(() => assertReportPrintRowLimit(5001)).toThrow(/Persempit filter/)
  })

  it('repository dengan batas override (untuk test) menolak ekspor melebihi batas — tanpa seed 5000 baris', async () => {
    // Cara override: ReportRepository({ reportPrintMaxRows }) — konstanta
    // produksi tetap 5000; test memakai batas kecil agar penolakan dapat
    // dibuktikan dengan seed sedikit baris.
    const limitedRepository = new ReportRepository({ reportPrintMaxRows: 5 })
    await seedMembers(6)
    await expect(limitedRepository.findAllMembersForExport({})).rejects.toThrow(/6 baris/)
    await expect(limitedRepository.findAllMembersForExport({})).rejects.toThrow(/5 baris/)
    await expect(limitedRepository.findAllMembersForExport({})).rejects.toThrow(/Persempit filter/)
    // Di bawah batas tetap lolos.
    const ok = await new ReportRepository({ reportPrintMaxRows: 10 }).findAllMembersForExport({})
    expect(ok.totalRows).toBe(6)
  })
})

describe('Paritas dengan ReportService (status & lateDays identik)', () => {
  it('status Peminjaman cetak == status layar (Dipinjam/Dikembalikan/Terlambat)', async () => {
    const members = await seedMembers(1)
    const books = await seedBooks(3)
    const copies = await seedCopies(books, 3)
    const mk = (borrowNumber: string, borrowDate: Date, dueDate: Date, returnDate: Date | null) => ({
      id: randomUUID(), borrowNumber, memberId: members[0].id,
      memberName: members[0].fullName, memberNumber: members[0].memberNumber,
      borrowDate, dueDate, returnDate
    })
    const borrows = [
      mk('PJ-PAR-ACTIVE', daysAgo(1), daysFromNow(6), null),
      mk('PJ-PAR-OVERDUE', daysAgo(10), daysAgo(2), null),
      mk('PJ-PAR-DONE', daysAgo(10), daysFromNow(2), daysAgo(1))
    ]
    await prisma.borrow.createMany({ data: borrows })
    await prisma.borrowDetail.createMany({ data: borrows.map((b, i) => ({
      id: randomUUID(), borrowId: b.id, bookCopyId: copies[i].id,
      bookTitle: books[i].title, returnedAt: b.returnDate
    })) })

    const period = { from: iso(daysAgo(15)), to: iso(new Date()) }
    const screen = await reportService.getBorrowingReport({ ...period, limit: 100 })
    const printed = await printService.buildData({ type: 'borrowings', filter: period })

    const TEXT: Record<string, string> = { ACTIVE: 'Dipinjam', COMPLETED: 'Dikembalikan', OVERDUE: 'Terlambat' }
    const screenByNumber = new Map(screen.rows.map((r) => [r.borrowNumber, TEXT[r.status]]))
    expect(printed.rows).toHaveLength(3)
    for (const row of printed.rows) {
      expect(row[6]).toBe(screenByNumber.get(row[1]))
    }
    expect(screenByNumber.get('PJ-PAR-ACTIVE')).toBe('Dipinjam')
    expect(screenByNumber.get('PJ-PAR-OVERDUE')).toBe('Terlambat')
    expect(screenByNumber.get('PJ-PAR-DONE')).toBe('Dikembalikan')
  })

  it('lateDays Keterlambatan cetak == lateDays layar; durationDays Pengembalian juga paritas', async () => {
    const members = await seedMembers(1)
    const books = await seedBooks(2)
    const copies = await seedCopies(books, 2)
    const borrowId = randomUUID()
    await prisma.borrow.create({ data: {
      id: borrowId,
      borrowNumber: 'PJ-PAR-LATE',
      memberId: members[0].id,
      memberName: members[0].fullName,
      memberNumber: members[0].memberNumber,
      borrowDate: daysAgo(20),
      dueDate: daysAgo(12),
      returnDate: daysAgo(1)
    } })
    await prisma.borrowDetail.create({ data: {
      id: randomUUID(), borrowId, bookCopyId: copies[0].id, bookTitle: books[0].title,
      returnedAt: daysAgo(1), conditionBack: 'BAIK'
    } })

    const period = { from: iso(daysAgo(25)), to: iso(new Date()) }
    const screenOverdue = await reportService.getOverdueReport({ ...period, limit: 100 })
    const printedOverdue = await printService.buildData({ type: 'overdues', filter: period })
    expect(screenOverdue.rows).toHaveLength(1)
    expect(printedOverdue.rows).toHaveLength(1)
    expect(printedOverdue.rows[0][6]).toBe(String(screenOverdue.rows[0].lateDays))

    const screenReturn = await reportService.getReturnReport({ ...period, limit: 100 })
    const printedReturn = await printService.buildData({ type: 'returns', filter: period })
    expect(screenReturn.rows).toHaveLength(1)
    expect(printedReturn.rows).toHaveLength(1)
    expect(printedReturn.rows[0][5]).toBe(`${screenReturn.rows[0].durationDays} hari`)
    expect(printedReturn.rows[0][6]).toBe(
      screenReturn.rows[0].status === 'LATE' ? 'Terlambat' : 'Tepat Waktu'
    )
  })
})

describe('ReportPrintService — filterSummary tercetak sebagai NAMA (TAHAP 2)', () => {
  async function seedMaster() {
    const year = await prisma.academicYear.create({ data: { name: '2026/2027', startDate: daysAgo(60), endDate: daysFromNow(300), isActive: true } })
    const curriculum = await prisma.curriculum.create({ data: { name: 'Kurikulum Merdeka' } })
    const kelas = await prisma.class.create({ data: { academicYearId: year.id, curriculumId: curriculum.id, educationLevel: 'X', parallel: 'A', isActive: true } })
    const category = await prisma.category.create({ data: { code: 'FIKSI', name: 'Fiksi' } })
    return { year, kelas, category }
  }

  it('Kelas & Tahun Ajaran tercetak sebagai nama ("X A", "2026/2027"), bukan ID', async () => {
    const { year, kelas } = await seedMaster()
    const data = await printService.buildData({ type: 'members', filter: { classId: kelas.id, academicYearId: year.id } })
    expect(data.filterSummary.find((f) => f.label === 'Kelas')?.value).toBe('X A')
    expect(data.filterSummary.find((f) => f.label === 'Tahun Ajaran')?.value).toBe('2026/2027')
  })

  it('Kategori tercetak sebagai nama ("Fiksi")', async () => {
    const { category } = await seedMaster()
    const data = await printService.buildData({ type: 'collections', filter: { categoryId: category.id } })
    expect(data.filterSummary.find((f) => f.label === 'Kategori')?.value).toBe('Fiksi')
  })

  it('ID tidak ditemukan → "(tidak ditemukan)", bukan error', async () => {
    const members = await printService.buildData({ type: 'members', filter: { classId: 'id-tidak-ada' } })
    expect(members.filterSummary.find((f) => f.label === 'Kelas')?.value).toBe('(tidak ditemukan)')
    const collections = await printService.buildData({ type: 'collections', filter: { categoryId: 'id-tidak-ada' } })
    expect(collections.filterSummary.find((f) => f.label === 'Kategori')?.value).toBe('(tidak ditemukan)')
  })
})
