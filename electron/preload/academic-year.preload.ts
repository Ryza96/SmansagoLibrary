import { ipcRenderer } from 'electron'

export const academicYearAPI = {
  academicYears: {
    findMany: (search?: string, page?: number, limit?: number) =>
      ipcRenderer.invoke('academic-years:findMany', search, page, limit),
    findById: (id: string) =>
      ipcRenderer.invoke('academic-years:findById', id),
    create: (input: Record<string, unknown>) =>
      ipcRenderer.invoke('academic-years:create', input),
    update: (id: string, input: Record<string, unknown>) =>
      ipcRenderer.invoke('academic-years:update', id, input),
    delete: (id: string) =>
      ipcRenderer.invoke('academic-years:delete', id),
    activate: (id: string) =>
      ipcRenderer.invoke('academic-years:activate', id),
    deactivate: (id: string) =>
      ipcRenderer.invoke('academic-years:deactivate', id)
  }
}
