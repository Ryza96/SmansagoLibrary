import { app, BrowserWindow } from 'electron'
import path from 'path'
import dotenv from 'dotenv'
import { initDatabase, closeDatabase } from './database'
import { createContainer } from './bootstrap'
import { registerAllHandlers } from '../ipc/index'
import { bootstrapDataInfrastructure } from './infrastructure/bootstrap'
import { databaseReconciliationService } from '../../src/main/services/database-reconciliation.service'

dotenv.config({ path: path.resolve(__dirname, '../../.env') })
dotenv.config()

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  const infra = await bootstrapDataInfrastructure()
  // TODO(WO Logging): console.log akan diganti Logging Framework pada Work Order Logging.
  console.log(`[DataInfra] Production data root: ${infra.root}`)
  console.log(`[DataInfra] Directories ensured: ${infra.newlyCreated.length} created, ${infra.alreadyExisted.length} existed`)

  await initDatabase()
  await databaseReconciliationService.run()

  const container = createContainer(infra.paths)
  registerAllHandlers(container, () => mainWindow)

  await container.settingService.get()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', async () => {
  await closeDatabase()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', async () => {
  await closeDatabase()
})
