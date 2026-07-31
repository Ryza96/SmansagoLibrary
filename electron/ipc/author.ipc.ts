import { ipcMain } from 'electron'
import type { AuthorService } from '../main/services/author.service'
import type { FindAuthorsQueryDTO, CreateAuthorDTO, UpdateAuthorDTO } from '../../src/shared/dto/master'

export function registerAuthorHandlers(authorService: AuthorService): void {
  ipcMain.handle('authors:findMany', async (_event, query?: FindAuthorsQueryDTO) =>
    authorService.getAll(query)
  )
  ipcMain.handle('authors:findById', async (_event, id: string) => authorService.getById(id))
  ipcMain.handle('authors:create', async (_event, input: CreateAuthorDTO) => authorService.create(input))
  ipcMain.handle('authors:update', async (_event, id: string, input: UpdateAuthorDTO) =>
    authorService.update(id, input)
  )
  ipcMain.handle('authors:delete', async (_event, id: string) => authorService.delete(id))
}
