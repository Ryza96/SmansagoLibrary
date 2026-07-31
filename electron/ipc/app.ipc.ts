import { ipcMain, BrowserWindow, app } from 'electron'
import { prisma } from '../main/database'

export function registerAppHandlers(mainWindow: () => BrowserWindow | null): void {
  ipcMain.handle('db:ping', async () => {
    try {
      await prisma.$queryRaw`SELECT 1`
      return { ok: true, message: 'Database connection is healthy' }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return { ok: false, message }
    }
  })

  ipcMain.handle('app:info', async () => {
    return {
      version: app.getVersion(),
      name: app.getName(),
      platform: process.platform,
      electronVersion: process.versions.electron,
      nodeVersion: process.versions.node
    }
  })

  ipcMain.handle('window:minimize', () => mainWindow()?.minimize())
  ipcMain.handle('window:maximize', () => {
    const win = mainWindow()
    if (win?.isMaximized()) win.unmaximize()
    else win?.maximize()
  })
  ipcMain.handle('window:close', () => mainWindow()?.close())
}
