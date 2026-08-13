import type { ParsedTeacherRow } from './TeacherExcelParserService'
import type { ImportCellValue } from '../types/import'

export type TeacherGender = 'male' | 'female'

export interface TeacherValidationError {
  messageKey: string
  label: string
}

export interface TeacherRowValidation {
  rowNumber: number
  valid: boolean
  errors: TeacherValidationError[]
  gender: TeacherGender
}

export interface TeacherValidationResult {
  rows: TeacherRowValidation[]
  valid: boolean
  validCount: number
  errorCount: number
  total: number
}

export const TEACHER_REQUIRED_VALUE_MESSAGE_KEY = 'teacherImport.requiredValue'
export const TEACHER_INVALID_GENDER_MESSAGE_KEY = 'teacherImport.invalidGender'
export const TEACHER_INVALID_DATE_MESSAGE_KEY = 'teacherImport.invalidDate'

function isBlank(value: ImportCellValue): boolean {
  return value === null || value === undefined || String(value).trim() === ''
}

function normalizeGender(value: ImportCellValue): TeacherGender | null {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'l' || normalized === 'laki-laki' || normalized === 'laki laki') {
    return 'male'
  }
  if (normalized === 'p' || normalized === 'perempuan') {
    return 'female'
  }
  return null
}

function isDateLike(value: ImportCellValue): boolean {
  if (isBlank(value)) return false
  const date = new Date(String(value))
  return !Number.isNaN(date.getTime())
}

export class TeacherImportValidationService {
  validate(rows: readonly ParsedTeacherRow[]): TeacherValidationResult {
    const results = rows.map((row): TeacherRowValidation => {
      const errors: TeacherValidationError[] = []
      const gender = normalizeGender(row.jenisKelamin)

      if (isBlank(row.nama)) {
        errors.push({ messageKey: TEACHER_REQUIRED_VALUE_MESSAGE_KEY, label: 'Nama' })
      }

      if (gender === null) {
        errors.push({ messageKey: TEACHER_INVALID_GENDER_MESSAGE_KEY, label: 'Jenis Kelamin' })
      }

      if (!isBlank(row.tanggalLahir) && !isDateLike(row.tanggalLahir)) {
        errors.push({ messageKey: TEACHER_INVALID_DATE_MESSAGE_KEY, label: 'Tanggal Lahir' })
      }

      return {
        rowNumber: row.rowNumber,
        valid: errors.length === 0,
        errors,
        gender: gender ?? 'male'
      }
    })

    const errorCount = results.filter((row) => !row.valid).length
    return {
      rows: results,
      valid: errorCount === 0,
      validCount: results.length - errorCount,
      errorCount,
      total: results.length
    }
  }
}

export const teacherImportValidationService = new TeacherImportValidationService()
