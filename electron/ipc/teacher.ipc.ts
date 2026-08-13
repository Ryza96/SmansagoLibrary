import { app, BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron'
import fs from 'fs'
import path from 'path'
import type { TeacherImportService } from '../../src/main/services/teacher-import.service'
import type { TeacherImportRowInput } from '../../src/shared/dto/teacher'
import type { DownloadTemplateResult } from '../../src/types/import'

const TEMPLATE_FILE_NAME = 'Template_Import_Guru_v1.0.xlsx'

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
    title: 'Simpan Template Import Guru',
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

export function registerTeacherHandlers(teacherImportService: TeacherImportService): void {
  ipcMain.handle('teachers:downloadTemplate', (event) => downloadTemplate(event))

  ipcMain.handle('teachers:previewCheck', async (_event, rows: TeacherImportRowInput[]) =>
    teacherImportService.previewCheck(rows)
  )

  ipcMain.handle('teachers:import', async (event, rows: TeacherImportRowInput[]) =>
    teacherImportService.import(rows, (stage) => event.sender.send('teachers:importProgress', stage))
  )
}
