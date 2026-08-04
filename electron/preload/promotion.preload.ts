import { ipcRenderer } from 'electron'

export const promotionAPI = {
  promotions: {
    findMany: (page?: number, limit?: number) =>
      ipcRenderer.invoke('promotions:findMany', page, limit),
    findById: (id: string) =>
      ipcRenderer.invoke('promotions:findById', id)
  }
}
