import { BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron'
import type { SettingService } from '../main/services/setting.service'
import type { ResetDatabaseService } from '../../src/main/services/reset-database.service'
import type { PickLogoResult } from '../../src/shared/dto/logo'
import type { PrinterInfoDTO } from '../../src/shared/dto/print'

export function registerSettingHandlers(
  settingService: SettingService,
  resetDatabaseService: ResetDatabaseService,
  listPrinters: () => Promise<PrinterInfoDTO[]>
): void {
  ipcMain.handle('settings:get', async () =>
    settingService.get()
  )

  ipcMain.handle('settings:update', async (_event, data: Record<string, unknown>) =>
    settingService.update(data)
  )

  // Daftar printer sistem untuk pemilih printer kartu peminjaman di UI Settings.
  // Implementasi di PrintService.listPrinters() (getPrintersAsync via hidden window).
  ipcMain.handle('settings:listPrinters', async () =>
    listPrinters()
  )

  // Reset Database — seluruh guard & eksekusi di ResetDatabaseService
  // (SATU $transaction all-or-nothing). Error sengaja tidak di-catch —
  // lolos ke wrapper Electron, renderer menerima Error dengan message.
  ipcMain.handle('settings:resetDatabase', async () =>
    resetDatabaseService.resetDatabase()
  )

  // RFC §15.1 — pilih file logo: dialog OS → validasi + resize + preview di main.
  ipcMain.handle('settings:pickLogo', async (event: IpcMainInvokeEvent): Promise<PickLogoResult> => {
    const parentWindow = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions = {
      title: 'Pilih Logo Sekolah',
      properties: ['openFile'],
      filters: [{ name: 'Gambar Logo', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    }
    const { canceled, filePaths } = parentWindow
      ? await dialog.showOpenDialog(parentWindow, options)
      : await dialog.showOpenDialog(options)
    if (canceled || filePaths.length === 0) {
      return { canceled: true }
    }
    const filePath = filePaths[0]
    const preview = await settingService.pickLogoPreview(filePath)
    return { canceled: false, ...preview }
  })
}
