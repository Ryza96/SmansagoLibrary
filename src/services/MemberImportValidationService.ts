import type { ImportCellValue } from '../types/import'
import type { ParsedMemberRow } from './MemberExcelParserService'

export type MemberGender = 'male' | 'female'

export interface MemberValidationError {
  messageKey: string
  label: string
}

export interface MemberRowValidation {
  rowNumber: number
  valid: boolean
  errors: MemberValidationError[]
  gender: MemberGender | null
}

export interface MemberValidationResult {
  rows: MemberRowValidation[]
  valid: boolean
  validCount: number
  errorCount: number
  total: number
}

function isBlank(value: ImportCellValue): boolean {
  return value === null || value === undefined || (typeof value === 'string' && value.trim().length === 0)
}

function normalizeGender(value: ImportCellValue): MemberGender | null {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
  if (normalized === 'l' || normalized === 'laki-laki' || normalized === 'laki laki') return 'male'
  if (normalized === 'p' || normalized === 'perempuan') return 'female'
  return null
}

function isDateLike(value: ImportCellValue): boolean {
  if (value instanceof Date) return !Number.isNaN(value.getTime())
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed === '') return true
    return !Number.isNaN(Date.parse(trimmed))
  }
  return false
}

const ERROR_REQUIRED_VALUE = 'memberImport.requiredValue'
const ERROR_INVALID_GENDER = 'memberImport.invalidGender'
const ERROR_INVALID_DATE = 'memberImport.invalidDate'

export class MemberImportValidationService {
  validate(rows: ParsedMemberRow[]): MemberValidationResult {
    const rowValidations: MemberRowValidation[] = rows.map((row) => this.validateRow(row))

    const validRows = rowValidations.filter((row) => row.valid)
    const errorCount = rows.length - validRows.length

    return {
      rows: rowValidations,
      valid: errorCount === 0,
      validCount: validRows.length,
      errorCount,
      total: rows.length,
    }
  }

  private validateRow(row: ParsedMemberRow): MemberRowValidation {
    const errors: MemberValidationError[] = []
    const gender = normalizeGender(row.jenisKelamin)

    if (isBlank(row.nama)) {
      errors.push({ messageKey: ERROR_REQUIRED_VALUE, label: 'Nama' })
    }
    if (isBlank(row.kelas)) {
      errors.push({ messageKey: ERROR_REQUIRED_VALUE, label: 'Kelas' })
    }
    if (isBlank(row.jenisKelamin)) {
      errors.push({ messageKey: ERROR_REQUIRED_VALUE, label: 'Jenis Kelamin' })
    } else if (gender === null) {
      errors.push({ messageKey: ERROR_INVALID_GENDER, label: 'Jenis Kelamin' })
    }
    if (isBlank(row.nisn)) {
      errors.push({ messageKey: ERROR_REQUIRED_VALUE, label: 'NISN' })
    }
    if (isBlank(row.alamat)) {
      errors.push({ messageKey: ERROR_REQUIRED_VALUE, label: 'Alamat' })
    }
    if (!isBlank(row.tanggalLahir) && !isDateLike(row.tanggalLahir)) {
      errors.push({ messageKey: ERROR_INVALID_DATE, label: 'Tanggal Lahir' })
    }

    return {
      rowNumber: row.rowNumber,
      valid: errors.length === 0,
      errors,
      gender,
    }
  }
}

export const memberImportValidationService = new MemberImportValidationService()
