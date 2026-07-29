import { prisma } from '../database'

export class BookCopyRepository {
  findById(id: string) {
    return prisma.bookCopy.findUnique({
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

}
