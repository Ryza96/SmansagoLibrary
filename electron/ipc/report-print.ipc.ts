import { ipcMain } from 'electron'
import { AppError } from '../main/errorHandler'
import type { PrintService } from '../main/services/print.service'
import type { ReportPrintRequest, ReportPrintType } from '../../src/shared/dto/report-print'

// Laporan Cetak A4 (TAHAP 2) — channel reports:printPreview / reports:print /
// reports:pdf. Validasi sederhana di main (type dari 5 nilai sah, filter
// object); page/limit dari renderer diabaikan (ekspor selalu semua baris,
// dibatasi 5000 di repository).
const VALID_TYPES: ReportPrintType[] = ['borrowings', 'returns', 'overdues', 'members', 'collections']

function validateReportPrintRequest(request: unknown): ReportPrintRequest {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    throw new AppError(400, 'Validation Error', 'Permintaan cetak laporan tidak valid.')
  }
  const candidate = request as { type?: unknown; filter?: unknown }
  if (typeof candidate.type !== 'string' || !(VALID_TYPES as string[]).includes(candidate.type)) {
    throw new AppError(400, 'Validation Error', 'Jenis laporan tidak dikenal.')
  }
  if (!candidate.filter || typeof candidate.filter !== 'object' || Array.isArray(candidate.filter)) {
    throw new AppError(400, 'Validation Error', 'Filter laporan tidak valid.')
  }
  return request as ReportPrintRequest
}

export function registerReportPrintHandlers(printService: PrintService): void {
  ipcMain.handle('reports:printPreview', (_event, request: unknown) =>
    printService.previewReport(validateReportPrintRequest(request))
  )
  ipcMain.handle('reports:print', (_event, request: unknown) =>
    printService.printReport(validateReportPrintRequest(request))
  )
  ipcMain.handle('reports:pdf', (_event, request: unknown) =>
    printService.saveReportPdf(validateReportPrintRequest(request))
  )
}
