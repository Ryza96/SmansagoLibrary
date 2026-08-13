export interface TeacherImportRowInput {
  rowNumber: number
  fullName: string
  gender: 'male' | 'female'
  nip?: string
  birthPlace?: string
  birthDate?: string
  address?: string
  phone?: string
  email?: string
}

export interface TeacherImportPreviewIssue {
  rowNumber: number
  messageKey: string
  field?: string
  existingMemberNumber?: string
  existingMemberName?: string
}

export interface TeacherImportPreviewDTO {
  valid: boolean
  errorCount: number
  warningCount: number
  errors: TeacherImportPreviewIssue[]
  warnings: TeacherImportPreviewIssue[]
}

export interface TeacherImportResultDTO {
  success: boolean
  totalRows: number
  created: number
  skipped: number
  failed: number
  warnings: number
  durationMs: number
  errors: TeacherImportPreviewIssue[]
}
