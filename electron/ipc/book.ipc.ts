import { ipcMain } from 'electron'
import type { BookService } from '../main/services/book.service'
import type { CreateBookDTO, UpdateBookDTO } from '../../src/shared/dto/book'

export function registerBookHandlers(bookService: BookService): void {
  ipcMain.handle('books:findMany', async () => bookService.getAllBooks())
  ipcMain.handle('books:findById', async (_event, id: string) => bookService.getBookById(id))
  ipcMain.handle('books:create', async (_event, input: CreateBookDTO) => bookService.createBook(input))
  ipcMain.handle('books:update', async (_event, id: string, input: UpdateBookDTO) => bookService.updateBook(id, input))
  ipcMain.handle('books:delete', async (_event, id: string) => bookService.deleteBook(id))
}
