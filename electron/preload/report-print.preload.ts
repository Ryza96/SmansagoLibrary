import { ipcRenderer } from 'electron'
import type { ReportPrintRequest } from '../../src/shared/dto/report-print'

export const reportPrintAPI = {
  reportPrint: {
    preview: (request: ReportPrintRequest) =>
      ipcRenderer.invoke('reports:printPreview', request) as Promise<{
        html: string
        pageCount: number
        orientation: 'portrait' | 'landscape'
        title: string
      }>,
    print: (request: ReportPrintRequest) => ipcRenderer.invoke('reports:print', request) as Promise<void>,
    pdf: (request: ReportPrintRequest) =>
      ipcRenderer.invoke('reports:pdf', request) as Promise<{ saved: boolean; filePath?: string }>
  }
}
