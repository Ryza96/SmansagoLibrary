import type { PaginationOptions, PaginatedResult } from './repository.types'

export function getPaginationParams(options?: PaginationOptions): { skip: number; take: number } {
  const page = Math.max(1, options?.page ?? 1)
  const limit = Math.min(100, Math.max(1, options?.limit ?? 10))
  const skip = (page - 1) * limit

  return { skip, take: limit }
}

export function toPaginatedResult<T>(
  data: T[],
  total: number,
  options?: PaginationOptions
): PaginatedResult<T> {
  const page = Math.max(1, options?.page ?? 1)
  const limit = Math.min(100, Math.max(1, options?.limit ?? 10))

  return {
    data,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit)
  }
}
