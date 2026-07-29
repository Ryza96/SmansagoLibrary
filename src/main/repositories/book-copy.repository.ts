import { prisma } from '../database'
import { Prisma } from '@prisma/client'

export class BookCopyRepository {
  findMany() {
    return prisma.bookCopy.findMany()
  }

  findById(id: string) {
    return prisma.bookCopy.findUnique({ where: { id } })
  }

  findByInventoryNumber(inventoryNumber: string) {
    return prisma.bookCopy.findUnique({ where: { inventoryNumber } })
  }

  findByBarcode(barcode: string) {
    return prisma.bookCopy.findUnique({ where: { barcode } })
  }

  create(data: Prisma.BookCopyCreateInput) {
    return prisma.bookCopy.create({ data })
  }

  update(id: string, data: Prisma.BookCopyUpdateInput) {
    return prisma.bookCopy.update({ where: { id }, data })
  }

  delete(id: string) {
    return prisma.bookCopy.delete({ where: { id } })
  }
}
