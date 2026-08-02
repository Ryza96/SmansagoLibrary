import type { ImportCellValue } from '../types/import'
import type { ParsedMemberRow } from './MemberExcelParserService'
import {
  memberImportValidationService,
  type MemberValidationError,
} from './MemberImportValidationService'

export const PREVIEW_MAX_ROWS = 50

export type MemberPreviewStatus = 'VALID' | 'ERROR' | 'DUPLICATE'

export interface MemberPreviewRow {
  rowNumber: number
  nama: ImportCellValue
  kelas: ImportCellValue
  nisn: ImportCellValue
  status: MemberPreviewStatus
  errors: MemberValidationError[]
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

function toNisnKey(value: ImportCellValue): string | null {
  if (value === null || value === undefined) return null
  const key = String(value).trim()
  return key === '' ? null : key
}

export class MemberPreviewService {
  buildPreview(rows: ParsedMemberRow[]): MemberPreviewResult {
    const validation = memberImportValidationService.validate(rows)

    const nisnCounts = new Map<string, number>()
    for (const row of rows) {
      const key = toNisnKey(row.nisn)
      if (key !== null) {
        nisnCounts.set(key, (nisnCounts.get(key) ?? 0) + 1)
      }
    }

    const previewRows: MemberPreviewRow[] = rows.map((row, index) => {
      const rowValidation = validation.rows[index]
      const nisnKey = toNisnKey(row.nisn)
      const isDuplicate = nisnKey !== null && (nisnCounts.get(nisnKey) ?? 0) > 1
      const hasErrors = rowValidation.errors.length > 0

      const status: MemberPreviewStatus = hasErrors ? 'ERROR' : isDuplicate ? 'DUPLICATE' : 'VALID'

      return {
        rowNumber: row.rowNumber,
        nama: row.nama,
        kelas: row.kelas,
        nisn: row.nisn,
        status,
        errors: rowValidation.errors,
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
