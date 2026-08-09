import { ipcRenderer } from 'electron'

export const settingAPI = {
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (data: Record<string, unknown>) => ipcRenderer.invoke('settings:update', data),
    pickLogo: () => ipcRenderer.invoke('settings:pickLogo'),
    resetDatabase: () => ipcRenderer.invoke('settings:resetDatabase'),
    listPrinters: () => ipcRenderer.invoke('settings:listPrinters')
  }
}
