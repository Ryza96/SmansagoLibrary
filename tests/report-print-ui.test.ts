import { describe, it, expect } from 'vitest'
import {
  buildBorrowingsPrintRequest,
  buildReturnsPrintRequest,
  buildOverduesPrintRequest,
  buildMembersPrintRequest,
  buildCollectionsPrintRequest,
  readReportPrintState,
  extractNavFilter,
  splitReportPrintHtml,
  toFilterDate,
  toDateInputValue
} from '../src/utils/report-print'
import { generateReportPrintHtml } from '../src/main/services/report-print-html.service'
import { paginateReportRows } from '../src/shared/config/report-print'
import type { ReportPrintData } from '../src/shared/dto/report-print'

describe('pembuat request cetak (page/limit tidak dikirim)', () => {
  it('Borrowings: filter sama dengan layar (from/to ISO lokal, status/search opsional)', () => {
    const request = buildBorrowingsPrintRequest('2026-08-01', '2026-08-31', 'ACTIVE', 'andi')
    expect(request.type).toBe('borrowings')
    const filter = request.filter as Record<string, unknown>
    expect(filter.from).toBe(new Date('2026-08-01T00:00:00').toISOString())
    expect(filter.to).toBe(new Date('2026-08-31T00:00:00').toISOString())
    expect(filter.status).toBe('ACTIVE')
    expect(filter.search).toBe('andi')
    expect(filter).not.toHaveProperty('page')
    expect(filter).not.toHaveProperty('limit')
  })

  it('nilai kosong → undefined (periode kosong tetap dikirim "" persis layar)', () => {
    const period = buildReturnsPrintRequest('', '', '')
    const pf = period.filter as Record<string, unknown>
    expect(pf.from).toBe('')
    expect(pf.to).toBe('')
    expect(pf.search).toBeUndefined()

    const members = buildMembersPrintRequest('', '', '')
    const mf = members.filter as Record<string, unknown>
    expect(mf.status).toBeUndefined()
    expect(mf.classId).toBeUndefined()

    const collections = buildCollectionsPrintRequest('', '')
    expect((collections.filter as Record<string, unknown>).categoryId).toBeUndefined()
  })

  it('seluruh builder menghasilkan type yang benar', () => {
    expect(buildBorrowingsPrintRequest('', '', '', '').type).toBe('borrowings')
    expect(buildReturnsPrintRequest('', '', '').type).toBe('returns')
    expect(buildOverduesPrintRequest('', '', '').type).toBe('overdues')
    expect(buildMembersPrintRequest('', '', '').type).toBe('members')
    expect(buildCollectionsPrintRequest('', '').type).toBe('collections')
  })
})

describe('konversi tanggal', () => {
  it('toFilterDate: kosong → "", tanggal → ISO tengah malam lokal', () => {
    expect(toFilterDate('')).toBe('')
    expect(toFilterDate('2026-08-01')).toBe(new Date('2026-08-01T00:00:00').toISOString())
  })

  it('toDateInputValue: ISO → yyyy-MM-dd lokal; kosong/invalid → ""', () => {
    expect(toDateInputValue(new Date(2026, 7, 1, 12).toISOString())).toBe('2026-08-01')
    expect(toDateInputValue('')).toBe('')
    expect(toDateInputValue(undefined)).toBe('')
    expect(toDateInputValue('bukan-tanggal')).toBe('')
  })

  it('roundtrip toFilterDate → toDateInputValue', () => {
    const iso = toFilterDate('2026-11-06')
    expect(toDateInputValue(iso)).toBe('2026-11-06')
  })
})

describe('readReportPrintState', () => {
  const valid = {
    request: { type: 'borrowings', filter: { from: '2026-08-01', to: '' } },
    fromPath: '/reports/borrowings'
  }

  it('state valid → request + fromPath', () => {
    const nav = readReportPrintState(valid)
    expect(nav?.request.type).toBe('borrowings')
    expect(nav?.fromPath).toBe('/reports/borrowings')
    expect(extractNavFilter(valid)?.from).toBe('2026-08-01')
  })

  it('state hilang/rusak → null (bukan throw)', () => {
    expect(readReportPrintState(null)).toBeNull()
    expect(readReportPrintState(undefined)).toBeNull()
    expect(readReportPrintState({})).toBeNull()
    expect(readReportPrintState({ request: { type: 'bogus', filter: {} } })).toBeNull()
    expect(readReportPrintState({ request: { type: 'members', filter: null } })).toBeNull()
  })

  it('fromPath kosong → default /reports', () => {
    const nav = readReportPrintState({ request: { type: 'members', filter: {} }, fromPath: '' })
    expect(nav?.fromPath).toBe('/reports')
  })
})

function makeData(rowCount: number): ReportPrintData {
  const columns = [
    { key: 'c1', label: 'Kolom 1', align: 'left' as const },
    { key: 'c2', label: 'Kolom 2', align: 'center' as const }
  ]
  return {
    // Peminjaman memakai paginasi berbasis tinggi baris; helper split diuji
    // dengan tipe berkapasitas tetap agar harapan jumlah sheet tetap jelas.
    type: 'returns',
    title: 'Laporan Uji',
    orientation: 'portrait',
    institution: {
      libraryName: 'Perpustakaan Uji',
      schoolName: 'SD Uji',
      address: 'Jl. Uji',
      phone: '',
      email: '',
      librarianName: 'Pustakawan',
      principalName: 'Kepala',
      librarianNip: '',
      principalNip: ''
    },
    filterSummary: [],
    notes: [],
    columns,
    rows: Array.from({ length: rowCount }, (_, i) => [`BARIS-${i + 1}`, `Nilai ${i + 1}`]),
    totalRows: rowCount,
    totals: [{ label: 'Total', value: String(rowCount) }],
    generatedAt: new Date(2026, 10, 6, 9, 45).toISOString()
  }
}

describe('splitReportPrintHtml', () => {
  it('120 baris: jumlah sheet == jumlah halaman paginate; style & footer utuh', () => {
    const html = generateReportPrintHtml(makeData(120))
    const parts = splitReportPrintHtml(html)
    const expected = paginateReportRows(120, 'portrait').pages.length
    expect(parts.sheets).toHaveLength(expected)
    expect(parts.styleText).toContain('.a4-sheet')
    expect(parts.sheets[0]).toContain('BARIS-1')
    expect(parts.sheets[0]).toContain('Halaman 1 dari')
    expect(parts.sheets[expected - 1]).toContain(`Halaman ${expected} dari ${expected}`)
    expect(parts.sheets[expected - 1]).toContain('signatures-block')
    expect(parts.sheets[0]).not.toContain('signatures-block')
  })

  it('dokumen besar 5.000 baris: semua sheet terpotong, baris terakhir ada, tanpa duplikat/hilang', () => {
    const html = generateReportPrintHtml(makeData(5000))
    const parts = splitReportPrintHtml(html)
    const expected = paginateReportRows(5000, 'portrait').pages.length
    expect(parts.sheets).toHaveLength(expected)
    const joined = parts.sheets.join('')
    expect(joined).toContain('BARIS-5000')
    expect(joined).toContain('BARIS-2500')
    // Setiap baris tepat satu kemunculan (disertai penutup span agar prefix
    // seperti BARIS-1 tidak ikut terhitung dari BARIS-10/BARIS-100/...).
    expect(joined.split('BARIS-5000</span>')).toHaveLength(2)
    expect(joined.split('BARIS-1</span>')).toHaveLength(2)
  })

  it('0 baris → 1 sheet berisi "Tidak ada data"', () => {
    const parts = splitReportPrintHtml(generateReportPrintHtml(makeData(0)))
    expect(parts.sheets).toHaveLength(1)
    expect(parts.sheets[0]).toContain('Tidak ada data')
  })

  it('HTML tanpa sheet → sheets kosong (tidak throw)', () => {
    expect(splitReportPrintHtml('<!DOCTYPE html><html><head><style>.a{}</style></head><body></body></html>').sheets).toEqual([])
  })
})
