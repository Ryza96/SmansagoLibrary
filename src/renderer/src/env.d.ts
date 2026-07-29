/// <reference types="vite/client" />

interface ElectronAPI {
  db: {
    ping: () => Promise<{ ok: boolean; message: string }>
  }
  app: {
    info: () => Promise<{
      version: string
      name: string
      platform: string
      electronVersion: string
      nodeVersion: string
    }>
  }
  window: {
    minimize: () => Promise<void>
    maximize: () => Promise<void>
    close: () => Promise<void>
  }
  books: {
    findMany: () => Promise<import('./types/dtos/book').BookListItemDTO[]>
    findById: (id: string) => Promise<import('./types/dtos/book').BookDetailDTO | null>
    create: (input: import('./types/dtos/book').CreateBookDTO) => Promise<import('./types/dtos/book').BookDetailDTO>
    update: (id: string, input: import('./types/dtos/book').UpdateBookDTO) => Promise<import('./types/dtos/book').BookDetailDTO | null>
    delete: (id: string) => Promise<boolean>
  }
  authors: {
    findMany: (query?: import('./types/dtos/master').FindAuthorsQueryDTO) => Promise<import('./types/dtos/master').AuthorDTO[]>
    findById: (id: string) => Promise<import('./types/dtos/master').AuthorDTO | null>
    create: (input: import('./types/dtos/master').CreateAuthorDTO) => Promise<import('./types/dtos/master').AuthorDTO>
    update: (id: string, input: import('./types/dtos/master').UpdateAuthorDTO) => Promise<import('./types/dtos/master').AuthorDTO>
    delete: (id: string) => Promise<void>
  }
  publishers: {
    findMany: (query?: import('./types/dtos/master').FindPublishersQueryDTO) => Promise<import('./types/dtos/master').PublisherDTO[]>
    findById: (id: string) => Promise<import('./types/dtos/master').PublisherDTO | null>
    create: (input: import('./types/dtos/master').CreatePublisherDTO) => Promise<import('./types/dtos/master').PublisherDTO>
    update: (id: string, input: import('./types/dtos/master').UpdatePublisherDTO) => Promise<import('./types/dtos/master').PublisherDTO>
    delete: (id: string) => Promise<void>
  }
  categories: {
    findMany: (query?: import('./types/dtos/master').FindCategoriesQueryDTO) => Promise<import('./types/dtos/master').CategoryDTO[]>
    findById: (id: string) => Promise<import('./types/dtos/master').CategoryDTO | null>
    create: (input: import('./types/dtos/master').CreateCategoryDTO) => Promise<import('./types/dtos/master').CategoryDTO>
    update: (id: string, input: import('./types/dtos/master').UpdateCategoryDTO) => Promise<import('./types/dtos/master').CategoryDTO>
    delete: (id: string) => Promise<void>
  }
  bookCopies: {
    findByBarcode: (barcode: string) => Promise<{
      id: string
      barcode: string | null
      inventoryNumber: string
      status: string
      book: { title: string } | null
    } | null>
  }
  members: {
    search: (query: string) => Promise<import('./types/dtos/member').MemberDTO[]>
    findById: (id: string) => Promise<import('./types/dtos/member').MemberDTO>
  }
  borrowings: {
    create: (input: import('./types/dtos/borrowing').CreateBorrowingInput) => Promise<import('./types/dtos/borrowing').BorrowingDTO>
    getMemberBorrowingStats: (memberId: string) => Promise<{ activeBookCount: number; nearestDueDate: string | null }>
  }
  returns: {
    findByBarcode: (barcode: string) => Promise<import('./types/dtos/borrowing').BorrowingByBarcodeResult>
    returnBook: (input: import('./types/dtos/borrowing').ReturnBookInput) => Promise<import('./types/dtos/borrowing').BorrowingDTO>
  }
  print: {
    borrowReceipt: (borrowingId: string) => Promise<void>
    returnReceipt: (borrowingId: string) => Promise<void>
  }
  platform: string
}

interface Window {
  electronAPI: ElectronAPI
}
