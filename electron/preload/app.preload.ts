import { ipcRenderer } from 'electron'

export const appAPI = {
  db: {
    ping: () => ipcRenderer.invoke('db:ping')
  },
  app: {
    info: () => ipcRenderer.invoke('app:info')
  },
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close')
  },
  platform: process.platform
}
