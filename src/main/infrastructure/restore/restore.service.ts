// WO-5 — Restore Engine (orchestrator).
// Pipeline restore RFC-004 §4/§5 / ADR-001 (SSOT), SATU run restore = SATU sesi:
//   intake → validate (gate awal) → extract → stage+verify → schema gate →
//   snapshot aman (WAJIB) → swap (satu-satunya titik tulis live) → post-verify →
//   ROLLBACK otomatis bila gagal → cleanup.
// Aturan ADR-001:
//   - Gate awal gagal → STOP, live TIDAK tersentuh.
//   - Snapshot WAJIB dibuat SEBELUM swap; gagal → restore ditolak.
//   - Schema backup lebih BARU → ditolak (forward protect, tanpa downgrade).
//   - Schema backup lebih LAMA → ditolak (migrasi-on-restore / Align belum
//     didukung v1 — @prisma/migrate tidak tersedia di runtime).
//   - Gagal swap / verifikasi pasca → ROLLBACK OTOMATIS ke snapshot.
//   - Single-flight: satu restore aktif per engine.
// Engine tidak terikat UI/IPC — hanya service + DTO hasil (WO-5, tanpa wiring UI).

import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import AdmZip from 'adm-zip'
import { PrismaClient } from '@prisma/client'
import { RestoreHandler } from '../../domain/provider/restore-handler'
import { RestoreHandlerRegistry } from '../../domain/provider/provider-registry'
import { PROVIDER_REQUIREMENTS } from '../../domain/provider/provider'
import { MANIFEST_ENTRY_KINDS } from '../../domain/manifest/entry'
import { Manifest } from '../../domain/manifest/manifest'
import { MANIFEST_BACKUP_VERSION } from '../../domain/manifest/metadata'
import { SchemaVersion } from '../../domain/manifest/schema-version'
import { RestoreDomainError } from '../../domain/restore/domain-error'
import { RESTORE_STATUS, RestoreStatus } from '../../domain/restore/restore-status'
import { BackupVerifier } from '../backup/verifier'
import { SchemaVersionReader } from '../backup/schema-version.reader'
import { AppPaths } from '../paths'
import { resolveWithin } from './fs-utils'
import { compareSchemaVersions } from './schema-compare'
import { isSafeSnapshotCapable } from './database-restore.handler'

export interface RestoreDirs {
  rootDir: string
  intakeDir: string
  extractDir: string
  stagingDir: string
  archiveDir: string
  snapshotDir: string
}

export function createRestoreDirs(tempDir: string): RestoreDirs {
  const rootDir = path.join(tempDir, 'restore')
  return {
    rootDir,
    intakeDir: path.join(rootDir, 'intake'),
    extractDir: path.join(rootDir, 'extract'),
    stagingDir: path.join(rootDir, 'stage'),
    archiveDir: path.join(rootDir, 'archive'),
    snapshotDir: path.join(rootDir, 'snapshot'),
  }
}

export interface RestoreRunOptions {
  backupFilePath: string
  isCancelled?: () => boolean
}

export interface RestoreRunResult {
  status: RestoreStatus
  sessionId: string
  startedAt: Date
  finishedAt: Date
  sourcePath: string
  schemaVersionBefore: string | null
  schemaVersionRestored: string | null
  files: number
  totalBytes: number
  warnings: string[]
  errors: string[]
  needsRestart: boolean
  rollbackPath: string | null
}

export interface RestoreServiceOptions {
  verifier: BackupVerifier
  schemaVersionReader: SchemaVersionReader
  handlerRegistry: RestoreHandlerRegistry
  paths: AppPaths
  liveDatabaseFile: string
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export class RestoreService {
  private _activeSessionId: string | null = null

  constructor(private readonly options: RestoreServiceOptions) {}

  get activeSessionId(): string | null {
    return this._activeSessionId
  }

  async run(options: RestoreRunOptions): Promise<RestoreRunResult> {
    if (this._activeSessionId !== null) {
      throw new RestoreDomainError(`restore lain sedang berjalan: ${this._activeSessionId}`)
    }
    const startedAt = new Date()
    const sessionId = `RST-${randomUUID().slice(0, 8)}`
    this._activeSessionId = sessionId

    const warnings: string[] = []
    const errors: string[] = []
    const dirs = createRestoreDirs(this.options.paths.tempDir)
    const stagedHandlers: RestoreHandler[] = []

    let status: RestoreStatus = RESTORE_STATUS.SUCCESS
    let manifest: Manifest | null = null
    let schemaVersionBefore: string | null = null
    let schemaVersionRestored: string | null = null
    let files = 0
    let totalBytes = 0
    let needsRestart = false
    let rollbackPath: string | null = null

    const finish = (): RestoreRunResult => ({
      status,
      sessionId,
      startedAt,
      finishedAt: new Date(),
      sourcePath: options.backupFilePath,
      schemaVersionBefore,
      schemaVersionRestored,
      files,
      totalBytes,
      warnings: [...warnings],
      errors: [...errors],
      needsRestart,
      rollbackPath,
    })

    try {
      if (fs.existsSync(dirs.rootDir)) {
        fs.rmSync(dirs.rootDir, { recursive: true, force: true })
      }
      fs.mkdirSync(dirs.intakeDir, { recursive: true })
      fs.mkdirSync(dirs.extractDir, { recursive: true })

      if (options.isCancelled?.()) {
        status = RESTORE_STATUS.CANCELLED
        return finish()
      }

      // 1. Intake — salin sumber ke staging restore (lokal aman).
      if (!fs.existsSync(options.backupFilePath)) {
        errors.push(`file backup tidak ditemukan: ${options.backupFilePath}`)
        status = RESTORE_STATUS.FAILED
        return finish()
      }
      const sourceName = path.basename(options.backupFilePath)
      const intakeFile = path.join(dirs.intakeDir, sourceName)
      fs.copyFileSync(options.backupFilePath, intakeFile)

      // 2. Gate awal (RFC-004 §3): wadah + manifest + checksum + integritas.
      const verification = await this.options.verifier.verify(intakeFile)
      if (!verification.ok) {
        errors.push(...verification.messages)
        status = RESTORE_STATUS.FAILED
        return finish()
      }
      manifest = verification.manifest
      if (manifest === null) {
        errors.push('wadah tidak memuat manifest yang valid')
        status = RESTORE_STATUS.FAILED
        return finish()
      }
      if (manifest.meta.backupVersion > MANIFEST_BACKUP_VERSION) {
        errors.push(
          `backupVersion ${manifest.meta.backupVersion} tidak didukung (maksimal ${MANIFEST_BACKUP_VERSION})`
        )
        status = RESTORE_STATUS.FAILED
        return finish()
      }
      const dbEntries = manifest.files.filter((entry) => entry.kind === MANIFEST_ENTRY_KINDS.DATABASE)
      if (dbEntries.length !== 1) {
        errors.push(`wadah wajib memuat tepat satu entri database (ditemukan ${dbEntries.length})`)
        status = RESTORE_STATUS.FAILED
        return finish()
      }

      if (options.isCancelled?.()) {
        status = RESTORE_STATUS.CANCELLED
        return finish()
      }

      // 3. Extract — isi wadah ke staging restore (path relatif, anti-traversal).
      const zip = new AdmZip(intakeFile)
      for (const entry of manifest.files) {
        const target = resolveWithin(dirs.extractDir, entry.path)
        const data = zip.readFile(entry.path)
        if (data === null || data === undefined) {
          errors.push(`entri "${entry.path}" tidak dapat diekstrak`)
          status = RESTORE_STATUS.FAILED
          return finish()
        }
        fs.mkdirSync(path.dirname(target), { recursive: true })
        fs.writeFileSync(target, data)
      }

      // 4. Stage + verify per entri.
      for (const entry of manifest.files) {
        const matches = this.options.handlerRegistry.discover().filter((handler) => handler.matches(entry))
        if (matches.length === 0) {
          errors.push(`tidak ada restore handler untuk entri "${entry.path}" (kind ${entry.kind})`)
          status = RESTORE_STATUS.FAILED
          return finish()
        }
        if (matches.length > 1) {
          errors.push(`lebih dari satu restore handler untuk entri "${entry.path}"`)
          status = RESTORE_STATUS.FAILED
          return finish()
        }
        const handler = matches[0]
        try {
          await handler.stage(entry)
          stagedHandlers.push(handler)
        } catch (error) {
          errors.push(`stage entri "${entry.path}" gagal: ${errorMessage(error)}`)
          status = RESTORE_STATUS.FAILED
          return finish()
        }
        const staged = await handler.verifyStaged(entry)
        if (!staged.ok) {
          errors.push(`verifikasi staging "${entry.path}" gagal: ${staged.messages.join('; ')}`)
          status = RESTORE_STATUS.FAILED
          return finish()
        }
      }

      if (options.isCancelled?.()) {
        status = RESTORE_STATUS.CANCELLED
        return finish()
      }

      // 5. Schema gate — bandingkan schema backup vs live.
      try {
        schemaVersionBefore = (await this.options.schemaVersionReader.read()).value
      } catch (error) {
        errors.push(`gagal membaca schema live: ${errorMessage(error)}`)
        status = RESTORE_STATUS.FAILED
        return finish()
      }
      schemaVersionRestored = manifest.meta.schemaVersion.value
      const comparison = compareSchemaVersions(manifest.meta.schemaVersion, SchemaVersion.of(schemaVersionBefore))
      if (comparison === 'newer') {
        errors.push(
          `schema backup (${schemaVersionRestored}) lebih baru dari live (${schemaVersionBefore}) — downgrade skema tidak didukung`
        )
        status = RESTORE_STATUS.FAILED
        return finish()
      }
      if (comparison === 'older') {
        errors.push(
          `schema backup (${schemaVersionRestored}) lebih lama dari live (${schemaVersionBefore}) — migrasi-on-restore (Align) belum didukung v1`
        )
        status = RESTORE_STATUS.FAILED
        return finish()
      }
      if (comparison === 'unknown') {
        errors.push(
          `kompatibilitas skema tidak dapat ditentukan (${schemaVersionBefore} vs ${schemaVersionRestored})`
        )
        status = RESTORE_STATUS.FAILED
        return finish()
      }

      // 6. Snapshot aman (WAJIB) — sebelum swap.
      for (const handler of stagedHandlers) {
        if (isSafeSnapshotCapable(handler)) {
          try {
            rollbackPath = await handler.captureSafeSnapshot()
          } catch (error) {
            errors.push(`gagal membuat snapshot aman: ${errorMessage(error)}`)
            status = RESTORE_STATUS.FAILED
            return finish()
          }
        } else if (handler.requirement === PROVIDER_REQUIREMENTS.REQUIRED) {
          errors.push(`handler WAJIB ${handler.id.fullName} tidak mendukung snapshot aman`)
          status = RESTORE_STATUS.FAILED
          return finish()
        }
      }

      // 7. Swap — satu-satunya titik tulis live.
      try {
        for (const handler of stagedHandlers) {
          const entry = manifest.files.find((candidate) => handler.matches(candidate))
          if (entry === undefined) {
            throw new Error(`entri tidak ditemukan untuk handler ${handler.id.fullName}`)
          }
          await handler.swapToLive(entry)
        }
      } catch (error) {
        errors.push(`swap gagal: ${errorMessage(error)}`)
        await this.rollbackAll(stagedHandlers, warnings, errors)
        status = RESTORE_STATUS.FAILED
        return finish()
      }

      // 8. Post-verify — integritas + schema live pasca-restore.
      const postMessages = await this.verifyLiveAfterSwap(manifest.meta.schemaVersion)
      if (postMessages.length > 0) {
        errors.push(...postMessages)
        await this.rollbackAll(stagedHandlers, warnings, errors)
        status = RESTORE_STATUS.FAILED
        return finish()
      }

      files = manifest.files.length
      totalBytes = manifest.summary.totalBytes
      needsRestart = true
      status = RESTORE_STATUS.SUCCESS
    } catch (error) {
      errors.push(`restore gagal: ${errorMessage(error)}`)
      status = RESTORE_STATUS.FAILED
    } finally {
      for (const handler of stagedHandlers) {
        try {
          await handler.cleanup()
        } catch {
          // ignore cleanup failure
        }
      }
      try {
        if (status === RESTORE_STATUS.SUCCESS && rollbackPath !== null && fs.existsSync(rollbackPath)) {
          const retained = path.join(this.options.paths.tempDir, 'restore-snapshots', `${sessionId}.db`)
          fs.mkdirSync(path.dirname(retained), { recursive: true })
          fs.copyFileSync(rollbackPath, retained)
          rollbackPath = retained
        }
        if (fs.existsSync(dirs.rootDir)) {
          fs.rmSync(dirs.rootDir, { recursive: true, force: true })
        }
      } catch {
        // ignore cleanup failure
      }
      this._activeSessionId = null
    }

    return finish()
  }

  private async rollbackAll(
    handlers: RestoreHandler[],
    warnings: string[],
    errors: string[]
  ): Promise<void> {
    for (const handler of handlers) {
      if (isSafeSnapshotCapable(handler)) {
        try {
          await handler.restoreFromSafeSnapshot()
          warnings.push(`rollback otomatis ke snapshot berhasil (${handler.id.fullName})`)
        } catch (error) {
          errors.push(`rollback otomatis gagal (${handler.id.fullName}): ${errorMessage(error)}`)
        }
      }
    }
  }

  private async verifyLiveAfterSwap(expectedSchema: SchemaVersion): Promise<string[]> {
    const messages: string[] = []
    const url = 'file:' + this.options.liveDatabaseFile.replace(/\\/g, '/')
    const client = new PrismaClient({ datasources: { db: { url } } })
    try {
      const rows = (await client.$queryRawUnsafe('PRAGMA integrity_check')) as Array<{
        integrity_check: string
      }>
      if (!Array.isArray(rows) || rows.length === 0 || rows[0]?.integrity_check !== 'ok') {
        messages.push('PRAGMA integrity_check database live pasca-restore tidak lulus')
      }
      const migrationRows = (await client.$queryRawUnsafe(
        `SELECT migration_name FROM "_prisma_migrations" WHERE rolled_back_at IS NULL AND finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1`
      )) as Array<{ migration_name: string }>
      const liveSchema = migrationRows?.[0]?.migration_name
      if (typeof liveSchema !== 'string' || liveSchema !== expectedSchema.value) {
        messages.push(
          `schema live pasca-restore (${liveSchema ?? '?'}) tidak cocok dengan schema backup (${expectedSchema.value})`
        )
      }
    } catch (error) {
      messages.push(`database live pasca-restore tidak dapat dibuka: ${errorMessage(error)}`)
    } finally {
      await client.$disconnect().catch(() => undefined)
    }
    return messages
  }
}
