// WO-6 — Backup & Restore UI Controller.
// Lapisan KLIENT di atas BackupService (WO-4) / RestoreService (WO-5).
// HANYA membungkus engine untuk UI — TIDAK mengubah perilaku engine:
//   - progress = controller-paced INDICATIVE (keputusan PO): stage 1 backup
//     = preflight ASLI engine, sisanya di-paced selama engine.run() berjalan;
//     seluruh 8 stage restore di-paced (restore bersifat atomic).
//   - status/nilai tampilan (nama file, ukuran, durasi, counts) dihitung DI SINI
//     dari hasil engine / manifest / DB di dalam wadah — renderer TIDAK menurunkan.
// Controller di src/main (bukan folder engine), headless-testable (tanpa Electron).
// Dilarang menyentuh schema/migration/engine/domain.

import fs from 'fs'
import path from 'path'
import AdmZip from 'adm-zip'
import { PrismaClient } from '@prisma/client'
import { AppPaths } from '../infrastructure/paths'
import { APBACKUP_EXTENSION } from '../infrastructure/backup/packager'
import { BackupService, buildBackupFilename } from '../infrastructure/backup/backup.service'
import { RestoreService } from '../infrastructure/restore/restore.service'
import { BackupVerifier } from '../infrastructure/backup/verifier'
import { MANIFEST_ENTRY_KINDS } from '../domain/manifest/entry'
import { RESTORE_STATUS } from '../domain/restore/restore-status'
import { isSuccessBackupStatus } from '../domain/backup/backup-status'
import {
  BACKUP_UI_STAGES,
  RESTORE_UI_STAGES,
  BackupUIProgressEvent,
  RestoreUIProgressEvent,
  BackupTargetInfo,
  BackupUISummary,
  BackupFileInfo,
  RestoreUIResult,
  BackupUIStage,
  RestoreUIStage,
} from '../../shared/dto/backup-ui'

// Interval pacing antar stage indicative (ms) — kontrak UI, bukan engine.
const PACING_MS = 350

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

// ---------------------------------------------------------------------------
// BackupInspector — membaca info .apbackup UNTUK UI (sebelum konfirmasi):
// manifest + counts Buku/Anggota/Eksemplar dihitung dari DB di dalam wadah.
// Counts TIDAK tersedia di manifest (ADR-001 §8.2 Q5 open) → dihitung di sini.
// Read-only: tidak pernah menyentuh DB live.
// ---------------------------------------------------------------------------
export interface BackupInspectorOptions {
  verifier: BackupVerifier
  tempDir: string
}

export class BackupInspector {
  constructor(private readonly options: BackupInspectorOptions) {}

  async inspect(filePath: string): Promise<BackupFileInfo> {
    const fileName = path.basename(filePath)
    let sizeBytes = 0
    try {
      sizeBytes = fs.statSync(filePath).size
    } catch {
      return {
        ok: false,
        fileName,
        filePath,
        sizeBytes: 0,
        backupDate: null,
        appVersion: '',
        schemaVersion: '',
        backupVersion: 0,
        bookCount: null,
        memberCount: null,
        copyCount: null,
        warnings: [],
        errors: [`file backup tidak dapat dibaca: ${filePath}`],
      }
    }

    const verification = await this.options.verifier.verify(filePath)
    if (verification.ok === false || verification.manifest === null) {
      return {
        ok: false,
        fileName,
        filePath,
        sizeBytes,
        backupDate: null,
        appVersion: '',
        schemaVersion: '',
        backupVersion: 0,
        bookCount: null,
        memberCount: null,
        copyCount: null,
        warnings: verification.messages,
        errors: verification.messages,
      }
    }

    const manifest = verification.manifest
    const zip = new AdmZip(filePath)
    const dbEntry = manifest.files.find((entry) => entry.kind === MANIFEST_ENTRY_KINDS.DATABASE)
    const counts =
      dbEntry !== undefined ? await this.countDatabaseRecords(zip, dbEntry.path) : { bookCount: null, memberCount: null, copyCount: null }

    return {
      ok: true,
      fileName,
      filePath,
      sizeBytes,
      backupDate: manifest.meta.createdAt.toISOString(),
      appVersion: manifest.meta.appVersion,
      schemaVersion: manifest.meta.schemaVersion.value,
      backupVersion: manifest.meta.backupVersion,
      ...counts,
      warnings: verification.messages.length > 0 ? verification.messages : [],
      errors: [],
    }
  }

  private async countDatabaseRecords(zip: AdmZip, dbPath: string): Promise<{ bookCount: number | null; memberCount: number | null; copyCount: number | null }> {
    const tempPath = path.join(this.options.tempDir, `inspect-${Date.now()}-${Math.random().toString(16).slice(2)}.db`)
    const data = zip.readFile(dbPath)
    if (data === null || data === undefined) {
      return { bookCount: null, memberCount: null, copyCount: null }
    }
    fs.writeFileSync(tempPath, data)
    const snapshotUrl = 'file:' + tempPath.replace(/\\/g, '/')
    const client = new PrismaClient({ datasources: { db: { url: snapshotUrl } } })
    try {
      const [books, members, copies] = await Promise.all([
        client.book.count(),
        client.member.count(),
        client.bookCopy.count(),
      ])
      return { bookCount: books, memberCount: members, copyCount: copies }
    } catch {
      return { bookCount: null, memberCount: null, copyCount: null }
    } finally {
      await client.$disconnect().catch(() => undefined)
      if (fs.existsSync(tempPath)) {
        try {
          fs.unlinkSync(tempPath)
        } catch {
          // ignore cleanup failure
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// BackupUIController — halaman Backup.
// ---------------------------------------------------------------------------
export interface BackupUIControllerOptions {
  backupService: BackupService
  paths: AppPaths
}

export class BackupUIController {
  constructor(private readonly options: BackupUIControllerOptions) {}

  getTargetInfo(): BackupTargetInfo {
    const sample = buildBackupFilename(new Date(), 'BKP-00000000-0000-4000-8000-000000000000')
    return {
      backupDir: this.options.paths.backupManualDir,
      sampleFilename: sample,
      extension: APBACKUP_EXTENSION,
    }
  }

  async run(options: {
    appVersion: string
    appName: string
    onProgress: (event: BackupUIProgressEvent) => void
  }): Promise<BackupUISummary> {
    const startedAt = new Date()
    const emit = (stage: BackupUIStage, current: number): void => {
      options.onProgress({
        stage,
        current,
        total: BACKUP_UI_STAGES.length,
        startedAt: startedAt.toISOString(),
      })
    }

    // Stage 1/7 — preflight ASLI engine (keputusan PO).
    emit('validate', 1)
    const preflight = await this.options.backupService.runPreflight()
    if (preflight.report.ok === false) {
      const errors = preflight.report.failedItems.map((item) => `preflight: ${item.name} — ${item.message}`)
      return {
        status: 'FAILED',
        fileName: null,
        filePath: null,
        sizeBytes: null,
        backupDir: this.options.paths.backupManualDir,
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: 0,
        warnings: preflight.decision.warnings,
        errors,
      }
    }

    // Stage 2..6 — indicative pacing selama engine.run() berjalan.
    const enginePromise = this.options.backupService.run({
      appVersion: options.appVersion,
      appName: options.appName,
    })
    const pacing: readonly BackupUIStage[] = ['collect', 'manifest', 'compress', 'verify', 'finalize']
    for (let i = 0; i < pacing.length; i++) {
      const outcome = await Promise.race([
        enginePromise.then(() => ({ settled: true as const })),
        sleep(PACING_MS).then(() => ({ settled: false as const })),
      ])
      if (outcome.settled) break
      emit(pacing[i], i + 2)
    }

    const result = await enginePromise
    if (isSuccessBackupStatus(result.status)) {
      emit('complete', BACKUP_UI_STAGES.length)
    }

    return {
      status: result.status,
      fileName: result.filePath !== null ? path.basename(result.filePath) : null,
      filePath: result.filePath,
      sizeBytes: result.sizeBytes,
      backupDir: this.options.paths.backupManualDir,
      startedAt: result.startedAt.toISOString(),
      finishedAt: result.finishedAt.toISOString(),
      durationMs: result.finishedAt.getTime() - result.startedAt.getTime(),
      warnings: result.warnings,
      errors: result.errors,
    }
  }
}

// ---------------------------------------------------------------------------
// RestoreUIController — halaman Restore.
// ---------------------------------------------------------------------------
export interface RestoreUIControllerOptions {
  restoreService: RestoreService
}

export class RestoreUIController {
  constructor(private readonly options: RestoreUIControllerOptions) {}

  async run(options: {
    backupFilePath: string
    onProgress: (event: RestoreUIProgressEvent) => void
  }): Promise<RestoreUIResult> {
    const startedAt = new Date()
    const emit = (stage: RestoreUIStage, current: number): void => {
      options.onProgress({
        stage,
        current,
        total: RESTORE_UI_STAGES.length,
        startedAt: startedAt.toISOString(),
      })
    }

    emit('validate', 1)
    const enginePromise = this.options.restoreService.run({ backupFilePath: options.backupFilePath })
    const pacing = RESTORE_UI_STAGES.slice(1) // extract..complete
    for (let i = 0; i < pacing.length; i++) {
      const outcome = await Promise.race([
        enginePromise.then(() => ({ settled: true as const })),
        sleep(PACING_MS).then(() => ({ settled: false as const })),
      ])
      if (outcome.settled) break
      emit(pacing[i], i + 2)
    }

    const result = await enginePromise
    if (result.status === RESTORE_STATUS.SUCCESS) {
      emit('complete', RESTORE_UI_STAGES.length)
    }

    return {
      status: result.status,
      sessionId: result.sessionId,
      startedAt: result.startedAt.toISOString(),
      finishedAt: result.finishedAt.toISOString(),
      durationMs: result.finishedAt.getTime() - result.startedAt.getTime(),
      schemaVersionBefore: result.schemaVersionBefore,
      schemaVersionRestored: result.schemaVersionRestored,
      needsRestart: result.needsRestart,
      warnings: result.warnings,
      errors: result.errors,
    }
  }
}
