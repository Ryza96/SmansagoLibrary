import { describe, it, expect } from 'vitest'
import {
  REPORT_PRINT_MAX_ROWS,
  REPORT_PRINT_ORIENTATION,
  REPORT_PRINT_PAGE,
  REPORT_PRINT_BORROWINGS_PAGE,
  REPORT_PRINT_BORROWINGS_METRICS,
  REPORT_PRINT_RETURNS_PAGE,
  REPORT_PRINT_RETURNS_METRICS,
  REPORT_PRINT_MEMBERS_PAGE,
  REPORT_PRINT_TYPES,
  BORROWINGS_COLUMN_WIDTH_PERCENT,
  RETURNS_COLUMN_WIDTH_PERCENT,
  estimateBorrowingRowHeightMm,
  paginateBorrowingRowsByHeight,
  reportPrintGeometry,
  paginateReportRows
} from '../src/shared/config/report-print'
import { escapeHtml } from '../src/shared/utils/escape-html'
import { formatReportDateId, formatRupiahId } from '../src/shared/utils/format-report'
import { buildReportPdfFilename } from '../src/main/services/report-print.service'

function assertContiguous(totalRows: number, orientation: 'portrait' | 'landscape') {
  const { pages, totalRows: total } = paginateReportRows(totalRows, orientation)
  expect(total).toBe(totalRows)
  // Tidak ada baris hilang/ganda: gabungan halaman = [0, totalRows).
  let cursor = 0
  for (const p of pages) {
    expect(p.startIndex).toBe(cursor)
    expect(p.endIndex - p.startIndex).toBe(p.rowCount)
    cursor = p.endIndex
  }
  expect(cursor).toBe(totalRows)
  // Halaman terakhir selalu menyisakan ruang untuk blok total + tanda tangan
  // (kecuali dokument kosong), dan tidak pernah kosong bila totalRows > 0.
  const last = pages[pages.length - 1]
  const reserve = REPORT_PRINT_PAGE[orientation].totalsReserveRows + REPORT_PRINT_PAGE[orientation].signatureReserveRows
  if (totalRows > 0) {
    expect(last.rowCount).toBeGreaterThan(0)
    expect(last.rowCount).toBeLessThanOrEqual(last.capacity - reserve)
  }
  return pages
}

describe('report-print config — konstanta', () => {
  it('REPORT_PRINT_MAX_ROWS = 5000', () => {
    expect(REPORT_PRINT_MAX_ROWS).toBe(5000)
  })

  it('orientasi per laporan sesuai keputusan pemilik', () => {
    expect(REPORT_PRINT_ORIENTATION).toEqual({
      borrowings: 'landscape',
      returns: 'landscape',
      overdues: 'landscape',
      members: 'landscape',
      collections: 'landscape'
    })
  })

  it('geometri A4 portrait & landscape', () => {
    expect(REPORT_PRINT_PAGE.portrait).toMatchObject({ widthMm: 210, heightMm: 297, marginMm: 12, rowHeightMm: 7.5 })
    expect(REPORT_PRINT_PAGE.landscape).toMatchObject({ widthMm: 297, heightMm: 210, marginMm: 12, rowHeightMm: 7.5 })
    expect(REPORT_PRINT_PAGE.portrait.firstPageRows).toBe(29)
    expect(REPORT_PRINT_PAGE.portrait.nextPageRows).toBe(32)
    expect(REPORT_PRINT_PAGE.landscape.firstPageRows).toBe(17)
    expect(REPORT_PRINT_PAGE.landscape.nextPageRows).toBe(21)
    // Landscape Peminjaman punya geometri sendiri (teks tidak dipotong → baris
    // lebih tinggi dari 7.5mm), sedangkan landscape laporan lain tidak berubah.
    expect(REPORT_PRINT_BORROWINGS_PAGE).toMatchObject({
      widthMm: 297,
      heightMm: 210,
      firstPageRows: 14,
      nextPageRows: 17,
      totalsReserveRows: 4,
      signatureReserveRows: 6
    })
    expect(REPORT_PRINT_BORROWINGS_PAGE.firstPageRows).toBeLessThan(REPORT_PRINT_PAGE.landscape.firstPageRows)
    expect(REPORT_PRINT_BORROWINGS_PAGE.nextPageRows).toBeLessThan(REPORT_PRINT_PAGE.landscape.nextPageRows)
    expect(reportPrintGeometry('borrowings', 'landscape')).toBe(REPORT_PRINT_BORROWINGS_PAGE)
    expect(reportPrintGeometry('overdues', 'landscape')).toBe(REPORT_PRINT_PAGE.landscape)
    expect(reportPrintGeometry('borrowings', 'portrait')).toBe(REPORT_PRINT_PAGE.portrait)
    expect(paginateReportRows(12, 'landscape', 'borrowings').pages[0].capacity).toBe(14)
    expect(paginateReportRows(12, 'landscape').pages[0].capacity).toBe(17)
  })

  it('lebar kolom Pengembalian: 7 kolom, total 100 persen', () => {
    expect(RETURNS_COLUMN_WIDTH_PERCENT).toHaveLength(7)
    expect(RETURNS_COLUMN_WIDTH_PERCENT.reduce((sum, w) => sum + w, 0)).toBe(100)
    for (const width of RETURNS_COLUMN_WIDTH_PERCENT) {
      expect(width).toBeGreaterThan(0)
    }
    // Status (indeks 6) = kolom terakhir yang dicetak nowrap.
    expect(RETURNS_COLUMN_WIDTH_PERCENT[6]).toBe(12)
  })

  it('geometri Pengembalian disiapkan tanpa mengubah jalur lain', () => {
    // Landscape Pengembalian punya konstanta sendiri, sementara menyalin
    // geometri + metrik Peminjaman (diukur ulang di sesi C bila perlu).
    expect(reportPrintGeometry('returns', 'landscape')).toBe(REPORT_PRINT_RETURNS_PAGE)
    expect(REPORT_PRINT_RETURNS_PAGE).toMatchObject({
      widthMm: 297,
      heightMm: 210,
      marginMm: 12,
      rowHeightMm: 7.5,
      firstPageRows: 14,
      nextPageRows: 17,
      totalsReserveRows: 4,
      signatureReserveRows: 6
    })
    expect(REPORT_PRINT_RETURNS_METRICS).toMatchObject(REPORT_PRINT_BORROWINGS_METRICS)
    // Orientasi aktif Pengembalian kini landscape; jalur portrait tetap sah
    // dipakai bila geometri diminta eksplisit (mis. cetak portrait manual) dan
    // tetap jatuh ke geometri portrait umum.
    expect(REPORT_PRINT_ORIENTATION.returns).toBe('landscape')
    expect(reportPrintGeometry('returns', 'portrait')).toBe(REPORT_PRINT_PAGE.portrait)
    expect(reportPrintGeometry('borrowings', 'landscape')).toBe(REPORT_PRINT_BORROWINGS_PAGE)
    expect(reportPrintGeometry('borrowings', 'portrait')).toBe(REPORT_PRINT_PAGE.portrait)
    expect(reportPrintGeometry('overdues', 'landscape')).toBe(REPORT_PRINT_PAGE.landscape)
    expect(reportPrintGeometry('members', 'landscape')).toBe(REPORT_PRINT_MEMBERS_PAGE)
    expect(reportPrintGeometry('members', 'portrait')).toBe(REPORT_PRINT_PAGE.portrait)
    expect(reportPrintGeometry('collections', 'landscape')).toBe(REPORT_PRINT_PAGE.landscape)
  })

  it('peta tipe laporan punya entri untuk kelima tipe dengan lebar kolom total 100', () => {
    const types = Object.keys(REPORT_PRINT_TYPES).sort()
    expect(types).toEqual(['borrowings', 'collections', 'members', 'overdues', 'returns'])
    for (const type of types as (keyof typeof REPORT_PRINT_TYPES)[]) {
      const total = REPORT_PRINT_TYPES[type].columnWidthPercent.reduce((sum, width) => sum + width, 0)
      expect(total, `${type}`).toBe(100)
    }
  })

  it('heightPaginated hanya true untuk borrowings, members, dan returns', () => {
    const types = Object.keys(REPORT_PRINT_TYPES) as (keyof typeof REPORT_PRINT_TYPES)[]
    const heightPaginated = types.filter((type) => REPORT_PRINT_TYPES[type].heightPaginated).sort()
    expect(heightPaginated).toEqual(['borrowings', 'members', 'returns'])
  })

  it('paginateBorrowingRowsByHeight identik dengan/tanpa metrics Borrowings eksplisit', () => {
    const rows = [
      ['31/08/2026', 'PK20260001', 'Nama Anggota Yang Cukup Panjang Untuk Membungkus Baris', 'XI Merdeka 1', 'Judul Buku Yang Juga Panjang Sekali', '5 hari', 'Tepat Waktu']
    ]
    const withoutMetrics = paginateBorrowingRowsByHeight(rows, RETURNS_COLUMN_WIDTH_PERCENT, REPORT_PRINT_RETURNS_METRICS.contentWidthMm, {
      nowrapColumnIndex: 6
    })
    const withMetrics = paginateBorrowingRowsByHeight(rows, RETURNS_COLUMN_WIDTH_PERCENT, REPORT_PRINT_RETURNS_METRICS.contentWidthMm, {
      nowrapColumnIndex: 6,
      metrics: REPORT_PRINT_BORROWINGS_METRICS
    })
    expect(withMetrics).toEqual(withoutMetrics)
  })
})

describe('paginateReportRows', () => {
  it('0 baris → tepat 1 halaman kosong', () => {
    const pages = assertContiguous(0, 'portrait')
    expect(pages).toHaveLength(1)
    expect(pages[0]).toMatchObject({ page: 1, startIndex: 0, endIndex: 0, rowCount: 0, capacity: 29 })
  })

  it('1 baris → 1 halaman', () => {
    const pages = assertContiguous(1, 'landscape')
    expect(pages).toHaveLength(1)
    expect(pages[0].rowCount).toBe(1)
  })

  it('tepat kapasitas halaman pertama (29 portrait) → redistribusi reserve, tanpa baris hilang', () => {
    // 29 baris = firstPageRows: halaman penuh tidak menyisakan ruang untuk
    // total + tanda tangan → 10 baris dipindah ke halaman baru (29-10=19).
    const pages = assertContiguous(29, 'portrait')
    expect(pages).toHaveLength(2)
    expect(pages[0].rowCount).toBe(19)
    expect(pages[1].rowCount).toBe(10)
  })

  it('kapasitas + 1 (30 portrait) → halaman 2 berisi 1 baris', () => {
    const pages = assertContiguous(30, 'portrait')
    expect(pages.map((p) => p.rowCount)).toEqual([29, 1])
  })

  it('tepat kapasitas landscape (17) → redistribusi reserve', () => {
    const pages = assertContiguous(17, 'landscape')
    expect(pages.map((p) => p.rowCount)).toEqual([7, 10])
  })

  it('ribuan baris (5000) kedua orientasi → kontinu, halaman terakhir ber-reserve', () => {
    for (const orientation of ['portrait', 'landscape'] as const) {
      const pages = assertContiguous(5000, orientation)
      expect(pages.length).toBeGreaterThan(100)
      expect(pages[0].capacity).toBe(REPORT_PRINT_PAGE[orientation].firstPageRows)
      expect(pages[1].capacity).toBe(REPORT_PRINT_PAGE[orientation].nextPageRows)
    }
  })

  it('totalRows tidak valid → 1 halaman kosong (tidak throw)', () => {
    expect(paginateReportRows(-1, 'portrait').pages[0].rowCount).toBe(0)
    expect(paginateReportRows(1.5, 'portrait').pages[0].rowCount).toBe(0)
  })
})

const BORROWING_METRICS = REPORT_PRINT_BORROWINGS_METRICS

function borrowingRow(i: number, title?: string): string[] {
  return [
    `0${(i % 9) + 1}/11/2026`,
    `PJ2026110${String(i + 1).padStart(3, '0')}`,
    `Anggota ${i + 1}`,
    'XI MERDEKA 1',
    title ?? `Buku Uji ${i + 1}`,
    '30/11/2026',
    i % 2 ? 'DIKEMBALIKAN' : 'AKTIF'
  ]
}

function borrowingPageLimitMm(isFirst: boolean): number {
  const m = BORROWING_METRICS
  return (m.contentHeightMm - (isFirst ? m.firstPageHeaderMm : m.continuationHeaderMm) - m.tableHeadMm - m.footerMm) * (1 - m.safeMarginRatio)
}

describe('paginateBorrowingRowsByHeight', () => {
  it('24 baris satu-baris-teks → paling banyak 2 halaman, tidak ada halaman berisi 1 baris', () => {
    const rows = Array.from({ length: 24 }, (_, i) => borrowingRow(i))
    const pag = paginateBorrowingRowsByHeight(rows)
    expect(pag.totalRows).toBe(24)
    expect(pag.pages.length + (pag.signaturePage === 'new' ? 1 : 0)).toBeLessThanOrEqual(2)
    for (const p of pag.pages) expect(p.rowCount).not.toBe(1)
    // Jauh lebih penuh daripada kapasitas tetap lama (14).
    expect(pag.pages[0].rowCount).toBeGreaterThan(14)
  })

  it('baris dengan teks 200 karakter dihitung lebih tinggi daripada baris pendek', () => {
    const short = estimateBorrowingRowHeightMm(borrowingRow(0))
    const long = estimateBorrowingRowHeightMm(borrowingRow(1, 'Judul '.repeat(34).slice(0, 200)))
    expect(long).toBeGreaterThan(short)
    expect(long).toBeGreaterThan(short * 3)
  })

  it('pengisian greedy: tidak ada halaman non-terakhir yang masih muat baris berikutnya', () => {
    const rows = Array.from({ length: 120 }, (_, i) =>
      borrowingRow(i, i % 5 === 0 ? 'Judul panjang yang membungkus beberapa baris '.repeat(2) : `Buku Uji ${i + 1}`)
    )
    const pag = paginateBorrowingRowsByHeight(rows)
    const heights = rows.map((r) => estimateBorrowingRowHeightMm(r))
    pag.pages.forEach((p, idx) => {
      if (idx === pag.pages.length - 1 || p.endIndex >= rows.length) return
      const used = heights.slice(p.startIndex, p.endIndex).reduce((a, b) => a + b, 0)
      expect(used + heights[p.endIndex]).toBeGreaterThan(borrowingPageLimitMm(idx === 0))
    })
  })

  it('blok total+tanda tangan pindah UTUH ke halaman baru bila tidak muat (tanpa memindah baris)', () => {
    // 64 baris = 29 (halaman 1) + 35 (halaman 2 penuh) → blok tidak muat.
    const full = Array.from({ length: 64 }, (_, i) => borrowingRow(i))
    const pagFull = paginateBorrowingRowsByHeight(full)
    expect(pagFull.pages.map((p) => p.rowCount)).toEqual([29, 35])
    expect(pagFull.signaturePage).toBe('new')
    expect(pagFull.pages[pagFull.pages.length - 1].endIndex).toBe(64)
    expect(full[64 - 1][4]).toBe('Buku Uji 64')

    // 70 baris → halaman terakhir sisa 6 baris, blok tetap di halaman itu.
    const roomy = Array.from({ length: 70 }, (_, i) => borrowingRow(i))
    const pagRoomy = paginateBorrowingRowsByHeight(roomy)
    expect(pagRoomy.signaturePage).toBe('last')
    expect(pagRoomy.pages[pagRoomy.pages.length - 1].rowCount).toBe(6)
  })

  it('0 baris → 1 halaman kosong, blok total tetap di halaman itu', () => {
    const pag = paginateBorrowingRowsByHeight([])
    expect(pag.pages).toHaveLength(1)
    expect(pag.pages[0]).toMatchObject({ page: 1, startIndex: 0, endIndex: 0, rowCount: 0 })
    expect(pag.signaturePage).toBe('last')
  })

  it('gabungan halaman = seluruh baris, urutan terjaga, tidak ada baris terbelah', () => {
    const rows = Array.from({ length: 37 }, (_, i) => borrowingRow(i))
    const pag = paginateBorrowingRowsByHeight(rows, BORROWINGS_COLUMN_WIDTH_PERCENT)
    let cursor = 0
    for (const p of pag.pages) {
      expect(p.startIndex).toBe(cursor)
      expect(p.endIndex - p.startIndex).toBe(p.rowCount)
      cursor = p.endIndex
    }
    expect(cursor).toBe(37)
  })
})

describe('escapeHtml', () => {
  it('meng-escape &, <, >, ", \'', () => {
    expect(escapeHtml(`<a href="x">&'b'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;b&#39;&lt;/a&gt;')
  })

  it('string kosong & teks biasa tidak berubah', () => {
    expect(escapeHtml('')).toBe('')
    expect(escapeHtml('Laporan Peminjaman')).toBe('Laporan Peminjaman')
  })
})

describe('formatReportDateId', () => {
  it('null / undefined / kosong / tidak valid → "-"', () => {
    expect(formatReportDateId(null)).toBe('-')
    expect(formatReportDateId(undefined)).toBe('-')
    expect(formatReportDateId('')).toBe('-')
    expect(formatReportDateId('bukan-tanggal')).toBe('-')
  })

  it('ISO date-only yyyy-MM-dd → dd/MM/yyyy tanpa geser hari', () => {
    expect(formatReportDateId('2026-08-01')).toBe('01/08/2026')
    expect(formatReportDateId('2026-11-06')).toBe('06/11/2026')
  })

  it('ISO datetime & Date → dd/MM/yyyy (zona lokal)', () => {
    const d = new Date(2026, 0, 5, 15, 30) // 5 Jan 2026 lokal
    expect(formatReportDateId(d)).toBe('05/01/2026')
    expect(formatReportDateId(d.toISOString())).toBe('05/01/2026')
  })
})

describe('formatRupiahId', () => {
  it('delegasi ke formatRupiah (pemisah ribuan titik)', () => {
    expect(formatRupiahId(1500000)).toBe('Rp 1.500.000')
    expect(formatRupiahId(0)).toBe('Rp 0')
  })

  it('null / NaN → Rp 0', () => {
    expect(formatRupiahId(null)).toBe('Rp 0')
    expect(formatRupiahId(Number.NaN)).toBe('Rp 0')
  })
})

describe('buildReportPdfFilename', () => {
  const now = new Date(2026, 10, 6) // 6 Nov 2026 lokal

  it('berperiode: "Laporan Peminjaman - 2026-08-01 s.d. 2026-08-31.pdf"', () => {
    expect(buildReportPdfFilename('borrowings', { from: '2026-08-01', to: '2026-08-31' }, now)).toBe(
      'Laporan Peminjaman - 2026-08-01 s.d. 2026-08-31.pdf'
    )
  })

  it('tanpa periode: tanggal cetak — "Laporan Anggota - 2026-11-06.pdf"', () => {
    expect(buildReportPdfFilename('members', {}, now)).toBe('Laporan Anggota - 2026-11-06.pdf')
    expect(buildReportPdfFilename('collections', { from: '', to: '' }, now)).toBe(
      'Laporan Koleksi Buku - 2026-11-06.pdf'
    )
  })

  it('Windows-safe: tanpa karakter ilegal, diakhiri .pdf', () => {
    const name = buildReportPdfFilename('overdues', { from: '2026-08-01', to: '2026-08-31' }, now)
    expect(name).not.toMatch(/[<>:"/\\|?*\u0000-\u001f]/)
    expect(name.endsWith('.pdf')).toBe(true)
  })

  it('judul panjang dipotong (nama file tetap wajar)', () => {
    // Judul laporan berasal dari konstanta (pendek), tetapi segmen judul
    // dipotong 60 karakter untuk menjaga nama file tetap pendek.
    const name = buildReportPdfFilename('collections', {}, now)
    expect(name.length).toBeLessThanOrEqual(60 + ' - 2026-11-06.pdf'.length)
  })
})
