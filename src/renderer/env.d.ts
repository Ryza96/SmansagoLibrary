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
    findMany: () => Promise<import('../types/dtos/book').BookListItemDTO[]>
    findById: (id: string) => Promise<import('../types/dtos/book').BookDetailDTO | null>
    create: (input: import('../types/dtos/book').CreateBookDTO) => Promise<import('../types/dtos/book').BookDetailDTO>
    update: (id: string, input: import('../types/dtos/book').UpdateBookDTO) => Promise<import('../types/dtos/book').BookDetailDTO | null>
    delete: (id: string) => Promise<boolean>
  }
  authors: {
    findMany: (query?: import('../types/dtos/master').FindAuthorsQueryDTO) => Promise<import('../types/dtos/master').AuthorDTO[]>
    findById: (id: string) => Promise<import('../types/dtos/master').AuthorDTO | null>
    create: (input: import('../types/dtos/master').CreateAuthorDTO) => Promise<import('../types/dtos/master').AuthorDTO>
    update: (id: string, input: import('../types/dtos/master').UpdateAuthorDTO) => Promise<import('../types/dtos/master').AuthorDTO>
    delete: (id: string) => Promise<void>
  }
  publishers: {
    findMany: (query?: import('../types/dtos/master').FindPublishersQueryDTO) => Promise<import('../types/dtos/master').PublisherDTO[]>
    findById: (id: string) => Promise<import('../types/dtos/master').PublisherDTO | null>
    create: (input: import('../types/dtos/master').CreatePublisherDTO) => Promise<import('../types/dtos/master').PublisherDTO>
    update: (id: string, input: import('../types/dtos/master').UpdatePublisherDTO) => Promise<import('../types/dtos/master').PublisherDTO>
    delete: (id: string) => Promise<void>
  }
  categories: {
    findMany: (query?: import('../types/dtos/master').FindCategoriesQueryDTO) => Promise<import('../types/dtos/master').CategoryDTO[]>
    findById: (id: string) => Promise<import('../types/dtos/master').CategoryDTO | null>
    create: (input: import('../types/dtos/master').CreateCategoryDTO) => Promise<import('../types/dtos/master').CategoryDTO>
    update: (id: string, input: import('../types/dtos/master').UpdateCategoryDTO) => Promise<import('../types/dtos/master').CategoryDTO>
    delete: (id: string) => Promise<void>
  }
  bookCopies: {
    findByBarcode: (barcode: string) => Promise<{
      id: string
      barcode: string | null
      inventoryNumber: string
      status: string
      book: { title: string } | null
    } | null>,
    findById: (id: string) => Promise<{
      id: string
      inventoryNumber: string
      barcode: string | null
      shelfLocation: string | null
      condition: string
      status: string
      acquisitionDate: string | null
      acquisitionSource: string | null
      acquisitionCost: number | null
      acquisitionSourceDetail: string | null
      acquisitionNotes: string | null
      notes: string | null
      createdAt: string
      updatedAt: string
      book: {
        title: string
        isbn: string | null
        publicationYear: number | null
        description: string | null
        author: { id: string; name: string } | null
        publisher: { id: string; name: string } | null
        category: { id: string; name: string } | null
      } | null
    } | null>,
    findByBookId: (bookId: string) => Promise<import('../types/dtos/book').BookCopyDTO[]>,
    addCopies: (bookId: string, input: import('../types/dtos/book').CreateBookCopiesDTO) => Promise<import('../types/dtos/book').BookCopyDTO[]>,
    decommissionCopy: (id: string) => Promise<void>
  }
  members: {
    findMany: (search?: string, page?: number, limit?: number, memberType?: string) => Promise<{
      data: import('../../src/shared/dto/member').MemberDTO[]
      total: number
      page: number
      limit: number
      totalPages: number
    }>
    findById: (id: string) => Promise<import('../../src/shared/dto/member').MemberDTO>
    create: (input: import('../../src/shared/dto/member').CreateMemberDTO) => Promise<import('../../src/shared/dto/member').MemberDTO>
    update: (id: string, input: import('../../src/shared/dto/member').UpdateMemberDTO) => Promise<import('../../src/shared/dto/member').MemberDTO>
    delete: (id: string) => Promise<void>
  }
  memberImport: {
    downloadTemplate: () => Promise<import('../types/import').DownloadTemplateResult>,
    previewCheck: (rows: import('../../src/shared/dto/member').MemberImportRowInput[]) => Promise<import('../../src/shared/dto/member').MemberImportPreviewDTO>,
    import: (rows: import('../../src/shared/dto/member').MemberImportRowInput[]) => Promise<import('../../src/shared/dto/member').MemberImportResultDTO>,
    onProgress: (callback: (event: import('../../src/shared/dto/member').MemberImportProgressEvent) => void) => () => void,
  }
  borrowings: {
    findMany: (search?: string, page?: number, limit?: number) => Promise<{
      data: Array<{
        id: string
        borrowingNumber: string
        memberName: string
        memberNumber: string
        borrowDate: string
        dueDate: string
        status: 'ACTIVE' | 'COMPLETED'
        totalItems: number
      }>
      total: number
      page: number
      limit: number
      totalPages: number
    }>,
    findById: (id: string) => Promise<import('../types/dtos/borrowing').BorrowingDTO>
    create: (input: import('../types/dtos/borrowing').CreateBorrowingInput) => Promise<import('../types/dtos/borrowing').BorrowingDTO>
    getMemberBorrowingStats: (memberId: string) => Promise<{ activeBookCount: number; nearestDueDate: string | null }>
  }
  returns: {
    findByBarcode: (barcode: string) => Promise<import('../types/dtos/borrowing').BorrowingByBarcodeResult>
    returnBook: (input: import('../types/dtos/borrowing').ReturnBookInput) => Promise<import('../types/dtos/borrowing').BorrowingDTO>
  }
  print: {
    getLabelPreviewHtml: (input: import('../../src/shared/dto/print').BookLabelData) => Promise<string>
    borrowReceipt: (borrowingId: string) => Promise<void>
    returnReceipt: (borrowingId: string) => Promise<void>
    bookLabels: (input: import('../../src/shared/dto/print').BookLabelData) => Promise<void>
  }
  academicYears: {
    findMany: (search?: string, page?: number, limit?: number) => Promise<{
      data: import('../../src/shared/dto/academic').AcademicYearDTO[]
      total: number
      page: number
      limit: number
      totalPages: number
    }>
    findById: (id: string) => Promise<import('../../src/shared/dto/academic').AcademicYearDTO>
    create: (input: import('../../src/shared/dto/academic').CreateAcademicYearDTO) => Promise<import('../../src/shared/dto/academic').AcademicYearDTO>
    update: (id: string, input: import('../../src/shared/dto/academic').UpdateAcademicYearDTO) => Promise<import('../../src/shared/dto/academic').AcademicYearDTO>
    delete: (id: string) => Promise<void>
    activate: (id: string) => Promise<import('../../src/shared/dto/academic').AcademicYearDTO>
    deactivate: (id: string) => Promise<import('../../src/shared/dto/academic').AcademicYearDTO>
  }
  curricula: {
    findMany: (search?: string, page?: number, limit?: number) => Promise<{
      data: import('../../src/shared/dto/academic').CurriculumDTO[]
      total: number
      page: number
      limit: number
      totalPages: number
    }>
    findById: (id: string) => Promise<import('../../src/shared/dto/academic').CurriculumDTO>
    create: (input: import('../../src/shared/dto/academic').CreateCurriculumDTO) => Promise<import('../../src/shared/dto/academic').CurriculumDTO>
    update: (id: string, input: import('../../src/shared/dto/academic').UpdateCurriculumDTO) => Promise<import('../../src/shared/dto/academic').CurriculumDTO>
    delete: (id: string) => Promise<void>
  }
  classes: {
    findMany: (search?: string, page?: number, limit?: number) => Promise<{
      data: import('../../src/shared/dto/academic').ClassDTO[]
      total: number
      page: number
      limit: number
      totalPages: number
    }>
    findById: (id: string) => Promise<import('../../src/shared/dto/academic').ClassDTO>
    create: (input: import('../../src/shared/dto/academic').CreateClassDTO) => Promise<import('../../src/shared/dto/academic').ClassDTO>
    update: (id: string, input: import('../../src/shared/dto/academic').UpdateClassDTO) => Promise<import('../../src/shared/dto/academic').ClassDTO>
    delete: (id: string) => Promise<void>
    cloneToYear: (sourceAcademicYearId: string, targetAcademicYearId: string) => Promise<import('../../src/shared/dto/academic').CloneClassResult>
  }
  inventory: {
    findMany: (params: {
      page?: number
      pageSize?: number
      search?: string
      status?: string
      condition?: string
      sortBy?: string
      sortDirection?: 'asc' | 'desc'
    }) => Promise<{
      items: Record<string, unknown>[]
      total: number
      page: number
      pageSize: number
      totalPages: number
    }>
    count: () => Promise<number>
  }
  assetEvents: {
    findByBookCopyId: (bookCopyId: string) => Promise<Array<{
      id: string
      eventType: string
      actorType: string
      actorId: string | null
      metadata: Record<string, unknown> | string | null
      notes: string | null
      occurredAt: string
    }>>
  }
  imports: {
    match: (canonicalRows: import('../types/import').CanonicalRow[]) => Promise<import('../types/import').MatchedWorkbook>,
    downloadTemplate: () => Promise<import('../types/import').DownloadTemplateResult>,
  }
  settings: {
    get: () => Promise<{
      id: string
      libraryName: string
      schoolName: string
      address: string
      phone: string
      email: string
      website: string
      logoPath: string
      principalName: string
      principalNip: string
      librarianName: string
      librarianNip: string
      defaultBorrowDays: number
      maxBorrowBooks: number
      lateFee: number
      allowRenewal: boolean
      inventoryPrefix: string
      defaultShelfLocation: string
      barcodeFormat: string
      reportPaperSize: string
      reportDateFormat: string
      reportSigner: string
      createdAt: string
      updatedAt: string
    }>
    update: (data: Record<string, unknown>) => Promise<{
      id: string
      libraryName: string
      schoolName: string
      address: string
      phone: string
      email: string
      website: string
      logoPath: string
      principalName: string
      principalNip: string
      librarianName: string
      librarianNip: string
      defaultBorrowDays: number
      maxBorrowBooks: number
      lateFee: number
      allowRenewal: boolean
      inventoryPrefix: string
      defaultShelfLocation: string
      barcodeFormat: string
      reportPaperSize: string
      reportDateFormat: string
      reportSigner: string
      createdAt: string
      updatedAt: string
    }>
  }
  platform: string
}

interface Window {
  electronAPI: ElectronAPI
}
