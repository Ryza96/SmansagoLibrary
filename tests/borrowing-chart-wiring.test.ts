// SESI 3 — Grafik Peminjaman: validasi permintaan (dipakai handler IPC), nama
// file PDF, dan periode awal. Semua fungsi diuji adalah fungsi MURNI dari
// src/shared/dto/borrowing-chart.ts (tanpa Electron, tanpa DB).
import { describe, expect, it } from 'vitest'
import {
  BORROWING_CHART_DEFAULT_MONTHS,
  BORROWING_CHART_TYPE,
  buildBorrowingChartPdfFilename,
  defaultBorrowingChartPeriod,
  toLocalIsoDate,
  validateBorrowingChartRequest
} from '../src/shared/dto/borrowing-chart'

describe('validateBorrowingChartRequest — permintaan sah', () => {
  it('menerima type borrowing-chart dengan periode terisi', () => {
    const result = validateBorrowingChartRequest({
      type: 'borrowing-chart',
      filter: { from: '2026-01-01', to: '2026-06-30' }
    })
    expect(result.ok).toBe(true)
    if (result.ok !== true) throw new Error('harus valid')
    expect(result.request.type).toBe(BORROWING_CHART_TYPE)
    expect(result.request.filter).toEqual({ from: '2026-01-01', to: '2026-06-30' })
  })

  it('menerima periode kosong (boleh kosong)', () => {
    const result = validateBorrowingChartRequest({ type: 'borrowing-chart', filter: { from: '', to: '' } })
    expect(result.ok).toBe(true)
    if (result.ok !== true) throw new Error('harus valid')
    expect(result.request.filter).toEqual({ from: '', to: '' })
  })

  it('menormalkan from/to yang tidak dikirim menjadi string kosong', () => {
    const result = validateBorrowingChartRequest({ type: 'borrowing-chart', filter: {} })
    expect(result.ok).toBe(true)
    if (result.ok !== true) throw new Error('harus valid')
    expect(result.request.filter).toEqual({ from: '', to: '' })
  })
})

describe('validateBorrowingChartRequest — permintaan ditolak', () => {
  it('menolak type laporan tabel (borrowings) — tipe grafik terpisah', () => {
    const result = validateBorrowingChartRequest({ type: 'borrowings', filter: { from: '', to: '' } })
    expect(result.ok).toBe(false)
    if (result.ok !== false) throw new Error('harus ditolak')
    expect(result.message).toBe('Jenis laporan grafik tidak dikenal.')
  })

  it('menolak permintaan tanpa type', () => {
    expect(validateBorrowingChartRequest({ filter: { from: '', to: '' } }).ok).toBe(false)
  })

  it('menolak null, array, string, dan number', () => {
    expect(validateBorrowingChartRequest(null).ok).toBe(false)
    expect(validateBorrowingChartRequest([]).ok).toBe(false)
    expect(validateBorrowingChartRequest('borrowing-chart').ok).toBe(false)
    expect(validateBorrowingChartRequest(7).ok).toBe(false)
  })

  it('menolak filter tidak ada atau bukan objek', () => {
    expect(validateBorrowingChartRequest({ type: 'borrowing-chart' }).ok).toBe(false)
    expect(validateBorrowingChartRequest({ type: 'borrowing-chart', filter: [] }).ok).toBe(false)
    expect(validateBorrowingChartRequest({ type: 'borrowing-chart', filter: 'x' }).ok).toBe(false)
  })

  it('menolak from/to yang bukan string', () => {
    expect(validateBorrowingChartRequest({ type: 'borrowing-chart', filter: { from: 1, to: '' } }).ok).toBe(false)
    expect(
      validateBorrowingChartRequest({ type: 'borrowing-chart', filter: { from: '', to: null } }).ok
    ).toBe(false)
  })
})

describe('buildBorrowingChartPdfFilename', () => {
  it('memakai tanggal lokal dengan format YYYYMMDD', () => {
    expect(buildBorrowingChartPdfFilename(new Date(2026, 2, 5))).toBe('grafik-peminjaman-20260305.pdf')
    expect(buildBorrowingChartPdfFilename(new Date(2026, 0, 9))).toBe('grafik-peminjaman-20260109.pdf')
    expect(buildBorrowingChartPdfFilename(new Date(2026, 11, 31))).toBe('grafik-peminjaman-20261231.pdf')
  })
})

describe('periode awal grafik', () => {
  it('memakai 6 bulan terakhir (tanggal 1 bulan ke-5 s/d hari ini)', () => {
    expect(BORROWING_CHART_DEFAULT_MONTHS).toBe(6)
    expect(defaultBorrowingChartPeriod(new Date(2026, 10, 15))).toEqual({
      from: '2026-06-01',
      to: '2026-11-15'
    })
  })

  it('melintasi batas tahun dengan benar', () => {
    expect(defaultBorrowingChartPeriod(new Date(2026, 0, 10))).toEqual({
      from: '2025-08-01',
      to: '2026-01-10'
    })
  })

  it('toLocalIsoDate memberi nol di depan', () => {
    expect(toLocalIsoDate(new Date(2026, 0, 1))).toBe('2026-01-01')
    expect(toLocalIsoDate(new Date(2026, 8, 30))).toBe('2026-09-30')
  })
})
