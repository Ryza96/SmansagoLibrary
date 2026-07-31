import { BorrowRepository } from '../repositories/borrow.repository'
import { BorrowDetailRepository } from '../repositories/borrow-detail.repository'
import { BookCopyRepository } from '../repositories/book-copy.repository'
import type { BorrowingByBarcodeResult, BorrowingDTO, BorrowingItemDetailDTO, ReturnBookInput } from '../../shared/dto/borrowing'
import { AppError } from '../../../electron/main/errorHandler'

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
}
