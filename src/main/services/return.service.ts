import { BorrowRepository } from '../repositories/borrow.repository'
import { BorrowDetailRepository } from '../repositories/borrow-detail.repository'
import { BookCopyRepository } from '../repositories/book-copy.repository'
import { BOOK_COPY_STATUS, canTransitionStatus } from '../../shared/config/book-copy-status'
import { RETURN_CONDITION, isReturnCondition } from '../../shared/config/return-condition'
import { runTransaction } from '../repositories/base/transaction'
import { getPrisma } from '../repositories/base/prisma'
import type {
  BatchReturnInput,
  BatchReturnResult,
  BorrowingByBarcodeResult,
  BorrowingDTO,
  BorrowingItemDetailDTO,
  ReturnBookInput
} from '../../shared/dto/borrowing'
import { AppError } from '../../../electron/main/errorHandler'
import { FINE_STATUS, FINE_TYPE, DEFAULT_LATE_FEE_PER_DAY } from '../../shared/config/fine'
import {
  calculateLateFine,
  resolveBookValue,
  lateFineDedupeKey,
  detailFineDedupeKey
} from './fine-calculator'

function toItemDTO(item: {
  id: string
  bookCopyId: string
  returnedAt: Date | null
  conditionBack: string | null
  note: string | null
  bookTitle: string
  bookCopy: { barcode: string | null; inventoryNumber: string; book: { title: string } } | null
}): BorrowingItemDetailDTO {
  return {
    id: item.id,
    bookCopyId: item.bookCopyId,
    status: item.returnedAt ? 'RETURNED' : 'BORROWED',
    returnedAt: item.returnedAt?.toISOString() ?? null,
    condition: item.conditionBack ?? null,
    fine: null,
    notes: item.note ?? null,
    bookTitle: item.bookCopy?.book?.title ?? item.bookTitle,
    barcode: item.bookCopy?.barcode ?? null,
    inventoryNumber: item.bookCopy?.inventoryNumber ?? ''
  }
}

function toDTO(borrowing: {
  id: string
  borrowNumber: string
  memberId: string
  borrowDate: Date
  dueDate: Date
  returnDate: Date | null
  notes: string | null
  memberName: string
  memberNumber: string
  createdAt: Date
  updatedAt: Date
  member: { fullName: string; memberNumber: string } | null
  details: Array<{
    id: string
    bookCopyId: string
    returnedAt: Date | null
    conditionBack: string | null
    note: string | null
    bookTitle: string
    bookCopy: { barcode: string | null; inventoryNumber: string; book: { title: string } } | null
  }>
}): BorrowingDTO {
  return {
    id: borrowing.id,
    borrowingNumber: borrowing.borrowNumber,
    memberId: borrowing.memberId,
    memberName: borrowing.member?.fullName ?? borrowing.memberName,
    memberNumber: borrowing.member?.memberNumber ?? borrowing.memberNumber,
    borrowDate: borrowing.borrowDate.toISOString(),
    dueDate: borrowing.dueDate.toISOString(),
    status: borrowing.returnDate ? 'COMPLETED' : 'ACTIVE',
    notes: borrowing.notes,
    totalItems: borrowing.details.length,
    items: borrowing.details.map(toItemDTO),
    createdAt: borrowing.createdAt.toISOString(),
    updatedAt: borrowing.updatedAt.toISOString()
  }
}

export class ReturnService {
  constructor(
    private borrowRepository: BorrowRepository,
    private borrowDetailRepository: BorrowDetailRepository,
    private bookCopyRepository: BookCopyRepository
  ) {}

  async findBorrowingByBarcode(barcode: string): Promise<BorrowingByBarcodeResult> {
    const bookCopy = await this.bookCopyRepository.findByBarcodeWithBook(barcode)
    if (!bookCopy) {
      throw new AppError(404, 'Not Found', 'Buku tidak ditemukan.')
    }

    const detail = await this.borrowDetailRepository.findActiveByBookCopyId(bookCopy.id)
    if (!detail) {
      throw new AppError(400, 'Not Borrowed', 'Buku tidak sedang dipinjam.')
    }

    const borrow = detail.borrow

    return {
      bookCopyId: bookCopy.id,
      barcode: bookCopy.barcode ?? '',
      inventoryNumber: bookCopy.inventoryNumber,
      bookTitle: bookCopy.book?.title ?? '',
      borrowingId: borrow.id,
      borrowingNumber: borrow.borrowNumber,
      memberId: borrow.memberId,
      memberName: borrow.member?.fullName ?? borrow.memberName,
      memberNumber: borrow.member?.memberNumber ?? borrow.memberNumber,
      borrowDate: borrow.borrowDate.toISOString(),
      dueDate: borrow.dueDate.toISOString()
    }
  }

  async returnBook(input: ReturnBookInput): Promise<BorrowingDTO> {
    const detail = await this.borrowDetailRepository.findActiveByBookCopyId(input.bookCopyId)
    if (!detail) {
      throw new AppError(400, 'Not Borrowed', 'Buku tidak sedang dipinjam.')
    }

    const updated = await this.borrowRepository.processReturn(
      detail.id,
      input.condition,
      input.notes ?? null
    )

    if (!updated) {
      throw new AppError(404, 'Not Found', 'Data peminjaman tidak ditemukan')
    }

    return toDTO(updated)
  }

  /**
   * Find active borrow transaction by borrow number.
   * Returns full BorrowingDTO with all details.
   */
  async findByBorrowNumber(borrowNumber: string): Promise<BorrowingDTO> {
    const borrowing = await this.borrowRepository.findByBorrowNumberActiveWithDetails(borrowNumber)
    if (!borrowing) {
      throw new AppError(404, 'Not Found', 'Transaksi peminjaman tidak ditemukan atau sudah dikembalikan sepenuhnya.')
    }
    return toDTO(borrowing)
  }

  /**
   * Batch return: return one or more books from the same transaction.
   * Runs in a SINGLE $transaction — all-or-nothing.
   *
   * Pre-conditions (inside tx):
   *  - All borrowDetailId values must belong to the same borrowingId
   *  - All target details must have returnedAt === null (not already returned)
   *  - All target BookCopies must have status BORROWED
   *
   * Post-conditions (inside tx):
   *  - Each returned detail: returnedAt = now, conditionBack = condition
   *  - Each returned BookCopy: status → AVAILABLE (or LOST if condition = HILANG)
   *  - If ALL details now returned → Borrow.returnDate = now (COMPLETED)
   *  - Re-fetch full Borrow with all relations for receipt generation
   *
   * Throws on any validation failure (no partial writes).
   */
  async batchReturn(input: BatchReturnInput): Promise<BatchReturnResult> {
    // 0. Validasi input (sebelum transaksi)
    if (input.books.length === 0) {
      throw new AppError(400, 'Validation Error', 'Pilih minimal satu buku untuk dikembalikan.')
    }
    const invalidCondition = input.books.find((b) => !isReturnCondition(b.condition))
    if (invalidCondition) {
      throw new AppError(400, 'Validation Error', 'Kondisi pengembalian tidak valid.')
    }

    return runTransaction(getPrisma(), async (tx) => {
      // 1. Load borrowing with all details + relations
      const borrowing = await tx.borrow.findUnique({
        where: { id: input.borrowingId },
        include: {
          details: {
            include: {
              bookCopy: {
                include: { book: true }
              }
            }
          },
          member: true
        }
      })

      if (!borrowing) {
        throw new AppError(404, 'Not Found', 'Data peminjaman tidak ditemukan.')
      }

      // 2. Validate all requested details belong to this borrowing
      const detailIds = new Set(input.books.map((b) => b.borrowDetailId))
      const matchingDetails = borrowing.details.filter((d) => detailIds.has(d.id))

      if (matchingDetails.length !== input.books.length) {
        throw new AppError(400, 'Validation Error', 'Beberapa buku tidak ditemukan dalam transaksi ini.')
      }

      // 3. Validate none are already returned
      const alreadyReturned = matchingDetails.filter((d) => d.returnedAt !== null)
      if (alreadyReturned.length > 0) {
        throw new AppError(
          400,
          'Validation Error',
          `${alreadyReturned.length} buku sudah dikembalikan sebelumnya.`
        )
      }

      // 4. Validate all BookCopies have status BORROWED
      const copyIds = matchingDetails.map((d) => d.bookCopyId)
      const copies = await tx.bookCopy.findMany({ where: { id: { in: copyIds } } })
      const invalidCopies = copies.filter((c) => c.status !== BOOK_COPY_STATUS.BORROWED)
      if (invalidCopies.length > 0) {
        throw new AppError(
          400,
          'Validation Error',
          `${invalidCopies.length} buku memiliki status tidak valid untuk pengembalian.`
        )
      }

      const now = new Date()
      const conditionMap = new Map(input.books.map((b) => [b.borrowDetailId, b.condition]))
      const finesCreated: Array<{ type: string; amount: number }> = []

      // 5. Process each book (within same tx)
      for (const detail of matchingDetails) {
        const condition = conditionMap.get(detail.id)!

        // Update BorrowDetail
        await tx.borrowDetail.update({
          where: { id: detail.id },
          data: { returnedAt: now, conditionBack: condition }
        })

        // Update BookCopy status — IT-1 transition logic
        const targetStatus =
          condition === RETURN_CONDITION.HILANG
            ? BOOK_COPY_STATUS.LOST
            : condition === RETURN_CONDITION.RUSAK_BERAT
              ? BOOK_COPY_STATUS.REMOVED
              : BOOK_COPY_STATUS.AVAILABLE

        const currentCopy = copies.find((c) => c.id === detail.bookCopyId)
        if (currentCopy && canTransitionStatus(currentCopy.status, targetStatus)) {
          await tx.bookCopy.updateMany({
            where: { id: detail.bookCopyId, status: currentCopy.status },
            data: { status: targetStatus }
          })
        }

        // Denda per-buku (HEAVY_DAMAGE / LOST) — masing-masing memakai dedupeKey-nya sendiri
        if (condition === RETURN_CONDITION.RUSAK_BERAT || condition === RETURN_CONDITION.HILANG) {
          const amount = resolveBookValue(currentCopy?.acquisitionCost)
          const type = condition === RETURN_CONDITION.RUSAK_BERAT ? FINE_TYPE.HEAVY_DAMAGE : FINE_TYPE.LOST
          await tx.fine.create({
            data: {
              borrowId: input.borrowingId,
              borrowDetailId: detail.id,
              type,
              amount,
              status: FINE_STATUS.UNPAID,
              dedupeKey: detailFineDedupeKey(detail.id)
            }
          })
          finesCreated.push({ type, amount })
        }
      }

      // 6. Check if ALL details are now returned → set Borrow.returnDate
      const allDetails = await tx.borrowDetail.findMany({
        where: { borrowId: input.borrowingId }
      })
      const allReturned = allDetails.every((d) => d.returnedAt !== null)
      if (allReturned) {
        await tx.borrow.update({
          where: { id: input.borrowingId },
          data: { returnDate: now }
        })

        // Denda LATE — SATU per transaksi, dibuat hanya saat pengembalian terakhir
        const setting = await tx.setting.findFirst()
        const ratePerDay = setting?.lateFee ?? DEFAULT_LATE_FEE_PER_DAY
        const late = calculateLateFine({ dueDate: borrowing.dueDate, returnedAt: now, ratePerDay })
        if (late) {
          await tx.fine.create({
            data: {
              borrowId: input.borrowingId,
              type: FINE_TYPE.LATE,
              amount: late.amount,
              lateDays: late.lateDays,
              ratePerDay,
              status: FINE_STATUS.UNPAID,
              dedupeKey: lateFineDedupeKey(input.borrowingId)
            }
          })
          finesCreated.push({ type: FINE_TYPE.LATE, amount: late.amount })
        }
      }

      // 7. Re-fetch full borrowing for receipt (post-return state)
      const updatedBorrowing = await tx.borrow.findUnique({
        where: { id: input.borrowingId },
        include: {
          details: {
            include: {
              bookCopy: {
                include: { book: true }
              }
            }
          },
          member: true
        }
      })

      return {
        borrowing: toDTO(updatedBorrowing!),
        returnedCount: matchingDetails.length,
        stillBorrowedCount: allDetails.filter((d) => d.returnedAt === null).length,
        fines: finesCreated,
        returnedBooks: input.books.map((b) => {
          const detail = matchingDetails.find((d) => d.id === b.borrowDetailId)!
          return {
            borrowDetailId: b.borrowDetailId,
            bookTitle: detail.bookCopy?.book?.title ?? detail.bookTitle,
            inventoryNumber: detail.bookCopy?.inventoryNumber ?? '',
            condition: b.condition
          }
        })
      }
    })
  }
}
