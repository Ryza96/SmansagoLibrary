import { BookCopyRepository } from '../repositories/book-copy.repository'
import { Prisma } from '@prisma/client'
import { BookCopyStatus } from '../shared/book-copy-status'

const validStatuses = Object.values(BookCopyStatus)

export class BookCopyService {
  constructor(private repository: BookCopyRepository) {}

  getAll() {
    return this.repository.findMany()
  }

  getById(id: string) {
    return this.repository.findById(id)
  }

  getByInventoryNumber(inventoryNumber: string) {
    return this.repository.findByInventoryNumber(inventoryNumber)
  }

  getByBarcode(barcode: string) {
    return this.repository.findByBarcode(barcode)
  }

  create(data: Prisma.BookCopyCreateInput) {
    if (data.status && !validStatuses.includes(data.status as any)) {
      throw new Error(`Invalid status: ${data.status}. Must be one of: ${validStatuses.join(', ')}`)
    }
    return this.repository.create(data)
  }

  update(id: string, data: Prisma.BookCopyUpdateInput) {
    if (data.status && !validStatuses.includes(data.status as any)) {
      throw new Error(`Invalid status: ${data.status}. Must be one of: ${validStatuses.join(', ')}`)
    }
    return this.repository.update(id, data)
  }

  delete(id: string) {
    return this.repository.delete(id)
  }
}
