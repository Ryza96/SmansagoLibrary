import { ipcMain } from 'electron'
import { AppError } from '../main/errorHandler'
import type { PrintService } from '../main/services/print.service'
import type { ReportPrintRequest, ReportPrintType } from '../../src/shared/dto/report-print'
import { validateBorrowingChartRequest } from '../../src/shared/dto/borrowing-chart'
import type { BorrowingChartFilter, BorrowingChartRequest } from '../../src/shared/dto/borrowing-chart'

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

// SESI 3 — Grafik Peminjaman: channel BARU, terpisah dari tiga channel laporan
// tabel di atas. Validator murni ada di DTO; di sini hanya diterjemahkan ke
// AppError 400.
function validateChartRequest(request: unknown): BorrowingChartRequest {
  const result = validateBorrowingChartRequest(request)
  if (result.ok === false) {
    throw new AppError(400, 'Validation Error', result.message)
  }
  return result.request
}

function chartFilter(request: BorrowingChartRequest): BorrowingChartFilter {
  return request.filter
}

export function registerReportPrintHandlers(printService: PrintService): void {
  ipcMain.handle('reports:chartPreview', (_event, request: unknown) =>
    printService.previewBorrowingChart(chartFilter(validateChartRequest(request)))
  )
  ipcMain.handle('reports:chartPrint', (_event, request: unknown) =>
    printService.printBorrowingChart(chartFilter(validateChartRequest(request)))
  )
  ipcMain.handle('reports:chartPdf', (_event, request: unknown) =>
    printService.saveBorrowingChartPdf(chartFilter(validateChartRequest(request)))
  )

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
