import { ipcRenderer } from 'electron'
import type { CreateBookDTO, UpdateBookDTO } from '../../src/shared/dto/book'

export const bookAPI = {
  books: {
    findMany: () => ipcRenderer.invoke('books:findMany'),
    findById: (id: string) => ipcRenderer.invoke('books:findById', id),
    create: (input: CreateBookDTO) => ipcRenderer.invoke('books:create', input),
    update: (id: string, input: UpdateBookDTO) => ipcRenderer.invoke('books:update', id, input),
    delete: (id: string) => ipcRenderer.invoke('books:delete', id)
  }
}
