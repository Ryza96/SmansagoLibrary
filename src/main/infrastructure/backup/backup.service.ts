// WO-4 — Backup Engine (orchestrator).
// Pipeline RFC-003 §4/§5 / ADR-001 (SSOT), SATU run backup = SATU sesi:
//   session(id+timestamp) → preflight → collect providers → build manifest →
//   package (.apbackup) → verify (round-trip) → finalize (pindah ke backupManualDir).
// Aturan ADR-001:
//   - Preflight gagal → batalkan SEBELUM menulis apa pun → FAILED.
//   - Provider WAJIB gagal → Abort → FAILED. Provider OPSIONAL gagal → dilewati
//     → SUCCESS_WITH_WARNING (manifest tetap dibangun, provider dilewati tercatat).
//   - Pembatalan (isCancelled) di titik antar-fase → CANCELLED, tanpa file permanen.
//   - Single-flight: satu run aktif per engine (mencegah dua run menimpa staging).
//   - Selalu cleanup: provider.cleanup() untuk provider yang sempat collect +
//     staging area per-sesi dihapus (try/finally).
// Lokasi output provider diketahui via providerStagingDirs (wiring infra) —
// kontrak BackupProvider (WO-3) tidak menyediakan jalur staging; pemetaan ini
// disediakan di tempat provider dikonstruksi (bootstrap).
// Engine tidak boleh terikat UI/IPC — hanya service + DTO hasil (WO-4, tanpa wiring).

import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { AppPaths } from '../paths'
import { getPrisma } from '../../repositories/base/prisma'
import { ProviderRegistry } from '../../domain/provider/provider-registry'
import { BackupProvider, PROVIDER_REQUIREMENTS } from '../../domain/provider/provider'
import {
  PreflightItem,
  PreflightReport,
  PREFLIGHT_STATUS,
  ProviderPreflightState,
  ProviderPreflightDecision,
  decideProviderPreflight,
} from '../../domain/provider/preflight'
import { Manifest } from '../../domain/manifest/manifest'
import { BackupSession, BackupSessionId } from '../../domain/backup/backup-session'
import { BACKUP_STATUS, BackupStatus } from '../../domain/backup/backup-status'
import { BackupDomainError } from '../../domain/backup/domain-error'
import { SchemaVersionReader } from './schema-version.reader'
import { ManifestBuilder, ManifestEntrySource } from './manifest-builder'
import { BackupPackager, APBACKUP_EXTENSION } from './packager'
import { BackupVerifier } from './verifier'
import { DATABASE_PROVIDER_ENGINE } from '../providers/database.provider'

export interface BackupServiceOptions {
  providerRegistry: ProviderRegistry
  schemaVersionReader: SchemaVersionReader
  manifestBuilder: ManifestBuilder
  packager: BackupPackager
  verifier: BackupVerifier
  paths: AppPaths
  providerStagingDirs: ReadonlyMap<string, string>
}

export interface BackupRunOptions {
  appVersion: string
  appName: string
  engine?: string
  isCancelled?: () => boolean
}

export interface BackupRunResult {
  status: BackupStatus
  sessionId: string
  startedAt: Date
  finishedAt: Date
  filePath: string | null
  sizeBytes: number | null
  manifest: Manifest | null
  warnings: string[]
  errors: string[]
}

export interface BackupPreflightOutcome {
  report: PreflightReport
  decision: ProviderPreflightDecision
}

export function buildBackupFilename(startedAt: Date, sessionId: string): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  const date = `${startedAt.getFullYear()}${pad(startedAt.getMonth() + 1)}${pad(startedAt.getDate())}`
  const time = `${pad(startedAt.getHours())}${pad(startedAt.getMinutes())}${pad(startedAt.getSeconds())}`
  const shortId = sessionId.replace(/[^a-zA-Z0-9-]/g, '').slice(-8)
  return `APLibrary-backup-${date}-${time}-${shortId}${APBACKUP_EXTENSION}`
}

export class BackupService {
  private _activeSessionId: string | null = null

  constructor(private readonly options: BackupServiceOptions) {}

  async run(options: BackupRunOptions): Promise<BackupRunResult> {
    if (this._activeSessionId !== null) {
      throw new BackupDomainError(`backup lain sedang berjalan (sesi ${this._activeSessionId})`)
    }

    const startedAt = new Date()
    const session = BackupSession.of({
      id: BackupSessionId.of(`BKP-${randomUUID()}`),
      startedAt,
    })
    this._activeSessionId = session.id.value

    const warnings: string[] = []
    const errors: string[] = []
    const stagingRoot = path.join(this.options.paths.tempDir, 'backup', session.id.value)
    const collectedProviders: BackupProvider[] = []
    const stagedEntries: ManifestEntrySource[] = []

    let status: BackupStatus = BACKUP_STATUS.SUCCESS
    let manifest: Manifest | null = null
    let filePath: string | null = null
    let sizeBytes: number | null = null

    const finish = (): BackupRunResult => ({
      status,
      sessionId: session.id.value,
      startedAt,
      finishedAt: new Date(),
      filePath,
      sizeBytes,
      manifest,
      warnings: [...warnings],
      errors: [...errors],
    })

    try {
      // ── 1. Preflight (RFC-003 §4.1/§4.2): lulus atau batalkan SEBELUM menulis. ──
      const preflight = await this.runPreflight()
      if (options.isCancelled?.()) {
        status = BACKUP_STATUS.CANCELLED
        return finish()
      }
      if (!preflight.report.ok) {
        status = BACKUP_STATUS.FAILED
        errors.push(
          ...preflight.report.failedItems.map((item) => `preflight: ${item.name} — ${item.message}`)
        )
        return finish()
      }
      warnings.push(...preflight.decision.warnings)
      if (preflight.report.hasWarning && status === BACKUP_STATUS.SUCCESS) {
        status = BACKUP_STATUS.SUCCESS_WITH_WARNING
      }

      // ── 2. Collect providers (WAJIB dulu, lalu OPSIONAL). ──
      const providers = [
        ...this.options.providerRegistry.requiredProviders(),
        ...this.options.providerRegistry.optionalProviders(),
      ]
      for (const provider of providers) {
        if (options.isCancelled?.()) {
          status = BACKUP_STATUS.CANCELLED
          return finish()
        }
        try {
          const result = await provider.collect()
          collectedProviders.push(provider)
          stagedEntries.push({
            relativePath: result.relativePath,
            stagingPath: this.resolveStagedPath(provider, result.relativePath),
            kind: result.kind,
          })
        } catch (error) {
          const detail = `${provider.id.fullName}: ${error instanceof Error ? error.message : String(error)}`
          if (provider.requirement === PROVIDER_REQUIREMENTS.REQUIRED) {
            status = BACKUP_STATUS.FAILED
            errors.push(`collect ${detail}`)
            return finish()
          }
          warnings.push(`collect ${detail}`)
          if (status === BACKUP_STATUS.SUCCESS) {
            status = BACKUP_STATUS.SUCCESS_WITH_WARNING
          }
        }
      }

      if (stagedEntries.length === 0) {
        status = BACKUP_STATUS.FAILED
        errors.push('tidak ada data yang dapat dikumpulkan dari provider mana pun')
        return finish()
      }

      // ── 3. Manifest (RFC-002 §4 / ADR-001 §6). ──
      const schemaVersion = await this.options.schemaVersionReader.read()
      manifest = await this.options.manifestBuilder.build({
        appVersion: options.appVersion,
        appName: options.appName,
        schemaVersion,
        createdAt: session.startedAt,
        engine: options.engine ?? DATABASE_PROVIDER_ENGINE,
        entries: stagedEntries,
      })

      // ── 4. Package ke staging (belum permanen). ──
      fs.mkdirSync(stagingRoot, { recursive: true })
      const stagedPackage = path.join(stagingRoot, `backup${APBACKUP_EXTENSION}`)
      const manifestJson = JSON.stringify(manifest.toJSON())
      await this.options.packager.package({
        entries: stagedEntries.map((entry) => ({
          relativePath: entry.relativePath,
          stagingPath: entry.stagingPath,
        })),
        manifestJson,
        outputPath: stagedPackage,
      })

      // ── 5. Verify round-trip wadah staging. ──
      const verification = await this.options.verifier.verify(stagedPackage)
      if (!verification.ok) {
        status = BACKUP_STATUS.FAILED
        errors.push('verifikasi gagal:', ...verification.messages)
        return finish()
      }

      // ── 6. Finalisasi: pindah ke lokasi permanen. ──
      if (options.isCancelled?.()) {
        status = BACKUP_STATUS.CANCELLED
        return finish()
      }
      fs.mkdirSync(this.options.paths.backupManualDir, { recursive: true })
      const finalPath = path.join(
        this.options.paths.backupManualDir,
        buildBackupFilename(session.startedAt, session.id.value)
      )
      fs.copyFileSync(stagedPackage, finalPath)
      filePath = finalPath
      sizeBytes = fs.statSync(finalPath).size
    } catch (error) {
      status = BACKUP_STATUS.FAILED
      errors.push(error instanceof Error ? error.message : String(error))
    } finally {
      for (const provider of collectedProviders) {
        try {
          await provider.cleanup()
        } catch {
          // cleanup tidak boleh membatalkan hasil
        }
      }
      try {
        fs.rmSync(stagingRoot, { recursive: true, force: true })
      } catch {
        // cleanup tidak boleh membatalkan hasil
      }
      this._activeSessionId = null
    }

    return finish()
  }

  async runPreflight(): Promise<BackupPreflightOutcome> {
    const items: PreflightItem[] = []

    // Database live: jangkauan + integritas (sumber DatabaseProvider).
    let databaseIntegrity = false
    try {
      const rows = (await getPrisma().$queryRawUnsafe('PRAGMA integrity_check')) as Array<{
        integrity_check: string
      }>
      databaseIntegrity = Array.isArray(rows) && rows.length > 0 && rows[0]?.integrity_check === 'ok'
    } catch {
      databaseIntegrity = false
    }
    items.push(
      PreflightItem.of({
        name: 'database-integrity',
        status: databaseIntegrity ? PREFLIGHT_STATUS.PASS : PREFLIGHT_STATUS.FAIL,
        message: databaseIntegrity
          ? 'database live terjangkau dan integritasnya sehat'
          : 'database live tidak terjangkau atau integritasnya tidak lulus',
      })
    )

    // Direktori target: harus dapat ditulis.
    let targetWritable = false
    try {
      fs.mkdirSync(this.options.paths.backupManualDir, { recursive: true })
      fs.accessSync(this.options.paths.backupManualDir, fs.constants.W_OK)
      targetWritable = true
    } catch {
      targetWritable = false
    }
    items.push(
      PreflightItem.of({
        name: 'target-directory',
        status: targetWritable ? PREFLIGHT_STATUS.PASS : PREFLIGHT_STATUS.FAIL,
        message: targetWritable
          ? 'direktori target dapat ditulis'
          : 'direktori target tidak dapat ditulis',
      })
    )

    // Provider-level: titik keputusan tunggal skip/abort (decideProviderPreflight).
    // Kesiapan sumber data nyata di-enforce pada fase collect (provider.collect
    // membuktikan sumbernya) — kontrak BackupProvider tidak punya preflight method.
    const states = this.options.providerRegistry.discover().map((provider) => {
      const state: ProviderPreflightState = {
        providerId: provider.id,
        requirement: provider.requirement,
        status: PREFLIGHT_STATUS.PASS,
        message: 'provider siap dikumpulkan',
      }
      return state
    })

    return {
      report: PreflightReport.of(items),
      decision: decideProviderPreflight(states),
    }
  }

  private resolveStagedPath(provider: BackupProvider, relativePath: string): string {
    const base = this.options.providerStagingDirs.get(provider.id.fullName)
      ?? this.options.paths.tempDir
    const resolvedBase = path.resolve(base)
    const resolved = path.resolve(resolvedBase, ...relativePath.split('/'))
    if (resolved !== resolvedBase && !resolved.startsWith(resolvedBase + path.sep)) {
      throw new BackupDomainError(
        `path hasil provider ${provider.id.fullName} keluar dari area staging: ${relativePath}`
      )
    }
    return resolved
  }
}
