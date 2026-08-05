import { ipcMain } from 'electron'
import type { ReportService } from '../../src/main/services/report.service'

export function registerReportHandlers(reportService: ReportService): void {
  ipcMain.handle('reports:borrowings', (_event, filter) => reportService.getBorrowingReport(filter))
  ipcMain.handle('reports:returns', (_event, filter) => reportService.getReturnReport(filter))
  ipcMain.handle('reports:overdues', (_event, filter) => reportService.getOverdueReport(filter))
  ipcMain.handle('reports:members', (_event, filter) => reportService.getMemberReport(filter))
  ipcMain.handle('reports:collections', (_event, filter) => reportService.getCollectionReport(filter))
}
