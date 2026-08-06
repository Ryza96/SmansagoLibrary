// WO-5 — DatabaseRestoreHandler (implementasi RestoreHandler untuk database —
// sisi kebalikan DatabaseProvider).
// RFC-004 §8 / ADR-001 §3.4:
//   stage()        — salin DB hasil extract ke staging handler
//   verifyStaged() — ukuran + sha256 + PRAGMA integrity_check pada staging DB
//   swapToLive()   — SATU-SATUNYA titik tulis live (dipanggil hanya RestoreService):
//                    disconnect client → arsipkan live lama → salin staging → reconnect.
//                    Gagal di tengah → live lama dipulihkan dari arsip (best-effort).
//   rollbackFrom() — pulihkan live dari snapshot aman (jaringan pengaman).
//   cleanup()      — buang artefak staging handler.
// SafeSnapshotCapable (infra): captureSafeSnapshot() = VACUUM INTO snapshot live
//   (WAJIB, ADR-001 §7 prinsip 5) + restoreFromSafeSnapshot() untuk rollback otomatis.
// Implementasi infra: menyentuh filesystem + sqlite — kontraknya di domain.

import fs from 'fs'
import path from 'path'
import { createHash } from 'crypto'
import { PrismaClient } from '@prisma/client'
import { getPrisma } from '../../repositories/base/prisma'
import { RestoreHandler, RestoreVerifyResult, restoreVerifyResultOf } from '../../domain/provider/restore-handler'
import { ProviderId } from '../../domain/provider/provider-id'
import { PROVIDER_KINDS } from '../../domain/provider/provider-kind'
import { ManifestEntry, MANIFEST_ENTRY_KINDS } from '../../domain/manifest/entry'
import { DATABASE_SNAPSHOT_FILENAME } from '../providers/database.provider'
import { moveFilePreserving, removeSideFiles, resolveWithin } from './fs-utils'

export interface SafeSnapshotCapable {
  captureSafeSnapshot(): Promise<string>
  restoreFromSafeSnapshot(): Promise<void>
}

export function isSafeSnapshotCapable(value: RestoreHandler): value is RestoreHandler & SafeSnapshotCapable {
  return typeof (value as unknown as SafeSnapshotCapable).captureSafeSnapshot === 'function'
}

export interface DatabaseRestoreHandlerOptions {
  liveDatabaseFile: string
  extractDir: string
  stagingDir: string
  archiveDir: string
  snapshotDir: string
  disconnectLiveClients: () => Promise<void>
  reconnectLiveClients: () => Promise<void>
}

export class DatabaseRestoreHandler implements RestoreHandler, SafeSnapshotCapable {
  readonly id: ProviderId
  readonly kind = PROVIDER_KINDS.DATABASE
  readonly requirement = 'required' as const

  private _safeSnapshotPath: string | null = null

  constructor(private readonly options: DatabaseRestoreHandlerOptions) {
    this.id = ProviderId.of({ name: 'database', version: '1.0.0' })
  }

  get stagedDatabasePath(): string {
    return path.join(this.options.stagingDir, DATABASE_SNAPSHOT_FILENAME)
  }

  matches(entry: ManifestEntry): boolean {
    return entry.kind === MANIFEST_ENTRY_KINDS.DATABASE
  }

  async stage(entry: ManifestEntry): Promise<void> {
    const source = resolveWithin(this.options.extractDir, entry.path)
    if (!fs.existsSync(source)) {
      throw new Error(`database hasil extract tidak ditemukan: ${source}`)
    }
    fs.mkdirSync(this.options.stagingDir, { recursive: true })
    fs.copyFileSync(source, this.stagedDatabasePath)
  }

  async verifyStaged(entry: ManifestEntry): Promise<RestoreVerifyResult> {
    const messages: string[] = []
    if (!fs.existsSync(this.stagedDatabasePath)) {
      return restoreVerifyResultOf(false, [`file staging database tidak ditemukan: ${this.stagedDatabasePath}`])
    }
    const actualSize = fs.statSync(this.stagedDatabasePath).size
    if (actualSize !== entry.sizeBytes) {
      messages.push(`ukuran staging tidak cocok: diharapkan ${entry.sizeBytes}, aktual ${actualSize}`)
    }
    const actualSha = createHash('sha256').update(fs.readFileSync(this.stagedDatabasePath)).digest('hex')
    if (actualSha !== entry.sha256.value) {
      messages.push('sha256 staging tidak cocok dengan entri manifest')
    }
    const stagingUrl = 'file:' + this.stagedDatabasePath.replace(/\\/g, '/')
    const client = new PrismaClient({ datasources: { db: { url: stagingUrl } } })
    try {
      const rows = (await client.$queryRawUnsafe('PRAGMA integrity_check')) as Array<{
        integrity_check: string
      }>
      if (!Array.isArray(rows) || rows.length === 0 || rows[0]?.integrity_check !== 'ok') {
        messages.push('PRAGMA integrity_check database staging tidak lulus')
      }
    } catch (error) {
      messages.push(
        `database staging tidak dapat dibuka untuk verifikasi: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    } finally {
      await client.$disconnect().catch(() => undefined)
    }
    return restoreVerifyResultOf(messages.length === 0, messages)
  }

  async captureSafeSnapshot(): Promise<string> {
    const snapshotFile = path.join(this.options.snapshotDir, DATABASE_SNAPSHOT_FILENAME)
    fs.mkdirSync(this.options.snapshotDir, { recursive: true })
    if (fs.existsSync(snapshotFile)) {
      fs.unlinkSync(snapshotFile)
    }
    const escaped = snapshotFile.replace(/'/g, "''")
    await getPrisma().$executeRawUnsafe(`VACUUM INTO '${escaped}'`)
    if (!fs.existsSync(snapshotFile)) {
      throw new Error(`snapshot aman gagal dibuat: ${snapshotFile}`)
    }
    this._safeSnapshotPath = snapshotFile
    return snapshotFile
  }

  async swapToLive(_entry: ManifestEntry): Promise<void> {
    if (!fs.existsSync(this.stagedDatabasePath)) {
      throw new Error(`file staging database tidak ditemukan: ${this.stagedDatabasePath}`)
    }
    const live = this.options.liveDatabaseFile
    const archiveFile = path.join(this.options.archiveDir, DATABASE_SNAPSHOT_FILENAME)
    fs.mkdirSync(this.options.archiveDir, { recursive: true })

    await this.options.disconnectLiveClients()
    try {
      removeSideFiles(live)
      if (fs.existsSync(live)) {
        moveFilePreserving(live, archiveFile)
      }
      moveFilePreserving(this.stagedDatabasePath, live)
    } catch (error) {
      try {
        if (!fs.existsSync(live) && fs.existsSync(archiveFile)) {
          fs.copyFileSync(archiveFile, live)
        }
      } catch {
        // best-effort pemulihan live dari arsip
      }
      throw error
    } finally {
      await this.options.reconnectLiveClients()
    }
  }

  async rollbackFrom(_entry: ManifestEntry): Promise<void> {
    await this.restoreFromSafeSnapshot()
  }

  async restoreFromSafeSnapshot(): Promise<void> {
    if (this._safeSnapshotPath === null || !fs.existsSync(this._safeSnapshotPath)) {
      throw new Error('snapshot aman belum dibuat — rollback tidak dapat dilakukan')
    }
    await this.options.disconnectLiveClients()
    try {
      removeSideFiles(this.options.liveDatabaseFile)
      fs.copyFileSync(this._safeSnapshotPath, this.options.liveDatabaseFile)
    } finally {
      await this.options.reconnectLiveClients()
    }
  }

  async cleanup(): Promise<void> {
    if (fs.existsSync(this.options.stagingDir)) {
      fs.rmSync(this.options.stagingDir, { recursive: true, force: true })
    }
  }
}
