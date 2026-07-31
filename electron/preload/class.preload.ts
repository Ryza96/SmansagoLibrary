import { ipcRenderer } from 'electron'

export const classAPI = {
  classes: {
    findMany: (search?: string, page?: number, limit?: number) =>
      ipcRenderer.invoke('classes:findMany', search, page, limit),
    findById: (id: string) =>
      ipcRenderer.invoke('classes:findById', id),
    create: (input: Record<string, unknown>) =>
      ipcRenderer.invoke('classes:create', input),
    update: (id: string, input: Record<string, unknown>) =>
      ipcRenderer.invoke('classes:update', id, input),
    delete: (id: string) =>
      ipcRenderer.invoke('classes:delete', id)
  }
}
