import { ipcMain } from 'electron'
import type { PrintService } from '../main/services/print.service'

export function registerPrintHandlers(printService: PrintService): void {
  ipcMain.handle('printing:borrowReceipt', async (_event, borrowingId: string) =>
    printService.printBorrowReceipt(borrowingId)
  )
  ipcMain.handle('printing:returnReceipt', async (_event, borrowingId: string) =>
    printService.printReturnReceipt(borrowingId)
  )
}
