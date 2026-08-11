import type { MemberTypeCode } from '../config/member-type'

export interface MemberDTO {
  id: string
  memberNumber: string
  fullName: string
  memberType: string | null
  gender: string | null
  nisn: string | null
  nip: string | null
  nuptk: string | null
  nik: string | null
  birthPlace: string | null
  birthDate: string | null
  address: string | null
  phone: string | null
  email: string | null
  classId: string | null
  classInfo: {
    id: string
    educationLevel: string
    parallel: string
    academicYear: { id: string; name: string; isActive: boolean } | null
    curriculum: { id: string; name: string } | null
  } | null
  status: string
  createdAt: string
  updatedAt: string
}

export interface CreateMemberDTO {
  fullName: string
  memberType?: MemberTypeCode
  gender?: string
  nisn?: string
  nip?: string
  nuptk?: string
  nik?: string
  birthPlace?: string
  birthDate?: string
  address?: string
  phone?: string
  email?: string
  classId?: string
  // WO Manual Student Entry (Opsi A) — tahun ajaran penempatan kelas. Wajib
  // bersama `classId` untuk anggota siswa: saat disimpan, MemberService membuat
  // Member + MemberEnrollment(ACTIVE) dalam SATU transaksi (mirror jalur import).
  academicYearId?: string
}

export interface UpdateMemberDTO {
  fullName?: string
  memberType?: MemberTypeCode
  gender?: string
  nisn?: string
  nip?: string
  nuptk?: string
  nik?: string
  birthPlace?: string
  birthDate?: string
  address?: string
  phone?: string
  email?: string
  classId?: string
  status?: string
}

export interface MemberImportRowInput {
  rowNumber: number
  fullName: string
  className: string
  gender: 'male' | 'female'
  nisn: string
  birthPlace?: string
  birthDate?: string
  address: string
  phone: string
  email?: string
}

export interface MemberImportPreviewIssue {
  rowNumber: number
  messageKey: string
  field?: 'nisn' | 'email'
  existingMemberNumber?: string
  existingMemberName?: string
  className?: string
}

export interface MemberImportPreviewDTO {
  valid: boolean
  errorCount: number
  warningCount: number
  errors: MemberImportPreviewIssue[]
  warnings: MemberImportPreviewIssue[]
}

export interface MemberImportResultDTO {
  success: boolean
  totalRows: number
  // Jumlah MemberEnrollment(ACTIVE) yang DIBUAT (baris yang diproses) —
  // impor kini berorientasi enrollment (MI-2/MI-3).
  created: number
  // WO-19 MI-3 — jumlah baris DILEWATI karena member sudah memiliki
  // enrollment ACTIVE di tahun target (strategi Skip & flag, RFC §12.2).
  skipped: number
  failed: number
  warnings: number
  durationMs: number
  errors: MemberImportPreviewIssue[]
}

// WO-17 MI-1 / WO-20 MI-4 — skop eksplisit resolusi kelas saat import
// (RFC §12.1 step 1/4). WAJIB diisi UI (MI-4): academicYearId = tahun target
// (default UI = tahun aktif), curriculumId = kurikulum target. Tidak ada lagi
// jalur tanpa scope (fallback tahun aktif implicit dihapus pada MI-4).
export interface MemberImportScope {
  academicYearId: string
  curriculumId: string
}

export type MemberImportStage =
  | 'preparing'
  | 'checking-duplicate'
  | 'resolving-class'
  | 'generating-number'
  | 'saving'
  | 'completed'

export interface MemberImportProgressEvent {
  stage: MemberImportStage
  current: number
  total: number
}
