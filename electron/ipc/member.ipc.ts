import { app, BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron'
import fs from 'fs'
import path from 'path'
import type { MemberService } from '../../src/main/services/member.service'
import type { MemberImportService } from '../../src/main/services/member-import.service'
import type { CreateMemberDTO, MemberImportRowInput, MemberImportScope, UpdateMemberDTO } from '../../src/shared/dto/member'
import type { DownloadTemplateResult } from '../../src/types/import'

const TEMPLATE_FILE_NAME = 'Template_Import_Anggota_v1.0.xlsx'

function resolveTemplatePath(): string {
  const base = app.isPackaged ? process.resourcesPath : app.getAppPath()
  return path.join(base, 'templates', TEMPLATE_FILE_NAME)
}

async function downloadTemplate(event: IpcMainInvokeEvent): Promise<DownloadTemplateResult> {
  const sourcePath = resolveTemplatePath()

  if (!fs.existsSync(sourcePath)) {
    return { status: 'error', message: 'Template tidak ditemukan.' }
  }

  const parentWindow = BrowserWindow.fromWebContents(event.sender)
  const options: Electron.SaveDialogOptions = {
    title: 'Simpan Template Import Anggota',
    defaultPath: TEMPLATE_FILE_NAME,
    filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }],
  }

  const { canceled, filePath } = parentWindow
    ? await dialog.showSaveDialog(parentWindow, options)
    : await dialog.showSaveDialog(options)

  if (canceled || !filePath) {
    return { status: 'cancelled' }
  }

  try {
    await fs.promises.copyFile(sourcePath, filePath)
    return { status: 'saved', filePath }
  } catch (error) {
    return {
      status: 'error',
      message: `Gagal menyimpan template: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

export function registerMemberHandlers(memberService: MemberService, memberImportService: MemberImportService): void {
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

  ipcMain.handle('members:downloadTemplate', (event) => downloadTemplate(event))

  ipcMain.handle('members:previewCheck', async (_event, rows: MemberImportRowInput[], scope?: MemberImportScope) =>
    memberImportService.previewCheck(rows, scope)
  )

  ipcMain.handle('members:import', async (event, rows: MemberImportRowInput[], scope?: MemberImportScope) =>
    memberImportService.import(rows, {
      scope,
      onProgress: (progress) => event.sender.send('members:importProgress', progress)
    })
  )
}
