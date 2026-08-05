// Report Module — DTO kontrak renderer ↔ main (R-1 foundation).
// KEPUTUSAN PO (REPORT_MODULE_DISCOVERY.md): laporan v1.0 TANPA kolom Petugas
// (K1) dan TANPA nominal denda (K2 — keterlambatan hanya status + hari).
// Seluruh nilai tanggal di DTO berupa string ISO; renderer hanya memformat.

// ---------------------------------------------------------------------------
// Primitif bersama
// ---------------------------------------------------------------------------

export interface ReportPagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

// Status peminjaman turunan (bukan kolom): dihitung Service dari
// returnDate + dueDate. OVERDUE = returnDate null && dueDate < hari ini.
export type BorrowReportStatus = 'ACTIVE' | 'COMPLETED' | 'OVERDUE'

// ---------------------------------------------------------------------------
// LAPORAN PEMINJAMAN
// ---------------------------------------------------------------------------

export interface BorrowReportFilter {
  from: string
  to: string
  status?: BorrowReportStatus
  // Pencarian server-side (R-2, aditif non-breaking): cocok di nomor
  // transaksi, nomor/nama anggota, dan judul buku.
  search?: string
  page?: number
  limit?: number
}

export interface BorrowingReportRowDTO {
  borrowNumber: string
  borrowDate: string
  memberNumber: string
  memberName: string
  className: string | null
  bookTitle: string
  dueDate: string
  returnDate: string | null
  status: BorrowReportStatus
}

export interface BorrowingReportSummaryDTO {
  total: number
  active: number
  completed: number
  overdue: number
}

export interface BorrowingReportDTO {
  rows: BorrowingReportRowDTO[]
  pagination: ReportPagination
  summary: BorrowingReportSummaryDTO
}

// ---------------------------------------------------------------------------
// LAPORAN PENGEMBALIAN
// ---------------------------------------------------------------------------

// Status pengembalian turunan (bukan kolom): dihitung Service dari
// returnedAt vs dueDate. TEPAT WAKTU = returnedAt <= dueDate; TERLAMBAT = returnedAt > dueDate.
export type ReturnStatus = 'ON_TIME' | 'LATE'

export interface ReturnReportFilter {
  from: string
  to: string
  // Pencarian server-side (R-3, aditif non-breaking): cocok di nomor
  // transaksi, nomor/nama anggota (snapshot), dan judul buku.
  search?: string
  page?: number
  limit?: number
}

// 1 baris = 1 buku yang dikembalikan (BorrowDetail.returnedAt bukan null).
export interface ReturnReportRowDTO {
  borrowNumber: string
  borrowDate: string
  returnedAt: string
  memberNumber: string
  memberName: string
  className: string | null
  bookTitle: string
  conditionBack: string | null
  dueDate: string
  // Jumlah hari terlambat saat dikembalikan (returnedAt > dueDate); null bila tepat waktu.
  lateDays: number | null
  // Lama pinjam dalam hari (returnedAt - borrowDate) — dihitung Service, renderer tidak menurunkan.
  durationDays: number
  // Tepat Waktu (returnedAt <= dueDate) / Terlambat (returnedAt > dueDate).
  status: ReturnStatus
}

export interface ReturnReportSummaryDTO {
  total: number
  // R-3 (aditif): statistik waktu pengembalian. onTime + late === total.
  onTime: number
  late: number
  returnedGood: number
  returnedDamaged: number
  returnedLost: number
}

export interface ReturnReportDTO {
  rows: ReturnReportRowDTO[]
  pagination: ReportPagination
  summary: ReturnReportSummaryDTO
}

// ---------------------------------------------------------------------------
// LAPORAN KETERLAMBATAN (tanpa nominal denda — K2)
// ---------------------------------------------------------------------------

// ACTIVE = masih terlambat & belum dikembalikan; RETURNED = pernah terlambat (sudah kembali).
export type OverdueCategory = 'ACTIVE' | 'RETURNED'

export interface OverdueReportFilter {
  from: string
  to: string
  // Pencarian server-side (R-4, aditif non-breaking): cocok di nomor
  // transaksi, nomor/nama anggota (snapshot), dan judul buku.
  search?: string
  page?: number
  limit?: number
}

export interface OverdueReportRowDTO {
  category: OverdueCategory
  borrowNumber: string
  borrowDate: string
  memberNumber: string
  memberName: string
  className: string | null
  bookTitle: string
  dueDate: string
  returnDate: string | null
  // ACTIVE: diffDays(today, dueDate); RETURNED: diffDays(returnedAt, dueDate).
  lateDays: number
}

export interface OverdueReportSummaryDTO {
  active: number
  returned: number
}

export interface OverdueReportDTO {
  rows: OverdueReportRowDTO[]
  pagination: ReportPagination
  summary: OverdueReportSummaryDTO
}

// ---------------------------------------------------------------------------
// LAPORAN ANGGOTA
// ---------------------------------------------------------------------------

export interface MemberReportFilter {
  memberType?: string
  academicYearId?: string
  classId?: string
  // Pencarian server-side (R-2, aditif non-breaking): cocok di nomor anggota & nama.
  search?: string
  // Status Keanggotaan (R-5, aditif non-breaking). Aturan PO: AKTIF = pernah
  // memiliki MemberEnrollment (status apa pun); NONAKTIF = tidak pernah memiliki
  // MemberEnrollment. BUKAN berdasarkan Member.status maupun pinjaman aktif.
  status?: 'ACTIVE' | 'INACTIVE'
  page?: number
  limit?: number
}

export interface MemberReportRowDTO {
  memberNumber: string
  fullName: string
  memberType: string | null
  gender: string | null
  phone: string | null
  email: string | null
  // Kelas saat ini (SSOT MemberEnrollment ACTIVE) atau null.
  className: string | null
  // Kolom Member.status (keanggotaan sistem). TIDAK sama dengan membershipStatus.
  status: string
  // Status Keanggotaan (R-5, turunan): ACTIVE = pernah memiliki MemberEnrollment
  // (status apa pun); INACTIVE = tidak pernah memiliki. Bukan dari pinjaman aktif.
  membershipStatus: 'ACTIVE' | 'INACTIVE'
  // Tanggal Bergabung (R-5). Catatan kontrak: Member.createdAt BUKAN definisi
  // bisnis "Tanggal Bergabung" — saat ini hanya dipakai sebagai FALLBACK karena
  // domain belum memiliki field khusus. Saat field khusus ditambahkan, ganti sumber
  // nilai di ReportService tanpa mengubah kontrak DTO ini.
  joinedAt: string
}

export interface MemberReportSummaryDTO {
  total: number
  students: number
  teachers: number
  general: number
  // R-5 (aditif): Aktif = pernah memiliki MemberEnrollment; Nonaktif = tidak
  // pernah. total === active + nonActive; seluruh ringkasan mengikuti filter.
  active: number
  nonActive: number
}

export interface MemberReportDTO {
  rows: MemberReportRowDTO[]
  pagination: ReportPagination
  summary: MemberReportSummaryDTO
}

// ---------------------------------------------------------------------------
// LAPORAN KOLEKSI BUKU
// ---------------------------------------------------------------------------

export interface CollectionReportFilter {
  categoryId?: string
  search?: string
  page?: number
  limit?: number
}

export interface CollectionReportRowDTO {
  isbn: string | null
  title: string
  authorName: string | null
  publisherName: string | null
  categoryName: string | null
  publicationYear: number | null
  // R-6 (aditif): total eksemplar NON-REMOVED (keputusan PO G-4).
  copyCount: number
  // R-6 (aditif): breakdown status per judul — per dimensi (keputusan PO G-5,
  // boleh overlap: eksemplar BORROWED/LOST juga bisa ber-condition rusak).
  availableCount: number
  borrowedCount: number
  lostCount: number
  // R-6 (aditif): eksemplar dgn condition LIGHT_DAMAGE / HEAVY_DAMAGE
  // (keputusan PO G-2) — NON-REMOVED, boleh overlap dengan status lain.
  damagedCount: number
}

export interface CollectionStatusAggregateDTO {
  status: string
  count: number
}

export interface CollectionConditionAggregateDTO {
  condition: string
  count: number
}

export interface CollectionReportSummaryDTO {
  totalTitles: number
  totalCopies: number
  // SUM(acquisitionCost) seluruh eksemplar (WO13); 0 bila belum diisi.
  totalAssetValue: number
  byStatus: CollectionStatusAggregateDTO[]
  byCondition: CollectionConditionAggregateDTO[]
}

export interface CollectionReportDTO {
  rows: CollectionReportRowDTO[]
  pagination: ReportPagination
  summary: CollectionReportSummaryDTO
}
