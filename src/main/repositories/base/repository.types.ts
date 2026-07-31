export interface PaginationOptions {
  page?: number
  limit?: number
}

export interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export type SortDirection = 'asc' | 'desc'

export interface FindOptions {
  pagination?: PaginationOptions
  sort?: Record<string, SortDirection>
  search?: string
  memberType?: string
  where?: Record<string, unknown>
}
