import { ipcMain } from 'electron'
import type { BorrowService } from '../../src/main/services/borrow.service'
import type { ReturnService } from '../../src/main/services/return.service'
import type { BorrowDetailRepository } from '../../src/main/repositories/borrow-detail.repository'
import type { BorrowRepository } from '../../src/main/repositories/borrow.repository'
import type { BatchReturnInput, CreateBorrowingInput, ReturnBookInput } from '../../src/shared/dto/borrowing'

export function registerBorrowHandlers(
  borrowService: BorrowService,
  returnService: ReturnService,
  borrowDetailRepository: BorrowDetailRepository,
  borrowRepository: BorrowRepository
): void {
  ipcMain.handle('borrowings:findMany', async (_event, search?: string, page?: number, limit?: number) =>
    borrowService.findMany(search, page, limit)
  )

  ipcMain.handle('borrowings:findById', async (_event, id: string) =>
    borrowService.findById(id)
  )

  ipcMain.handle('borrowings:create', async (_event, input: CreateBorrowingInput) =>
    borrowService.create(input)
  )

  ipcMain.handle('borrowings:getMemberBorrowingStats', async (_event, memberId: string) => {
    const activeBookCount = await borrowDetailRepository.countActiveByMemberId(memberId)
    const nearestDueDate = await borrowRepository.getNearestDueDateByMemberId(memberId)
    return { activeBookCount, nearestDueDate: nearestDueDate?.toISOString() ?? null }
  })

  ipcMain.handle('returns:findByBarcode', async (_event, barcode: string) =>
    returnService.findBorrowingByBarcode(barcode)
  )

  ipcMain.handle('returns:returnBook', async (_event, input: ReturnBookInput) =>
    returnService.returnBook(input)
  )

  ipcMain.handle('returns:findByBorrowNumber', async (_event, borrowNumber: string) =>
    returnService.findByBorrowNumber(borrowNumber)
  )

  ipcMain.handle('returns:batchReturn', async (_event, input: BatchReturnInput) =>
    returnService.batchReturn(input)
  )
}
