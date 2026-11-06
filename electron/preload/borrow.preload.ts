import { ipcRenderer } from 'electron'
import type {
  BatchReturnInput,
  CreateBorrowingInput,
  ReturnBookInput
} from '../../src/shared/dto/borrowing'
import type {
  CreateCollectiveBorrowingInput,
  OutstandingCopiesResultDTO,
  CollectivePreviewDTO,
  PreviewCollectiveBorrowingInput
} from '../../src/shared/dto/collective-borrow'

export const borrowAPI = {
  borrowings: {
    findMany: (search?: string, page?: number, limit?: number) => ipcRenderer.invoke('borrowings:findMany', search, page, limit),
    findById: (id: string) => ipcRenderer.invoke('borrowings:findById', id),
    create: (input: CreateBorrowingInput) => ipcRenderer.invoke('borrowings:create', input),
    getMemberBorrowingStats: (memberId: string) => ipcRenderer.invoke('borrowings:getMemberBorrowingStats', memberId),
    previewCollective: (input: PreviewCollectiveBorrowingInput): Promise<CollectivePreviewDTO> =>
      ipcRenderer.invoke('borrowings:previewCollective', input),
    createCollective: (input: CreateCollectiveBorrowingInput) => ipcRenderer.invoke('borrowings:createCollective', input),
    outstandingCopies: (borrowingId: string): Promise<OutstandingCopiesResultDTO> =>
      ipcRenderer.invoke('borrowings:outstandingCopies', borrowingId)
  },
  returns: {
    findByBarcode: (barcode: string) => ipcRenderer.invoke('returns:findByBarcode', barcode),
    returnBook: (input: ReturnBookInput) => ipcRenderer.invoke('returns:returnBook', input),
    findByBorrowNumber: (borrowNumber: string) => ipcRenderer.invoke('returns:findByBorrowNumber', borrowNumber),
    batchReturn: (input: BatchReturnInput) => ipcRenderer.invoke('returns:batchReturn', input)
  }
}
