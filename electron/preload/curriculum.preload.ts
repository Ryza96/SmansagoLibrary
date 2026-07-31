import { ipcRenderer } from 'electron'

export const curriculumAPI = {
  curricula: {
    findMany: (search?: string, page?: number, limit?: number) =>
      ipcRenderer.invoke('curricula:findMany', search, page, limit),
    findById: (id: string) =>
      ipcRenderer.invoke('curricula:findById', id),
    create: (input: Record<string, unknown>) =>
      ipcRenderer.invoke('curricula:create', input),
    update: (id: string, input: Record<string, unknown>) =>
      ipcRenderer.invoke('curricula:update', id, input),
    delete: (id: string) =>
      ipcRenderer.invoke('curricula:delete', id)
  }
}
