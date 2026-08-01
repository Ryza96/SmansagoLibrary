import readXlsxFile from 'read-excel-file/browser'
import type { ImportCellValue, ImportErrorCode, RawWorkbook } from '../types/import'

export class ImportReaderError extends Error {
  readonly code: ImportErrorCode

  constructor(code: ImportErrorCode) {
    super(code)
    this.name = 'ImportReaderError'
    this.code = code
  }
}

export class WorkbookReaderService {
  async readWorkbook(file: File): Promise<RawWorkbook> {
    try {
      const sheets = await readXlsxFile(file)
      return {
        sheets: (sheets ?? []).map((sheet) => ({
          name: sheet.sheet,
          rows: (sheet.data ?? []) as ImportCellValue[][],
        })),
      }
    } catch (error) {
      if (error instanceof ImportReaderError) throw error
      throw new ImportReaderError('IMP-004')
    }
  }
}

export const workbookReaderService = new WorkbookReaderService()
