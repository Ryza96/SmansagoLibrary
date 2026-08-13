import { workbookReaderService } from './WorkbookReaderService'
import { headerNormalizerService } from './HeaderNormalizerService'
import type { ImportCellValue } from '../types/import'
import {
  TEACHER_IMPORT_TEMPLATE,
  type TeacherImportColumnKey
} from '../config/teacherImport.template'

export interface ParsedTeacherRow {
  rowNumber: number
  nama: ImportCellValue
  jenisKelamin: ImportCellValue
  nip: ImportCellValue
  tempatLahir: ImportCellValue
  tanggalLahir: ImportCellValue
  alamat: ImportCellValue
  whatsapp: ImportCellValue
  email: ImportCellValue
}

export class TeacherExcelParserError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TeacherExcelParserError'
  }
}

const HEADER_ROW_INDEX = 0

function toString(value: ImportCellValue): string {
  return value === null || value === undefined ? '' : String(value)
}

const EXCEL_EPOCH_OFFSET_DAYS = 25569
const EXCEL_MIN_SERIAL = 1
const EXCEL_MAX_SERIAL = 2958465
const DAY_MS = 86400000

function normalizeDateValue(value: ImportCellValue): ImportCellValue {
  if (typeof value === 'number' && value >= EXCEL_MIN_SERIAL && value <= EXCEL_MAX_SERIAL) {
    return new Date(Math.round((value - EXCEL_EPOCH_OFFSET_DAYS) * DAY_MS))
  }
  return value
}

export class TeacherExcelParserService {
  private columnIndexByKey(
    headerRow: ImportCellValue[]
  ): Record<TeacherImportColumnKey, number> {
    const normalizedHeaders = headerRow.map((cell) =>
      headerNormalizerService.normalizeHeader(toString(cell))
    )
    const result = {} as Record<TeacherImportColumnKey, number>
    const missing: string[] = []

    for (const column of TEACHER_IMPORT_TEMPLATE) {
      const normalizedLabel = headerNormalizerService.normalizeHeader(column.label)
      const index = normalizedHeaders.indexOf(normalizedLabel)
      if (index === -1) {
        if (column.requiredHeader) missing.push(column.label)
        continue
      }
      result[column.key] = index
    }

    if (missing.length > 0) {
      throw new TeacherExcelParserError(
        `Kolom wajib tidak ditemukan: ${missing.join(', ')}.`
      )
    }

    return result
  }

  async parse(file: File): Promise<ParsedTeacherRow[]> {
    let rows: ImportCellValue[][]
    try {
      const workbook = await workbookReaderService.readWorkbook(file)
      rows = workbook.sheets[0]?.rows ?? []
    } catch (error) {
      if (error instanceof TeacherExcelParserError) throw error
      throw new TeacherExcelParserError('File gagal dibaca.')
    }

    if (rows.length === 0) {
      throw new TeacherExcelParserError('File tidak memiliki baris header.')
    }

    const columnIndexByKey = this.columnIndexByKey(rows[HEADER_ROW_INDEX])

    return rows.slice(HEADER_ROW_INDEX + 1).map((row, index) => {
      const get = (key: TeacherImportColumnKey): ImportCellValue => {
        const columnIndex = columnIndexByKey[key]
        return columnIndex === undefined ? null : (row[columnIndex] ?? null)
      }
      return {
        rowNumber: HEADER_ROW_INDEX + index + 2,
        nama: get('nama'),
        jenisKelamin: get('jenisKelamin'),
        nip: get('nip'),
        tempatLahir: get('tempatLahir'),
        tanggalLahir: normalizeDateValue(get('tanggalLahir')),
        alamat: get('alamat'),
        whatsapp: get('whatsapp'),
        email: get('email')
      }
    })
  }
}

export const teacherExcelParserService = new TeacherExcelParserService()
