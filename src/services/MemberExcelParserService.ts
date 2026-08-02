import { workbookReaderService } from './WorkbookReaderService'
import { headerNormalizerService } from './HeaderNormalizerService'
import type { ImportCellValue } from '../types/import'
import {
  MEMBER_IMPORT_TEMPLATE,
  type MemberImportColumnKey,
} from '../config/memberImport.template'

export interface ParsedMemberRow {
  rowNumber: number
  nama: ImportCellValue
  kelas: ImportCellValue
  jenisKelamin: ImportCellValue
  nisn: ImportCellValue
  tempatLahir: ImportCellValue
  tanggalLahir: ImportCellValue
  alamat: ImportCellValue
  whatsapp: ImportCellValue
  email: ImportCellValue
}

export class MemberExcelParserError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MemberExcelParserError'
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

export class MemberExcelParserService {
  private columnIndexByKey(headerRow: ImportCellValue[]): Record<MemberImportColumnKey, number> {
    const normalizedHeaders = headerRow.map((cell) => headerNormalizerService.normalizeHeader(toString(cell)))
    const result = {} as Record<MemberImportColumnKey, number>
    const missing: string[] = []

    for (const column of MEMBER_IMPORT_TEMPLATE) {
      const normalizedLabel = headerNormalizerService.normalizeHeader(column.label)
      const index = normalizedHeaders.indexOf(normalizedLabel)
      if (index === -1) {
        if (column.requiredHeader) missing.push(column.label)
        continue
      }
      result[column.key] = index
    }

    if (missing.length > 0) {
      throw new MemberExcelParserError(`Kolom wajib tidak ditemukan: ${missing.join(', ')}.`)
    }

    return result
  }

  async parse(file: File): Promise<ParsedMemberRow[]> {
    let rows: ImportCellValue[][]
    try {
      const workbook = await workbookReaderService.readWorkbook(file)
      rows = workbook.sheets[0]?.rows ?? []
    } catch (error) {
      if (error instanceof MemberExcelParserError) throw error
      throw new MemberExcelParserError('File gagal dibaca.')
    }

    if (rows.length === 0) {
      throw new MemberExcelParserError('File tidak memiliki baris header.')
    }

    const columnIndexByKey = this.columnIndexByKey(rows[HEADER_ROW_INDEX])

    return rows
      .slice(HEADER_ROW_INDEX + 1)
      .map((row, index) => {
        const get = (key: MemberImportColumnKey): ImportCellValue => {
          const columnIndex = columnIndexByKey[key]
          return columnIndex === undefined ? null : (row[columnIndex] ?? null)
        }
        return {
          rowNumber: HEADER_ROW_INDEX + index + 2,
          nama: get('nama'),
          kelas: get('kelas'),
          jenisKelamin: get('jenisKelamin'),
          nisn: get('nisn'),
          tempatLahir: get('tempatLahir'),
          tanggalLahir: normalizeDateValue(get('tanggalLahir')),
          alamat: get('alamat'),
          whatsapp: get('whatsapp'),
          email: get('email'),
        }
      })
  }
}

export const memberExcelParserService = new MemberExcelParserService()
