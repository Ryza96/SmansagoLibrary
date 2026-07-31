import { ipcRenderer } from 'electron'
import type { FindPublishersQueryDTO, CreatePublisherDTO, UpdatePublisherDTO } from '../../src/shared/dto/master'

export const publisherAPI = {
  publishers: {
    findMany: (query?: FindPublishersQueryDTO) => ipcRenderer.invoke('publishers:findMany', query),
    findById: (id: string) => ipcRenderer.invoke('publishers:findById', id),
    create: (input: CreatePublisherDTO) => ipcRenderer.invoke('publishers:create', input),
    update: (id: string, input: UpdatePublisherDTO) => ipcRenderer.invoke('publishers:update', id, input),
    delete: (id: string) => ipcRenderer.invoke('publishers:delete', id)
  }
}
