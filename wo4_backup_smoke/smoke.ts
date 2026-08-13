// WO-4 — Smoke / Engine Test untuk Backup Engine (schema version reader +
// manifest builder + packager + verifier + backup.service orchestrator).
// Bagian murni (filename/kind-mapping): tanpa DB/Electron.
// Bagian DB-backed: fresh DB temp (DATABASE_URL absolute) + DatabaseProvider.
// Compile: npx tsc --module commonjs --moduleResolution node --target es2022
//   --esModuleInterop --skipLibCheck --rootDir . --outDir <tmp>\out wo4_backup_smoke/smoke.ts
// Run: node <tmp>\out\wo4_backup_smoke\smoke.js   (dengan DATABASE_URL absolute fresh DB)

import fs from 'fs'
import os from 'os'
import path from 'path'
import { createHash } from 'crypto'
import AdmZip from 'adm-zip'
import { Manifest } from '../src/main/domain/manifest/manifest'
import { ManifestValidator } from '../src/main/domain/manifest/validator'
import { SchemaVersion } from '../src/main/domain/manifest/schema-version'
import { ManifestDomainError } from '../src/main/domain/manifest/domain-error'
import { BackupDomainError } from '../src/main/domain/backup/domain-error'
import { ProviderId } from '../src/main/domain/provider/provider-id'
import { PROVIDER_KINDS, ProviderKind } from '../src/main/domain/provider/provider-kind'
import {
  BackupProvider,
  ProviderCollectResult,
  ProviderVerifyResult,
  ProviderRequirement,
  PROVIDER_REQUIREMENTS,
  collectResultOf,
  verifyResultOf,
} from '../src/main/domain/provider/provider'
import { ProviderRegistry } from '../src/main/domain/provider/provider-registry'
import { createAppPaths } from '../src/main/infrastructure/paths'
import { SchemaVersionReader } from '../src/main/infrastructure/backup/schema-version.reader'
import {
  ManifestBuilder,
  ManifestEntrySource,
  computeManifestSha256,
  providerKindToManifestKind,
  MANIFEST_INTEGRITY_OK,
} from '../src/main/infrastructure/backup/manifest-builder'
import { BackupPackager, MANIFEST_FILENAME, APBACKUP_EXTENSION } from '../src/main/infrastructure/backup/packager'
import { BackupVerifier } from '../src/main/infrastructure/backup/verifier'
import {
  BackupService,
  BackupRunResult,
  buildBackupFilename,
} from '../src/main/infrastructure/backup/backup.service'
import { BACKUP_STATUS } from '../src/main/domain/backup/backup-status'
import { DatabaseProvider, DATABASE_SNAPSHOT_FILENAME } from '../src/main/infrastructure/providers/database.provider'

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

// ── 1. Pure: buildBackupFilename ─────────────────────────────────────────────
function testFilename(): void {
  const d = new Date(2026, 7, 6, 10, 30, 45)
  check('APBACKUP_EXTENSION === ".apbackup"', APBACKUP_EXTENSION === '.apbackup')
  check('MANIFEST_FILENAME === "manifest.json"', MANIFEST_FILENAME === 'manifest.json')
  const fn = buildBackupFilename(d, 'BKP-abc123')
  check('filename diawali APLibrary-backup-<timestamp>', fn.startsWith('APLibrary-backup-20260806-103045-'))
  check('filename diakhiri .apbackup', fn.endsWith(APBACKUP_EXTENSION))
  check('filename memuat ekor session', fn.includes('abc123'))
  check('filename menstripan karakter ilegal', buildBackupFilename(d, 'BKP: x/y').includes('BKPxy'))
  check('session berbeda → filename berbeda', buildBackupFilename(d, 'BKP-a') !== buildBackupFilename(d, 'BKP-b'))
}

// ── 2. Pure: providerKindToManifestKind ──────────────────────────────────────
function testKindMapping(): void {
  check('database → database', providerKindToManifestKind('database') === 'database')
  check('asset → asset', providerKindToManifestKind('asset') === 'asset')
  check('log → log', providerKindToManifestKind('log') === 'log')
  expectThrows(
    'configuration → throw (tanpa pasangan entry kind)',
    () => providerKindToManifestKind('configuration'),
    ManifestDomainError,
    'tidak dapat dipetakan'
  )
}

// ── Stub providers ───────────────────────────────────────────────────────────
class ThrowingOptionalProvider implements BackupProvider {
  readonly id = ProviderId.of({ name: 'assets', version: '1.0.0' })
  readonly kind: ProviderKind = PROVIDER_KINDS.ASSET
  readonly requirement: ProviderRequirement = PROVIDER_REQUIREMENTS.OPTIONAL

  async collect(): Promise<ProviderCollectResult> {
    throw new Error('stub optional gagal')
  }

  async verify(): Promise<ProviderVerifyResult> {
    return verifyResultOf(true)
  }

  async cleanup(): Promise<void> {
    return undefined
  }
}

class ThrowingRequiredProvider implements BackupProvider {
  readonly id = ProviderId.of({ name: 'logs', version: '1.0.0' })
  readonly kind: ProviderKind = PROVIDER_KINDS.LOG
  readonly requirement: ProviderRequirement = PROVIDER_REQUIREMENTS.REQUIRED

  async collect(): Promise<ProviderCollectResult> {
    throw new Error('stub required gagal')
  }

  async verify(): Promise<ProviderVerifyResult> {
    return verifyResultOf(true)
  }

  async cleanup(): Promise<void> {
    return undefined
  }
}

class GatedDatabaseProvider extends DatabaseProvider {
  constructor(stagingDir: string, private readonly gate: Promise<void>) {
    super({ stagingDir })
  }

  override async collect(): Promise<ProviderCollectResult> {
    await this.gate
    return super.collect()
  }
}

// ── 3. DB-backed section ─────────────────────────────────────────────────────
async function dbBackedSection(tempRoot: string): Promise<void> {
  const paths = createAppPaths(tempRoot)
  fs.mkdirSync(paths.tempDir, { recursive: true })
  fs.mkdirSync(paths.backupManualDir, { recursive: true })

  const reader = new SchemaVersionReader()
  const builder = new ManifestBuilder()
  const packager = new BackupPackager()
  const verifier = new BackupVerifier({ tempDir: paths.tempDir })

  // 3a. SchemaVersionReader (fresh DB)
  const schemaVersion = await reader.read()
  check('SchemaVersionReader.read → migration F2a', schemaVersion.value === EXPECTED_SCHEMA_VERSION)

  // 3b. ManifestBuilder — dummy asset entry (tanpa DB)
  const dummyPath = path.join(paths.tempDir, 'dummy-asset.bin')
  const dummyBytes = Buffer.from('WO4-dummy-asset-data', 'utf8')
  fs.writeFileSync(dummyPath, dummyBytes)
  const dummyManifest = await builder.build({
    appVersion: '1.2.3',
    appName: 'APLibrary',
    schemaVersion,
    createdAt: new Date(2026, 7, 6, 10, 0, 0),
    engine: 'vacuum-into',
    entries: [{ relativePath: 'assets/dummy.bin', stagingPath: dummyPath, kind: PROVIDER_KINDS.ASSET }],
  })
  check('builder.meta.backupVersion === 1', dummyManifest.meta.backupVersion === 1)
  check('builder.meta.appVersion === "1.2.3"', dummyManifest.meta.appVersion === '1.2.3')
  check('builder.meta.appName === "APLibrary"', dummyManifest.meta.appName === 'APLibrary')
  check('builder.meta.type === "full"', dummyManifest.meta.type === 'full')
  check('builder.meta.schemaVersion === migration F2a', dummyManifest.meta.schemaVersion.value === EXPECTED_SCHEMA_VERSION)
  check('builder.meta.engine === "vacuum-into"', dummyManifest.meta.engine === 'vacuum-into')
  check('builder.meta.integrity === "ok"', dummyManifest.meta.integrity === MANIFEST_INTEGRITY_OK)
  check('builder.entry.path === "assets/dummy.bin"', dummyManifest.files[0].path === 'assets/dummy.bin')
  check('builder.entry.sizeBytes === panjang byte', dummyManifest.files[0].sizeBytes === dummyBytes.length)
  check(
    'builder.entry.sha256 === sha256 file',
    dummyManifest.files[0].sha256.value === createHash('sha256').update(dummyBytes).digest('hex')
  )
  check('builder.entry.kind === "asset"', dummyManifest.files[0].kind === 'asset')
  check('builder.summary.files === 1', dummyManifest.summary.files === 1)
  check('builder.summary.totalBytes === panjang byte', dummyManifest.summary.totalBytes === dummyBytes.length)
  check(
    'manifestSha256 konsisten (recompute === tertulis)',
    computeManifestSha256(dummyManifest).equals(dummyManifest.checksums.manifestSha256)
  )

  // 3c. Packager + Verifier round-trip dengan database nyata
  const dbProvider = new DatabaseProvider({ stagingDir: paths.tempDir })
  const collect = await dbProvider.collect()
  check('collect.relativePath === aplibrary.db', collect.relativePath === DATABASE_SNAPSHOT_FILENAME)
  const dbStaging = path.join(paths.tempDir, DATABASE_SNAPSHOT_FILENAME)
  const realManifest = await builder.build({
    appVersion: '0.1.0',
    appName: 'APLibrary',
    schemaVersion,
    createdAt: new Date(2026, 7, 6, 10, 0, 0),
    engine: 'vacuum-into',
    entries: [{ relativePath: collect.relativePath, stagingPath: dbStaging, kind: PROVIDER_KINDS.DATABASE }],
  })
  const outPath = path.join(paths.tempDir, 'out.apbackup')
  const packaged = await packager.package({
    entries: [{ relativePath: collect.relativePath, stagingPath: dbStaging }],
    manifestJson: JSON.stringify(realManifest.toJSON()),
    outputPath: outPath,
  })
  check('packager.sizeBytes > 0', packaged.sizeBytes > 0)
  check('packager file tertulis', fs.existsSync(outPath))

  const vr = await verifier.verify(outPath)
  check('verifier round-trip valid → ok', vr.ok === true)
  check('verifier round-trip tanpa pesan', vr.messages.length === 0)
  check('verifier mengembalikan manifest', vr.manifest !== null)
  check('verifier manifest.files.length === 1', vr.manifest?.files.length === 1)
  check('verifier containerSha256 64 hex', /^[0-9a-f]{64}$/.test(vr.containerSha256))
  check(
    'verifier containerSha256 === sha256 file',
    vr.containerSha256 === createHash('sha256').update(fs.readFileSync(outPath)).digest('hex')
  )

  // 3d. Tamper: isi database diganti → sha256 entri tidak cocok
  const tamperedZip = new AdmZip()
  tamperedZip.addFile(DATABASE_SNAPSHOT_FILENAME, Buffer.from('TAMPERED-CONTENT'))
  tamperedZip.addFile(MANIFEST_FILENAME, Buffer.from(JSON.stringify(realManifest.toJSON()), 'utf8'))
  const tamperedPath = path.join(paths.tempDir, 'tampered.apbackup')
  await tamperedZip.writeZipPromise(tamperedPath, { overwrite: true })
  const vt = await verifier.verify(tamperedPath)
  check('verifier isi database ditamper → !ok', vt.ok === false)
  check('verifier isi database ditamper → pesan sha256', vt.messages.some((m) => m.includes('sha256')))

  // 3e. Tamper: manifest.json dimodifikasi (struktur tetap valid) → manifestSha256 tidak cocok
  const originalZip = new AdmZip(outPath)
  const parsedManifest = JSON.parse(originalZip.readFile(MANIFEST_FILENAME)?.toString('utf8') ?? '') as Record<string, unknown>
  ;(parsedManifest.meta as Record<string, unknown>).appVersion = '9.9.9'
  const manifestTamperedZip = new AdmZip()
  manifestTamperedZip.addFile(DATABASE_SNAPSHOT_FILENAME, originalZip.readFile(DATABASE_SNAPSHOT_FILENAME) as Buffer)
  manifestTamperedZip.addFile(MANIFEST_FILENAME, Buffer.from(JSON.stringify(parsedManifest), 'utf8'))
  const manifestTamperedPath = path.join(paths.tempDir, 'manifest-tampered.apbackup')
  await manifestTamperedZip.writeZipPromise(manifestTamperedPath, { overwrite: true })
  const vm = await verifier.verify(manifestTamperedPath)
  check('verifier manifest dimodifikasi → !ok', vm.ok === false)
  check('verifier manifest dimodifikasi → pesan manifestSha256', vm.messages.some((m) => m.includes('manifestSha256')))

  // 3f. Bukan zip / file hilang
  const garbagePath = path.join(paths.tempDir, 'garbage.apbackup')
  fs.writeFileSync(garbagePath, 'not a zip')
  const vg = await verifier.verify(garbagePath)
  check('verifier bukan zip → !ok', vg.ok === false)
  check('verifier bukan zip → pesan zip', vg.messages.some((m) => m.includes('zip')))

  const missingPath = path.join(paths.tempDir, 'nope.apbackup')
  const vn = await verifier.verify(missingPath)
  check('verifier file hilang → !ok', vn.ok === false)
  check('verifier file hilang → pesan tidak ditemukan', vn.messages.some((m) => m.includes('tidak ditemukan')))

  // 3g. BackupService end-to-end — SUCCESS
  const registry = new ProviderRegistry()
  registry.register(dbProvider)
  const service = new BackupService({
    providerRegistry: registry,
    schemaVersionReader: reader,
    manifestBuilder: builder,
    packager,
    verifier,
    paths,
    providerStagingDirs: new Map([[dbProvider.id.fullName, paths.tempDir]]),
  })

  const success = await service.run({ appVersion: '0.1.0', appName: 'APLibrary' })
  check('service SUCCESS status', success.status === BACKUP_STATUS.SUCCESS)
  check('service SUCCESS file ada', success.filePath !== null && fs.existsSync(success.filePath as string))
  check('service SUCCESS tanpa error', success.errors.length === 0)
  check('service SUCCESS tanpa warning', success.warnings.length === 0)
  check('service SUCCESS manifest terisi', success.manifest !== null)
  check(
    'service SUCCESS schemaVersion F2a',
    success.manifest?.meta.schemaVersion.value === EXPECTED_SCHEMA_VERSION
  )
  check('service SUCCESS backupVersion 1', success.manifest?.meta.backupVersion === 1)
  check('service SUCCESS type full', success.manifest?.meta.type === 'full')
  check('service SUCCESS engine vacuum-into', success.manifest?.meta.engine === 'vacuum-into')
  check('service SUCCESS files.length 1', success.manifest?.files.length === 1)
  check('service SUCCESS entry path aplibrary.db', success.manifest?.files[0].path === DATABASE_SNAPSHOT_FILENAME)
  check('service SUCCESS entry kind database', success.manifest?.files[0].kind === 'database')
  check(
    'service SUCCESS sizeBytes === ukuran file',
    success.sizeBytes === fs.statSync(success.filePath as string).size
  )
  check(
    'service SUCCESS file di backupManualDir',
    path.dirname(success.filePath as string) === paths.backupManualDir
  )
  const finalVerify = await verifier.verify(success.filePath as string)
  check('service SUCCESS file final lolos verifier', finalVerify.ok === true)
  check('service SUCCESS snapshot provider dibersihkan', !fs.existsSync(dbProvider.snapshotPath))
  check(
    'service SUCCESS staging sesi dihapus',
    !fs.existsSync(path.join(paths.tempDir, 'backup', success.sessionId))
  )

  // 3h. CANCELLED
  const cancelled = await service.run({
    appVersion: '0.1.0',
    appName: 'APLibrary',
    isCancelled: () => true,
  })
  check('service CANCELLED status', cancelled.status === BACKUP_STATUS.CANCELLED)
  check('service CANCELLED tanpa file', cancelled.filePath === null)
  check('service CANCELLED tanpa error', cancelled.errors.length === 0)

  // 3i. SUCCESS_WITH_WARNING (provider OPSIONAL gagal)
  const registryW = new ProviderRegistry()
  registryW.register(new DatabaseProvider({ stagingDir: paths.tempDir }))
  registryW.register(new ThrowingOptionalProvider())
  const serviceW = new BackupService({
    providerRegistry: registryW,
    schemaVersionReader: reader,
    manifestBuilder: builder,
    packager,
    verifier,
    paths,
    providerStagingDirs: new Map([['database@1.0.0', paths.tempDir]]),
  })
  const warned = await serviceW.run({ appVersion: '0.1.0', appName: 'APLibrary' })
  check('service WARNING status', warned.status === BACKUP_STATUS.SUCCESS_WITH_WARNING)
  check('service WARNING warning tercatat (assets@1.0.0)', warned.warnings.some((w) => w.includes('assets@1.0.0')))
  check('service WARNING file tetap dibuat', warned.filePath !== null && fs.existsSync(warned.filePath as string))
  check('service WARNING manifest hanya database', warned.manifest?.files.length === 1)

  // 3j. FAILED (provider WAJIB gagal)
  const registryF = new ProviderRegistry()
  registryF.register(new ThrowingRequiredProvider())
  const serviceF = new BackupService({
    providerRegistry: registryF,
    schemaVersionReader: reader,
    manifestBuilder: builder,
    packager,
    verifier,
    paths,
    providerStagingDirs: new Map(),
  })
  const failed = await serviceF.run({ appVersion: '0.1.0', appName: 'APLibrary' })
  check('service FAILED status', failed.status === BACKUP_STATUS.FAILED)
  check('service FAILED tanpa file', failed.filePath === null)
  check('service FAILED error collect tercatat', failed.errors.some((e) => e.includes('collect')))
  check('service FAILED tanpa manifest', failed.manifest === null)

  // 3k. Single-flight: run kedua ditolak saat run pertama berjalan
  let gateResolve: (() => void) | null = null
  const gate = new Promise<void>((resolve) => {
    gateResolve = resolve
  })
  const registryG = new ProviderRegistry()
  registryG.register(new GatedDatabaseProvider(paths.tempDir, gate))
  const serviceG = new BackupService({
    providerRegistry: registryG,
    schemaVersionReader: reader,
    manifestBuilder: builder,
    packager,
    verifier,
    paths,
    providerStagingDirs: new Map([['database@1.0.0', paths.tempDir]]),
  })
  const firstRun: Promise<BackupRunResult> = serviceG.run({ appVersion: '0.1.0', appName: 'APLibrary' })
  await new Promise((resolve) => setTimeout(resolve, 100))
  await expectRejected(
    'service single-flight: run kedua ditolak',
    () => serviceG.run({ appVersion: '0.1.0', appName: 'APLibrary' }),
    BackupDomainError,
    'sedang berjalan'
  )
  gateResolve?.()
  const first = await firstRun
  check('service single-flight: run pertama tetap SUCCESS', first.status === BACKUP_STATUS.SUCCESS)
}

async function main(): Promise<void> {
  testFilename()
  testKindMapping()

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wo4-backup-'))
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
