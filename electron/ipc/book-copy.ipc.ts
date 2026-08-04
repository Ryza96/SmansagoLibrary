import { ipcMain } from 'electron'
import type { BookCopyService as LegacyBookCopyService } from '../main/services/book-copy.service'
import type { BookCopyService } from '../../src/main/services/book-copy.service'
import type { CreateBookCopiesDTO } from '../../src/shared/dto/book'

export function registerBookCopyHandlers(
  bookCopyService: LegacyBookCopyService,
  newBookCopyService: BookCopyService
): void {
  ipcMain.handle('bookCopies:findByBarcode', async (_event, barcode: string) =>
    newBookCopyService.findByBarcode(barcode)
  )
  ipcMain.handle('bookCopies:findById', async (_event, id: string) =>
    bookCopyService.getBookCopyById(id)
  )
  ipcMain.handle('bookCopies:findByBookId', async (_event, bookId: string) =>
    bookCopyService.getCopiesByBookId(bookId)
  )
  ipcMain.handle('bookCopies:addCopies', async (_event, bookId: string, input: CreateBookCopiesDTO) =>
    bookCopyService.addCopies(bookId, input)
  )
  ipcMain.handle('bookCopies:decommissionCopy', async (_event, id: string) =>
    newBookCopyService.decommissionCopy(id)
  )
}
