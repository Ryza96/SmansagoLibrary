import { ipcRenderer } from 'electron'

export const memberAPI = {
  members: {
    findMany: (search?: string, page?: number, limit?: number, memberType?: string) =>
      ipcRenderer.invoke('members:findMany', search, page, limit, memberType),
    findById: (id: string) =>
      ipcRenderer.invoke('members:findById', id),
    create: (input: Record<string, unknown>) =>
      ipcRenderer.invoke('members:create', input),
    update: (id: string, input: Record<string, unknown>) =>
      ipcRenderer.invoke('members:update', id, input),
    delete: (id: string) =>
      ipcRenderer.invoke('members:delete', id)
  },
  memberImport: {
    downloadTemplate: () => ipcRenderer.invoke('members:downloadTemplate'),
  },
}
