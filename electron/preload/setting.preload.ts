import { ipcRenderer } from 'electron'

export const settingAPI = {
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (data: Record<string, unknown>) => ipcRenderer.invoke('settings:update', data)
  }
}
