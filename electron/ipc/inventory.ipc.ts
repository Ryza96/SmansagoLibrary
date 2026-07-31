import { ipcMain } from 'electron'
import type { InventoryService, InventoryFindManyParams } from '../main/services/inventory.service'

export function registerInventoryHandlers(inventoryService: InventoryService): void {
  ipcMain.handle('inventory:findMany', async (_event, params: InventoryFindManyParams) =>
    inventoryService.findMany(params)
  )

  ipcMain.handle('inventory:count', async () =>
    inventoryService.count()
  )
}
