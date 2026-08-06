// WO-6 — Backup & Restore UI preload (channel client-side).
// Satu-satunya pintu renderer ke engine via controller (backup-ui.ipc.ts).
// onProgress mengikuti pola member import (subscribe/unsubscribe).

import { ipcRenderer } from 'electron'
import type {
  BackupUIProgressEvent,
  RestoreUIProgressEvent,
} from '../../src/shared/dto/backup-ui'

export const backupUIAPI = {
  backupUI: {
    getTargetInfo: () => ipcRenderer.invoke('backupUI:getTargetInfo'),
    openFolder: () => ipcRenderer.invoke('backupUI:openFolder'),
    run: () => ipcRenderer.invoke('backupUI:run'),
    onProgress: (callback: (event: BackupUIProgressEvent) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, progress: BackupUIProgressEvent) =>
        callback(progress)
      ipcRenderer.on('backupUI:progress', listener)
      return () => ipcRenderer.removeListener('backupUI:progress', listener)
    },
  },
  restoreUI: {
    pickBackup: () => ipcRenderer.invoke('restoreUI:pickBackup'),
    inspect: (filePath: string) => ipcRenderer.invoke('restoreUI:inspect', filePath),
    run: (filePath: string) => ipcRenderer.invoke('restoreUI:run', filePath),
    onProgress: (callback: (event: RestoreUIProgressEvent) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, progress: RestoreUIProgressEvent) =>
        callback(progress)
      ipcRenderer.on('restoreUI:progress', listener)
      return () => ipcRenderer.removeListener('restoreUI:progress', listener)
    },
  },
}
