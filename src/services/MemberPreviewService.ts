import type { ImportCellValue } from '../types/import'
import type { ParsedMemberRow } from './MemberExcelParserService'
import {
  memberImportValidationService,
  type MemberValidationError,
} from './MemberImportValidationService'
import type { MemberImportPreviewDTO, MemberImportPreviewIssue } from '../../src/shared/dto/member'

export const PREVIEW_MAX_ROWS = 50

export type MemberPreviewStatus = 'VALID' | 'ERROR' | 'DUPLICATE'

export interface MemberPreviewRow {
  rowNumber: number
  nama: ImportCellValue
  kelas: ImportCellValue
  nisn: ImportCellValue
  status: MemberPreviewStatus
  errors: MemberValidationError[]
  issues: MemberImportPreviewIssue[]
  duplicateNisnRows: number[]
  duplicateEmailRows: number[]
}

export interface MemberPreviewSummary {
  total: number
  valid: number
  error: number
  duplicate: number
}

export interface MemberPreviewResult {
  rows: MemberPreviewRow[]
  summary: MemberPreviewSummary
  canImport: boolean
}

const DUPLICATE_MESSAGE_KEYS = new Set(['memberImport.duplicateNisnInDb', 'memberImport.duplicateEmailInDb'])

function toKey(value: ImportCellValue): string | null {
  if (value === null || value === undefined) return null
  const key = String(value).trim()
  return key === '' ? null : key
}

function toEmailKey(value: ImportCellValue): string | null {
  if (value === null || value === undefined) return null
  const key = String(value).trim().toLowerCase()
  return key === '' ? null : key
}

function append(map: Map<string, number[]>, key: string, value: number): void {
  const list = map.get(key)
  if (list) list.push(value)
  else map.set(key, [value])
}

export class MemberPreviewService {
  // WO-6 P5A (REV 1): preview = MERGE validasi renderer + validasi backend.
  // Renderer: required field, gender, tanggal, duplicate NISN dalam file,
  // duplicate Email dalam file. Backend (PreviewDTO): duplicate database,
  // class resolver. Status baris ditentukan dari gabungan seluruh issue.
  buildPreview(rows: ParsedMemberRow[], preview: MemberImportPreviewDTO): MemberPreviewResult {
    const validation = memberImportValidationService.validate(rows)

    const nisnByKey = new Map<string, number[]>()
    const emailByKey = new Map<string, number[]>()
    for (const row of rows) {
      const nk = toKey(row.nisn)
      if (nk) append(nisnByKey, nk, row.rowNumber)
      const ek = toEmailKey(row.email)
      if (ek) append(emailByKey, ek, row.rowNumber)
    }

    const issuesByRow = new Map<number, MemberImportPreviewIssue[]>()
    for (const issue of preview.errors) {
      const list = issuesByRow.get(issue.rowNumber)
      if (list) list.push(issue)
      else issuesByRow.set(issue.rowNumber, [issue])
    }

    const previewRows: MemberPreviewRow[] = rows.map((row, index) => {
      const rowValidation = validation.rows[index]
      const issues = issuesByRow.get(row.rowNumber) ?? []

      const nk = toKey(row.nisn)
      const ek = toEmailKey(row.email)
      const duplicateNisnRows = nk ? (nisnByKey.get(nk) ?? []).filter((n) => n !== row.rowNumber) : []
      const duplicateEmailRows = ek ? (emailByKey.get(ek) ?? []).filter((n) => n !== row.rowNumber) : []

      const hasValidationErrors = rowValidation.errors.length > 0
      const hasInFileDuplicate = duplicateNisnRows.length > 0 || duplicateEmailRows.length > 0
      const hasBackendDuplicate = issues.some((issue) => DUPLICATE_MESSAGE_KEYS.has(issue.messageKey))
      const hasBackendError = issues.length > 0 && !hasBackendDuplicate

      const status: MemberPreviewStatus = hasValidationErrors
        ? 'ERROR'
        : hasInFileDuplicate || hasBackendDuplicate
          ? 'DUPLICATE'
          : hasBackendError
            ? 'ERROR'
            : 'VALID'

      return {
        rowNumber: row.rowNumber,
        nama: row.nama,
        kelas: row.kelas,
        nisn: row.nisn,
        status,
        errors: rowValidation.errors,
        issues,
        duplicateNisnRows,
        duplicateEmailRows,
      }
    })

    const summary: MemberPreviewSummary = {
      total: previewRows.length,
      valid: previewRows.filter((row) => row.status === 'VALID').length,
      error: previewRows.filter((row) => row.status === 'ERROR').length,
      duplicate: previewRows.filter((row) => row.status === 'DUPLICATE').length,
    }

    return {
      rows: previewRows,
      summary,
      canImport: summary.total > 0 && summary.valid === summary.total,
    }
  }
}

export const memberPreviewService = new MemberPreviewService()
