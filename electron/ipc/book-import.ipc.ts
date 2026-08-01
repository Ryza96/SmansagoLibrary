import { app, BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron'
import fs from 'fs'
import path from 'path'
import type { MatchingEngineService } from '../../src/services/MatchingEngineService'
import type { AutoCreateService } from '../../src/main/services/auto-create.service'
import type { BookImportService } from '../../src/main/services/book-import.service'
import type { CanonicalRow, DownloadTemplateResult, ValidatedWorkbook } from '../../src/types/import'

const TEMPLATE_FILE_NAME = 'Template_Import_Buku_v2.0.xlsx'

function toValidatedWorkbook(canonicalRows: CanonicalRow[]): ValidatedWorkbook {
  return {
    rawWorkbook: { sheets: [] },
    normalizedHeaders: [],
    rowResults: [],
    canonicalRows,
    validationResult: { valid: true, errors: [], warnings: [] },
  }
}

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
    title: 'Simpan Template Import Buku',
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

export function registerBookImportHandlers(
  matchingEngine: MatchingEngineService,
  autoCreateService: AutoCreateService,
  bookImportService: BookImportService
): void {
  ipcMain.handle('imports:match', async (_event, canonicalRows: CanonicalRow[]) => {
    const matchedWorkbook = await matchingEngine.match(toValidatedWorkbook(canonicalRows))
    await autoCreateService.apply(matchedWorkbook)
    return bookImportService.importBooks(matchedWorkbook)
  })

  ipcMain.handle('imports:downloadTemplate', (event) => downloadTemplate(event))
}
