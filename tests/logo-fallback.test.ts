import { describe, expect, it } from 'vitest'
import type { BorrowingChartData } from '../src/shared/dto/borrowing-chart'
import type { BorrowCardData } from '../src/shared/dto/borrow-card'
import type { CollectiveCardData } from '../src/shared/dto/collective-card'
import { generateBorrowingChartHtml } from '../src/main/services/borrowing-chart-html.service'
import { generateBorrowCardHtml } from '../src/main/services/borrow-card.service'
import { generateCollectiveCardHtml } from '../src/main/services/collective-borrow-card.service'

const LOGO_DATA_URI = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB'
const MONOGRAM_COLOR = '#1d4ed8'

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

function chartData(): BorrowingChartData {
  return {
    title: 'Grafik Peminjaman',
    orientation: 'landscape',
    institution: {
      libraryName: 'Perpustakaan Sekolah',
      schoolName: 'SMA Negeri 1 Contoh',
      address: 'Jl. Pendidikan No. 1',
      phone: '022-1234567',
      email: 'perpus@sman1.example',
      librarianName: 'Siti Rahayu',
      principalName: 'Budi Santoso',
      librarianNip: '198701232010012001',
      principalNip: ''
    },
    periodLabel: 'Jan 2026 - Jun 2026',
    generatedAt: new Date(2026, 10, 15, 9, 30).toISOString(),
    summary: { totalBorrowings: 10, totalBooks: 20, activeBorrowers: 3 },
    monthly: [{ label: 'Jan 2026', count: 5 }],
    topBooks: [{ title: 'Buku A', count: 4 }],
    topCategories: [{ category: 'Fiksi', count: 4 }],
    byClass: [{ className: 'X Merdeka 1', count: 3 }]
  }
}

function borrowCardData(logo: string): BorrowCardData {
  return {
    header: { logo, schoolName: 'SMA Negeri 1 Contoh', libraryName: 'Perpustakaan Sekolah' },
    member: {
      memberNumber: 'S-000001',
      fullName: 'Andi Pratama',
      memberType: 'Siswa',
      className: 'X Merdeka 1',
      avatarPlaceholder: ''
    },
    borrow: { borrowId: 'b1', borrowNumber: 'PJ2026010001', borrowDate: '01-01-2026', dueDate: '08-01-2026' },
    books: [{ inventoryNumber: 'INV-000001', title: 'Buku A' }],
    footer: { totalBooks: 1, borrowStatus: 'AKTIF', qrSvg: '', officerName: 'Petugas' }
  }
}

function collectiveData(logo: string): CollectiveCardData {
  return {
    school: {
      libraryName: 'Perpustakaan Sekolah',
      schoolName: 'SMA Negeri 1 Contoh',
      address: 'Jl. Pendidikan No. 1',
      logo
    },
    teacher: { fullName: 'Guru Kartu', memberNumber: 'G-000001', identityNumber: 'G-000001' },
    borrow: {
      borrowId: 'b1',
      borrowNumber: 'PJ2026010001',
      borrowDate: '01-01-2026',
      dueDate: '08-01-2026',
      purpose: '',
      collectiveClassName: 'XI Merdeka 2',
      notes: null
    },
    copies: [
      { sequence: 1, inventoryNumber: 'INV-000001', barcode: 'INV-000001', bookTitle: 'Buku A', returnedDate: '', status: 'BORROWED' }
    ],
    summary: { totalCopies: 1, returnedCount: 0, outstandingCount: 1 },
    qrSvg: '',
    printedAt: '15-11-2026 09:30'
  }
}

function docLogoBlock(html: string): string {
  const match = html.match(/<div class="doc-logo"[\s\S]*?<\/div>/)
  return match ? match[0] : ''
}

function logoIconBlock(html: string): string {
  const match = html.match(/<div class="logo-icon">([\s\S]*?)<\/div>/)
  return match ? match[1] : ''
}

describe('logo fallback — Grafik Peminjaman (chart)', () => {
  it('tanpa logo: memuat monogram, tanpa deklarasi --report-logo-url', () => {
    const html = generateBorrowingChartHtml(chartData())

    expect(html).toContain(MONOGRAM_COLOR)
    expect(html).toContain('>SN<')
    expect(html).not.toContain('--report-logo-url:')
    expect(docLogoBlock(html)).toContain('<svg')
  })

  it('dengan logo: --report-logo-url SEKALI, data URI SEKALI, tanpa monogram di .doc-logo', () => {
    const html = generateBorrowingChartHtml(chartData(), { logoDataUri: LOGO_DATA_URI })

    expect(countOccurrences(html, '--report-logo-url:')).toBe(1)
    expect(countOccurrences(html, LOGO_DATA_URI)).toBe(1)
    const logoBlock = docLogoBlock(html)
    expect(logoBlock).not.toContain('<svg')
    expect(logoBlock).not.toContain(MONOGRAM_COLOR)
  })
})

describe('logo fallback — Kartu Peminjaman', () => {
  it('tanpa logo: memuat monogram (biru + inisial), tanpa path ikon buku di .logo-icon', () => {
    const html = generateBorrowCardHtml(borrowCardData(''))
    const logoBlock = logoIconBlock(html)

    expect(logoBlock).toContain(MONOGRAM_COLOR)
    expect(logoBlock).toContain('>SN<')
    expect(logoBlock).not.toContain('M2 6c3-1.5')
  })

  it('dengan logo: memuat <img class="logo-img">', () => {
    const html = generateBorrowCardHtml(borrowCardData(LOGO_DATA_URI))

    expect(html).toContain('<img class="logo-img"')
    expect(html).not.toContain(MONOGRAM_COLOR)
  })
})

describe('logo fallback — Kartu Peminjaman Kolektif', () => {
  it('tanpa logo: memuat monogram, tanpa class logo-empty', () => {
    const html = generateCollectiveCardHtml(collectiveData(''), { termsText: 'Syarat' })

    expect(html).toContain(MONOGRAM_COLOR)
    expect(html).toContain('>SN<')
    expect(html).not.toContain('logo-empty')
  })

  it('dengan logo: memuat <img class="logo">', () => {
    const html = generateCollectiveCardHtml(collectiveData(LOGO_DATA_URI), { termsText: 'Syarat' })

    expect(html).toContain('<img class="logo"')
    expect(html).not.toContain(MONOGRAM_COLOR)
  })
})
