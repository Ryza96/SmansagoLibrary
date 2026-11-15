import { ipcRenderer } from 'electron'
import type { ReportPrintRequest } from '../../src/shared/dto/report-print'
import type { BorrowingChartRequest } from '../../src/shared/dto/borrowing-chart'

export const reportPrintAPI = {
  reportPrint: {
    preview: (request: ReportPrintRequest) =>
      ipcRenderer.invoke('reports:printPreview', request) as Promise<{
        html: string
        pageCount: number
        totalRows: number
        orientation: 'portrait' | 'landscape'
        title: string
      }>,
    print: (request: ReportPrintRequest) => ipcRenderer.invoke('reports:print', request) as Promise<void>,
    pdf: (request: ReportPrintRequest) =>
      ipcRenderer.invoke('reports:pdf', request) as Promise<{ saved: boolean; filePath?: string }>,
    // SESI 3 — Grafik Peminjaman (channel terpisah dari laporan tabel).
    chartPreview: (request: BorrowingChartRequest) =>
      ipcRenderer.invoke('reports:chartPreview', request) as Promise<{
        html: string
        pageCount: number
        title: string
      }>,
    chartPrint: (request: BorrowingChartRequest) => ipcRenderer.invoke('reports:chartPrint', request) as Promise<void>,
    chartPdf: (request: BorrowingChartRequest) =>
      ipcRenderer.invoke('reports:chartPdf', request) as Promise<{ saved: boolean; filePath?: string }>
  }
}
