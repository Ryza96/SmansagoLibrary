import { ipcMain } from 'electron'
import type { EnrollmentService } from '../../src/main/services/enrollment.service'
import type { CreateEnrollmentDTO, CloseEnrollmentDTO, RepointEnrollmentDTO, TransferEnrollmentDTO } from '../../src/shared/dto/enrollment'

export function registerEnrollmentHandlers(service: EnrollmentService): void {
  ipcMain.handle('enrollments:enroll', async (_event, input: CreateEnrollmentDTO) =>
    service.enroll(input)
  )
  ipcMain.handle('enrollments:close', async (_event, enrollmentId: string, input: CloseEnrollmentDTO) =>
    service.close(enrollmentId, input)
  )
  ipcMain.handle('enrollments:repoint', async (_event, enrollmentId: string, input: RepointEnrollmentDTO) =>
    service.repoint(enrollmentId, input)
  )
  ipcMain.handle('enrollments:transfer', async (_event, enrollmentId: string, input: TransferEnrollmentDTO) =>
    service.transfer(enrollmentId, input)
  )
  ipcMain.handle('enrollments:findActiveByMember', async (_event, memberId: string) =>
    service.findActiveByMember(memberId)
  )
  ipcMain.handle('enrollments:historyByMember', async (_event, memberId: string) =>
    service.historyByMember(memberId)
  )
}
