import { ipcRenderer } from 'electron'
import type { FindAuthorsQueryDTO, CreateAuthorDTO, UpdateAuthorDTO } from '../../src/shared/dto/master'

export const authorAPI = {
  authors: {
    findMany: (query?: FindAuthorsQueryDTO) => ipcRenderer.invoke('authors:findMany', query),
    findById: (id: string) => ipcRenderer.invoke('authors:findById', id),
    create: (input: CreateAuthorDTO) => ipcRenderer.invoke('authors:create', input),
    update: (id: string, input: UpdateAuthorDTO) => ipcRenderer.invoke('authors:update', id, input),
    delete: (id: string) => ipcRenderer.invoke('authors:delete', id)
  }
}
