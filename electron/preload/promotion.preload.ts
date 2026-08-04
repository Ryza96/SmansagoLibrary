import { ipcRenderer } from 'electron'
import type { AutomaticPromotionPreviewInput, AutomaticPromotionExecuteInput } from '../../src/shared/dto/promotion'

export const promotionAPI = {
  promotions: {
    findMany: (page?: number, limit?: number) =>
      ipcRenderer.invoke('promotions:findMany', page, limit),
    findById: (id: string) =>
      ipcRenderer.invoke('promotions:findById', id),
    preview: (input: AutomaticPromotionPreviewInput) =>
      ipcRenderer.invoke('promotions:preview', input),
    execute: (input: AutomaticPromotionExecuteInput) =>
      ipcRenderer.invoke('promotions:execute', input)
  }
}
