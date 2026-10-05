import { ipcRenderer } from 'electron'
import type { FineListFilter } from '../../src/shared/dto/fine'

export const fineAPI = {
  fines: {
    list: (filter?: FineListFilter) => ipcRenderer.invoke('fines:list', filter),
    markPaid: (id: string) => ipcRenderer.invoke('fines:markPaid', id),
    waive: (id: string, reason: string) => ipcRenderer.invoke('fines:waive', id, reason)
  }
}
