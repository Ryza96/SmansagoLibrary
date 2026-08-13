import { ipcRenderer } from 'electron'
import type { MemberImportProgressEvent, MemberImportRowInput, MemberImportScope } from '../../src/shared/dto/member'

async function invokeClean(channel: string, ...args: unknown[]): Promise<unknown> {
  try {
    return await ipcRenderer.invoke(channel, ...args)
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err)
    const idx = raw.indexOf(': ')
    const clean = idx !== -1 ? raw.slice(idx + 2) : raw
    const marker = 'AppError: '
    const finalMsg = clean.startsWith(marker) ? clean.slice(marker.length) : clean
    throw new Error(finalMsg || raw)
  }
}

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
      ipcRenderer.invoke('members:delete', id),
    pickPhoto: () => invokeClean('members:pickPhoto'),
    getPhotoDataUri: (id: string) => invokeClean('members:getPhotoDataUri', id),
    removePhoto: (id: string) => invokeClean('members:removePhoto', id)
  },
  memberImport: {
    downloadTemplate: () => ipcRenderer.invoke('members:downloadTemplate'),
    previewCheck: (rows: MemberImportRowInput[], scope: MemberImportScope) =>
      ipcRenderer.invoke('members:previewCheck', rows, scope),
    import: (rows: MemberImportRowInput[], scope: MemberImportScope) =>
      ipcRenderer.invoke('members:import', rows, scope),
    onProgress: (callback: (event: MemberImportProgressEvent) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, progress: MemberImportProgressEvent) =>
        callback(progress)
      ipcRenderer.on('members:importProgress', listener)
      return () => ipcRenderer.removeListener('members:importProgress', listener)
    }
  },
}
