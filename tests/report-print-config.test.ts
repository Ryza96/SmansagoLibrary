import { describe, it, expect } from 'vitest'
import {
  REPORT_PRINT_MAX_ROWS,
  REPORT_PRINT_ORIENTATION,
  REPORT_PRINT_PAGE,
  REPORT_PRINT_BORROWINGS_PAGE,
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
      returns: 'portrait',
      overdues: 'landscape',
      members: 'portrait',
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
      firstPageRows: 11,
      nextPageRows: 14,
      totalsReserveRows: 4,
      signatureReserveRows: 6
    })
    expect(REPORT_PRINT_BORROWINGS_PAGE.firstPageRows).toBeLessThan(REPORT_PRINT_PAGE.landscape.firstPageRows)
    expect(REPORT_PRINT_BORROWINGS_PAGE.nextPageRows).toBeLessThan(REPORT_PRINT_PAGE.landscape.nextPageRows)
    expect(reportPrintGeometry('borrowings', 'landscape')).toBe(REPORT_PRINT_BORROWINGS_PAGE)
    expect(reportPrintGeometry('overdues', 'landscape')).toBe(REPORT_PRINT_PAGE.landscape)
    expect(reportPrintGeometry('borrowings', 'portrait')).toBe(REPORT_PRINT_PAGE.portrait)
    expect(paginateReportRows(12, 'landscape', 'borrowings').pages[0].capacity).toBe(11)
    expect(paginateReportRows(12, 'landscape').pages[0].capacity).toBe(17)
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
