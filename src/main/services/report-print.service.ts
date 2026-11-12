// Report Module — ReportPrintService (TAHAP 1 = fondasi data Laporan Cetak A4).
// Membangun ReportPrintData (dokumen siap-render) untuk 5 laporan dari
// repository ekspor "semua baris" + derivasi yang SAMA dengan ReportService
// (startOfDay/endOfDay/parseRange/iso/diffDays/deriveBorrowStatus diekspor
// dari report.service.ts — satu sumber rumus, tanpa menyalin).
// TIDAK ada template HTML / IPC / UI di tahap ini.
// SettingService tidak diimpor langsung (src/main tidak boleh bergantung ke
// electron/ selain errorHandler): bootstrap mengoper SettingService yang
// bentuk get()-nya cocok secara struktural.

import type { ReportRepository } from '../repositories/report.repository'
import {
  deriveBorrowStatus,
  diffDays,
  iso,
  parseRange
} from './report.service'
import {
  REPORT_PRINT_ORIENTATION
} from '../../shared/config/report-print'
import type {
  ReportPrintColumn,
  ReportPrintData,
  ReportPrintInstitution,
  ReportPrintRequest
} from '../../shared/dto/report-print'
import type {
  BorrowReportFilter,
  CollectionReportFilter,
  MemberReportFilter,
  OverdueReportFilter,
  ReturnReportFilter
} from '../../shared/dto/report'
import { MEMBER_TYPES } from '../../shared/config/member-type'
import { formatReportDateId, formatRupiahId } from '../../shared/utils/format-report'

// Bentuk minimal settings yang dibutuhkan kop dokumen (Setting row cocok).
export interface ReportPrintSettings {
  libraryName: string
  schoolName: string
  address: string
  phone: string
  email: string
  librarianName: string
  principalName: string
  librarianNip: string
  principalNip: string
}

export interface ReportPrintSettingsProvider {
  get(): Promise<ReportPrintSettings>
}

// Judul dokumen per tipe (teks Indonesia; dipakai title + nama file PDF).
export const REPORT_PRINT_TITLES: Record<ReportPrintRequest['type'], string> = {
  borrowings: 'Laporan Peminjaman',
  returns: 'Laporan Pengembalian',
  overdues: 'Laporan Keterlambatan',
  members: 'Laporan Anggota',
  collections: 'Laporan Koleksi Buku'
} as const

// ---------------------------------------------------------------------------
// Nama file PDF — MURNI (tanpa I/O) agar dapat diuji headless.
// Pola buildCollectiveCardPdfFilename (print.service.ts): sanitasi karakter
// ilegal Windows ([<>:"/\|?*] + kontrol), collapse spasi, fallback, truncate.
// Berperiode : "Laporan Peminjaman - 2026-08-01 s.d. 2026-08-31.pdf"
// Tanpa periode: "Laporan Anggota - 2026-11-06.pdf" (tanggal cetak).
// ---------------------------------------------------------------------------

function sanitizeFileSegment(value: string): string {
  return value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function toFileDatePart(value: string | undefined, fallback: Date): string {
  if (value) {
    const head = value.trim().slice(0, 10)
    if (/^\d{4}-\d{2}-\d{2}$/.test(head)) return head
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) {
      const mm = String(parsed.getMonth() + 1).padStart(2, '0')
      const dd = String(parsed.getDate()).padStart(2, '0')
      return `${parsed.getFullYear()}-${mm}-${dd}`
    }
  }
  const mm = String(fallback.getMonth() + 1).padStart(2, '0')
  const dd = String(fallback.getDate()).padStart(2, '0')
  return `${fallback.getFullYear()}-${mm}-${dd}`
}

export function buildReportPdfFilename(
  type: ReportPrintRequest['type'],
  filter: { from?: string; to?: string } | object,
  now: Date = new Date()
): string {
  const period = filter as { from?: string; to?: string }
  const title = sanitizeFileSegment(REPORT_PRINT_TITLES[type]).slice(0, 60) || 'Laporan'
  const hasPeriod = Boolean(period.from && period.to)
  const datePart = hasPeriod
    ? `${toFileDatePart(period.from, now)} s.d. ${toFileDatePart(period.to, now)}`
    : toFileDatePart(undefined, now)
  return `${title} - ${datePart}.pdf`
}

// ---------------------------------------------------------------------------
// Kolom cetak = kolom layar (keputusan pemilik). Status ditulis sebagai teks
// Indonesia (hitam-putih — tidak bergantung warna).
// ---------------------------------------------------------------------------

// Kolom "Nama Anggota" cetak = "<nomor anggota> · <nama>" (P2) untuk
// Peminjaman, Pengembalian, Keterlambatan. Nomor = snapshot Borrow.memberNumber
// (BUKAN Member master) — identik dengan nilai yang dicetak di layar.
function memberPrintLabel(memberNumber: string, memberName: string): string {
  return `${memberNumber} · ${memberName}`
}

// Kelas cetak: kelas individu kosong → kelas kolektif (P5), lalu fallback "-".
function classPrintLabel(className: string | null, collectiveClassName: string | null): string {
  return className ?? collectiveClassName ?? '-'
}

const COLUMNS: Record<ReportPrintRequest['type'], ReportPrintColumn[]> = {
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

// Label status teks (mengikuti label layar di src/utils/labels.ts REPORT).
const BORROW_STATUS_TEXT: Record<string, string> = {
  ACTIVE: 'Dipinjam',
  COMPLETED: 'Dikembalikan',
  OVERDUE: 'Terlambat'
}
const RETURN_STATUS_TEXT: Record<string, string> = {
  ON_TIME: 'Tepat Waktu',
  LATE: 'Terlambat'
}
const OVERDUE_STATUS_TEXT: Record<string, string> = {
  ACTIVE: 'Masih Terlambat',
  RETURNED: 'Sudah Dikembalikan Terlambat'
}

export class ReportPrintService {
  constructor(
    private readonly reportRepository: ReportRepository,
    private readonly settingsProvider: ReportPrintSettingsProvider
  ) {}

  async buildData(request: ReportPrintRequest): Promise<ReportPrintData> {
    const institution = await this.readInstitution()
    const base = {
      type: request.type,
      title: REPORT_PRINT_TITLES[request.type],
      orientation: REPORT_PRINT_ORIENTATION[request.type],
      institution,
      columns: COLUMNS[request.type],
      generatedAt: new Date().toISOString()
    }

    switch (request.type) {
      case 'borrowings':
        return { ...base, ...(await this.buildBorrowings(request.filter as BorrowReportFilter)) }
      case 'returns':
        return { ...base, ...(await this.buildReturns(request.filter as ReturnReportFilter)) }
      case 'overdues':
        return { ...base, ...(await this.buildOverdues(request.filter as OverdueReportFilter)) }
      case 'members':
        return { ...base, ...(await this.buildMembers(request.filter as MemberReportFilter)) }
      case 'collections':
        return { ...base, ...(await this.buildCollections(request.filter as CollectionReportFilter)) }
    }
  }

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

  // Resolver nama filter (TAHAP 2): cetak NAMA, bukan ID. ID tidak ditemukan
  // → "(tidak ditemukan)" (tidak melempar error; dokumen tetap tercetak).
  private async resolveClassName(id: string): Promise<string> {
    return (await this.reportRepository.findClassLabelById(id)) ?? '(tidak ditemukan)'
  }

  private async resolveCategoryName(id: string): Promise<string> {
    return (await this.reportRepository.findCategoryNameById(id)) ?? '(tidak ditemukan)'
  }

  private async resolveAcademicYearName(id: string): Promise<string> {
    return (await this.reportRepository.findAcademicYearNameById(id)) ?? '(tidak ditemukan)'
  }

  private periodLine(from: Date, to: Date) {
    return { label: 'Periode', value: `${formatReportDateId(from)} s.d. ${formatReportDateId(to)}` }
  }

  // -------------------------------------------------------------------------
  // Laporan Peminjaman — 1 baris per BorrowDetail; totals.transaksi = jumlah
  // transaksi (dari data borrow), BUKAN rows.length.
  // -------------------------------------------------------------------------
  private async buildBorrowings(filter: BorrowReportFilter) {
    const { from, to } = parseRange(filter.from, filter.to)
    const now = Date.now()
    const [exported, statusSummary] = await Promise.all([
      this.reportRepository.findAllBorrowingsForExport({ from, to, status: filter.status, search: filter.search }),
      this.reportRepository.countBorrowStatusSummary(from, to, filter.search, filter.status)
    ])

    const rows: string[][] = []
    for (const b of exported.data) {
      const statusText = BORROW_STATUS_TEXT[deriveBorrowStatus(b.returnDate, b.dueDate, now)] ?? ''
      for (const d of b.details) {
        rows.push([
          formatReportDateId(iso(b.borrowDate)),
          b.borrowNumber,
          memberPrintLabel(b.memberNumber, b.memberName),
          classPrintLabel(b.className, b.collectiveClassName),
          d.bookTitle,
          formatReportDateId(iso(b.dueDate)),
          statusText
        ])
      }
    }

    const filterSummary = [this.periodLine(from, to)]
    if (filter.status) {
      const statusLabel =
        filter.status === 'ACTIVE' ? 'Aktif' : filter.status === 'COMPLETED' ? 'Selesai' : 'Terlambat'
      filterSummary.push({ label: 'Status', value: statusLabel })
    }
    if (filter.search) filterSummary.push({ label: 'Pencarian', value: filter.search })

    return {
      filterSummary,
      // P4: catatan wajib pada dokumen Peminjaman — status per baris = status
      // transaksi; total dihitung per transaksi, baris per buku.
      notes: [
        'Status menunjukkan keadaan transaksi. Satu transaksi dapat memuat beberapa buku (satu baris per buku), dan total dihitung per transaksi.'
      ],
      rows,
      totalRows: exported.totalRows,
      totals: [
        // P1: Total Transaksi = Aktif + Selesai dari summary (filter-aware),
        // bukan exported.data.length.
        { label: 'Total Transaksi', value: String(statusSummary.active + statusSummary.completed) },
        { label: 'Aktif', value: String(statusSummary.active) },
        { label: 'Selesai', value: String(statusSummary.completed) },
        { label: 'Terlambat', value: String(statusSummary.overdue) }
      ]
    }
  }

  // -------------------------------------------------------------------------
  // Laporan Pengembalian — 1 baris = 1 buku kembali (rumus layar identik).
  // -------------------------------------------------------------------------
  private async buildReturns(filter: ReturnReportFilter) {
    const { from, to } = parseRange(filter.from, filter.to)
    const [exported, cond, timing] = await Promise.all([
      this.reportRepository.findAllReturnsForExport({ from, to, search: filter.search }),
      this.reportRepository.countReturnedConditionSummary(from, to, filter.search),
      this.reportRepository.countReturnedTimingSummary(from, to, filter.search)
    ])

    const rows = exported.data.map((d) => {
      const returnedAt = d.returnedAt
      const late = returnedAt != null && returnedAt.getTime() > d.borrow.dueDate.getTime()
      const status = late ? 'LATE' : 'ON_TIME'
      return [
        formatReportDateId(iso(returnedAt ?? new Date())),
        d.borrow.borrowNumber,
        memberPrintLabel(d.borrow.memberNumber, d.borrow.memberName),
        classPrintLabel(d.borrow.className, d.borrow.collectiveClassName),
        d.bookTitle,
        returnedAt ? `${diffDays(returnedAt, d.borrow.borrowDate)} hari` : '0 hari',
        RETURN_STATUS_TEXT[status] ?? status
      ]
    })

    const filterSummary = [this.periodLine(from, to)]
    if (filter.search) filterSummary.push({ label: 'Pencarian', value: filter.search })

    return {
      filterSummary,
      notes: [] as string[],
      rows,
      totalRows: exported.totalRows,
      totals: [
        { label: 'Total Pengembalian', value: String(timing.total) },
        { label: 'Tepat Waktu', value: String(timing.total - timing.late) },
        { label: 'Terlambat', value: String(timing.late) },
        { label: 'Baik', value: String(cond.returnedGood) },
        { label: 'Rusak', value: String(cond.returnedDamaged) },
        { label: 'Hilang', value: String(cond.returnedLost) }
      ]
    }
  }

  // -------------------------------------------------------------------------
  // Laporan Keterlambatan — ACTIVE tanpa filter periode (aturan R-4) +
  // RETURNED dengan filter periode. Notes wajib dicantumkan.
  // -------------------------------------------------------------------------
  private async buildOverdues(filter: OverdueReportFilter) {
    const { from, to } = parseRange(filter.from, filter.to)
    const nowDate = new Date()
    const exported = await this.reportRepository.findAllOverduesForExport({
      asOf: nowDate,
      from,
      to,
      search: filter.search
    })

    const activeRows = exported.active.map((d) => [
      formatReportDateId(iso(d.borrow.borrowDate)),
      d.borrow.borrowNumber,
      memberPrintLabel(d.borrow.memberNumber, d.borrow.memberName),
      classPrintLabel(d.borrow.className, d.borrow.collectiveClassName),
      d.bookTitle,
      formatReportDateId(iso(d.borrow.dueDate)),
      String(diffDays(nowDate, d.borrow.dueDate)),
      OVERDUE_STATUS_TEXT['ACTIVE'] ?? 'Masih Terlambat'
    ])
    const returnedRows = exported.returned.map((r) => [
      formatReportDateId(iso(r.borrowDate)),
      r.borrowNumber,
      memberPrintLabel(r.memberNumber, r.memberName),
      classPrintLabel(r.className, r.collectiveClassName),
      r.bookTitle,
      formatReportDateId(iso(r.dueDate)),
      String(diffDays(r.returnedAt, r.dueDate)),
      OVERDUE_STATUS_TEXT['RETURNED'] ?? 'Sudah Dikembalikan Terlambat'
    ])

    const filterSummary = [this.periodLine(from, to)]
    if (filter.search) filterSummary.push({ label: 'Pencarian', value: filter.search })

    return {
      filterSummary,
      notes: ['Periode hanya berlaku untuk buku yang sudah dikembalikan. Buku yang masih terlambat selalu ditampilkan.'],
      rows: [...activeRows, ...returnedRows],
      totalRows: exported.totalRows,
      totals: [
        { label: 'Total Terlambat', value: String(exported.totalRows) },
        { label: 'Masih Terlambat', value: String(exported.active.length) },
        { label: 'Sudah Dikembalikan Terlambat', value: String(exported.returned.length) }
      ]
    }
  }

  // -------------------------------------------------------------------------
  // Laporan Anggota — tanpa periode; TANPA telepon/email/gender (keputusan
  // pemilik). Kolom "Tanggal Bergabung" tetap dicetak (fallback Member.createdAt).
  // -------------------------------------------------------------------------
  private async buildMembers(filter: MemberReportFilter) {
    const [exported, membership, typeCounts] = await Promise.all([
      this.reportRepository.findAllMembersForExport(filter),
      this.reportRepository.countMemberMembershipSummary(filter),
      this.reportRepository.countMembersByType(filter)
    ])

    const rows = exported.data.map((m) => {
      const enrollment = m.memberEnrollments[0]
      const className = enrollment ? `${enrollment.class.educationLevel} ${enrollment.class.parallel}` : '-'
      const membershipText = m.status === 'ACTIVE' ? 'Aktif' : 'Nonaktif'
      return [m.memberNumber, m.fullName, className, membershipText, formatReportDateId(iso(m.createdAt))]
    })

    const filterSummary: { label: string; value: string }[] = []
    if (filter.status) filterSummary.push({ label: 'Status Keanggotaan', value: filter.status === 'ACTIVE' ? 'Aktif' : 'Nonaktif' })
    if (filter.memberType) {
      const known = Object.values(MEMBER_TYPES).find((t) => t.code === filter.memberType)
      filterSummary.push({ label: 'Tipe Anggota', value: known ? known.label : filter.memberType })
    }
    if (filter.classId) filterSummary.push({ label: 'Kelas', value: await this.resolveClassName(filter.classId) })
    if (filter.academicYearId) filterSummary.push({ label: 'Tahun Ajaran', value: await this.resolveAcademicYearName(filter.academicYearId) })
    if (filter.search) filterSummary.push({ label: 'Pencarian', value: filter.search })

    const countByType = new Map(typeCounts.map((t) => [t.memberType, t.count]))
    return {
      filterSummary,
      notes: [] as string[],
      rows,
      totalRows: exported.totalRows,
      totals: [
        { label: 'Total Anggota', value: String(membership.active + membership.nonActive) },
        { label: 'Aktif', value: String(membership.active) },
        { label: 'Nonaktif', value: String(membership.nonActive) },
        { label: 'Siswa', value: String(countByType.get(MEMBER_TYPES.student.code) ?? 0) },
        { label: 'Guru', value: String(countByType.get(MEMBER_TYPES.teacher.code) ?? 0) },
        { label: 'Umum', value: String(countByType.get(MEMBER_TYPES.general.code) ?? 0) }
      ]
    }
  }

  // -------------------------------------------------------------------------
  // Laporan Koleksi Buku — 1 baris = 1 judul (tanpa filter periode).
  // -------------------------------------------------------------------------
  private async buildCollections(filter: CollectionReportFilter) {
    const [exported, summary] = await Promise.all([
      this.reportRepository.findAllCollectionsForExport(filter),
      this.reportRepository.getCollectionSummary(filter.categoryId, filter.search)
    ])

    const rows = exported.data.map((b) => [
      b.isbn ?? '-',
      b.title,
      b.author?.name ?? '-',
      b.publisher?.name ?? '-',
      b.category?.name ?? '-',
      b.publicationYear != null ? String(b.publicationYear) : '-',
      String(b._count.bookCopies),
      String(b.availableCount),
      String(b.borrowedCount),
      String(b.lostCount),
      String(b.damagedCount)
    ])

    const filterSummary: { label: string; value: string }[] = []
    if (filter.categoryId) filterSummary.push({ label: 'Kategori', value: await this.resolveCategoryName(filter.categoryId) })
    if (filter.search) filterSummary.push({ label: 'Pencarian', value: filter.search })

    return {
      filterSummary,
      notes: [] as string[],
      rows,
      totalRows: exported.totalRows,
      totals: [
        { label: 'Total Judul', value: String(summary.totalTitles) },
        { label: 'Total Eksemplar', value: String(summary.totalCopies) },
        { label: 'Nilai Aset', value: formatRupiahId(summary.totalAssetValue) }
      ]
    }
  }
}
