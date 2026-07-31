import { prisma } from '../database'
import { Prisma } from '@prisma/client'

export class BookCopyRepository {
  findById(id: string) {
    return prisma.bookCopy.findUnique({
      where: { id },
      include: {
        book: { select: { title: true } },
        _count: { select: { borrowDetails: true } }
      }
    })
  }

  findByIdWithBookDetails(id: string) {
    return prisma.bookCopy.findUnique({
      where: { id },
      include: {
        book: {
          include: {
            author: { select: { id: true, name: true } },
            publisher: { select: { id: true, name: true } },
            category: { select: { id: true, name: true } }
          }
        }
      }
    })
  }

  findByIdWithTx(tx: Prisma.TransactionClient, id: string) {
    return tx.bookCopy.findUnique({
      where: { id },
      include: { book: { select: { title: true } } }
    })
  }

  findByBarcodeWithBook(barcode: string) {
    return prisma.bookCopy.findUnique({
      where: { barcode },
      include: { book: { select: { title: true } } }
    })
  }

  findManyByBookId(bookId: string) {
    return prisma.bookCopy.findMany({
      where: { bookId },
      include: { _count: { select: { borrowDetails: true } } },
      orderBy: { inventoryNumber: 'asc' }
    })
  }

  createMany(data: Prisma.BookCopyCreateManyInput[]) {
    return prisma.bookCopy.createMany({ data })
  }

  createManyWithTx(tx: Prisma.TransactionClient, data: Prisma.BookCopyCreateManyInput[]) {
    return tx.bookCopy.createMany({ data })
  }

  updateStatus(tx: Prisma.TransactionClient | typeof prisma, id: string, status: string) {
    return (tx as any).bookCopy.update({
      where: { id },
      data: { status }
    })
  }

  updateCondition(tx: Prisma.TransactionClient | typeof prisma, id: string, condition: string) {
    return (tx as any).bookCopy.update({
      where: { id },
      data: { condition }
    })
  }

  countByBookId(bookId: string) {
    return prisma.bookCopy.count({ where: { bookId } })
  }

  deleteById(id: string) {
    return prisma.bookCopy.delete({ where: { id } })
  }
}
