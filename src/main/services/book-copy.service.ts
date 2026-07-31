import { BookCopyRepository } from '../repositories/book-copy.repository'

export class BookCopyService {
  constructor(
    private bookCopyRepository: BookCopyRepository
  ) {}

  async findByBarcode(barcode: string) {
    return this.bookCopyRepository.findByBarcodeWithBook(barcode)
  }
}
