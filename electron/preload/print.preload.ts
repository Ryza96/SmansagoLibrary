import { ipcRenderer } from 'electron'
import type { BookLabelData } from '../../src/shared/dto/print'

export const printAPI = {
  print: {
    getLabelPreviewHtml: (data: BookLabelData) => ipcRenderer.invoke('printing:labelPreview', data),
    borrowReceipt: (borrowingId: string) => ipcRenderer.invoke('printing:borrowReceipt', borrowingId),
    returnReceipt: (borrowingId: string) => ipcRenderer.invoke('printing:returnReceipt', borrowingId),
    bookLabels: (data: BookLabelData) => ipcRenderer.invoke('printing:bookLabels', data),
    borrowCardPreview: (borrowingId: string, options?: { activeOnly?: boolean }) =>
      ipcRenderer.invoke('printing:borrowCardPreview', borrowingId, options),
    borrowCard: (borrowingId: string, options?: { silent?: boolean; activeOnly?: boolean }) =>
      ipcRenderer.invoke('printing:borrowCard', borrowingId, options),
    borrowCardPdf: (borrowingId: string, options?: { activeOnly?: boolean }) =>
      ipcRenderer.invoke('printing:borrowCardPdf', borrowingId, options) as Promise<{ saved: boolean; filePath?: string }>,
    returnReceiptPreview: (borrowingId: string, detailIds?: string[]) =>
      ipcRenderer.invoke('printing:returnReceiptPreview', borrowingId, detailIds)
  }
}
