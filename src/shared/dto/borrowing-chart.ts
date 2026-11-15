// Report Module — DTO kontrak "Grafik Peminjaman" (SESSION 1: data layer saja).
// Tipe laporan BARU (`borrowing-chart`) yang BERDIRI SENDIRI: tidak menggantikan
// dan tidak mengubah kontrak cetak 5 laporan tabel (ReportPrintType /
// REPORT_PRINT_TYPES / REPORT_PRINT_TITLES / COLUMNS / VALID_TYPES).
//
// Seluruh angka pada DTO dihitung Service + Repository main (bukan renderer).
// `institution` memakai bentuk yang SAMA dengan laporan tabel (ReportPrintInstitution)
// agar kop dokumen grafik nanti identik dengan kop laporan tabel.
import type { ReportPrintInstitution } from './report-print'

/** Identifier tipe laporan grafik (dipakai request + dispatcher cetak nanti). */
export const BORROWING_CHART_TYPE = 'borrowing-chart'

// Filter periode. String kosong diperlakukan sama dengan laporan Peminjaman
// (parseRange): jatuh ke hari ini. Format tanggal = ISO / YYYY-MM-DD.
export interface BorrowingChartFilter {
  from: string
  to: string
}

export interface BorrowingChartRequest {
  type: typeof BORROWING_CHART_TYPE
  filter: BorrowingChartFilter
}

// Ringkasan angka periode. Dihitung dari agregasi repository (count / distinct),
// BUKAN hasil menjumlah ulang array monthly/topBooks/byClass.
export interface BorrowingChartSummary {
  /** Jumlah transaksi peminjaman (Borrow.borrowDate) dalam periode. */
  totalBorrowings: number
  /** Jumlah buku dipinjam (baris BorrowDetail) dalam periode. */
  totalBooks: number
  /** Jumlah anggota unik (COUNT(DISTINCT memberId)) dalam periode. */
  activeBorrowers: number
}

// Satu titik seri bulanan. `label` sudah siap tampil (mis. "Jan 2026").
// Bulan tanpa data TETAP muncul dengan count 0 (seri berurutan tanpa lubang).
export interface BorrowingChartMonthPoint {
  label: string
  count: number
}

// Buku terpopuler (maks 10). Urutan: count desc, lalu title asc (tie-break).
export interface BorrowingChartTopBook {
  title: string
  count: number
}

// Distribusi per kelas (snapshot nama kelas pada transaksi). Transaksi tanpa
// kelas → "Tanpa Kelas". Urutan: count desc, lalu className asc.
export interface BorrowingChartClassRow {
  className: string
  count: number
}

// Dokumen grafik siap-render (nilai sudah jadi teks/angka; tanpa business logic
// di renderer). `orientation` dikunci landscape seperti keputusan desain grafik.
export interface BorrowingChartData {
  title: string
  orientation: 'landscape'
  institution: ReportPrintInstitution
  /** Label periode siap tampil (mis. "Feb 2026 - Apr 2026"). */
  periodLabel: string
  /** Waktu data dibangun (ISO string). */
  generatedAt: string
  summary: BorrowingChartSummary
  monthly: BorrowingChartMonthPoint[]
  topBooks: BorrowingChartTopBook[]
  byClass: BorrowingChartClassRow[]
}
