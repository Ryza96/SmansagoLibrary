import type { ParsedTeacherRow } from './TeacherExcelParserService'
import type { TeacherImportValidationService, TeacherValidationError } from './TeacherImportValidationService'
import { teacherImportValidationService } from './TeacherImportValidationService'

export const TEACHER_PREVIEW_MAX_ROWS = 50
export const TEACHER_DUPLICATE_NIP_IN_FILE_MESSAGE_KEY = 'teacherImport.duplicateNipInFile'

export type TeacherPreviewStatus = 'VALID' | 'ERROR' | 'DUPLICATE'

export interface TeacherPreviewRow {
  rowNumber: number
  nama: string
  nip: string
  status: TeacherPreviewStatus
  errors: TeacherValidationError[]
  issues: TeacherValidationError[]
  duplicateNipRows: number[]
}

export interface TeacherPreviewSummary {
  total: number
  valid: number
  error: number
  duplicate: number
}

export interface TeacherPreviewResult {
  rows: TeacherPreviewRow[]
  summary: TeacherPreviewSummary
  canImport: boolean
}

function toKey(value: unknown): string {
  return String(value ?? '').trim()
}

export class TeacherPreviewService {
  constructor(private readonly validation: TeacherImportValidationService) {}

  preview(parsedRows: readonly ParsedTeacherRow[]): TeacherPreviewResult {
    const validation = this.validation.validate(parsedRows)
    const validationByRow = new Map(validation.rows.map((row) => [row.rowNumber, row]))

    const seen = new Map<string, number[]>()
    for (const row of parsedRows) {
      const nip = toKey(row.nip)
      if (nip === '') continue
      const list = seen.get(nip)
      if (list) list.push(row.rowNumber)
      else seen.set(nip, [row.rowNumber])
    }

    const rows = parsedRows.map((row): TeacherPreviewRow => {
      const validationRow = validationByRow.get(row.rowNumber)
      const errors = validationRow?.errors ?? []
      const nip = toKey(row.nip)
      const duplicateNipRows = (seen.get(nip) ?? []).filter(
        (rowNumber) => rowNumber !== row.rowNumber
      )

      let status: TeacherPreviewStatus = 'VALID'
      if (errors.length > 0) {
        status = 'ERROR'
      } else if (duplicateNipRows.length > 0) {
        status = 'DUPLICATE'
      }

      return {
        rowNumber: row.rowNumber,
        nama: toKey(row.nama),
        nip,
        status,
        errors,
        issues:
          duplicateNipRows.length > 0
            ? [{ messageKey: TEACHER_DUPLICATE_NIP_IN_FILE_MESSAGE_KEY, label: 'NIP' }]
            : [],
        duplicateNipRows
      }
    })

    const errorCount = rows.filter((row) => row.status === 'ERROR').length
    const duplicateCount = rows.filter((row) => row.status === 'DUPLICATE').length

    return {
      rows: rows.slice(0, TEACHER_PREVIEW_MAX_ROWS),
      summary: {
        total: rows.length,
        valid: rows.length - errorCount - duplicateCount,
        error: errorCount,
        duplicate: duplicateCount
      },
      canImport: rows.length > 0 && errorCount === 0 && duplicateCount === 0
    }
  }
}

export const teacherPreviewService = new TeacherPreviewService(teacherImportValidationService)
