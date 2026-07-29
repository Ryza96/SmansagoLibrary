export interface BookListItemDTO {
  id: string
  title: string
  isbn: string | null
  categoryName: string | null
  publisherName: string | null
  publicationYear: number | null
  copyCount: number
}

export interface BookDetailDTO {
  id: string
  title: string
  isbn: string | null
  category: { id: string; name: string } | null
  publisher: { id: string; name: string } | null
  publicationYear: number | null
  edition: string | null
  language: string | null
  pageCount: number | null
  description: string | null
  coverImage: string | null
  authors: { id: string; name: string }[]
  copies: { id: string; inventoryNumber: string; status: string }[]
  createdAt: string
  updatedAt: string
}

export interface CreateBookDTO {
  title: string
  isbn?: string
  categoryId?: string
  publisherId?: string
  publicationYear?: number
  edition?: string
  language?: string
  pageCount?: number
  description?: string
  authorIds: string[]
}

export interface UpdateBookDTO {
  title?: string
  isbn?: string
  categoryId?: string | null
  publisherId?: string | null
  publicationYear?: number | null
  edition?: string
  language?: string
  pageCount?: number | null
  description?: string
  authorIds?: string[]
}

export interface SelectOption {
  id: string
  name: string
}
