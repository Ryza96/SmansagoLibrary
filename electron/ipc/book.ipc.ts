import { BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron'
import type { BookService } from '../main/services/book.service'
import type { CreateBookDTO, UpdateBookDTO } from '../../src/shared/dto/book'
import type { PickCoverResult } from '../../src/shared/dto/cover'

export function registerBookHandlers(bookService: BookService): void {
  ipcMain.handle('books:findMany', async () => bookService.getAllBooks())
  ipcMain.handle('books:findById', async (_event, id: string) => bookService.getBookById(id))
  ipcMain.handle('books:create', async (_event, input: CreateBookDTO) => bookService.createBook(input))
  ipcMain.handle('books:update', async (_event, id: string, input: UpdateBookDTO) => bookService.updateBook(id, input))
  ipcMain.handle('books:delete', async (_event, id: string) => bookService.deleteBook(id))

  // WO SAM — pilih file sampul: dialog OS → validasi + resize + preview di main
  // (pola settings:pickLogo RFC §15.1).
  ipcMain.handle('books:pickCover', async (event: IpcMainInvokeEvent): Promise<PickCoverResult> => {
    const parentWindow = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions = {
      title: 'Pilih Sampul Buku',
      properties: ['openFile'],
      filters: [{ name: 'Gambar Sampul', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    }
    const { canceled, filePaths } = parentWindow
      ? await dialog.showOpenDialog(parentWindow, options)
      : await dialog.showOpenDialog(options)
    if (canceled || filePaths.length === 0) {
      return { canceled: true }
    }
    const filePath = filePaths[0]
    const preview = await bookService.pickCoverPreview(filePath)
    return { canceled: false, ...preview }
  })

  // WO SAM — baca sampul sebagai data URI untuk renderer (detail buku).
  ipcMain.handle('books:getCoverDataUri', async (_event, id: string) =>
    bookService.getCoverDataUri(id)
  )

  // WO SAM — hapus sampul buku (DB di-null-kan dulu, lalu file dihapus).
  ipcMain.handle('books:removeCover', async (_event, id: string) =>
    bookService.removeCover(id)
  )
}
