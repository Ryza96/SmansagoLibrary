// WO-5 — Smoke / Engine Test untuk Restore Engine.
// Cakupan: schema-compare (murni) + fs-utils (murni) + database-path (murni) +
// createRestoreDirs (murni) + restore.service orchestrator + DatabaseRestoreHandler
// (DB-backed, fresh DB). Bagian DB-backed membuat sumber backup via BackupService
// (WO-4) terhadap DB live, lalu mengembalikannya via RestoreService — membuktikan
// round-trip + gate awal + schema gate + single-flight + snapshot aman.
// Compile: npx tsc --module commonjs --moduleResolution node --target es2022
//   --esModuleInterop --skipLibCheck --rootDir . --outDir <tmp>\out wo5_restore_smoke/smoke.ts
// Run: node <tmp>\out\wo5_restore_smoke\smoke.js  (dengan DATABASE_URL absolute fresh DB,
//   sudah `prisma migrate deploy` dari workdir prisma/ — smoke TIDAK menyiapkan DB).

import fs from 'fs'
import os from 'os'
import path from 'path'
import AdmZip from 'adm-zip'
import { Manifest, MANIFEST_FORMAT } from '../src/main/domain/manifest/manifest'
import { ManifestMetadata, MANIFEST_BACKUP_TYPE_FULL } from '../src/main/domain/manifest/metadata'
import { ManifestEntry } from '../src/main/domain/manifest/entry'
import { SchemaVersion } from '../src/main/domain/manifest/schema-version'
import { Checksum } from '../src/main/domain/manifest/checksum'
import { RestoreDomainError } from '../src/main/domain/restore/domain-error'
import { RESTORE_STATUS } from '../src/main/domain/restore/restore-status'
import { ProviderRegistry, RestoreHandlerRegistry } from '../src/main/domain/provider/provider-registry'
import { PROVIDER_KINDS } from '../src/main/domain/provider/provider-kind'
import { createAppPaths } from '../src/main/infrastructure/paths'
import { SchemaVersionReader } from '../src/main/infrastructure/backup/schema-version.reader'
import { ManifestBuilder, computeManifestSha256 } from '../src/main/infrastructure/backup/manifest-builder'
import { BackupPackager } from '../src/main/infrastructure/backup/packager'
import { BackupVerifier } from '../src/main/infrastructure/backup/verifier'
import { BackupService } from '../src/main/infrastructure/backup/backup.service'
import { DatabaseProvider, DATABASE_SNAPSHOT_FILENAME } from '../src/main/infrastructure/providers/database.provider'
import {
  DatabaseRestoreHandler,
  DatabaseRestoreHandlerOptions,
  isSafeSnapshotCapable,
} from '../src/main/infrastructure/restore/database-restore.handler'
import { RestoreService, createRestoreDirs, RestoreRunResult } from '../src/main/infrastructure/restore/restore.service'
import { compareSchemaVersions } from '../src/main/infrastructure/restore/schema-compare'
import { resolveWithin, moveFilePreserving, removeSideFiles } from '../src/main/infrastructure/restore/fs-utils'
import { resolveLiveDatabaseFile } from '../src/main/infrastructure/database-path'
import { getPrisma, connectPrisma, disconnectPrisma } from '../src/main/repositories/base/prisma'

const EXPECTED_SCHEMA_VERSION = '20260803_wo2_f2a_master_data_akademik'
const PROBE_TABLE = 'smoke_probe'

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

function expectThrows(
  name: string,
  fn: () => unknown,
  errorClass: new (...args: never[]) => Error,
  messagePart?: string
): void {
  try {
    fn()
    check(name, false)
  } catch (error) {
    const isDomain = error instanceof errorClass
    const msgOk = messagePart === undefined || (error instanceof Error && error.message.includes(messagePart))
    check(
      `${name} (${errorClass.name}${messagePart !== undefined ? `: ${messagePart}` : ''})`,
      isDomain && msgOk
    )
  }
}

async function expectRejected(
  name: string,
  fn: () => Promise<unknown>,
  errorClass: new (...args: never[]) => Error,
  messagePart?: string
): Promise<void> {
  try {
    await fn()
    check(name, false)
  } catch (error) {
    const isDomain = error instanceof errorClass
    const msgOk = messagePart === undefined || (error instanceof Error && error.message.includes(messagePart))
    check(
      `${name} (${errorClass.name}${messagePart !== undefined ? `: ${messagePart}` : ''})`,
      isDomain && msgOk
    )
  }
}

// ── 1. Pure: compareSchemaVersions ────────────────────────────────────────────
function testSchemaCompare(): void {
  const f2a = SchemaVersion.of(EXPECTED_SCHEMA_VERSION)
  check('same: identik → same', compareSchemaVersions(f2a, f2a) === 'same')
  check(
    'same: nilai sama (trim) → same',
    compareSchemaVersions(SchemaVersion.of(' 20260803_wo2_f2a_master_data_akademik '), f2a) === 'same'
  )
  check(
    'older: backup lama vs live → older',
    compareSchemaVersions(SchemaVersion.of('20200101_old_schema'), f2a) === 'older'
  )
  check(
    'newer: backup baru vs live → newer',
    compareSchemaVersions(SchemaVersion.of('99999999_future_schema'), f2a) === 'newer'
  )
  check('unknown: nama backup tanpa timestamp → unknown', compareSchemaVersions(SchemaVersion.of('v1'), f2a) === 'unknown')
  check('unknown: nama live tanpa timestamp → unknown', compareSchemaVersions(f2a, SchemaVersion.of('v1')) === 'unknown')
  check('unknown: keduanya tanpa timestamp (beda) → unknown', compareSchemaVersions(SchemaVersion.of('abc'), SchemaVersion.of('def')) === 'unknown')
  check(
    'same: keduanya sama walau bukan pola timestamp',
    compareSchemaVersions(SchemaVersion.of('20200101_old_schema'), SchemaVersion.of('20200101_old_schema')) === 'same'
  )
  check(
    'older vs older: timestamp lebih kecil → older',
    compareSchemaVersions(SchemaVersion.of('20260803_wo2_f2a_master_data_akademik'), SchemaVersion.of('20260804_next')) === 'older'
  )
}

// ── 2. Pure: createRestoreDirs ───────────────────────────────────────────────
function testRestoreDirs(): void {
  const dirs = createRestoreDirs('C:/temp-app')
  check('rootDir = tempDir/restore', dirs.rootDir === path.join('C:/temp-app', 'restore'))
  check('intakeDir di bawah rootDir', dirs.intakeDir === path.join(dirs.rootDir, 'intake'))
  check('extractDir di bawah rootDir', dirs.extractDir === path.join(dirs.rootDir, 'extract'))
  check('stagingDir di bawah rootDir', dirs.stagingDir === path.join(dirs.rootDir, 'stage'))
  check('archiveDir di bawah rootDir', dirs.archiveDir === path.join(dirs.rootDir, 'archive'))
  check('snapshotDir di bawah rootDir', dirs.snapshotDir === path.join(dirs.rootDir, 'snapshot'))
  const sixDirs = [
    dirs.rootDir,
    dirs.intakeDir,
    dirs.extractDir,
    dirs.stagingDir,
    dirs.archiveDir,
    dirs.snapshotDir,
  ]
  check('enam direktori restore unik', new Set(sixDirs).size === 6)
}

// ── 3. Pure: resolveLiveDatabaseFile ─────────────────────────────────────────
function testDatabasePath(): void {
  check(
    'file: absolut Windows (forward-slash) → normalized',
    resolveLiveDatabaseFile('file:C:/data/app.db') === path.normalize('C:/data/app.db')
  )
  check(
    'file: absolut POSIX → normalized',
    resolveLiveDatabaseFile('file:/data/app.db') === path.normalize('/data/app.db')
  )
  check(
    'file: relatif + schemaDir → absolute terhadap schemaDir',
    resolveLiveDatabaseFile('file:./aplibrary.db', 'C:/schema') === path.resolve('C:/schema', 'aplibrary.db')
  )
  check(
    'file: relatif tanpa schemaDir → absolute terhadap cwd',
    resolveLiveDatabaseFile('file:./aplibrary.db') === path.resolve(process.cwd(), 'aplibrary.db')
  )
  check(
    'bukan file: → fallback path apa adanya terhadap cwd',
    resolveLiveDatabaseFile('C:\\data\\app.db') === path.resolve(process.cwd(), 'C:\\data\\app.db')
  )
  check(
    'backslash di URL di-normalize',
    resolveLiveDatabaseFile('file:C:/data\\app.db') === path.normalize('C:/data/app.db')
  )
  check('empty string → cwd', resolveLiveDatabaseFile('') === path.resolve(process.cwd(), ''))
}

// ── 4. Pure: fs-utils ────────────────────────────────────────────────────────
function testFsUtils(tempRoot: string): void {
  const base = path.join(tempRoot, 'stage')
  fs.mkdirSync(base, { recursive: true })
  check('resolveWithin: path dalam base → resolved', resolveWithin(base, 'a/b.db') === path.join(base, 'a', 'b.db'))
  check('resolveWithin: "." → base', resolveWithin(base, '.') === base)
  expectThrows(
    'resolveWithin: ../ melarikan diri → throw',
    () => resolveWithin(base, '../escape.db'),
    Error,
    'di luar area staging'
  )
  expectThrows(
    'resolveWithin: path absolut → throw',
    () => resolveWithin(base, 'C:/abs.db'),
    Error,
    'di luar area staging'
  )

  const src = path.join(tempRoot, 'src.bin')
  const dst = path.join(tempRoot, 'dst.bin')
  fs.writeFileSync(src, Buffer.from('move-test'))
  moveFilePreserving(src, dst)
  check('moveFilePreserving: target tertulis', fs.readFileSync(dst).toString() === 'move-test')
  check('moveFilePreserving: sumber hilang', !fs.existsSync(src))

  const db = path.join(tempRoot, 'live.db')
  fs.writeFileSync(db, 'db')
  fs.writeFileSync(db + '-wal', 'wal')
  fs.writeFileSync(db + '-shm', 'shm')
  removeSideFiles(db)
  check('removeSideFiles: -wal dihapus', !fs.existsSync(db + '-wal'))
  check('removeSideFiles: -shm dihapus', !fs.existsSync(db + '-shm'))
  check('removeSideFiles: db utama utuh', fs.existsSync(db))
}

// ── DB-backed helpers ────────────────────────────────────────────────────────
class GatedRestoreHandler extends DatabaseRestoreHandler {
  constructor(options: DatabaseRestoreHandlerOptions, private readonly gate: Promise<void>) {
    super(options)
  }

  override async stage(entry: ManifestEntry): Promise<void> {
    await this.gate
    return super.stage(entry)
  }
}

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

  // Backup engine (WO-4) — sumber backup terhadap live DB.
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

  // Restore engine (WO-5).
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
  check('handler adalah SafeSnapshotCapable', isSafeSnapshotCapable(databaseRestoreHandler))
  const restoreHandlerRegistry = new RestoreHandlerRegistry()
  restoreHandlerRegistry.register(databaseRestoreHandler)
  check('handler terdaftar di registry', restoreHandlerRegistry.count() === 1)
  const restoreService = new RestoreService({
    verifier,
    schemaVersionReader: reader,
    handlerRegistry: restoreHandlerRegistry,
    paths,
    liveDatabaseFile,
  })

  // Probe: tabel marker + isi A (bukti isi DB yang dibackup/direstore).
  await getPrisma().$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS ${PROBE_TABLE} (marker TEXT)`)
  await getPrisma().$executeRawUnsafe(`INSERT INTO ${PROBE_TABLE} (marker) VALUES ('A')`)
  check('probe A tertulis di live', (await liveMarkers()).join(',') === 'A')

  // 5a. Backup sumber (isi A).
  const backup = await backupService.run({ appVersion: '0.1.0', appName: 'APLibrary' })
  check('backup SUCCESS', backup.status === 'SUCCESS')
  check('backup filePath ada', backup.filePath !== null && fs.existsSync(backup.filePath as string))
  const backup1Path = backup.filePath as string

  // 5b. Restore round-trip SUCCESS.
  const restored = await restoreService.run({ backupFilePath: backup1Path })
  check('restore status SUCCESS', restored.status === RESTORE_STATUS.SUCCESS)
  check('restore sessionId ber-awalan RST-', restored.sessionId.startsWith('RST-'))
  check('restore schemaVersionBefore === F2a', restored.schemaVersionBefore === EXPECTED_SCHEMA_VERSION)
  check('restore schemaVersionRestored === F2a', restored.schemaVersionRestored === EXPECTED_SCHEMA_VERSION)
  check('restore files === 1', restored.files === 1)
  check('restore totalBytes > 0', restored.totalBytes > 0)
  check('restore needsRestart === true', restored.needsRestart === true)
  check('restore tanpa error', restored.errors.length === 0)
  check('restore tanpa warning', restored.warnings.length === 0)
  check('restore rollbackPath diisi', restored.rollbackPath !== null)
  check('restore snapshot dipertahankan di restore-snapshots', restored.rollbackPath !== null && fs.existsSync(restored.rollbackPath as string))
  check(
    'restore snapshot path di tempDir/restore-snapshots',
    (restored.rollbackPath as string).includes(path.join('restore-snapshots'))
  )
  check('live tetap berisi A setelah restore', (await liveMarkers()).join(',') === 'A')
  check('live integritas ok setelah restore', await liveIntegrityOk())
  const restoredSessionId = restored.sessionId

  // 5c. Bukti swap: ubah live (tambah B), backup (isi A+B), restore backup1 → B hilang.
  await getPrisma().$executeRawUnsafe(`INSERT INTO ${PROBE_TABLE} (marker) VALUES ('B')`)
  check('live kini A+B', (await liveMarkers()).join(',') === 'A,B')
  const backup2 = await backupService.run({ appVersion: '0.1.0', appName: 'APLibrary' })
  check('backup2 SUCCESS (isi A+B)', backup2.status === 'SUCCESS')
  const restoredAfterSwap = await restoreService.run({ backupFilePath: backup1Path })
  check('restore (swap) status SUCCESS', restoredAfterSwap.status === RESTORE_STATUS.SUCCESS)
  check('restore (swap) tanpa error', restoredAfterSwap.errors.length === 0)
  check('restore (swap) needsRestart', restoredAfterSwap.needsRestart === true)
  check('live kembali hanya A (B hilang → file diganti)', (await liveMarkers()).join(',') === 'A')
  check('live integritas ok pasca swap', await liveIntegrityOk())

  // 5d. Idempoten: restore ulang file yang sama → SUCCESS, live tetap A.
  const restoredAgain = await restoreService.run({ backupFilePath: backup1Path })
  check('restore ulang SUCCESS (idempoten)', restoredAgain.status === RESTORE_STATUS.SUCCESS)
  check('restore ulang live tetap A', (await liveMarkers()).join(',') === 'A')

  // 5e. Gate awal — file tidak ada.
  const missingPath = path.join(paths.tempDir, 'nope.apbackup')
  const gateMissing = await restoreService.run({ backupFilePath: missingPath })
  check('gate file hilang → FAILED', gateMissing.status === RESTORE_STATUS.FAILED)
  check('gate file hilang → error tidak ditemukan', gateMissing.errors.some((e) => e.includes('tidak ditemukan')))
  await ensureLiveOnlyMarkerA()

  // 5f. Gate awal — bukan zip.
  const garbagePath = path.join(paths.tempDir, 'garbage.apbackup')
  fs.writeFileSync(garbagePath, 'not a zip')
  const gateGarbage = await restoreService.run({ backupFilePath: garbagePath })
  check('gate bukan zip → FAILED', gateGarbage.status === RESTORE_STATUS.FAILED)
  check('gate bukan zip → error zip', gateGarbage.errors.some((e) => e.includes('zip')))
  await ensureLiveOnlyMarkerA()

  // 5g. Gate awal — isi database di dalam wadah ditamper (sha256 entri tidak cocok).
  const originalZip = new AdmZip(backup1Path)
  const originalManifest = originalZip.readFile('manifest.json')?.toString('utf8') ?? ''
  const tamperedZip = new AdmZip()
  tamperedZip.addFile(DATABASE_SNAPSHOT_FILENAME, Buffer.from('TAMPERED-DB-CONTENT'))
  tamperedZip.addFile('manifest.json', Buffer.from(originalManifest, 'utf8'))
  const tamperedPath = path.join(paths.tempDir, 'tampered.apbackup')
  await tamperedZip.writeZipPromise(tamperedPath, { overwrite: true })
  const gateTamper = await restoreService.run({ backupFilePath: tamperedPath })
  check('gate tamper DB → FAILED', gateTamper.status === RESTORE_STATUS.FAILED)
  check('gate tamper DB → error sha256', gateTamper.errors.some((e) => e.includes('sha256')))
  await ensureLiveOnlyMarkerA()

  // Helper membangun wadah valid dengan schemaVersion/backupVersion custom.
  async function buildArchiveWithMeta(schemaValue: string, outputPath: string, backupVersion?: number): Promise<void> {
    const snapProvider = new DatabaseProvider({ stagingDir: paths.tempDir })
    try {
      await snapProvider.collect()
      const snapPath = snapProvider.snapshotPath
      const base = await builder.build({
        appVersion: '0.1.0',
        appName: 'APLibrary',
        schemaVersion: SchemaVersion.of(schemaValue),
        createdAt: new Date(2026, 7, 6, 10, 0, 0),
        engine: 'vacuum-into',
        entries: [
          { relativePath: DATABASE_SNAPSHOT_FILENAME, stagingPath: snapPath, kind: PROVIDER_KINDS.DATABASE },
        ],
      })
      let manifest = base
      if (backupVersion !== undefined) {
        const meta = ManifestMetadata.of({
          backupVersion,
          appVersion: '0.1.0',
          schemaVersion: SchemaVersion.of(schemaValue),
          createdAt: new Date(2026, 7, 6, 10, 0, 0),
          appName: 'APLibrary',
          type: MANIFEST_BACKUP_TYPE_FULL,
          engine: 'vacuum-into',
          integrity: 'ok',
        })
        const draft = Manifest.create({
          format: MANIFEST_FORMAT,
          meta,
          files: base.files,
          summary: base.summary,
          checksums: { manifestSha256: Checksum.of('0'.repeat(64)) },
        })
        manifest = Manifest.create({
          format: MANIFEST_FORMAT,
          meta,
          files: base.files,
          summary: base.summary,
          checksums: { manifestSha256: computeManifestSha256(draft) },
        })
      }
      await packager.package({
        entries: [{ relativePath: DATABASE_SNAPSHOT_FILENAME, stagingPath: snapPath }],
        manifestJson: JSON.stringify(manifest.toJSON()),
        outputPath,
      })
    } finally {
      await snapProvider.cleanup().catch(() => undefined)
    }
  }

  // 5h. Schema gate — backup lebih BARU → ditolak (forward protect).
  const newerPath = path.join(paths.tempDir, 'newer.apbackup')
  await buildArchiveWithMeta('99999999_future_schema', newerPath)
  const gateNewer = await restoreService.run({ backupFilePath: newerPath })
  check('schema gate lebih baru → FAILED', gateNewer.status === RESTORE_STATUS.FAILED)
  check('schema gate lebih baru → error downgrade', gateNewer.errors.some((e) => e.includes('downgrade')))
  check('schema gate lebih baru → schemaBefore terisi', gateNewer.schemaVersionBefore === EXPECTED_SCHEMA_VERSION)
  check(
    'schema gate lebih baru → schemaRestored terisi',
    gateNewer.schemaVersionRestored === '99999999_future_schema'
  )
  await ensureLiveOnlyMarkerA()

  // 5i. Schema gate — backup lebih LAMA → ditolak (Align belum didukung v1).
  const olderPath = path.join(paths.tempDir, 'older.apbackup')
  await buildArchiveWithMeta('20200101_old_schema', olderPath)
  const gateOlder = await restoreService.run({ backupFilePath: olderPath })
  check('schema gate lebih lama → FAILED', gateOlder.status === RESTORE_STATUS.FAILED)
  check('schema gate lebih lama → error Align', gateOlder.errors.some((e) => e.includes('Align')))
  await ensureLiveOnlyMarkerA()

  // 5j. Schema gate — nama tidak dapat dibandingkan → ditolak (jalur aman).
  const unknownPath = path.join(paths.tempDir, 'unknown.apbackup')
  await buildArchiveWithMeta('v1', unknownPath)
  const gateUnknown = await restoreService.run({ backupFilePath: unknownPath })
  check('schema gate unknown → FAILED', gateUnknown.status === RESTORE_STATUS.FAILED)
  check('schema gate unknown → error kompatibilitas', gateUnknown.errors.some((e) => e.includes('kompatibilitas')))
  await ensureLiveOnlyMarkerA()

  // 5k. backupVersion lebih tinggi → ditolak.
  const bvPath = path.join(paths.tempDir, 'backupv2.apbackup')
  await buildArchiveWithMeta(EXPECTED_SCHEMA_VERSION, bvPath, 2)
  const gateBv = await restoreService.run({ backupFilePath: bvPath })
  check('backupVersion 2 → FAILED', gateBv.status === RESTORE_STATUS.FAILED)
  check('backupVersion 2 → error tidak didukung', gateBv.errors.some((e) => e.includes('tidak didukung')))
  await ensureLiveOnlyMarkerA()

  // 5l. CANCELLED — dibatalkan sebelum menulis apa pun.
  const cancelled = await restoreService.run({ backupFilePath: backup1Path, isCancelled: () => true })
  check('restore CANCELLED', cancelled.status === RESTORE_STATUS.CANCELLED)
  check('restore CANCELLED tanpa error', cancelled.errors.length === 0)
  check('restore CANCELLED tanpa rollback', cancelled.rollbackPath === null)
  await ensureLiveOnlyMarkerA()

  // 5m. Single-flight — run kedua ditolak saat run pertama berjalan.
  let gateResolve: (() => void) | null = null
  const gate = new Promise<void>((resolve) => {
    gateResolve = resolve
  })
  const gatedHandler = new GatedRestoreHandler(
    {
      liveDatabaseFile,
      extractDir: restoreDirs.extractDir,
      stagingDir: restoreDirs.stagingDir,
      archiveDir: restoreDirs.archiveDir,
      snapshotDir: restoreDirs.snapshotDir,
      disconnectLiveClients: restoreWiring.disconnectLiveClients,
      reconnectLiveClients: restoreWiring.reconnectLiveClients,
    },
    gate
  )
  const gatedRegistry = new RestoreHandlerRegistry()
  gatedRegistry.register(gatedHandler)
  const gatedService = new RestoreService({
    verifier,
    schemaVersionReader: reader,
    handlerRegistry: gatedRegistry,
    paths,
    liveDatabaseFile,
  })
  const firstRun: Promise<RestoreRunResult> = gatedService.run({ backupFilePath: backup1Path })
  await new Promise((resolve) => setTimeout(resolve, 150))
  await expectRejected(
    'single-flight: run kedua ditolak',
    () => gatedService.run({ backupFilePath: backup1Path }),
    RestoreDomainError,
    'sedang berjalan'
  )
  gateResolve?.()
  const gatedFirst = await firstRun
  check('single-flight: run pertama tetap SUCCESS', gatedFirst.status === RESTORE_STATUS.SUCCESS)
  check('single-flight: live tetap A', (await liveMarkers()).join(',') === 'A')
  check('single-flight: snapshot sesi dipertahankan', gatedFirst.rollbackPath !== null)

  // 5n. Snapshot sesi dari 5b masih dipertahankan di restore-snapshots.
  const retainedPath = path.join(paths.tempDir, 'restore-snapshots', `${restoredSessionId}.db`)
  check('snapshot sesi 5b dipertahankan', fs.existsSync(retainedPath))
  check('snapshot sesi 5b bukan file kosong', fs.statSync(retainedPath).size > 0)
}

async function liveMarkers(): Promise<string[]> {
  const rows = (await getPrisma().$queryRawUnsafe(
    `SELECT marker FROM ${PROBE_TABLE} ORDER BY marker`
  )) as Array<{ marker: string }>
  return rows.map((r) => r.marker)
}

async function liveIntegrityOk(): Promise<boolean> {
  const rows = (await getPrisma().$queryRawUnsafe('PRAGMA integrity_check')) as Array<{
    integrity_check: string
  }>
  return Array.isArray(rows) && rows.length > 0 && rows[0]?.integrity_check === 'ok'
}

async function ensureLiveOnlyMarkerA(): Promise<void> {
  const markers = await liveMarkers()
  check('live berisi marker A', markers.includes('A'))
  check('live TIDAK berisi marker B', !markers.includes('B'))
}

async function main(): Promise<void> {
  testSchemaCompare()
  testRestoreDirs()
  testDatabasePath()

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wo5-restore-'))
  try {
    testFsUtils(tempRoot)
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
