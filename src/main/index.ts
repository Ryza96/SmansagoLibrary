import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { initDatabase, closeDatabase, prisma } from './database'
import { BookService } from './services/book.service'
import { BookRepository } from './repositories/book.repository'
import { AuthorService } from './services/author.service'
import { AuthorRepository } from './repositories/author.repository'
import { PublisherService } from './services/publisher.service'
import { PublisherRepository } from './repositories/publisher.repository'
import { CategoryService } from './services/category.service'
import { CategoryRepository } from './repositories/category.repository'

const bookRepository = new BookRepository()
const bookService = new BookService(bookRepository)
const authorService = new AuthorService(new AuthorRepository(), bookRepository)
const publisherService = new PublisherService(new PublisherRepository(), bookRepository)
const categoryService = new CategoryService(new CategoryRepository(), bookRepository)

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle('db:ping', async () => {
    try {
      await prisma.$queryRaw`SELECT 1`
      return { ok: true, message: 'Database connection is healthy' }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return { ok: false, message }
    }
  })

  ipcMain.handle('app:info', async () => {
    return {
      version: app.getVersion(),
      name: app.getName(),
      platform: process.platform,
      electronVersion: process.versions.electron,
      nodeVersion: process.versions.node
    }
  })

  ipcMain.handle('window:minimize', () => {
    mainWindow?.minimize()
  })

  ipcMain.handle('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow?.maximize()
    }
  })

  ipcMain.handle('window:close', () => {
    mainWindow?.close()
  })

  ipcMain.handle('books:findMany', async () => {
    return bookService.getAllBooks()
  })

  ipcMain.handle('books:findById', async (_event, id: string) => {
    return bookService.getBookById(id)
  })

  ipcMain.handle('books:create', async (_event, input: any) => {
    return bookService.createBook(input)
  })

  ipcMain.handle('books:update', async (_event, id: string, input: any) => {
    return bookService.updateBook(id, input)
  })

  ipcMain.handle('books:delete', async (_event, id: string) => {
    return bookService.deleteBook(id)
  })

  ipcMain.handle('authors:findMany', async (_event, query?: any) => {
    return authorService.getAll(query)
  })

  ipcMain.handle('publishers:findMany', async (_event, query?: any) => {
    return publisherService.getAll(query)
  })

  ipcMain.handle('categories:findMany', async (_event, query?: any) => {
    return categoryService.getAll(query)
  })

  ipcMain.handle('authors:findById', async (_event, id: string) => {
    return authorService.getById(id)
  })

  ipcMain.handle('publishers:findById', async (_event, id: string) => {
    return publisherService.getById(id)
  })

  ipcMain.handle('categories:findById', async (_event, id: string) => {
    return categoryService.getById(id)
  })

  ipcMain.handle('authors:create', async (_event, input: any) => {
    return authorService.create(input)
  })

  ipcMain.handle('authors:update', async (_event, id: string, input: any) => {
    return authorService.update(id, input)
  })

  ipcMain.handle('authors:delete', async (_event, id: string) => {
    return authorService.delete(id)
  })

  ipcMain.handle('publishers:create', async (_event, input: any) => {
    return publisherService.create(input)
  })

  ipcMain.handle('publishers:update', async (_event, id: string, input: any) => {
    return publisherService.update(id, input)
  })

  ipcMain.handle('publishers:delete', async (_event, id: string) => {
    return publisherService.delete(id)
  })

  ipcMain.handle('categories:create', async (_event, input: any) => {
    return categoryService.create(input)
  })

  ipcMain.handle('categories:update', async (_event, id: string, input: any) => {
    return categoryService.update(id, input)
  })

  ipcMain.handle('categories:delete', async (_event, id: string) => {
    return categoryService.delete(id)
  })
}

app.whenReady().then(async () => {
  await initDatabase()
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', async () => {
  await closeDatabase()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', async () => {
  await closeDatabase()
})
