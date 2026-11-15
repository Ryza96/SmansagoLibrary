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

// SESI 3: nama file PDF grafik disusun di MAIN (renderer tidak menyusun nama
// file). Tanggal memakai tanggal LOKAL mesin, format YYYYMMDD.
export function buildBorrowingChartPdfFilename(now: Date = new Date()): string {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `grafik-peminjaman-${year}${month}${day}.pdf`
}

// Filter periode. String kosong diperlakukan sama dengan laporan Peminjaman
// (parseRange): jatuh ke hari ini. Format tanggal = ISO / YYYY-MM-DD.
export interface BorrowingChartFilter {
  from: string
  to: string
}

/** Jumlah bulan pada periode awal grafik (6 bulan terakhir). */
export const BORROWING_CHART_DEFAULT_MONTHS = 6

/** YYYY-MM-DD menurut tanggal LOKAL mesin (bukan UTC) agar tidak bergeser hari. */
export function toLocalIsoDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Periode awal bila pengguna belum memilih: tanggal 1 bulan ke-5 sebelum bulan
// ini sampai hari ini. Contoh: 15 Nov 2026 → from 2026-06-01, to 2026-11-15.
export function defaultBorrowingChartPeriod(now: Date = new Date()): BorrowingChartFilter {
  const start = new Date(now.getFullYear(), now.getMonth() - (BORROWING_CHART_DEFAULT_MONTHS - 1), 1)
  return { from: toLocalIsoDate(start), to: toLocalIsoDate(now) }
}

export interface BorrowingChartRequest {
  type: typeof BORROWING_CHART_TYPE
  filter: BorrowingChartFilter
}

// Hasil validasi permintaan grafik. Validator ini MURNI (tanpa Electron dan
// tanpa AppError) agar bisa diuji langsung; handler IPC menerjemahkan
// `message` menjadi AppError 400.
export type BorrowingChartRequestValidation =
  | { ok: true; request: BorrowingChartRequest }
  | { ok: false; message: string }

// Aturan SESI 3: type harus 'borrowing-chart', filter harus objek, dan
// from/to harus string (boleh kosong). Hanya nilai yang TIDAK DIKIRIM
// (undefined) yang dinormalkan menjadi ''; null/number/objek ditolak.
export function validateBorrowingChartRequest(raw: unknown): BorrowingChartRequestValidation {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, message: 'Permintaan grafik peminjaman tidak valid.' }
  }
  const candidate = raw as { type?: unknown; filter?: unknown }
  if (candidate.type !== BORROWING_CHART_TYPE) {
    return { ok: false, message: 'Jenis laporan grafik tidak dikenal.' }
  }
  if (!candidate.filter || typeof candidate.filter !== 'object' || Array.isArray(candidate.filter)) {
    return { ok: false, message: 'Filter grafik peminjaman tidak valid.' }
  }
  const filter = candidate.filter as { from?: unknown; to?: unknown }
  const from = filter.from === undefined ? '' : filter.from
  const to = filter.to === undefined ? '' : filter.to
  if (typeof from !== 'string' || typeof to !== 'string') {
    return { ok: false, message: 'Tanggal filter grafik peminjaman tidak valid.' }
  }
  return { ok: true, request: { type: BORROWING_CHART_TYPE, filter: { from, to } } }
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

// Kategori buku paling diminati (maks 10). Satu buku hanya punya SATU kategori
// (Book.categoryId nullable), sehingga hitungan = eksemplar per kategori.
// Buku tanpa kategori → "Tanpa Kategori". Urutan: count desc, lalu category asc.
export interface BorrowingChartTopCategory {
  category: string
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
  /** Isi tabel kanan bawah ("Kategori Buku Paling Diminati"). */
  topCategories: BorrowingChartTopCategory[]
  byClass: BorrowingChartClassRow[]
}
