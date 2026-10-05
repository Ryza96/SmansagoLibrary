import { ipcMain } from 'electron'
import type { FineService } from '../../src/main/services/fine.service'

export function registerFineHandlers(fineService: FineService): void {
  ipcMain.handle('fines:list', async (_event, filter?: { status?: string; search?: string }) => {
    if (filter?.status !== undefined && filter.status !== '' && !['UNPAID', 'PAID', 'WAIVED'].includes(filter.status)) {
      throw new Error('Status filter tidak valid.')
    }
    return fineService.list(filter as any)
  })
  ipcMain.handle('fines:markPaid', async (_event, id: string) => {
    if (typeof id !== 'string' || !id.trim()) throw new Error('ID denda tidak valid.')
    return fineService.markPaid(id)
  })
  ipcMain.handle('fines:waive', async (_event, id: string, reason: string) => {
    if (typeof id !== 'string' || !id.trim()) throw new Error('ID denda tidak valid.')
    if (typeof reason !== 'string') throw new Error('Alasan pembebasan tidak valid.')
    return fineService.waive(id, reason)
  })
}
