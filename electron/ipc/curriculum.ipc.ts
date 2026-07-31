import { ipcMain } from 'electron'
import type { CurriculumService } from '../../src/main/services/curriculum.service'
import type { CreateCurriculumDTO, UpdateCurriculumDTO } from '../../src/shared/dto/academic'

export function registerCurriculumHandlers(service: CurriculumService): void {
  ipcMain.handle('curricula:findMany', async (_event, search?: string, page?: number, limit?: number) =>
    service.findMany(search, page, limit)
  )
  ipcMain.handle('curricula:findById', async (_event, id: string) =>
    service.findById(id)
  )
  ipcMain.handle('curricula:create', async (_event, input: CreateCurriculumDTO) =>
    service.create(input)
  )
  ipcMain.handle('curricula:update', async (_event, id: string, input: UpdateCurriculumDTO) =>
    service.update(id, input)
  )
  ipcMain.handle('curricula:delete', async (_event, id: string) =>
    service.delete(id)
  )
}
