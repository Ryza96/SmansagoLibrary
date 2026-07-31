import { prisma } from '../database'
import { Prisma } from '@prisma/client'

interface CreateBookRepoInput {
  title: string
  isbn?: string
  categoryId?: string
  publisherId?: string
  publicationYear?: number
  description?: string
  authorIds: string[]
}

export class BookRepository {
  findManyWithCount() {
    return prisma.book.findMany({
      include: {
        category: { select: { name: true } },
        publisher: { select: { name: true } },
        _count: { select: { bookCopies: true } }
      },
      orderBy: { createdAt: 'desc' }
    })
  }

  findById(id: string) {
    return prisma.book.findUnique({ where: { id } })
  }

  findByIdWithDetails(id: string) {
    return prisma.book.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true } },
        publisher: { select: { id: true, name: true } },
        author: { select: { id: true, name: true } },
        bookCopies: {
          include: { _count: { select: { borrowDetails: true } } },
          orderBy: { inventoryNumber: 'asc' }
        }
      }
    })
  }

  createWithAuthors(input: CreateBookRepoInput) {
    const { authorIds, ...bookData } = input
    return prisma.book.create({
      data: {
        ...bookData,
        publicationYear: bookData.publicationYear ?? undefined,
        authorId: authorIds.length > 0 ? authorIds[0] : undefined
      }
    })
  }

  replaceAuthors(bookId: string, authorIds: string[]) {
    return prisma.book.update({
      where: { id: bookId },
      data: {
        author: authorIds.length > 0
          ? { connect: { id: authorIds[0] } }
          : { disconnect: true }
      }
    })
  }

  updateBook(id: string, data: Prisma.BookUpdateInput) {
    return prisma.book.update({ where: { id }, data })
  }

  deleteWithAuthors(id: string) {
    return prisma.book.delete({ where: { id } })
  }

  async countCopies(id: string): Promise<number> {
    return prisma.bookCopy.count({ where: { bookId: id } })
  }

  async existsByIsbn(isbn: string, excludeId?: string): Promise<boolean> {
    const count = await prisma.book.count({
      where: {
        isbn,
        ...(excludeId ? { id: { not: excludeId } } : {})
      }
    })
    return count > 0
  }

  async existsByAuthorId(authorId: string): Promise<boolean> {
    const count = await prisma.book.count({ where: { authorId } })
    return count > 0
  }

  async existsByPublisherId(publisherId: string): Promise<boolean> {
    const count = await prisma.book.count({ where: { publisherId } })
    return count > 0
  }

  async existsByCategoryId(categoryId: string): Promise<boolean> {
    const count = await prisma.book.count({ where: { categoryId } })
    return count > 0
  }
}
