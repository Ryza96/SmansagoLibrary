import { app, BrowserWindow, Menu } from 'electron'
import path from 'path'
import dotenv from 'dotenv'
import { initDatabase, closeDatabase } from './database'
import { createContainer } from './bootstrap'
import { registerAllHandlers } from '../ipc/index'
import { bootstrapDataInfrastructure } from './infrastructure/bootstrap'
import { bootstrapMigrations } from '../../src/main/infrastructure/migrations/migration-bootstrap'
import { databaseReconciliationService } from '../../src/main/services/database-reconciliation.service'
import { resolveLiveDatabaseFile } from '../../src/main/infrastructure/database-path'
import { connectPrisma, disconnectPrisma } from '../../src/main/repositories/base/prisma'

dotenv.config({ path: path.resolve(__dirname, '../../.env') })
dotenv.config()

// Fix #1 (Installer Audit): saat packaged, arahkan Prisma engine ke salinan
// extraResources (file nyata di disk, bukan di dalam app.asar). Dev tidak
// terpengaruh (app.isPackaged = false) — engine dibaca dari .prisma/client.
if (app.isPackaged && process.platform === 'win32') {
  process.env.PRISMA_QUERY_ENGINE_LIBRARY = path.join(
    process.resourcesPath,
    'prisma',
    'client',
    'query_engine-windows.dll.node'
  )
}

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    show: false,
    title: 'BAM',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.maximize()
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
  // Fix #2 (Installer Audit): saat packaged, arahkan live DB ke userData
  // (folder database/ sudah di-ensure WO-1). Dev (app.isPackaged=false) tetap
  // memakai .env → prisma/aplibrary.db. Data dev TIDAK dihapus/dipindah paksa.
  if (app.isPackaged) {
    process.env.DATABASE_URL = 'file:' + infra.paths.databaseFile.replace(/\\/g, '/')
  }
  // TODO(WO Logging): console.log akan diganti Logging Framework pada Work Order Logging.
  console.log(`[DataInfra] Production data root: ${infra.root}`)
  console.log(`[DataInfra] Directories ensured: ${infra.newlyCreated.length} created, ${infra.alreadyExisted.length} existed`)

  // Fix #3 (Installer Audit): pada instalasi bersih, skema DB dibuat otomatis
  // dengan menjalankan migration yang belum diterapkan (transaction-per-migration,
  // direkam ke tabel `_prisma_migrations` ala `prisma migrate deploy`). Dev tidak
  // terpengaruh — migration dev dikelola `prisma migrate deploy`.
  if (app.isPackaged) {
    const migrationsDir = path.join(process.resourcesPath, 'migrations')
    const migrationResult = await bootstrapMigrations(migrationsDir)
    console.log(`[Migrations] bootstrap: ${migrationResult.applied.length} applied, ${migrationResult.skipped.length} skipped`)
  }

  await initDatabase()
  await databaseReconciliationService.run()

  const container = createContainer(infra.paths, {
    liveDatabaseFile: resolveLiveDatabaseFile(
      process.env.DATABASE_URL ?? '',
      path.join(app.getAppPath(), 'prisma')
    ),
    disconnectLiveClients: async () => {
      await disconnectPrisma().catch(() => undefined)
      await closeDatabase().catch(() => undefined)
    },
    reconnectLiveClients: async () => {
      await connectPrisma()
      await initDatabase()
    },
  })
  registerAllHandlers(container, () => mainWindow)

  await container.settingService.get()

  createWindow()

  Menu.setApplicationMenu(null)

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
