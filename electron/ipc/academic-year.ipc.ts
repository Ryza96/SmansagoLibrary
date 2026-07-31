import { ipcMain } from 'electron'
import type { AcademicYearService } from '../../src/main/services/academic-year.service'
import type { CreateAcademicYearDTO, UpdateAcademicYearDTO } from '../../src/shared/dto/academic'

export function registerAcademicYearHandlers(service: AcademicYearService): void {
  ipcMain.handle('academic-years:findMany', async (_event, search?: string, page?: number, limit?: number) =>
    service.findMany(search, page, limit)
  )
  ipcMain.handle('academic-years:findById', async (_event, id: string) =>
    service.findById(id)
  )
  ipcMain.handle('academic-years:create', async (_event, input: CreateAcademicYearDTO) =>
    service.create(input)
  )
  ipcMain.handle('academic-years:update', async (_event, id: string, input: UpdateAcademicYearDTO) =>
    service.update(id, input)
  )
  ipcMain.handle('academic-years:delete', async (_event, id: string) =>
    service.delete(id)
  )
}
