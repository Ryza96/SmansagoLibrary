import { BookCopyRepository as NewBookCopyRepository } from '../../../src/main/repositories/book-copy.repository'

export interface InventoryFindManyParams {
  page?: number
  pageSize?: number
  search?: string
  status?: string
  condition?: string
  sortBy?: string
  sortDirection?: 'asc' | 'desc'
}

export interface InventoryFindManyResult {
  items: Array<Record<string, unknown>>
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export class InventoryService {
  constructor(private bookCopyRepository: NewBookCopyRepository) {}

  async findMany(params: InventoryFindManyParams): Promise<InventoryFindManyResult> {
    const page = Math.max(1, params.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 10))

    const where: Record<string, unknown> = {}
    if (params.status) {
      where.status = params.status
    }
    if (params.condition) {
      where.condition = params.condition
    }

    const sortBy = params.sortBy ?? 'inventoryNumber'
    const sortDirection = params.sortDirection === 'desc' ? 'desc' : 'asc'

    const result = await this.bookCopyRepository.findMany({
      pagination: { page, limit: pageSize },
      search: params.search,
      where: Object.keys(where).length > 0 ? where : undefined,
      sort: { [sortBy]: sortDirection }
    })

    return {
      items: result.data,
      total: result.total,
      page: result.page,
      pageSize: result.limit,
      totalPages: result.totalPages
    }
  }

  async count(): Promise<number> {
    return this.bookCopyRepository.count()
  }
}
