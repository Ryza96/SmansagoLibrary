import { ipcMain } from 'electron'
import type { MemberService } from '../../src/main/services/member.service'
import type { CreateMemberDTO, UpdateMemberDTO } from '../../src/shared/dto/member'

export function registerMemberHandlers(memberService: MemberService): void {
  ipcMain.handle('members:findMany', async (_event, search?: string, page?: number, limit?: number, memberType?: string) =>
    memberService.findMany(search, page, limit, memberType)
  )

  ipcMain.handle('members:findById', async (_event, id: string) =>
    memberService.findById(id)
  )

  ipcMain.handle('members:create', async (_event, input: CreateMemberDTO) =>
    memberService.create(input)
  )

  ipcMain.handle('members:update', async (_event, id: string, input: UpdateMemberDTO) =>
    memberService.update(id, input)
  )

  ipcMain.handle('members:delete', async (_event, id: string) =>
    memberService.delete(id)
  )
}
