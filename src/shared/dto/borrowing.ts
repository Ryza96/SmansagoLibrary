export interface BorrowingItemDetailDTO {
  id: string
  bookCopyId: string
  status: string
  returnedAt: string | null
  condition: string | null
  fine: number | null
  notes: string | null
  bookTitle: string
  barcode: string | null
  inventoryNumber: string
}

export interface BorrowingDTO {
  id: string
  borrowingNumber: string
  memberId: string
  memberName: string
  memberNumber: string
  borrowDate: string
  dueDate: string
  status: string
  notes: string | null
  totalItems: number
  items: BorrowingItemDetailDTO[]
  createdAt: string
  updatedAt: string
}

export interface BorrowingListItemDTO {
  id: string
  borrowingNumber: string
  memberName: string
  memberNumber: string
  borrowDate: string
  dueDate: string
  status: string
  totalItems: number
}

export interface CreateBorrowingInput {
  memberId: string
  dueDate: string
  bookCopyIds: string[]
  notes?: string
}

export interface ReturnDTO {
  id: string
  borrowingId: string
  returnDate: string
  processedBy: string | null
  notes: string | null
  createdAt: string
}

export type ReturnCondition = 'BAIK' | 'RUSAK' | 'HILANG'

export interface ReturnBookInput {
  bookCopyId: string
  condition: ReturnCondition
  notes?: string
}

export interface BorrowingByBarcodeResult {
  bookCopyId: string
  barcode: string
  inventoryNumber: string
  bookTitle: string
  borrowingId: string
  borrowingNumber: string
  memberId: string
  memberName: string
  memberNumber: string
  borrowDate: string
  dueDate: string
}

// --- Batch Return (WO Return Flow Redesign) ---

/** A single book selected for return within a batch */
export interface BatchReturnBookItem {
  /** BorrowDetail.id */
  borrowDetailId: string
  /** Condition when returned */
  condition: ReturnCondition
}

/** Input for batch return — one or more books from the same transaction */
export interface BatchReturnInput {
  /** ID of the Borrow record */
  borrowingId: string
  /** Books to return in this batch */
  books: BatchReturnBookItem[]
}

/** Result of a successful batch return — full updated Borrow with all details */
export interface BatchReturnResult {
  borrowing: BorrowingDTO
  returnedCount: number
  stillBorrowedCount: number
  /** Books returned in THIS batch — for event-scoped receipt rendering */
  returnedBooks: Array<{
    borrowDetailId: string
    bookTitle: string
    inventoryNumber: string
    condition: string
  }>
}
