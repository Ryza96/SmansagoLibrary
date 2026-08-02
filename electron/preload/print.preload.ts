import { ipcRenderer } from 'electron'
import type { BookLabelData } from '../../src/shared/dto/print'

export const printAPI = {
  print: {
    getLabelPreviewHtml: (data: BookLabelData) => ipcRenderer.invoke('printing:labelPreview', data),
    borrowReceipt: (borrowingId: string) => ipcRenderer.invoke('printing:borrowReceipt', borrowingId),
    returnReceipt: (borrowingId: string) => ipcRenderer.invoke('printing:returnReceipt', borrowingId),
    bookLabels: (data: BookLabelData) => ipcRenderer.invoke('printing:bookLabels', data)
  }
}
