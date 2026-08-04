import { BookCopyRepository } from '../repositories/book-copy.repository'
import { BOOK_COPY_STATUS, canTransitionStatus } from '../../shared/config/book-copy-status'
import { AppError } from '../../../electron/main/errorHandler'

export class BookCopyService {
  constructor(
    private bookCopyRepository: BookCopyRepository
  ) {}

  async findByBarcode(barcode: string) {
    return this.bookCopyRepository.findByBarcodeWithBook(barcode)
  }

  // IT-1 — decommission dipindah ke stack baru (SATU PrismaClient).
  // Keputusan PO: BORROWED TIDAK BOLEH menuju REMOVED → ditolak validation error.
  async decommissionCopy(id: string): Promise<void> {
    const copy = await this.bookCopyRepository.findByIdWithHistory(id)
    if (!copy) {
      throw new AppError(404, 'Not Found', 'Eksemplar tidak ditemukan.')
    }

    if (copy.status === BOOK_COPY_STATUS.BORROWED) {
      throw new AppError(400, 'Validation Error', 'Eksemplar sedang dipinjam dan tidak dapat dihapus.')
    }

    if (!canTransitionStatus(copy.status, BOOK_COPY_STATUS.REMOVED)) {
      throw new AppError(
        400,
        'Invalid Transition',
        `Tidak dapat mengubah status dari "${copy.status}" ke "${BOOK_COPY_STATUS.REMOVED}".`
      )
    }

    if (copy._count.borrowDetails > 0) {
      const changed = await this.bookCopyRepository.updateStatusIf(id, copy.status, BOOK_COPY_STATUS.REMOVED)
      if (!changed) {
        throw new AppError(409, 'Conflict', 'Status eksemplar berubah saat pemrosesan. Silakan coba lagi.')
      }
      return
    }

    await this.bookCopyRepository.delete(id)
  }
}
