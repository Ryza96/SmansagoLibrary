// WO-6 — Backup & Restore UI IPC.
// Channel client (renderer) → controller (src/main). Renderer TIDAK menyentuh
// engine langsung; handler memakai BrowserWindow/dialog/shell (Electron) untuk
// kebutuhan OS (pilih file, buka folder), sisanya controller murni.
// Progress dikirim via event.sender.send (pola member import progress).

import { app, BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from 'electron'
import type { BackupUIController, BackupInspector, RestoreUIController } from '../../src/main/services/backup-ui.service'
import type { PickBackupResult, OpenFolderResult } from '../../src/shared/dto/backup-ui'

export interface BackupUIHandlers {
  backupUIController: BackupUIController
  restoreUIController: RestoreUIController
  backupInspector: BackupInspector
}

async function pickBackupFile(event: IpcMainInvokeEvent): Promise<PickBackupResult> {
  const parentWindow = BrowserWindow.fromWebContents(event.sender)
  const options: Electron.OpenDialogOptions = {
    title: 'Pilih File Backup',
    properties: ['openFile'],
    filters: [{ name: 'Backup Aplikasi Perpustakaan', extensions: ['apbackup'] }],
  }
  const { canceled, filePaths } = parentWindow
    ? await dialog.showOpenDialog(parentWindow, options)
    : await dialog.showOpenDialog(options)
  if (canceled || filePaths.length === 0) {
    return { canceled: true }
  }
  return { canceled: false, filePath: filePaths[0] }
}

export function registerBackupUIHandlers(services: BackupUIHandlers): void {
  ipcMain.handle('backupUI:getTargetInfo', () => services.backupUIController.getTargetInfo())

  ipcMain.handle('backupUI:openFolder', async (): Promise<OpenFolderResult> => {
    const { backupDir } = services.backupUIController.getTargetInfo()
    try {
      const result = await shell.openPath(backupDir)
      return result.length === 0 ? { ok: true } : { ok: false, message: result }
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      }
    }
  })

  ipcMain.handle('backupUI:run', async (event) =>
    services.backupUIController.run({
      appVersion: app.getVersion(),
      appName: app.getName(),
      onProgress: (progress) => event.sender.send('backupUI:progress', progress),
    })
  )

  ipcMain.handle('restoreUI:pickBackup', (event) => pickBackupFile(event))

  ipcMain.handle('restoreUI:inspect', async (_event, filePath: string) =>
    services.backupInspector.inspect(filePath)
  )

  ipcMain.handle('restoreUI:run', async (event, filePath: string) =>
    services.restoreUIController.run({
      backupFilePath: filePath,
      onProgress: (progress) => event.sender.send('restoreUI:progress', progress),
    })
  )
}
