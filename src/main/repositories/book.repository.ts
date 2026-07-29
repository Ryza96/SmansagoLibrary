import { prisma } from '../database'
import { Prisma } from '@prisma/client'

interface CreateBookRepoInput {
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

export class BookRepository {
  findMany() {
    return prisma.book.findMany()
  }

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
        authors: {
          include: { author: { select: { id: true, name: true } } }
        },
        bookCopies: {
          select: { id: true, inventoryNumber: true, status: true },
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
        pageCount: bookData.pageCount ?? undefined,
        authors: {
          create: authorIds.map((authorId) => ({
            author: { connect: { id: authorId } }
          }))
        }
      }
    })
  }

  replaceAuthors(bookId: string, authorIds: string[]) {
    return prisma.$transaction([
      prisma.bookAuthor.deleteMany({ where: { bookId } }),
      prisma.bookAuthor.createMany({
        data: authorIds.map((authorId) => ({ bookId, authorId }))
      })
    ])
  }

  updateBook(id: string, data: Prisma.BookUpdateInput) {
    return prisma.book.update({ where: { id }, data })
  }

  deleteWithAuthors(id: string) {
    return prisma.$transaction([
      prisma.bookAuthor.deleteMany({ where: { bookId: id } }),
      prisma.book.delete({ where: { id } })
    ])
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

  findByIsbn(isbn: string, excludeId?: string) {
    return prisma.book.findFirst({
      where: {
        isbn,
        ...(excludeId ? { id: { not: excludeId } } : {})
      }
    })
  }

  async existsByAuthorId(authorId: string): Promise<boolean> {
    const count = await prisma.bookAuthor.count({ where: { authorId } })
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
