import type {
  CanonicalRow,
  CellType,
  ImportErrorCode,
  ImportCellValue,
  RawWorkbook,
  RowResult,
  ValidatedWorkbook,
  ValidationIssue,
  ValidationMetadata,
} from '../types/import'
import { getColumnCount } from '../types/import'
import type { TemplateColumn } from '../types/import'
import { IMPORT_CONFIG } from '../config/import.config'
import { detectBookImportTemplate } from '../config/bookImport.template'
import { headerNormalizerService } from './HeaderNormalizerService'

const EMPTY_METADATA: ValidationMetadata = {
  expectedHeader: null,
  actualHeader: null,
  expectedColumn: null,
  actualColumn: null,
  expectedType: null,
  actualType: null,
}

function issue(
  code: ImportErrorCode,
  row: number | null,
  column: number | null,
  messageKey: string,
  metadata: ValidationMetadata = EMPTY_METADATA
): ValidationIssue {
  return { code, row, column, messageKey, metadata }
}

function toString(value: ImportCellValue): string {
  return value === null || value === undefined ? '' : String(value)
}

function isEmpty(value: ImportCellValue): boolean {
  return value === null || value === undefined || (typeof value === 'string' && value.trim().length === 0)
}

function inferCellType(value: ImportCellValue): CellType {
  if (value === null || value === undefined) return 'empty'
  if (typeof value === 'string') return 'string'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  if (value instanceof Date) return 'date'
  return 'unknown'
}

function matchesDataType(value: ImportCellValue, dataType: string): boolean {
  if (dataType === 'string') return typeof value === 'string'
  if (dataType === 'date') return value instanceof Date
  return typeof value === 'number' && Number.isFinite(value)
}

export class ValidationEngineService {
  private validateRow(row: ImportCellValue[], rowNumber: number, columns: readonly TemplateColumn[]): ValidationIssue[] {
    const issues: ValidationIssue[] = []
    const columnsList = columns

    for (let i = 0; i < columnsList.length; i++) {
      const column = columnsList[i]
      const value = row[i]
      const expectedColumn = i + 1

      if (isEmpty(value)) {
        if (column.requiredValue || !column.nullable) {
          issues.push(
            issue('IMP-013', rowNumber, expectedColumn, 'ERROR_REQUIRED_VALUE', {
              ...EMPTY_METADATA,
              expectedHeader: column.label,
              expectedColumn,
            })
          )
        }
        continue
      }

      const actualType = inferCellType(value)
      if (!matchesDataType(value, column.dataType)) {
        issues.push(
          issue('IMP-014', rowNumber, expectedColumn, 'ERROR_TYPE_MISMATCH', {
            ...EMPTY_METADATA,
            expectedHeader: column.label,
            expectedColumn,
            expectedType: column.dataType,
            actualType,
          })
        )
      } else if (column.min !== undefined || column.max !== undefined) {
        const num = value as number
        const outOfRange =
          (column.min !== undefined && num < column.min) ||
          (column.max !== undefined && num > column.max) ||
          (column.min !== undefined && !Number.isInteger(num))
        if (outOfRange) {
          issues.push(
            issue('IMP-015', rowNumber, expectedColumn, 'ERROR_VALUE_RANGE', {
              ...EMPTY_METADATA,
              expectedHeader: column.label,
              expectedColumn,
              expectedType: column.dataType,
              actualType,
            })
          )
        }
      }
    }

    return issues
  }

  private buildCanonicalRow(row: ImportCellValue[], rowNumber: number, columns: readonly TemplateColumn[]): CanonicalRow {
    const values: Record<string, ImportCellValue> = {}
    columns.forEach((column, index) => {
      values[column.key] = row[index] ?? null
    })
    return { rowNumber, values }
  }

  validate(rawWorkbook: RawWorkbook): ValidatedWorkbook {
    const errors: ValidationIssue[] = []
    const warnings: ValidationIssue[] = []
    const rowResults: RowResult[] = []
    const canonicalRows: CanonicalRow[] = []

    if (rawWorkbook.sheets.length === 0) {
      errors.push(issue('IMP-005', null, null, 'ERROR_NO_WORKSHEET'))
      return {
        rawWorkbook,
        normalizedHeaders: [],
        rowResults,
        canonicalRows,
        validationResult: { valid: false, errors, warnings },
      }
    }

    const target = rawWorkbook.sheets[0]
    const totalRows = rawWorkbook.sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0)

    if (totalRows === 0) {
      errors.push(issue('IMP-006', null, null, 'ERROR_EMPTY_WORKBOOK'))
      return {
        rawWorkbook,
        normalizedHeaders: [],
        rowResults,
        canonicalRows,
        validationResult: { valid: false, errors, warnings },
      }
    }

    if (target.rows.length === 0) {
      errors.push(issue('IMP-007', null, null, 'ERROR_EMPTY_WORKSHEET'))
      return {
        rawWorkbook,
        normalizedHeaders: [],
        rowResults,
        canonicalRows,
        validationResult: { valid: false, errors, warnings },
      }
    }

    const columnCount = getColumnCount(target.rows)
    if (columnCount < IMPORT_CONFIG.minColumns) {
      errors.push(
        issue('IMP-008', null, columnCount + 1, 'ERROR_MIN_COLUMNS', {
          ...EMPTY_METADATA,
          expectedColumn: IMPORT_CONFIG.minColumns,
          actualColumn: columnCount,
        })
      )
    }

    if (target.rows.length === 1) {
      errors.push(issue('IMP-009', 2, null, 'ERROR_NO_DATA'))
    }

    const hasHeader = target.rows[0].length > 0
    const normalizedHeaders = hasHeader
      ? target.rows[0].map((cell) => headerNormalizerService.normalizeHeader(toString(cell)))
      : []

    const template = detectBookImportTemplate(normalizedHeaders)
    const templateColumns = template.columns
    const requiredColumnCount = templateColumns.filter((column) => column.requiredColumn).length

    const headerErrors: ValidationIssue[] = []
    if (!hasHeader && target.rows.length > 0) {
      headerErrors.push(
        issue('IMP-010', 1, null, 'ERROR_HEADER_COUNT', {
          ...EMPTY_METADATA,
          expectedColumn: requiredColumnCount,
          actualColumn: 0,
        })
      )
    } else if (hasHeader) {
      const templateNormalized = templateColumns.map((column) =>
        headerNormalizerService.normalizeHeader(column.label)
      )

      if (normalizedHeaders.length < requiredColumnCount) {
        headerErrors.push(
          issue('IMP-010', 1, null, 'ERROR_HEADER_COUNT', {
            ...EMPTY_METADATA,
            expectedColumn: requiredColumnCount,
            actualColumn: normalizedHeaders.length,
          })
        )
      }

      for (let i = 0; i < templateColumns.length; i++) {
        const templateColumn = templateColumns[i]
        if (i >= normalizedHeaders.length) {
          if (templateColumn.requiredColumn) {
            headerErrors.push(
              issue('IMP-011', 1, i + 1, 'ERROR_HEADER_NAME', {
                ...EMPTY_METADATA,
                expectedHeader: templateColumn.label,
                expectedColumn: i + 1,
              })
            )
          }
        } else if (normalizedHeaders[i] !== templateNormalized[i]) {
          if (templateNormalized.includes(normalizedHeaders[i])) {
            headerErrors.push(
              issue('IMP-012', 1, i + 1, 'ERROR_HEADER_ORDER', {
                ...EMPTY_METADATA,
                expectedHeader: templateColumn.label,
                actualHeader: toString(target.rows[0][i]),
                expectedColumn: i + 1,
                actualColumn: i + 1,
              })
            )
          } else {
            headerErrors.push(
              issue('IMP-011', 1, i + 1, 'ERROR_HEADER_NAME', {
                ...EMPTY_METADATA,
                expectedHeader: templateColumn.label,
                actualHeader: toString(target.rows[0][i]),
                expectedColumn: i + 1,
                actualColumn: i + 1,
              })
            )
          }
        }
      }
    }
    errors.push(...headerErrors)

    if (hasHeader && headerErrors.length === 0 && target.rows.length > 1) {
      for (let r = 1; r < target.rows.length; r++) {
        const dataRow = target.rows[r]
        const dataCells = dataRow.slice(0, templateColumns.length)
        const allEmpty = dataCells.every((cell) => isEmpty(cell))
        if (allEmpty) {
          rowResults.push({ rowNumber: r + 1, valid: true, issues: [] })
          continue
        }
        const rowIssues = this.validateRow(dataRow, r + 1, templateColumns)
        const valid = rowIssues.length === 0
        rowResults.push({ rowNumber: r + 1, valid, issues: rowIssues })
        if (valid) {
          canonicalRows.push(this.buildCanonicalRow(dataRow, r + 1, templateColumns))
        }
      }
    }

    const allRowsValid = rowResults.every((row) => row.valid)
    return {
      rawWorkbook,
      normalizedHeaders,
      rowResults,
      canonicalRows,
      validationResult: { valid: errors.length === 0 && allRowsValid, errors, warnings },
    }
  }
}

export const validationEngineService = new ValidationEngineService()
