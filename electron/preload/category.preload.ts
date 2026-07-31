import { ipcRenderer } from 'electron'
import type { FindCategoriesQueryDTO, CreateCategoryDTO, UpdateCategoryDTO } from '../../src/shared/dto/master'

export const categoryAPI = {
  categories: {
    findMany: (query?: FindCategoriesQueryDTO) => ipcRenderer.invoke('categories:findMany', query),
    findById: (id: string) => ipcRenderer.invoke('categories:findById', id),
    create: (input: CreateCategoryDTO) => ipcRenderer.invoke('categories:create', input),
    update: (id: string, input: UpdateCategoryDTO) => ipcRenderer.invoke('categories:update', id, input),
    delete: (id: string) => ipcRenderer.invoke('categories:delete', id)
  }
}
