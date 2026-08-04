import type { MatchCandidate } from '../shared/match-provider'
export type { MatchCandidate } from '../shared/match-provider'

export type ImportErrorCode =
  | 'IMP-001'
  | 'IMP-002'
  | 'IMP-003'
  | 'IMP-004'
  | 'IMP-005'
  | 'IMP-006'
  | 'IMP-007'
  | 'IMP-008'
  | 'IMP-009'
  | 'IMP-010'
  | 'IMP-011'
  | 'IMP-012'
  | 'IMP-013'
  | 'IMP-014'
  | 'IMP-015'

export type ImportCellValue = string | number | boolean | Date | null

export interface RawSheet {
  name: string
  rows: ImportCellValue[][]
}

export interface RawWorkbook {
  sheets: RawSheet[]
}

export type TemplateDataType = 'string' | 'number' | 'date'

export type CellType = TemplateDataType | 'boolean' | 'date' | 'empty' | 'unknown'

export interface ValidationMetadata {
  expectedHeader: string | null
  actualHeader: string | null
  expectedColumn: number | null
  actualColumn: number | null
  expectedType: CellType | null
  actualType: CellType | null
}

export interface ValidationIssue {
  code: ImportErrorCode
  row: number | null
  column: number | null
  messageKey: string
  metadata: ValidationMetadata
}

export interface ValidationResult {
  valid: boolean
  errors: ValidationIssue[]
  warnings: ValidationIssue[]
}

export interface TemplateColumn {
  key: string
  label: string
  requiredColumn: boolean
  requiredValue: boolean
  dataType: TemplateDataType
  nullable: boolean
  min?: number
  max?: number
}

export interface BookImportTemplate {
  id: string
  name: string
  description: string
  columns: TemplateColumn[]
}

export interface RowResult {
  rowNumber: number
  valid: boolean
  issues: ValidationIssue[]
}

export interface CanonicalRow {
  rowNumber: number
  values: Record<string, ImportCellValue>
}

export interface ValidatedWorkbook {
  rawWorkbook: RawWorkbook
  normalizedHeaders: string[]
  rowResults: RowResult[]
  canonicalRows: CanonicalRow[]
  validationResult: ValidationResult
}

export interface MatchingIssue {
  rowNumber: number | null
  messageKey: string
}

export type MatchStatus = 'FOUND' | 'NOT_FOUND' | 'AMBIGUOUS' | 'SKIPPED'

export interface FieldMatch {
  field: string
  provider: string
  status: MatchStatus
  candidates: MatchCandidate[]
  resolvedEntity?: MatchCandidate | null
}

export interface MatchingResult {
  valid: boolean
  errors: MatchingIssue[]
  warnings: MatchingIssue[]
}

export interface MatchedRow {
  rowNumber: number
  canonicalRow: CanonicalRow
  matches: FieldMatch[]
  issues: MatchingIssue[]
}

export interface MatchedWorkbook {
  canonicalRows: CanonicalRow[]
  matchedRows: MatchedRow[]
  matchingResult: MatchingResult
}

export interface ImportFailedRow {
  rowNumber: number
  messageKey: string
}

export interface ImportResultDTO {
  totalRows: number
  importedBooks: number
  importedCopies: number
  failedRows: ImportFailedRow[]
}

export type DownloadTemplateResult =
  | { status: 'saved'; filePath: string }
  | { status: 'cancelled' }
  | { status: 'error'; message: string }

export function getColumnCount(rows: ImportCellValue[][]): number {
  return rows.reduce((max, row) => Math.max(max, row.length), 0)
}
