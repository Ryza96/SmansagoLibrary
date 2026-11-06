// Report Module — DTO kontrak Laporan Cetak/Simpan PDF A4 (TAHAP 1 = data layer).
// Kontrak ini TIDAK menggantikan DTO laporan layar (src/shared/dto/report.ts);
// seluruh filter/row/summary lama dipakai apa adanya. ReportPrintData adalah
// dokumen siap-render: seluruh nilai sudah berupa teks (sudah terformat),
// sehingga template HTML (TAHAP 2) dan renderer (TAHAP 3) tidak menurunkan
// angka / tidak punya business logic (konsisten WO-2 / P-4 / Dashboard / R-1).
import type {
  BorrowReportFilter,
  CollectionReportFilter,
  MemberReportFilter,
  OverdueReportFilter,
  ReturnReportFilter
} from './report'
import type { ReportPrintOrientation, ReportPrintType } from '../config/report-print'

export type { ReportPrintOrientation, ReportPrintType } from '../config/report-print'

export type ReportPrintFilter =
  | BorrowReportFilter
  | ReturnReportFilter
  | OverdueReportFilter
  | MemberReportFilter
  | CollectionReportFilter

// Permintaan cetak: `filter` adalah filter laporan yang sesuai dengan `type`.
// Field page/limit SAYA abaikan — ekspor selalu "semua baris" (dibatasi
// REPORT_PRINT_MAX_ROWS di repository).
export interface ReportPrintRequest {
  type: ReportPrintType
  filter: ReportPrintFilter
}

// Satu baris meta/filter pada dokumen (teks Indonesia, siap cetak).
export interface ReportPrintMetaLine {
  label: string
  value: string
}

// Satu kolom tabel cetak. `align` hanya petunjuk perataan;
export interface ReportPrintColumn {
  key: string
  label: string
  align: 'left' | 'center' | 'right'
}

// Metadata kop dokumen (hanya dibaca dari Setting; TIDAK diubah).
export interface ReportPrintInstitution {
  libraryName: string
  schoolName: string
  address: string
  phone: string
  email: string
  librarianName: string
  principalName: string
}

export interface ReportPrintData {
  type: ReportPrintType
  /** Judul laporan (teks Indonesia, mis. "Laporan Peminjaman"). */
  title: string
  orientation: ReportPrintOrientation
  /** Metadata kop dari Setting (untuk header dokumen + tanda tangan). */
  institution: ReportPrintInstitution
  /** Filter aktif sebagai teks Indonesia (Periode/Status/Pencarian/Kelas/Kategori). */
  filterSummary: ReportPrintMetaLine[]
  /** Catatan kaki dokumen (mis. aturan periode Laporan Keterlambatan). */
  notes: string[]
  columns: ReportPrintColumn[]
  /** Baris tabel, sudah terformat teks (tanggal dd/MM/yyyy, angka polos). */
  rows: string[][]
  /** Jumlah baris tabel (=== rows.length) — untuk pagination TAHAP 2. */
  totalRows: number
  /**
   * Total/ringkasan dari `summary` laporan (bukan dari rows.length —
   * mis. Peminjaman: total = transaksi). Nilai sudah terformat teks.
   */
  totals: ReportPrintMetaLine[]
  /** Waktu dokumen dibuat (ISO string). */
  generatedAt: string
}
