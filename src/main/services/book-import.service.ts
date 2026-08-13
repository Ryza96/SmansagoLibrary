import type { ImportCellValue, ImportResultDTO, MatchedWorkbook, MatchedRow, MatchingIssue } from '../../types/import'
import { BookRepository } from '../repositories/book.repository'
import { BookCopyRepository } from '../repositories/book-copy.repository'
import { getPrisma } from '../repositories/base/prisma'
import { runTransaction } from '../repositories/base/transaction'
import { AutoCreateService } from './auto-create.service'
import { InventoryAllocator } from './inventory-allocator'

const BOOK_AMBIGUOUS_MESSAGE_KEY = 'bookImport.ambiguous'
const BOOK_TITLE_MISSING_MESSAGE_KEY = 'bookImport.titleMissing'
const BOOK_ENTITY_MISSING_MESSAGE_KEY = 'bookImport.entityMissing'
const BOOK_ISBN_DUPLICATE_MESSAGE_KEY = 'bookImport.isbnDuplicate'
const BOOK_CREATE_FAILED_MESSAGE_KEY = 'bookImport.createFailed'
const BOOK_COPY_CREATE_FAILED_MESSAGE_KEY = 'bookImport.copyCreateFailed'

const INVENTORY_CREATE_RETRIES = 3

class ImportRowBlockedError extends Error {
  constructor(readonly messageKey: string) {
    super(messageKey)
  }
}

export class BookImportService {
  constructor(
    private readonly bookRepository: BookRepository,
    private readonly bookCopyRepository: BookCopyRepository,
    private readonly autoCreateService: AutoCreateService,
    private readonly inventoryAllocator: InventoryAllocator = new InventoryAllocator()
  ) {}

  async importBooks(workbook: MatchedWorkbook): Promise<ImportResultDTO> {
    const errors: MatchingIssue[] = []

    for (const row of workbook.matchedRows) {
      const rowErrors = await this.importRow(row)
      row.issues.push(...rowErrors)
      errors.push(...rowErrors)
    }

    workbook.matchingResult.errors.push(...errors)
    return this.toImportResult(workbook)
  }

  private toImportResult(workbook: MatchedWorkbook): ImportResultDTO {
    const failures = new Map<number, string>()
    for (const error of workbook.matchingResult.errors) {
      if (error.rowNumber === null || failures.has(error.rowNumber)) continue
      failures.set(error.rowNumber, error.messageKey)
    }

    let importedCopies = 0
    for (const row of workbook.matchedRows) {
      if (failures.has(row.rowNumber)) continue
      const copyCount = this.valueToInteger(row.canonicalRow.values['copyCount']) ?? 1
      importedCopies += copyCount >= 1 ? copyCount : 1
    }

    return {
      totalRows: workbook.matchedRows.length,
      importedBooks: workbook.matchedRows.length - failures.size,
      importedCopies,
      failedRows: Array.from(failures, ([rowNumber, messageKey]) => ({ rowNumber, messageKey })),
    }
  }

  private async importRow(row: MatchedRow): Promise<MatchingIssue[]> {
    const issues: MatchingIssue[] = []
    const issue = (messageKey: string): void => {
      issues.push({ rowNumber: row.rowNumber, messageKey })
    }

    if (row.matches.some((match) => match.status === 'AMBIGUOUS')) {
      issue(BOOK_AMBIGUOUS_MESSAGE_KEY)
      return issues
    }

    const title = this.valueToString(row.canonicalRow.values['title'])
    if (!title) {
      issue(BOOK_TITLE_MISSING_MESSAGE_KEY)
      return issues
    }

    const isbnValue = row.canonicalRow.values['isbn']
    const isbn = isbnValue === null || isbnValue === undefined ? null : String(isbnValue).trim() || null

    if (isbn && (await this.bookRepository.existsByISBN(isbn))) {
      issue(BOOK_ISBN_DUPLICATE_MESSAGE_KEY)
      return issues
    }

    const copyCount = this.valueToInteger(row.canonicalRow.values['copyCount']) ?? 1
    if (!Number.isInteger(copyCount) || copyCount < 1 || copyCount > 1000) {
      issue(BOOK_COPY_CREATE_FAILED_MESSAGE_KEY)
      return issues
    }

    const publicationYear = this.valueToNumber(row.canonicalRow.values['year'])
    const description = this.valueToString(row.canonicalRow.values['description']) || undefined

    try {
      await this.createBookWithCopies(
        {
          title,
          isbn: isbn ?? undefined,
          publicationYear,
          description,
        },
        copyCount,
        row
      )
    } catch (error) {
      if (error instanceof ImportRowBlockedError) {
        issue(error.messageKey)
        return issues
      }
      const code = (error as { code?: string })?.code
      if (code === 'P2002' && isbn && (await this.bookRepository.existsByISBN(isbn))) {
        issue(BOOK_ISBN_DUPLICATE_MESSAGE_KEY)
      } else {
        issue(BOOK_CREATE_FAILED_MESSAGE_KEY)
      }
    }

    return issues
  }

  private async createBookWithCopies(
    bookData: {
      title: string
      isbn?: string
      publicationYear?: number
      description?: string
    },
    copyCount: number,
    row: MatchedRow
  ): Promise<void> {
    const shelfLocation = this.valueToString(row.canonicalRow.values['shelfLocation']) || ''
    const acquisitionSource = this.valueToString(row.canonicalRow.values['acquisitionSource']) || undefined
    const acquisitionDate = this.valueToDate(row.canonicalRow.values['acquisitionDate'])
    const acquisitionCost = this.valueToNumber(row.canonicalRow.values['acquisitionCost'])

    for (let attempt = 0; attempt < INVENTORY_CREATE_RETRIES; attempt++) {
      try {
        await runTransaction(getPrisma(), async (tx) => {
          await this.autoCreateService.resolveRow(row, tx)

          const authorId = this.resolvedId(row, 'authors')
          const publisherId = this.resolvedId(row, 'publisher')
          const categoryId = this.resolvedId(row, 'category')
          if (!authorId || !publisherId || !categoryId) {
            throw new ImportRowBlockedError(BOOK_ENTITY_MISSING_MESSAGE_KEY)
          }

          const book = await this.bookRepository.createWithTx(tx, { ...bookData, authorId, publisherId, categoryId })
          const allocations = await this.inventoryAllocator.allocate(tx, copyCount)
          await this.bookCopyRepository.createManyWithTx(
            tx,
            allocations.map(({ inventoryNumber, barcode }) => ({
              bookId: book.id,
              inventoryNumber,
              barcode,
              shelfLocation,
              acquisitionSource,
              acquisitionDate,
              acquisitionCost,
            }))
          )
        })
        return
      } catch (error) {
        if (error instanceof ImportRowBlockedError) {
          throw error
        }
        const code = (error as { code?: string })?.code
        if (code === 'P2002' && attempt < INVENTORY_CREATE_RETRIES - 1) {
          continue
        }
        throw error
      }
    }
  }

  private valueToInteger(value: ImportCellValue): number | undefined {
    if (value === null || value === undefined) return undefined
    const num = typeof value === 'number' ? value : Number(String(value).trim())
    return Number.isFinite(num) ? num : undefined
  }

  private valueToString(value: unknown): string {
    if (value === null || value === undefined) return ''
    return String(value).trim()
  }

  private valueToNumber(value: ImportCellValue): number | undefined {
    if (value === null || value === undefined) return undefined
    const num = typeof value === 'number' ? value : Number(String(value).trim())
    return Number.isFinite(num) ? num : undefined
  }

  private valueToDate(value: ImportCellValue): Date | undefined {
    if (value instanceof Date) return value
    return undefined
  }

  private resolvedId(row: MatchedRow, field: string): string | null {
    const match = row.matches.find((m) => m.field === field)
    return match?.resolvedEntity?.id ?? null
  }
}
