import { ipcMain } from 'electron'
import type { CategoryService } from '../main/services/category.service'
import type { FindCategoriesQueryDTO, CreateCategoryDTO, UpdateCategoryDTO } from '../../src/shared/dto/master'

export function registerCategoryHandlers(categoryService: CategoryService): void {
  ipcMain.handle('categories:findMany', async (_event, query?: FindCategoriesQueryDTO) =>
    categoryService.getAll(query)
  )
  ipcMain.handle('categories:findById', async (_event, id: string) => categoryService.getById(id))
  ipcMain.handle('categories:create', async (_event, input: CreateCategoryDTO) =>
    categoryService.create(input)
  )
  ipcMain.handle('categories:update', async (_event, id: string, input: UpdateCategoryDTO) =>
    categoryService.update(id, input)
  )
  ipcMain.handle('categories:delete', async (_event, id: string) => categoryService.delete(id))
}
