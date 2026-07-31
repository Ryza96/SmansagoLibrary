import { ipcRenderer } from 'electron'

export const inventoryAPI = {
  inventory: {
    findMany: (params: Record<string, unknown>) =>
      ipcRenderer.invoke('inventory:findMany', params),
    count: () =>
      ipcRenderer.invoke('inventory:count')
  }
}
