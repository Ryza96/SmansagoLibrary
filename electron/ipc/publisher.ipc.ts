import { ipcMain } from 'electron'
import type { PublisherService } from '../main/services/publisher.service'
import type { FindPublishersQueryDTO, CreatePublisherDTO, UpdatePublisherDTO } from '../../src/shared/dto/master'

export function registerPublisherHandlers(publisherService: PublisherService): void {
  ipcMain.handle('publishers:findMany', async (_event, query?: FindPublishersQueryDTO) =>
    publisherService.getAll(query)
  )
  ipcMain.handle('publishers:findById', async (_event, id: string) => publisherService.getById(id))
  ipcMain.handle('publishers:create', async (_event, input: CreatePublisherDTO) =>
    publisherService.create(input)
  )
  ipcMain.handle('publishers:update', async (_event, id: string, input: UpdatePublisherDTO) =>
    publisherService.update(id, input)
  )
  ipcMain.handle('publishers:delete', async (_event, id: string) => publisherService.delete(id))
}
