import { ipcRenderer } from 'electron'
import type { CreateBookCopiesDTO } from '../../src/shared/dto/book'

export const bookCopyAPI = {
  bookCopies: {
    findByBarcode: (barcode: string) => ipcRenderer.invoke('bookCopies:findByBarcode', barcode),
    findById: (id: string) => ipcRenderer.invoke('bookCopies:findById', id),
    findByBookId: (bookId: string) => ipcRenderer.invoke('bookCopies:findByBookId', bookId),
    addCopies: (bookId: string, input: CreateBookCopiesDTO) => ipcRenderer.invoke('bookCopies:addCopies', bookId, input),
    decommissionCopy: (id: string) => ipcRenderer.invoke('bookCopies:decommissionCopy', id)
  }
}
