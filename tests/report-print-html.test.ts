import { describe, it, expect } from 'vitest'
import { generateReportPrintHtml } from '../src/main/services/report-print-html.service'
import {
  paginateBorrowingRowsByHeight,
  REPORT_PRINT_ORIENTATION,
  paginateReportByType
} from '../src/shared/config/report-print'
import type { ReportPrintData, ReportPrintType } from '../src/shared/dto/report-print'

const COLUMNS: Record<ReportPrintType, { key: string; label: string; align: 'left' | 'center' | 'right' }[]> = {
  borrowings: [
    { key: 'borrowDate', label: 'Tanggal', align: 'center' },
    { key: 'borrowNumber', label: 'Nomor Transaksi', align: 'left' },
    { key: 'memberName', label: 'Nama Anggota', align: 'left' },
    { key: 'className', label: 'Kelas', align: 'left' },
    { key: 'bookTitle', label: 'Judul Buku', align: 'left' },
    { key: 'dueDate', label: 'Jatuh Tempo', align: 'center' },
    { key: 'status', label: 'Status', align: 'center' }
  ],
  returns: [
    { key: 'returnedAt', label: 'Tanggal Kembali', align: 'center' },
    { key: 'borrowNumber', label: 'Nomor Transaksi', align: 'left' },
    { key: 'memberName', label: 'Nama Anggota', align: 'left' },
    { key: 'className', label: 'Kelas', align: 'left' },
    { key: 'bookTitle', label: 'Judul Buku', align: 'left' },
    { key: 'durationDays', label: 'Lama Pinjam', align: 'center' },
    { key: 'status', label: 'Status', align: 'center' }
  ],
  overdues: [
    { key: 'borrowDate', label: 'Tanggal Pinjam', align: 'center' },
    { key: 'borrowNumber', label: 'Nomor Transaksi', align: 'left' },
    { key: 'memberName', label: 'Nama Anggota', align: 'left' },
    { key: 'className', label: 'Kelas', align: 'left' },
    { key: 'bookTitle', label: 'Judul Buku', align: 'left' },
    { key: 'dueDate', label: 'Jatuh Tempo', align: 'center' },
    { key: 'lateDays', label: 'Hari Terlambat', align: 'center' },
    { key: 'status', label: 'Status', align: 'center' }
  ],
  members: [
    { key: 'memberNumber', label: 'Nomor Anggota', align: 'left' },
    { key: 'fullName', label: 'Nama', align: 'left' },
    { key: 'className', label: 'Kelas', align: 'left' },
    { key: 'membershipStatus', label: 'Status Keanggotaan', align: 'center' },
    { key: 'joinedAt', label: 'Tanggal Bergabung', align: 'center' }
  ],
  collections: [
    { key: 'isbn', label: 'ISBN', align: 'left' },
    { key: 'title', label: 'Judul', align: 'left' },
    { key: 'authorName', label: 'Penulis', align: 'left' },
    { key: 'publisherName', label: 'Penerbit', align: 'left' },
    { key: 'categoryName', label: 'Kategori', align: 'left' },
    { key: 'publicationYear', label: 'Tahun', align: 'center' },
    { key: 'copyCount', label: 'Jumlah Eksemplar', align: 'center' },
    { key: 'availableCount', label: 'Tersedia', align: 'center' },
    { key: 'borrowedCount', label: 'Dipinjam', align: 'center' },
    { key: 'lostCount', label: 'Hilang', align: 'center' },
    { key: 'damagedCount', label: 'Rusak', align: 'center' }
  ]
}

function makeData(type: ReportPrintType, rowCount: number, overrides?: Partial<ReportPrintData>): ReportPrintData {
  const columns = COLUMNS[type]
  const rows = Array.from({ length: rowCount }, (_, i) =>
    columns.map((c, j) => (j === 0 ? `BARIS-${i + 1}` : `${c.label} ${i + 1}`))
  )
  return {
    type,
    title: `Laporan Uji ${type}`,
    orientation: REPORT_PRINT_ORIENTATION[type],
    institution: {
      libraryName: 'Perpustakaan Uji',
      schoolName: 'SD Uji',
      address: 'Jl. Uji No. 1',
      phone: '0800',
      email: 'uji@example.test',
      librarianName: 'Pustakawan Uji',
      principalName: 'Kepala Uji',
      librarianNip: '19800101 001',
      principalNip: '19750101 001'
    },
    filterSummary: [{ label: 'Periode', value: '01/08/2026 s.d. 31/08/2026' }],
    notes: [],
    columns,
    rows,
    totalRows: rowCount,
    totals: [{ label: 'Total', value: String(rowCount) }],
    generatedAt: new Date(2026, 10, 6, 9, 45).toISOString(),
    ...overrides
  }
}

function countSheets(html: string): number {
  return (html.match(/<section class="a4-sheet/g) ?? []).length
}

describe('generateReportPrintHtml — struktur', () => {
  it('jumlah .a4-sheet == jumlah halaman paginasi tiap tipe (120 baris)', () => {
    for (const type of Object.keys(COLUMNS) as ReportPrintType[]) {
      const data = makeData(type, 120)
      const html = generateReportPrintHtml(data)
      // Satu pintu: konfigurasi per tipe menentukan cara paginasi.
      const expected = paginateReportByType({
        type,
        rows: data.rows,
        totalRows: data.totalRows,
        orientation: data.orientation
      }).pageCount
      expect(countSheets(html), `${type}`).toBe(expected)
    }
  })

  it('setiap halaman data punya <thead>; "Halaman X dari Y" benar; total + tanda tangan hanya di halaman terakhir', () => {
    const data = makeData('borrowings', 120)
    const html = generateReportPrintHtml(data)
    const pag = paginateBorrowingRowsByHeight(data.rows)
    const pageCount = pag.pages.length + (pag.signaturePage === 'new' ? 1 : 0)
    expect((html.match(/<thead>/g) ?? []).length).toBe(pag.pages.length)
    expect(html).toContain(`Halaman 1 dari ${pageCount}`)
    expect(html).toContain(`Halaman ${pageCount} dari ${pageCount}`)
    expect((html.match(/class="totals-block"/g) ?? []).length).toBe(1)
    expect((html.match(/class="signatures-block"/g) ?? []).length).toBe(1)
    // Blok total & tanda tangan berada setelah halaman terakhir dimulai.
    const lastSheetStart = html.lastIndexOf('<section class="a4-sheet')
    expect(html.indexOf('class="totals-block"')).toBeGreaterThan(lastSheetStart)
    expect(html.indexOf('class="signatures-block"')).toBeGreaterThan(lastSheetStart)
  })

  it('@page size sesuai orientasi; tidak ada halaman kosong ekstra', () => {
    // Data uji dengan orientasi portrait eksplisit (tidak ada tipe produksi
    // portrait lagi selain jalur eksplisit ini).
    const portrait = generateReportPrintHtml({ ...makeData('collections', 1), orientation: 'portrait' })
    expect(portrait).toContain('size: A4 portrait')
    expect(portrait).toContain('width: 210mm')
    expect(portrait).toContain('height: 297mm')
    // Hanya halaman terakhir yang tanpa page-break-after.
    expect((portrait.match(/class="a4-sheet a4-sheet--last"/g) ?? []).length).toBe(1)

    const landscape = generateReportPrintHtml(makeData('collections', 1))
    expect(landscape).toContain('size: A4 landscape')
    expect(landscape).toContain('width: 297mm')
    expect(landscape).toContain('height: 210mm')
  })

  it('0 baris: satu halaman, baris "Tidak ada data", total + tanda tangan tetap ada', () => {
    const html = generateReportPrintHtml(makeData('borrowings', 0))
    expect(countSheets(html)).toBe(1)
    expect(html).toContain('Tidak ada data')
    expect(html).toContain('totals-block')
    expect(html).toContain('signatures-block')
    expect(html).toContain('Halaman 1 dari 1')
  })

  it('escape: <script> dan tanda kutip pada data tidak lolos mentah', () => {
    const data = makeData('borrowings', 1, {
      rows: [['01/08/2026', 'PJ-1', '<script>alert("x")</script>', 'X A', `Judul "berkutip" & <b>tebal</b>`, '08/08/2026', 'Dipinjam']]
    })
    const html = generateReportPrintHtml(data)
    expect(html).not.toContain('<script>alert')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&quot;berkutip&quot;')
    expect(html).toContain('&amp;')
    expect(html).not.toContain('<b>tebal</b>')
  })

  it('logo: tanpa data URI → monogram SVG di elemen logo; dengan data URI → CSS variable sekali', () => {
    const noLogo = generateReportPrintHtml(makeData('borrowings', 1))
    expect(noLogo).toContain('<svg')
    expect(noLogo).not.toContain('--report-logo-url:')

    const withLogo = generateReportPrintHtml(makeData('borrowings', 1), { logoDataUri: 'data:image/png;base64,AAA' })
    expect(withLogo).toContain('--report-logo-url: url("data:image/png;base64,AAA")')
    expect((withLogo.match(/data:image\/png;base64/g) ?? []).length).toBe(1)
  })

  it('nama penanda tangan kosong tidak menghasilkan "undefined"; NIP kosong dicetak sebagai "NIP. -"', () => {
    const data = makeData('members', 1, {
      institution: {
        ...makeData('members', 0).institution,
        librarianName: '',
        principalName: '',
        librarianNip: '',
        principalNip: ''
      }
    })
    const html = generateReportPrintHtml(data)
    expect(html).not.toContain('undefined')
    expect(html).toContain('NIP. -')
    // Garis tanda tangan tetap tersedia (elemen signature-name kosong).
    expect(html).toContain('signature-name')
  })

  it('blok tanda tangan: NIP kedua penanda tangan tercetak, nama digarisbawahi tanpa border-top', () => {
    const data = makeData('borrowings', 1, {
      institution: {
        ...makeData('borrowings', 0).institution,
        librarianName: 'Pustakawan Uji',
        librarianNip: '198001012005011001',
        principalName: 'Kepala Uji',
        principalNip: '197502022000031002'
      }
    })
    const html = generateReportPrintHtml(data)
    expect(html).toContain('NIP. 198001012005011001')
    expect(html).toContain('NIP. 197502022000031002')
    const ruleStart = html.indexOf('.signature-name {')
    const rule = html.slice(ruleStart, html.indexOf('}', ruleStart))
    expect(ruleStart).toBeGreaterThan(-1)
    expect(rule).not.toContain('border-top')
    expect(rule).toContain('text-decoration: underline')
  })

  it('header dokumen memuat judul, ringkasan filter, dan "Dicetak: dd/MM/yyyy HH:mm"', () => {
    const html = generateReportPrintHtml(makeData('returns', 2))
    expect(html).toContain('Laporan Uji returns')
    expect(html).toContain('Periode:')
    expect(html).toContain('01/08/2026 s.d. 31/08/2026')
    expect(html).toContain('Dicetak:')
    expect(html).toMatch(/Dicetak:<\/span> <span>0[0-9]\/[0-9]{2}\/2026 [0-9]{2}:[0-9]{2}/)
  })

  it('dokumen memuat tepat satu tag <body> (semua tipe & dokumen kosong)', () => {
    for (const type of Object.keys(COLUMNS) as ReportPrintType[]) {
      const html = generateReportPrintHtml(makeData(type, 120))
      expect((html.match(/<body\b/g) ?? []).length, `<body> ${type}`).toBe(1)
      expect((html.match(/<\/body>/g) ?? []).length, `</body> ${type}`).toBe(1)
    }
    const empty = generateReportPrintHtml(makeData('borrowings', 0))
    expect((empty.match(/<body\b/g) ?? []).length).toBe(1)
    expect((empty.match(/<\/body>/g) ?? []).length).toBe(1)
  })

  it('laporan Peminjaman tidak memotong teks: tanpa line-clamp/ellipsis/max-height, baris min-height', () => {
    const html = generateReportPrintHtml(makeData('borrowings', 3))
    expect(html).not.toContain('line-clamp')
    expect(html).not.toContain('ellipsis')
    expect(html).not.toContain('text-overflow')
    expect(html).toContain('overflow-wrap: anywhere')
    expect(html).toContain('word-break: break-word')
    expect(html).toContain('min-height:')
    expect(html).toContain('break-inside: avoid')
    expect(html).toContain('height: auto')
    // Pengembalian kini ikut varian tanpa pemotongan teks.
    const returnsHtml = generateReportPrintHtml(makeData('returns', 3))
    expect(returnsHtml).not.toContain('line-clamp')
    expect(returnsHtml).toContain('overflow-wrap: anywhere')
    // Seluruh tipe laporan kini memakai varian tanpa pemotongan teks (Koleksi
    // ikut landscape tanpa clamp + paginasi tinggi baris).
    const collectionsHtml = generateReportPrintHtml(makeData('collections', 3))
    expect(collectionsHtml).not.toContain('line-clamp')
    expect(collectionsHtml).not.toContain('text-overflow')
    expect(collectionsHtml).toContain('overflow-wrap: anywhere')
  })

  it('Peminjaman: jumlah halaman mengikuti paginasi berbasis tinggi baris', () => {
    // Isi halaman sampai penuh; blok total+tanda tangan boleh pindah ke halaman
    // baru (satu sheet tambahan).
    for (const n of [0, 1, 14, 24, 29, 64, 70]) {
      const data = makeData('borrowings', n)
      const pag = paginateBorrowingRowsByHeight(data.rows)
      expect(countSheets(generateReportPrintHtml(data)), `n=${n}`).toBe(pag.pages.length + (pag.signaturePage === 'new' ? 1 : 0))
    }
    // 24 baris pendek: paling banyak 2 halaman, halaman data pertama terisi penuh.
    const data24 = makeData('borrowings', 24)
    const html24 = generateReportPrintHtml(data24)
    expect(countSheets(html24)).toBeLessThanOrEqual(2)
    // Seluruh tipe kini kapasitas berbasis tinggi baris (satu pintu:
    // paginateReportByType), termasuk Koleksi.
    for (const n of [7, 25, 70]) {
      const data = makeData('collections', n)
      const html = generateReportPrintHtml(data)
      const pag = paginateReportByType({ type: 'collections', rows: data.rows, totalRows: data.totalRows, orientation: 'landscape' })
      expect(countSheets(html), `collections n=${n}`).toBe(pag.pageCount)
    }
  })
})
