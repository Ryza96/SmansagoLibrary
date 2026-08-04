import { ipcMain } from 'electron'
import type { PromotionRunService } from '../../src/main/services/promotion-run.service'

// WO P-3 (PROMOTION RUN HISTORY) — baca riwayat promosi (READ-ONLY, audit).
// Seluruh data berasal dari PromotionRun + PromotionRunItem; TIDAK ada
// perhitungan ulang keputusan (decide() hanya dipakai P-1/P-2).
export function registerPromotionHandlers(service: PromotionRunService): void {
  ipcMain.handle('promotions:findMany', async (_event, page?: number, limit?: number) =>
    service.findMany({ page, limit })
  )
  ipcMain.handle('promotions:findById', async (_event, id: string) =>
    service.findById(id)
  )
}
