// WO-6 — Smoke / UI Controller Test (Backup & Restore UI layer).
// Cakupan: kontrak stage UI (murni) + getTargetInfo (murni) + BackupInspector
// (DB-backed: baca .apbackup nyata → manifest + counts Buku/Anggota/Eksemplar)
// + BackupUIController.run (preflight ASLI + pacing + ringkasan) +
// RestoreUIController.run (8 stage + hasil restore).
// Engine (WO-1..WO-5) dipakai apa adanya — controller HANYA membungkus.
// Compile: npx tsc --module commonjs --moduleResolution node --target es2022
//   --esModuleInterop --skipLibCheck --rootDir . --outDir <tmp>\out wo6_backup_restore_ui_smoke/smoke.ts
// Run: node <tmp>\out\wo6_backup_restore_ui_smoke\smoke.js  (dengan DATABASE_URL
//   absolute fresh DB, sudah `prisma migrate deploy` dari workdir prisma/).

import fs from 'fs'
import os from 'os'
import path from 'path'
import { createAppPaths } from '../src/main/infrastructure/paths'
import { SchemaVersionReader } from '../src/main/infrastructure/backup/schema-version.reader'
import { ManifestBuilder } from '../src/main/infrastructure/backup/manifest-builder'
import { BackupPackager } from '../src/main/infrastructure/backup/packager'
import { BackupVerifier } from '../src/main/infrastructure/backup/verifier'
import { BackupService } from '../src/main/infrastructure/backup/backup.service'
import { DatabaseProvider } from '../src/main/infrastructure/providers/database.provider'
import { ProviderRegistry, RestoreHandlerRegistry } from '../src/main/domain/provider/provider-registry'
import {
  DatabaseRestoreHandler,
} from '../src/main/infrastructure/restore/database-restore.handler'
import { RestoreService, createRestoreDirs } from '../src/main/infrastructure/restore/restore.service'
import { resolveLiveDatabaseFile } from '../src/main/infrastructure/database-path'
import { RESTORE_STATUS } from '../src/main/domain/restore/restore-status'
import {
  BACKUP_UI_STAGES,
  RESTORE_UI_STAGES,
  BackupUIProgressEvent,
  RestoreUIProgressEvent,
} from '../src/shared/dto/backup-ui'
import {
  BackupInspector,
  BackupUIController,
  RestoreUIController,
} from '../src/main/services/backup-ui.service'
import { getPrisma, connectPrisma, disconnectPrisma } from '../src/main/repositories/base/prisma'

const EXPECTED_SCHEMA_VERSION = '20260810_wo_book_cover'

let passed = 0
let failed = 0

function check(name: string, condition: boolean): void {
  if (condition) {
    passed++
    console.log(`PASS: ${name}`)
  } else {
    failed++
    console.error(`FAIL: ${name}`)
  }
}

// ── 1. Pure: kontrak stage UI ────────────────────────────────────────────────
function testStageContracts(): void {
  check('BACKUP_UI_STAGES = 7', BACKUP_UI_STAGES.length === 7)
  check(
    'backup stage urutan PO (validate…complete)',
    BACKUP_UI_STAGES.join(',') === 'validate,collect,manifest,compress,verify,finalize,complete'
  )
  check('RESTORE_UI_STAGES = 8', RESTORE_UI_STAGES.length === 8)
  check(
    'restore stage urutan PO (validate…complete)',
    RESTORE_UI_STAGES.join(',') === 'validate,extract,verify,snapshot,restore,verify-after,cleanup,complete'
  )
  check(
    'total backup = 7 di tiap event',
    BACKUP_UI_STAGES[0] === 'validate' && BACKUP_UI_STAGES[BACKUP_UI_STAGES.length - 1] === 'complete'
  )
}

// ── 2. DB-backed: controller + inspector pada DB fresh + .apbackup nyata ─────
async function dbBackedSection(tempRoot: string): Promise<void> {
  const paths = createAppPaths(tempRoot)
  fs.mkdirSync(paths.tempDir, { recursive: true })
  fs.mkdirSync(paths.backupManualDir, { recursive: true })

  const DATABASE_URL = process.env.DATABASE_URL ?? ''
  const liveDatabaseFile = resolveLiveDatabaseFile(DATABASE_URL, process.cwd())
  check('liveDatabaseFile ter-resolve', liveDatabaseFile.length > 0)
  check('live DB file ada (sudah migrate deploy)', fs.existsSync(liveDatabaseFile))

  const reader = new SchemaVersionReader()
  const builder = new ManifestBuilder()
  const packager = new BackupPackager()
  const verifier = new BackupVerifier({ tempDir: paths.tempDir })

  const restoreWiring = {
    liveDatabaseFile,
    disconnectLiveClients: async (): Promise<void> => {
      await disconnectPrisma().catch(() => undefined)
    },
    reconnectLiveClients: async (): Promise<void> => {
      await connectPrisma()
    },
  }

  const dbProvider = new DatabaseProvider({ stagingDir: paths.tempDir })
  const providerRegistry = new ProviderRegistry()
  providerRegistry.register(dbProvider)
  const backupService = new BackupService({
    providerRegistry,
    schemaVersionReader: reader,
    manifestBuilder: builder,
    packager,
    verifier,
    paths,
    providerStagingDirs: new Map([[dbProvider.id.fullName, paths.tempDir]]),
  })

  const restoreDirs = createRestoreDirs(paths.tempDir)
  const databaseRestoreHandler = new DatabaseRestoreHandler({
    liveDatabaseFile,
    extractDir: restoreDirs.extractDir,
    stagingDir: restoreDirs.stagingDir,
    archiveDir: restoreDirs.archiveDir,
    snapshotDir: restoreDirs.snapshotDir,
    disconnectLiveClients: restoreWiring.disconnectLiveClients,
    reconnectLiveClients: restoreWiring.reconnectLiveClients,
  })
  const restoreHandlerRegistry = new RestoreHandlerRegistry()
  restoreHandlerRegistry.register(databaseRestoreHandler)
  const restoreService = new RestoreService({
    verifier,
    schemaVersionReader: reader,
    handlerRegistry: restoreHandlerRegistry,
    paths,
    liveDatabaseFile,
  })

  // ── 2a. getTargetInfo (keputusan PO #1: path FIXED, tanpa picker folder). ──
  const controller = new BackupUIController({ backupService, paths })
  const target = controller.getTargetInfo()
  check('target.backupDir === backupManualDir', target.backupDir === paths.backupManualDir)
  check(
    'target.sampleFilename ber-awalan APLibrary-backup-',
    /^APLibrary-backup-\d{8}-\d{6}-[0-9a-f-]{8}\.apbackup$/.test(target.sampleFilename)
  )
  check('target.extension === .apbackup', target.extension === '.apbackup')

  // ── 2b. Seed data (deterministik utk counts inspector). ──
  await getPrisma().book.createMany({
    data: [
      { id: 'b-wo6-1', title: 'Buku WO6 Satu', isbn: '978-6-0000-0001-0' },
      { id: 'b-wo6-2', title: 'Buku WO6 Dua', isbn: '978-6-0000-0002-0' },
    ],
  })
  await getPrisma().member.createMany({
    data: [
      { id: 'm-wo6-1', memberNumber: 'WO6-0001', fullName: 'Anggota WO6 Satu' },
      { id: 'm-wo6-2', memberNumber: 'WO6-0002', fullName: 'Anggota WO6 Dua' },
      { id: 'm-wo6-3', memberNumber: 'WO6-0003', fullName: 'Anggota WO6 Tiga' },
    ],
  })
  await getPrisma().bookCopy.createMany({
    data: [
      { id: 'c-wo6-1', bookId: 'b-wo6-1', inventoryNumber: 'INV-WO6-001', barcode: 'INV-WO6-001', shelfLocation: 'R1' },
      { id: 'c-wo6-2', bookId: 'b-wo6-1', inventoryNumber: 'INV-WO6-002', barcode: 'INV-WO6-002', shelfLocation: 'R1' },
      { id: 'c-wo6-3', bookId: 'b-wo6-2', inventoryNumber: 'INV-WO6-003', barcode: 'INV-WO6-003', shelfLocation: 'R2' },
      { id: 'c-wo6-4', bookId: 'b-wo6-2', inventoryNumber: 'INV-WO6-004', barcode: 'INV-WO6-004', shelfLocation: 'R2' },
    ],
  })
  check('seed books = 2', (await getPrisma().book.count()) === 2)
  check('seed members = 3', (await getPrisma().member.count()) === 3)
  check('seed copies = 4', (await getPrisma().bookCopy.count()) === 4)

  // ── 2c. BackupUIController.run — progress + ringkasan. ──
  const backupEvents: BackupUIProgressEvent[] = []
  const backupSummary = await controller.run({
    appVersion: '0.1.0',
    appName: 'APLibrary',
    onProgress: (event) => backupEvents.push(event),
  })
  check('backup status SUCCESS', backupSummary.status === 'SUCCESS')
  check('backup fileName ber-akhiran .apbackup', (backupSummary.fileName ?? '').endsWith('.apbackup'))
  check('backup filePath ada di backupManualDir', backupSummary.filePath !== null && fs.existsSync(backupSummary.filePath))
  check('backup filePath di dalam backupDir', (backupSummary.filePath ?? '').startsWith(paths.backupManualDir))
  check('backup sizeBytes > 0', (backupSummary.sizeBytes ?? 0) > 0)
  check('backup backupDir === backupManualDir', backupSummary.backupDir === paths.backupManualDir)
  check('backup durationMs >= 0', backupSummary.durationMs >= 0)
  check('backup tanpa error', backupSummary.errors.length === 0)
  check('progress backup: event pertama validate/1', backupEvents[0]?.stage === 'validate' && backupEvents[0]?.current === 1)
  check('progress backup: total 7 di tiap event', backupEvents.every((e) => e.total === BACKUP_UI_STAGES.length))
  check(
    'progress backup: current non-menurun',
    backupEvents.every((e, i) => i === 0 || backupEvents[i - 1].current <= e.current)
  )
  check(
    'progress backup: event terakhir complete/7 (sukses)',
    backupEvents[backupEvents.length - 1]?.stage === 'complete' &&
      backupEvents[backupEvents.length - 1]?.current === BACKUP_UI_STAGES.length
  )
  const backupPath = backupSummary.filePath as string

  // ── 2d. BackupInspector.inspect — .apbackup nyata. ──
  const inspector = new BackupInspector({ verifier, tempDir: paths.tempDir })
  const info = await inspector.inspect(backupPath)
  check('inspector ok', info.ok === true)
  check('inspector fileName sama', info.fileName === backupSummary.fileName)
  check('inspector bookCount = 2', info.bookCount === 2)
  check('inspector memberCount = 3', info.memberCount === 3)
  check('inspector copyCount = 4', info.copyCount === 4)
  check('inspector schemaVersion === F2a', info.schemaVersion === EXPECTED_SCHEMA_VERSION)
  check('inspector backupVersion = 1', info.backupVersion === 1)
  check('inspector appVersion = 0.1.0', info.appVersion === '0.1.0')
  check('inspector backupDate ISO valid', info.backupDate !== null && !Number.isNaN(Date.parse(info.backupDate)))
  check('inspector sizeBytes == stat', info.sizeBytes === fs.statSync(backupPath).size)
  check('inspector tanpa error', info.errors.length === 0)

  // ── 2e. BackupInspector.inspect — file tidak ada / bukan zip. ──
  const missingPath = path.join(paths.tempDir, 'missing.apbackup')
  const missingInfo = await inspector.inspect(missingPath)
  check('inspector missing → ok false', missingInfo.ok === false)
  check('inspector missing → error tidak dapat dibaca', missingInfo.errors.some((e) => e.includes('tidak dapat dibaca')))

  const garbagePath = path.join(paths.tempDir, 'garbage.apbackup')
  fs.writeFileSync(garbagePath, 'not a zip')
  const garbageInfo = await inspector.inspect(garbagePath)
  check('inspector garbage → ok false', garbageInfo.ok === false)
  check('inspector garbage → errors tidak kosong', garbageInfo.errors.length > 0)

  // ── 2f. RestoreUIController.run — 8 stage + hasil. ──
  const restoreController = new RestoreUIController({ restoreService })
  const restoreEvents: RestoreUIProgressEvent[] = []
  const restoreResult = await restoreController.run({
    backupFilePath: backupPath,
    onProgress: (event) => restoreEvents.push(event),
  })
  check('restore status SUCCESS', restoreResult.status === RESTORE_STATUS.SUCCESS)
  check('restore sessionId ber-awalan RST-', restoreResult.sessionId.startsWith('RST-'))
  check('restore schemaVersionBefore === F2a', restoreResult.schemaVersionBefore === EXPECTED_SCHEMA_VERSION)
  check('restore schemaVersionRestored === F2a', restoreResult.schemaVersionRestored === EXPECTED_SCHEMA_VERSION)
  check('restore needsRestart === true', restoreResult.needsRestart === true)
  check('restore durationMs >= 0', restoreResult.durationMs >= 0)
  check('restore tanpa error', restoreResult.errors.length === 0)
  check('progress restore: event pertama validate/1', restoreEvents[0]?.stage === 'validate' && restoreEvents[0]?.current === 1)
  check('progress restore: total 8 di tiap event', restoreEvents.every((e) => e.total === RESTORE_UI_STAGES.length))
  check(
    'progress restore: current non-menurun',
    restoreEvents.every((e, i) => i === 0 || restoreEvents[i - 1].current <= e.current)
  )
  check(
    'progress restore: event terakhir complete/8 (sukses)',
    restoreEvents[restoreEvents.length - 1]?.stage === 'complete' &&
      restoreEvents[restoreEvents.length - 1]?.current === RESTORE_UI_STAGES.length
  )

  // ── 2g. Live berisi isi backup setelah restore (round-trip). ──
  check('pasca restore: books tetap 2', (await getPrisma().book.count()) === 2)
  check('pasca restore: members tetap 3', (await getPrisma().member.count()) === 3)
  check('pasca restore: copies tetap 4', (await getPrisma().bookCopy.count()) === 4)
  check('pasca restore: integritas live ok', await liveIntegrityOk())

  // ── 2h. RestoreUIController.run — file rusak → FAILED tanpa complete. ──
  const failedEvents: RestoreUIProgressEvent[] = []
  const failedResult = await restoreController.run({
    backupFilePath: garbagePath,
    onProgress: (event) => failedEvents.push(event),
  })
  check('restore garbage → FAILED', failedResult.status === RESTORE_STATUS.FAILED)
  check('restore garbage → errors tidak kosong', failedResult.errors.length > 0)
  check('restore garbage → tidak ada event complete', failedEvents.every((e) => e.stage !== 'complete'))
  check(
    'restore garbage → event pertama validate/1',
    failedEvents[0]?.stage === 'validate' && failedEvents[0]?.current === 1
  )
}

async function liveIntegrityOk(): Promise<boolean> {
  const rows = (await getPrisma().$queryRawUnsafe('PRAGMA integrity_check')) as Array<{
    integrity_check: string
  }>
  return Array.isArray(rows) && rows.length > 0 && rows[0]?.integrity_check === 'ok'
}

async function main(): Promise<void> {
  testStageContracts()

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wo6-backup-ui-'))
  try {
    await dbBackedSection(tempRoot)
  } finally {
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true })
    } catch {
      // ignore cleanup failure
    }
  }

  console.log(`\nRESULT ${passed} passed, ${failed} failed`)
  if (failed > 0) {
    process.exit(1)
  }
}

main().catch((error) => {
  console.error('FATAL', error)
  process.exit(1)
})
