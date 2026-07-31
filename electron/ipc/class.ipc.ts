import { ipcMain } from 'electron'
import type { ClassService } from '../../src/main/services/class.service'
import type { CreateClassDTO, UpdateClassDTO } from '../../src/shared/dto/academic'

export function registerClassHandlers(service: ClassService): void {
  ipcMain.handle('classes:findMany', async (_event, search?: string, page?: number, limit?: number) =>
    service.findMany(search, page, limit)
  )
  ipcMain.handle('classes:findById', async (_event, id: string) =>
    service.findById(id)
  )
  ipcMain.handle('classes:create', async (_event, input: CreateClassDTO) =>
    service.create(input)
  )
  ipcMain.handle('classes:update', async (_event, id: string, input: UpdateClassDTO) =>
    service.update(id, input)
  )
  ipcMain.handle('classes:delete', async (_event, id: string) =>
    service.delete(id)
  )
}
