import { ipcMain } from 'electron'
import type { AssetEventService } from '../main/services/asset-event.service'

export function registerAssetEventHandlers(assetEventService: AssetEventService): void {
  ipcMain.handle('assetEvents:findByBookCopyId', async (_event, bookCopyId: string) =>
    assetEventService.findByBookCopyId(bookCopyId)
  )
}
