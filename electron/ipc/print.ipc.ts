import { ipcMain } from 'electron'
import type { PrintService } from '../main/services/print.service'
import type { BookLabelData } from '../../src/shared/dto/print'

export function registerPrintHandlers(printService: PrintService): void {
  ipcMain.handle('printing:borrowReceipt', async (_event, borrowingId: string) =>
    printService.printBorrowReceipt(borrowingId)
  )
  ipcMain.handle('printing:returnReceipt', async (_event, borrowingId: string) =>
    printService.printReturnReceipt(borrowingId)
  )
  ipcMain.handle('printing:bookLabels', async (_event, data: BookLabelData) =>
    printService.printBookLabels(data)
  )
}
