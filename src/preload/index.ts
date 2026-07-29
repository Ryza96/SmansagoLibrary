import { contextBridge, ipcRenderer } from 'electron'

const electronAPI = {
  db: {
    ping: () => ipcRenderer.invoke('db:ping')
  },
  app: {
    info: () => ipcRenderer.invoke('app:info')
  },
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close')
  },
  books: {
    findMany: () => ipcRenderer.invoke('books:findMany'),
    findById: (id: string) => ipcRenderer.invoke('books:findById', id),
    create: (input: any) => ipcRenderer.invoke('books:create', input),
    update: (id: string, input: any) => ipcRenderer.invoke('books:update', id, input),
    delete: (id: string) => ipcRenderer.invoke('books:delete', id)
  },
  authors: {
    findMany: (query?: any) => ipcRenderer.invoke('authors:findMany', query),
    findById: (id: string) => ipcRenderer.invoke('authors:findById', id),
    create: (input: any) => ipcRenderer.invoke('authors:create', input),
    update: (id: string, input: any) => ipcRenderer.invoke('authors:update', id, input),
    delete: (id: string) => ipcRenderer.invoke('authors:delete', id)
  },
  publishers: {
    findMany: (query?: any) => ipcRenderer.invoke('publishers:findMany', query),
    findById: (id: string) => ipcRenderer.invoke('publishers:findById', id),
    create: (input: any) => ipcRenderer.invoke('publishers:create', input),
    update: (id: string, input: any) => ipcRenderer.invoke('publishers:update', id, input),
    delete: (id: string) => ipcRenderer.invoke('publishers:delete', id)
  },
  categories: {
    findMany: (query?: any) => ipcRenderer.invoke('categories:findMany', query),
    findById: (id: string) => ipcRenderer.invoke('categories:findById', id),
    create: (input: any) => ipcRenderer.invoke('categories:create', input),
    update: (id: string, input: any) => ipcRenderer.invoke('categories:update', id, input),
    delete: (id: string) => ipcRenderer.invoke('categories:delete', id)
  },
  bookCopies: {
    findByBarcode: (barcode: string) => ipcRenderer.invoke('bookCopies:findByBarcode', barcode)
  },
  members: {
    search: (query: string) => ipcRenderer.invoke('members:search', query),
    findById: (id: string) => ipcRenderer.invoke('members:findById', id)
  },
  borrowings: {
    create: (input: any) => ipcRenderer.invoke('borrowings:create', input),
    getMemberBorrowingStats: (memberId: string) => ipcRenderer.invoke('borrowings:getMemberBorrowingStats', memberId)
  },
  returns: {
    findByBarcode: (barcode: string) => ipcRenderer.invoke('returns:findByBarcode', barcode),
    returnBook: (input: any) => ipcRenderer.invoke('returns:returnBook', input)
  },
  print: {
    borrowReceipt: (borrowingId: string) => ipcRenderer.invoke('printing:borrowReceipt', borrowingId),
    returnReceipt: (borrowingId: string) => ipcRenderer.invoke('printing:returnReceipt', borrowingId)
  },
  platform: process.platform
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
