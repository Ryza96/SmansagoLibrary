import { ipcMain } from 'electron'
import type { SettingService } from '../main/services/setting.service'

export function registerSettingHandlers(settingService: SettingService): void {
  ipcMain.handle('settings:get', async () =>
    settingService.get()
  )

  ipcMain.handle('settings:update', async (_event, data: Record<string, unknown>) =>
    settingService.update(data)
  )
}
