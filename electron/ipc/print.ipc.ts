import { ipcMain } from 'electron'
import type { PrintService } from '../main/services/print.service'
import type { BookLabelData } from '../../src/shared/dto/print'

export function registerPrintHandlers(printService: PrintService): void {
  ipcMain.handle('printing:labelPreview', async (_event, data: BookLabelData) =>
    printService.getLabelPreviewHtml(data)
  )
  ipcMain.handle('printing:borrowReceipt', async (_event, borrowingId: string) =>
    printService.printBorrowReceipt(borrowingId)
  )
  ipcMain.handle('printing:returnReceipt', async (_event, borrowingId: string) =>
    printService.printReturnReceipt(borrowingId)
  )
  ipcMain.handle('printing:bookLabels', async (_event, data: BookLabelData) =>
    printService.printBookLabels(data)
  )
  ipcMain.handle('printing:borrowCardPreview', async (_event, borrowingId: string, options?: { activeOnly?: boolean }) =>
    printService.getBorrowCardPreviewHtml(borrowingId, options)
  )
  ipcMain.handle('printing:borrowCard', async (_event, borrowingId: string, options?: { silent?: boolean; activeOnly?: boolean }) =>
    printService.printBorrowCard(borrowingId, options)
  )
  ipcMain.handle('printing:borrowCardPdf', async (_event, borrowingId: string, options?: { activeOnly?: boolean }) =>
    printService.saveBorrowCardPdf(borrowingId, options)
  )
  ipcMain.handle(
    'printing:returnReceiptPreview',
    async (_event, borrowingId: string, detailIds?: string[]) =>
      printService.getReturnReceiptPreviewHtml(borrowingId, detailIds)
  )
}
