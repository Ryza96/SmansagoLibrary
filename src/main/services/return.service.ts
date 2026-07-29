import { AppError } from '../errorHandler'
import { BookCopyRepository } from '../repositories/book-copy.repository'
import { BorrowingItemRepository } from '../repositories/borrowing-item.repository'
import { BorrowingRepository } from '../repositories/borrowing.repository'
import { ReturnRepository } from '../repositories/return.repository'
import type { BorrowingDTO, BorrowingByBarcodeResult, ReturnBookInput } from '../../shared/dto/borrowing'

function toBorrowingDTO(borrowing: any): BorrowingDTO {
  return {
    id: borrowing.id,
    borrowingNumber: borrowing.borrowingNumber,
    memberId: borrowing.memberId,
    memberName: borrowing.member?.fullName ?? '',
    memberNumber: borrowing.member?.number ?? '',
    borrowDate: borrowing.borrowDate.toISOString(),
    dueDate: borrowing.dueDate.toISOString(),
    status: borrowing.status,
    notes: borrowing.notes ?? null,
    totalItems: borrowing.totalItems,
    items: (borrowing.items ?? []).map((item: any) => ({
      id: item.id,
      bookCopyId: item.bookCopyId,
      status: item.status,
      returnedAt: item.returnedAt?.toISOString() ?? null,
      condition: item.condition ?? null,
      fine: item.fine ?? null,
      notes: item.notes ?? null,
      bookTitle: item.bookCopy?.book?.title ?? '',
      barcode: item.bookCopy?.barcode ?? null,
      inventoryNumber: item.bookCopy?.inventoryNumber ?? ''
    })),
    createdAt: borrowing.createdAt.toISOString(),
    updatedAt: borrowing.updatedAt.toISOString()
  }
}

export class ReturnService {
  constructor(
    private bookCopyRepository: BookCopyRepository,
    private borrowingItemRepository: BorrowingItemRepository,
    private borrowingRepository: BorrowingRepository,
    private returnRepository: ReturnRepository
  ) {}

  async findBorrowingByBarcode(barcode: string): Promise<BorrowingByBarcodeResult> {
    const bookCopy = await this.bookCopyRepository.findByBarcodeWithBook(barcode)
    if (!bookCopy) {
      throw new AppError(404, 'Not Found', 'Buku tidak ditemukan.')
    }

    const activeItem = await this.borrowingItemRepository.findActiveByBookCopyId(bookCopy.id)
    if (!activeItem) {
      throw new AppError(400, 'Not Borrowed', 'Buku tidak sedang dipinjam.')
    }

    const borrowing = await this.borrowingRepository.findById(activeItem.borrowingId)
    if (!borrowing) {
      throw new AppError(404, 'Not Found', 'Data peminjaman tidak ditemukan.')
    }

    return {
      bookCopyId: bookCopy.id,
      barcode: bookCopy.barcode ?? '',
      inventoryNumber: bookCopy.inventoryNumber,
      bookTitle: bookCopy.book?.title ?? '',
      borrowingId: borrowing.id,
      borrowingNumber: borrowing.borrowingNumber,
      memberId: borrowing.memberId,
      memberName: borrowing.member?.fullName ?? '',
      memberNumber: borrowing.member?.number ?? '',
      borrowDate: borrowing.borrowDate.toISOString(),
      dueDate: borrowing.dueDate.toISOString()
    }
  }

  async returnBook(input: ReturnBookInput): Promise<BorrowingDTO> {
    const activeItem = await this.borrowingItemRepository.findActiveByBookCopyId(input.bookCopyId)
    if (!activeItem) {
      throw new AppError(400, 'Not Borrowed', 'Buku tidak sedang dipinjam.')
    }

    await this.returnRepository.createReturnTransaction({
      borrowingItemId: activeItem.id,
      bookCopyId: input.bookCopyId,
      borrowingId: activeItem.borrowingId,
      condition: input.condition,
      notes: input.notes
    })

    const borrowing = await this.borrowingRepository.findById(activeItem.borrowingId)
    if (!borrowing) {
      throw new AppError(404, 'Not Found', 'Data peminjaman tidak ditemukan.')
    }

    return toBorrowingDTO(borrowing)
  }
}
