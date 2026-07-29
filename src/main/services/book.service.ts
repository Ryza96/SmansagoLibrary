import { BookRepository } from '../repositories/book.repository'
import { AppError } from '../errorHandler'
import type { BookListItemDTO, BookDetailDTO, CreateBookDTO, UpdateBookDTO } from '../../shared/dto/book'

export class BookService {
  constructor(private repository: BookRepository) {}

  async getAllBooks(): Promise<BookListItemDTO[]> {
    const books = await this.repository.findManyWithCount()
    return books.map((book) => ({
      id: book.id,
      title: book.title,
      isbn: book.isbn,
      categoryName: book.category?.name ?? null,
      publisherName: book.publisher?.name ?? null,
      publicationYear: book.publicationYear,
      copyCount: book._count.bookCopies
    }))
  }

  async getBookById(id: string): Promise<BookDetailDTO | null> {
    const book = await this.repository.findByIdWithDetails(id)
    if (!book) return null

    return {
      id: book.id,
      title: book.title,
      isbn: book.isbn,
      category: book.category,
      publisher: book.publisher,
      publicationYear: book.publicationYear,
      edition: book.edition,
      language: book.language,
      pageCount: book.pageCount,
      description: book.description,
      coverImage: book.coverImage,
      authors: book.authors.map((ba) => ba.author),
      copies: book.bookCopies,
      createdAt: book.createdAt.toISOString(),
      updatedAt: book.updatedAt.toISOString()
    }
  }

  async createBook(input: CreateBookDTO): Promise<BookDetailDTO> {
    if (input.isbn) {
      const exists = await this.repository.existsByIsbn(input.isbn)
      if (exists) {
        throw new AppError(409, 'Duplicate', `ISBN ${input.isbn} sudah digunakan oleh buku lain.`)
      }
    }

    const book = await this.repository.createWithAuthors({
      title: input.title,
      isbn: input.isbn,
      categoryId: input.categoryId,
      publisherId: input.publisherId,
      publicationYear: input.publicationYear,
      edition: input.edition,
      language: input.language,
      pageCount: input.pageCount,
      description: input.description,
      authorIds: input.authorIds
    })

    return (await this.getBookById(book.id))!
  }

  async updateBook(id: string, input: UpdateBookDTO): Promise<BookDetailDTO | null> {
    const existing = await this.repository.findById(id)
    if (!existing) return null

    if (input.isbn) {
      const duplicate = await this.repository.existsByIsbn(input.isbn, id)
      if (duplicate) {
        throw new AppError(409, 'Duplicate', `ISBN ${input.isbn} sudah digunakan oleh buku lain.`)
      }
    }

    const { authorIds, ...bookData } = input

    const updateData: Record<string, unknown> = {}
    if (bookData.title !== undefined) updateData.title = bookData.title
    if (bookData.isbn !== undefined) updateData.isbn = bookData.isbn
    if (bookData.categoryId !== undefined) updateData.categoryId = bookData.categoryId
    if (bookData.publisherId !== undefined) updateData.publisherId = bookData.publisherId
    if (bookData.publicationYear !== undefined) updateData.publicationYear = bookData.publicationYear
    if (bookData.edition !== undefined) updateData.edition = bookData.edition
    if (bookData.language !== undefined) updateData.language = bookData.language
    if (bookData.pageCount !== undefined) updateData.pageCount = bookData.pageCount
    if (bookData.description !== undefined) updateData.description = bookData.description

    if (authorIds !== undefined) {
      await this.repository.replaceAuthors(id, authorIds)
    }

    await this.repository.updateBook(id, updateData as any)
    return this.getBookById(id)
  }

  async deleteBook(id: string): Promise<boolean> {
    const existing = await this.repository.findById(id)
    if (!existing) return false

    await this.repository.deleteWithAuthors(id)
    return true
  }
}
