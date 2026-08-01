import { IMPORT_CONFIG } from '../config/import.config'
import { LABELS } from './labels'
import type { ImportErrorCode, MatchedWorkbook } from '../types/import'

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B'
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** index
  const digits = index === 0 || value >= 100 ? 0 : value >= 10 ? 1 : 2
  return `${value.toFixed(digits)} ${units[index]}`
}

export function validateImportFile(file: File | null): ImportErrorCode | null {
  if (!file) return 'IMP-001'
  const lowerName = file.name.toLowerCase()
  const allowed = IMPORT_CONFIG.allowedExtensions.some((ext) => lowerName.endsWith(ext))
  if (!allowed) return 'IMP-002'
  if (file.size > IMPORT_CONFIG.maxFileSize) return 'IMP-003'
  return null
}

const IMPORT_ERROR_MESSAGES: Record<ImportErrorCode, string> = {
  'IMP-001': LABELS.IMPORT.ERROR_REQUIRED,
  'IMP-002': LABELS.IMPORT.ERROR_EXTENSION,
  'IMP-003': LABELS.IMPORT.ERROR_SIZE,
  'IMP-004': LABELS.IMPORT.ERROR_READ_FAILED,
  'IMP-005': LABELS.IMPORT.ERROR_NO_WORKSHEET,
  'IMP-006': LABELS.IMPORT.ERROR_EMPTY_WORKBOOK,
  'IMP-007': LABELS.IMPORT.ERROR_EMPTY_WORKSHEET,
  'IMP-008': LABELS.IMPORT.ERROR_MIN_COLUMNS,
  'IMP-009': LABELS.IMPORT.ERROR_NO_DATA,
  'IMP-010': LABELS.IMPORT.ERROR_HEADER_COUNT,
  'IMP-011': LABELS.IMPORT.ERROR_HEADER_NAME,
  'IMP-012': LABELS.IMPORT.ERROR_HEADER_ORDER,
  'IMP-013': LABELS.IMPORT.ERROR_REQUIRED_VALUE,
  'IMP-014': LABELS.IMPORT.ERROR_TYPE_MISMATCH,
  'IMP-015': LABELS.IMPORT.ERROR_VALUE_RANGE,
}

export function getImportErrorMessage(code: ImportErrorCode): string {
  return IMPORT_ERROR_MESSAGES[code]
}

const VALIDATION_MESSAGES: Record<string, string> = {
  ERROR_NO_WORKSHEET: LABELS.IMPORT.ERROR_NO_WORKSHEET,
  ERROR_EMPTY_WORKBOOK: LABELS.IMPORT.ERROR_EMPTY_WORKBOOK,
  ERROR_EMPTY_WORKSHEET: LABELS.IMPORT.ERROR_EMPTY_WORKSHEET,
  ERROR_MIN_COLUMNS: LABELS.IMPORT.ERROR_MIN_COLUMNS,
  ERROR_NO_DATA: LABELS.IMPORT.ERROR_NO_DATA,
  ERROR_HEADER_COUNT: LABELS.IMPORT.ERROR_HEADER_COUNT,
  ERROR_HEADER_NAME: LABELS.IMPORT.ERROR_HEADER_NAME,
  ERROR_HEADER_ORDER: LABELS.IMPORT.ERROR_HEADER_ORDER,
  ERROR_REQUIRED_VALUE: LABELS.IMPORT.ERROR_REQUIRED_VALUE,
  ERROR_TYPE_MISMATCH: LABELS.IMPORT.ERROR_TYPE_MISMATCH,
  ERROR_VALUE_RANGE: LABELS.IMPORT.ERROR_VALUE_RANGE,
}

export function getValidationIssueMessage(messageKey: string): string {
  return VALIDATION_MESSAGES[messageKey] ?? LABELS.IMPORT.ERROR_UNKNOWN
}

const IMPORT_RESULT_MESSAGES: Record<string, string> = {
  'bookImport.ambiguous': LABELS.IMPORT.RESULT_AMBIGUOUS,
  'bookImport.titleMissing': LABELS.IMPORT.RESULT_TITLE_MISSING,
  'bookImport.entityMissing': LABELS.IMPORT.RESULT_ENTITY_MISSING,
  'bookImport.isbnDuplicate': LABELS.IMPORT.RESULT_ISBN_DUPLICATE,
  'bookImport.createFailed': LABELS.IMPORT.RESULT_CREATE_FAILED,
  'bookImport.copyCreateFailed': LABELS.IMPORT.RESULT_COPY_CREATE_FAILED,
}

export function getImportResultMessage(messageKey: string): string {
  return IMPORT_RESULT_MESSAGES[messageKey] ?? LABELS.IMPORT.ERROR_UNKNOWN
}

export interface ImportResultSummaryData {
  booksCreated: number
  copiesCreated: number
  failedRows: number
}

export function computeImportResultSummary(result: MatchedWorkbook): ImportResultSummaryData {
  const failedRowNumbers = new Set(
    result.matchingResult.errors.filter((e) => e.rowNumber !== null).map((e) => e.rowNumber)
  )
  const failedRows = failedRowNumbers.size

  let copiesCreated = 0
  for (const row of result.matchedRows) {
    if (failedRowNumbers.has(row.rowNumber)) continue
    const raw = row.canonicalRow.values['copyCount']
    const num = typeof raw === 'number' ? raw : raw !== null && raw !== undefined ? Number(String(raw).trim()) : NaN
    copiesCreated += Number.isFinite(num) && num >= 1 ? num : 1
  }

  return {
    booksCreated: result.matchedRows.length - failedRows,
    copiesCreated,
    failedRows,
  }
}
