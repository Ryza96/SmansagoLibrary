import { ipcMain } from 'electron'
import type { PromotionRunService } from '../../src/main/services/promotion-run.service'
import type { PromotionPreviewService } from '../../src/main/services/promotion-preview.service'
import type { PromotionExecuteService } from '../../src/main/services/promotion-execute.service'
import type { AutomaticPromotionPreviewInput, AutomaticPromotionExecuteInput } from '../../src/shared/dto/promotion'

// WO P-3 (PROMOTION RUN HISTORY) — baca riwayat promosi (READ-ONLY, audit).
// WO P-4 (PROMOTION OPERATOR UI) — preview + execute dipanggil dari UI operator.
// Preview WAJIB lewat PromotionPreviewService (decide() P-1); Execute WAJIB lewat
// PromotionExecuteService (satu transaksi all-or-nothing). IPC hanyalah penerus —
// TIDAK ada logika keputusan di layer ini.
export function registerPromotionHandlers(services: {
  runService: PromotionRunService
  previewService: PromotionPreviewService
  executeService: PromotionExecuteService
}): void {
  const { runService, previewService, executeService } = services

  ipcMain.handle('promotions:findMany', async (_event, page?: number, limit?: number) =>
    runService.findMany({ page, limit })
  )
  ipcMain.handle('promotions:findById', async (_event, id: string) =>
    runService.findById(id)
  )
  ipcMain.handle('promotions:preview', async (_event, input: AutomaticPromotionPreviewInput) =>
    previewService.preview(input)
  )
  ipcMain.handle('promotions:execute', async (_event, input: AutomaticPromotionExecuteInput) =>
    executeService.executeAutomatic(input)
  )
}
