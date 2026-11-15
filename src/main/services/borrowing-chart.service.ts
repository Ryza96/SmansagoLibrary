// Report Module — Service "Grafik Peminjaman" (SESSION 1: data layer saja).
// Tidak ada UI, tidak ada IPC, dan TIDAK menyentuh 5 laporan tabel
// (ReportService / ReportPrintService / print.service / report-print config).
//
// Aturan komputasi:
// - Validasi periode memakai `parseRange` yang SAMA dengan laporan Peminjaman
//   (from > to → AppError 400 "Tanggal mulai tidak boleh setelah tanggal akhir.").
// - Pengelompokan bulan dilakukan LOKAL dari daftar borrowDate (bukan strftime /
//   UTC), sehingga pinjaman pukul 00:30 tanggal 1 masuk bulan LOKAL yang benar.
// - Bulan tanpa data tetap muncul dengan count 0; seri dibatasi 24 bulan terakhir
//   (bila periode lebih panjang, keterbatasan dinyatakan di periodLabel).
// - Ringkasan (summary) berasal dari agregasi repository — BUKAN penjumlahan
//   ulang array monthly/topBooks/byClass.
import type { BorrowingChartData, BorrowingChartFilter } from '../../shared/dto/borrowing-chart'
import type { ReportPrintInstitution } from '../../shared/dto/report-print'
import type { ReportRepository } from '../repositories/report.repository'
import type { ReportPrintSettingsProvider } from './report-print.service'
import { parseRange } from './report.service'

export const BORROWING_CHART_TITLE = 'Grafik Peminjaman'
export const BORROWING_CHART_MAX_MONTHS = 24
export const BORROWING_CHART_TOP_BOOKS = 10
export const BORROWING_CHART_TOP_CATEGORIES = 10

// Label bulan Indonesia (3 huruf) — dipakai label seri, mis. "Jan 2026".
export const MONTH_LABELS_ID = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des'
] as const

export interface BorrowingChartMonthPointKey {
  /** Kunci internal `YYYY-M` (bulan lokal, 1-12) — pencocokan hasil grouping. */
  key: string
  /** Label siap tampil, mis. "Jan 2026". */
  label: string
}

function monthKeyOf(year: number, monthIndex0: number): string {
  return `${year}-${monthIndex0 + 1}`
}

export function monthLabelOf(year: number, monthIndex0: number): string {
  return `${MONTH_LABELS_ID[monthIndex0]} ${year}`
}

// Seri bulan LOKAL berurutan (inklusif) dari bulan `from` sampai bulan `to`.
// Periode > maxMonths → ambil maxMonths bulan TERAKHIR (truncated = true).
export function buildMonthSeries(
  from: Date,
  to: Date,
  maxMonths: number = BORROWING_CHART_MAX_MONTHS
): { points: BorrowingChartMonthPointKey[]; truncated: boolean } {
  const points: BorrowingChartMonthPointKey[] = []
  const cursor = new Date(from.getFullYear(), from.getMonth(), 1)
  const last = new Date(to.getFullYear(), to.getMonth(), 1)

  while (cursor.getTime() <= last.getTime()) {
    points.push({
      key: monthKeyOf(cursor.getFullYear(), cursor.getMonth()),
      label: monthLabelOf(cursor.getFullYear(), cursor.getMonth())
    })
    cursor.setMonth(cursor.getMonth() + 1)
  }

  if (points.length > maxMonths) {
    return { points: points.slice(points.length - maxMonths), truncated: true }
  }
  return { points, truncated: false }
}

// Hitung jumlah pinjaman per bulan LOKAL dari tanggal mentah (UTC dari SQLite
// dikonversi oleh Date ke zona waktu lokal proses).
export function groupBorrowDatesByMonth(dates: Date[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const d of dates) {
    const key = monthKeyOf(d.getFullYear(), d.getMonth())
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

// Label periode siap tampil:
// - satu bulan            : "Feb 2026"
// - beberapa bulan        : "Feb 2026 - Apr 2026"
// - terpotong 24 bulan    : "24 bulan terakhir (Jul 2024 - Jun 2026)"
export function formatPeriodLabel(points: BorrowingChartMonthPointKey[], truncated: boolean): string {
  if (points.length === 0) return '-'
  const first = points[0].label
  const last = points[points.length - 1].label
  if (points.length === 1) return first
  const range = `${first} - ${last}`
  return truncated ? `${points.length} bulan terakhir (${range})` : range
}

export class BorrowingChartService {
  constructor(
    private readonly repository: ReportRepository,
    private readonly settingsProvider: ReportPrintSettingsProvider
  ) {}

  async buildBorrowingChartData(filter?: BorrowingChartFilter): Promise<BorrowingChartData> {
    // Validasi periode yang SAMA dengan laporan Peminjaman (AppError 400).
    const { from, to } = parseRange(filter?.from, filter?.to)

    const [dates, topBooks, topCategories, byClass, summary, institution] = await Promise.all([
      this.repository.borrowDatesBetween(from, to),
      this.repository.topBookTitlesBetween(from, to, BORROWING_CHART_TOP_BOOKS),
      this.repository.topCategoriesBetween(from, to, BORROWING_CHART_TOP_CATEGORIES),
      this.repository.borrowCountByClassBetween(from, to),
      this.repository.countBorrowPeriodSummary(from, to),
      this.readInstitution()
    ])

    const { points, truncated } = buildMonthSeries(from, to)
    const countsByMonth = groupBorrowDatesByMonth(dates)

    return {
      title: BORROWING_CHART_TITLE,
      orientation: 'landscape',
      institution,
      periodLabel: formatPeriodLabel(points, truncated),
      generatedAt: new Date().toISOString(),
      summary,
      // Bulan tanpa data TETAP tampil (count 0) — seri tidak berlubang.
      monthly: points.map((p) => ({ label: p.label, count: countsByMonth.get(p.key) ?? 0 })),
      topBooks,
      topCategories,
      byClass
    }
  }

  // Kop dokumen: pemetaan 8 field yang SAMA dengan ReportPrintService.readInstitution
  // (dipakai bersama agar kop grafik identik dengan kop laporan tabel). File
  // report-print.service.ts TIDAK diubah.
  private async readInstitution(): Promise<ReportPrintInstitution> {
    const s = await this.settingsProvider.get()
    return {
      libraryName: s.libraryName,
      schoolName: s.schoolName,
      address: s.address,
      phone: s.phone,
      email: s.email,
      librarianName: s.librarianName,
      principalName: s.principalName,
      librarianNip: s.librarianNip,
      principalNip: s.principalNip
    }
  }
}
