import { randomUUID } from 'crypto'
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { getPrisma } from '../src/main/repositories/base/prisma'
import { ReportRepository } from '../src/main/repositories/report.repository'
import {
  BorrowingChartService,
  BORROWING_CHART_MAX_MONTHS
} from '../src/main/services/borrowing-chart.service'

const prisma = getPrisma()
const repository = new ReportRepository()
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
const service = new BorrowingChartService(repository, settingsProvider)

const DAY_MS = 86_400_000

// Tanggal LOKAL eksplisit (bukan UTC) — inti pengujian bulan lokal.
function localDate(y: number, m: number, d: number, h = 10, min = 0): Date {
  return new Date(y, m - 1, d, h, min, 0, 0)
}

// Filter periode dari tanggal lokal (parseRange memakai startOfDay/endOfDay lokal).
function period(
  fromY: number,
  fromM: number,
  fromD: number,
  toY: number,
  toM: number,
  toD: number
): { from: string; to: string } {
  return {
    from: localDate(fromY, fromM, fromD, 0, 0).toISOString(),
    to: localDate(toY, toM, toD, 0, 0).toISOString()
  }
}

async function cleanup() {
  await prisma.fine.deleteMany()
  await prisma.borrowDetail.deleteMany()
  await prisma.borrow.deleteMany()
  await prisma.assetEvent.deleteMany()
  await prisma.bookCopy.deleteMany()
  await prisma.book.deleteMany()
  await prisma.memberEnrollment.deleteMany()
  await prisma.member.deleteMany()
}

beforeEach(async () => {
  await cleanup()
})

afterAll(async () => {
  await cleanup()
  await prisma.$disconnect()
})

async function seedMembers(count: number) {
  const members = Array.from({ length: count }, (_, i) => ({
    id: randomUUID(),
    memberNumber: `S-CHART-${String(i + 1).padStart(4, '0')}`,
    memberType: 'student',
    fullName: `Anggota Grafik ${i + 1}`,
    gender: 'L',
    phone: `0813${String(i).padStart(6, '0')}`,
    email: `grafik${i}@example.test`,
    status: 'ACTIVE'
  }))
  await prisma.member.createMany({ data: members })
  return members
}

// Satu buku = satu eksemplar (cukup untuk pengujian agregasi).
async function seedBooks(titles: string[]) {
  const books = titles.map((title, i) => ({
    id: randomUUID(),
    isbn: `978-CHART-${String(i + 1).padStart(6, '0')}`,
    title,
    publicationYear: 2020 + (i % 5)
  }))
  await prisma.book.createMany({ data: books })

  const copies = books.map((book, i) => ({
    id: randomUUID(),
    bookId: book.id,
    inventoryNumber: `INV-CHART-${String(i + 1).padStart(5, '0')}`,
    barcode: `INV-CHART-${String(i + 1).padStart(5, '0')}`,
    status: 'AVAILABLE',
    condition: 'GOOD',
    shelfLocation: 'A-1',
    acquisitionCost: 10000
  }))
  await prisma.bookCopy.createMany({ data: copies })
  return { books, copies }
}

let borrowSeq = 0

interface SeedBorrowInput {
  member: { id: string; memberNumber: string; fullName: string }
  bookIndex: number
  borrowDate: Date
  className?: string | null
  collectiveClassName?: string | null
}

async function seedBorrows(
  input: SeedBorrowInput[],
  library: { books: { id: string; title: string }[]; copies: { id: string }[] }
) {
  for (const item of input) {
    borrowSeq += 1
    const borrow = {
      id: randomUUID(),
      borrowNumber: `PJ-CHART-${String(borrowSeq).padStart(5, '0')}`,
      memberId: item.member.id,
      memberName: item.member.fullName,
      memberNumber: item.member.memberNumber,
      borrowDate: item.borrowDate,
      dueDate: new Date(item.borrowDate.getTime() + 7 * DAY_MS),
      returnDate: null as Date | null,
      className: item.className ?? null,
      collectiveClassName: item.collectiveClassName ?? null
    }
    await prisma.borrow.create({ data: borrow })
    await prisma.borrowDetail.create({
      data: {
        id: randomUUID(),
        borrowId: borrow.id,
        bookCopyId: library.copies[item.bookIndex].id,
        bookTitle: library.books[item.bookIndex].title,
        returnedAt: null
      }
    })
  }
}

describe('BorrowingChartService — periode kosong', () => {
  it('(a) tanpa data: tidak error, seluruh angka 0, seri 1 bulan berisi 0', async () => {
    const data = await service.buildBorrowingChartData(period(2025, 1, 1, 2025, 1, 31))

    expect(data.title).toBe('Grafik Peminjaman')
    expect(data.orientation).toBe('landscape')
    expect(data.institution.libraryName).toBe('Perpustakaan Uji')
    expect(data.periodLabel).toBe('Jan 2025')
    expect(data.summary).toEqual({ totalBorrowings: 0, totalBooks: 0, activeBorrowers: 0 })
    expect(data.monthly).toEqual([{ label: 'Jan 2025', count: 0 }])
    expect(data.topBooks).toEqual([])
    expect(data.byClass).toEqual([])
    expect(typeof data.generatedAt).toBe('string')
  })
})

describe('BorrowingChartService — data campuran', () => {
  it('(b) hitung per bulan, top judul, dan per kelas benar', async () => {
    const members = await seedMembers(3)
    const library = await seedBooks(['Buku Uji 01', 'Buku Uji 02', 'Buku Uji 03'])
    await seedBorrows(
      [
        { member: members[0], bookIndex: 0, borrowDate: localDate(2026, 2, 10), className: 'X IPA 1' },
        { member: members[0], bookIndex: 0, borrowDate: localDate(2026, 2, 20), className: 'X IPA 1' },
        {
          member: members[1],
          bookIndex: 1,
          borrowDate: localDate(2026, 2, 25),
          className: null,
          collectiveClassName: 'XI IPS 2'
        },
        {
          member: members[2],
          bookIndex: 2,
          borrowDate: localDate(2026, 4, 2),
          className: null,
          collectiveClassName: null
        }
      ],
      library
    )

    const data = await service.buildBorrowingChartData(period(2026, 2, 1, 2026, 4, 30))

    // Bulan berurutan; bulan tanpa data (Mar) = 0.
    expect(data.monthly).toEqual([
      { label: 'Feb 2026', count: 3 },
      { label: 'Mar 2026', count: 0 },
      { label: 'Apr 2026', count: 1 }
    ])
    expect(data.periodLabel).toBe('Feb 2026 - Apr 2026')
    expect(data.summary).toEqual({ totalBorrowings: 4, totalBooks: 4, activeBorrowers: 3 })
    expect(data.topBooks).toEqual([
      { title: 'Buku Uji 01', count: 2 },
      { title: 'Buku Uji 02', count: 1 },
      { title: 'Buku Uji 03', count: 1 }
    ])
    // count desc, lalu nama kelas asc ("Tanpa Kelas" < "XI IPS 2").
    expect(data.byClass).toEqual([
      { className: 'X IPA 1', count: 2 },
      { className: 'Tanpa Kelas', count: 1 },
      { className: 'XI IPS 2', count: 1 }
    ])
  })

  it('(b2) top judul maksimal 10 dan tie-break judul asc', async () => {
    const members = await seedMembers(1)
    const titles = Array.from({ length: 12 }, (_, i) => `Buku Uji ${String(i + 1).padStart(2, '0')}`)
    const library = await seedBooks(titles)
    // 16 pinjaman: 3x judul 01, 2x judul 02, 2x judul 03, 1x judul 04..12.
    const sequence = [0, 0, 0, 1, 1, 2, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
    await seedBorrows(
      sequence.map((bookIndex) => ({
        member: members[0],
        bookIndex,
        borrowDate: localDate(2026, 5, 5)
      })),
      library
    )

    const data = await service.buildBorrowingChartData(period(2026, 5, 1, 2026, 5, 31))

    expect(data.topBooks).toHaveLength(10)
    expect(data.topBooks[0]).toEqual({ title: 'Buku Uji 01', count: 3 })
    expect(data.topBooks.slice(1, 3)).toEqual([
      { title: 'Buku Uji 02', count: 2 },
      { title: 'Buku Uji 03', count: 2 }
    ])
    expect(data.topBooks.slice(3).map((b) => b.title)).toEqual([
      'Buku Uji 04',
      'Buku Uji 05',
      'Buku Uji 06',
      'Buku Uji 07',
      'Buku Uji 08',
      'Buku Uji 09',
      'Buku Uji 10'
    ])
    expect(data.topBooks.map((b) => b.title)).not.toContain('Buku Uji 11')
    expect(data.topBooks.map((b) => b.title)).not.toContain('Buku Uji 12')
    expect(data.monthly).toEqual([{ label: 'Mei 2026', count: 16 }])
    expect(data.summary.totalBorrowings).toBe(16)
  })
})

describe('BorrowingChartService — batas bulan lokal', () => {
  it('(c) pinjaman 00:30 tanggal 1 masuk bulan LOKAL yang benar', async () => {
    const members = await seedMembers(1)
    const library = await seedBooks(['Buku Uji 01'])
    await seedBorrows(
      [{ member: members[0], bookIndex: 0, borrowDate: localDate(2026, 6, 1, 0, 30) }],
      library
    )

    const june = await service.buildBorrowingChartData(period(2026, 6, 1, 2026, 6, 30))
    expect(june.monthly).toEqual([{ label: 'Jun 2026', count: 1 }])
    expect(june.summary.totalBorrowings).toBe(1)

    // Tidak boleh "bocor" ke bulan sebelumnya.
    const may = await service.buildBorrowingChartData(period(2026, 5, 1, 2026, 5, 31))
    expect(may.monthly).toEqual([{ label: 'Mei 2026', count: 0 }])
    expect(may.summary.totalBorrowings).toBe(0)
  })
})

describe('BorrowingChartService — bulan tanpa data', () => {
  it('(d) bulan di tengah periode tanpa data tetap muncul dengan 0', async () => {
    const members = await seedMembers(1)
    const library = await seedBooks(['Buku Uji 01'])
    await seedBorrows(
      [
        { member: members[0], bookIndex: 0, borrowDate: localDate(2026, 1, 15) },
        { member: members[0], bookIndex: 0, borrowDate: localDate(2026, 3, 15) }
      ],
      library
    )

    const data = await service.buildBorrowingChartData(period(2026, 1, 1, 2026, 3, 31))

    expect(data.monthly.map((m) => m.label)).toEqual(['Jan 2026', 'Feb 2026', 'Mar 2026'])
    expect(data.monthly.map((m) => m.count)).toEqual([1, 0, 1])
    expect(data.summary.totalBorrowings).toBe(2)
  })
})

describe('BorrowingChartService — validasi & batas seri', () => {
  it('(e) from > to ditolak dengan pesan Indonesia', async () => {
    await expect(service.buildBorrowingChartData(period(2026, 6, 10, 2026, 6, 1))).rejects.toThrow(
      'Tanggal mulai tidak boleh setelah tanggal akhir.'
    )
  })

  it('(f) periode > 24 bulan → seri 24 bulan terakhir dan dinyatakan di periodLabel', async () => {
    // Jan 2024 .. Jun 2026 = 30 bulan.
    const data = await service.buildBorrowingChartData(period(2024, 1, 1, 2026, 6, 30))

    expect(data.monthly).toHaveLength(BORROWING_CHART_MAX_MONTHS)
    expect(data.monthly[0].label).toBe('Jul 2024')
    expect(data.monthly[data.monthly.length - 1].label).toBe('Jun 2026')
    expect(data.periodLabel).toBe('24 bulan terakhir (Jul 2024 - Jun 2026)')
  })
})
