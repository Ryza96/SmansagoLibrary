import { ipcRenderer } from 'electron'
import type { CreateBorrowingInput, ReturnBookInput } from '../../src/shared/dto/borrowing'

export const borrowAPI = {
  borrowings: {
    findMany: (search?: string, page?: number, limit?: number) => ipcRenderer.invoke('borrowings:findMany', search, page, limit),
    findById: (id: string) => ipcRenderer.invoke('borrowings:findById', id),
    create: (input: CreateBorrowingInput) => ipcRenderer.invoke('borrowings:create', input),
    getMemberBorrowingStats: (memberId: string) => ipcRenderer.invoke('borrowings:getMemberBorrowingStats', memberId)
  },
  returns: {
    findByBarcode: (barcode: string) => ipcRenderer.invoke('returns:findByBarcode', barcode),
    returnBook: (input: ReturnBookInput) => ipcRenderer.invoke('returns:returnBook', input)
  }
}
