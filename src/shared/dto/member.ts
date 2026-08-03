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
  created: number
  failed: number
  warnings: number
  durationMs: number
  errors: MemberImportPreviewIssue[]
}

// WO-17 MI-1 — skop resolusi kelas saat import (RFC §12.1 step 1/4).
// academicYearId: tahun target (wajib diisi UI MI-2; null tidak diterima di sini).
// curriculumId: kurikulum target; null = tanpa filter kurikulum (backward-compat
// jalur UI lama yang belum memilih scope) — bila satu nama kelas ada di beberapa
// kurikulum tahun yang sama, resolver mengembalikan classAmbiguous (BLOCKER).
export interface MemberImportScope {
  academicYearId: string
  curriculumId: string | null
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
