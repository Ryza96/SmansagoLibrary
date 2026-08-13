// WO SAM: SAMPUL BUKU — AssetRestoreHandler (implementasi RestoreHandler untuk
// aset sampul buku — sisi kebalikan AssetBackupProvider).
// RFC-004 §8 / ADR-001 §3.4:
//   stage()        — salin arsip hasil extract ke staging handler
//   verifyStaged() — ukuran + sha256 + buka ZIP (integritas arsip)
//   swapToLive()   — HANYA dipanggil RestoreService: arsipkan direktori live
//                    lama → buat live baru → ekstrak isi arsip. Gagal di
//                    tengah → direktori live dibuang & arsip dipulihkan.
//   rollbackFrom() — no-op (jaringan pengaman restore = snapshot aman database).
//   cleanup()      — buang artefak staging handler.
// Implementasi infra: menyentuh filesystem + zip — kontraknya di domain.

import fs from 'fs'
import path from 'path'
import { createHash } from 'crypto'
import AdmZip from 'adm-zip'
import { RestoreHandler, RestoreVerifyResult, restoreVerifyResultOf } from '../../domain/provider/restore-handler'
import { ProviderId } from '../../domain/provider/provider-id'
import { PROVIDER_KINDS } from '../../domain/provider/provider-kind'
import { ManifestEntry, MANIFEST_ENTRY_KINDS } from '../../domain/manifest/entry'
import { ASSET_BOOK_COVERS_ARCHIVE_FILENAME } from '../providers/asset.provider'
import { moveFilePreserving, resolveWithin } from './fs-utils'

export interface AssetRestoreHandlerOptions {
  extractDir: string
  stagingDir: string
  archiveDir: string
  liveDir: string
}

export class AssetRestoreHandler implements RestoreHandler {
  readonly id: ProviderId
  readonly kind = PROVIDER_KINDS.ASSET
  readonly requirement = 'optional' as const

  constructor(private readonly options: AssetRestoreHandlerOptions) {
    this.id = ProviderId.of({ name: 'book-covers', version: '1.0.0' })
  }

  get stagedArchivePath(): string {
    return path.join(this.options.stagingDir, ASSET_BOOK_COVERS_ARCHIVE_FILENAME)
  }

  matches(entry: ManifestEntry): boolean {
    return entry.kind === MANIFEST_ENTRY_KINDS.ASSET
  }

  async stage(entry: ManifestEntry): Promise<void> {
    const source = resolveWithin(this.options.extractDir, entry.path)
    if (!fs.existsSync(source)) {
      throw new Error(`arsip aset hasil extract tidak ditemukan: ${source}`)
    }
    fs.mkdirSync(this.options.stagingDir, { recursive: true })
    fs.copyFileSync(source, this.stagedArchivePath)
  }

  async verifyStaged(entry: ManifestEntry): Promise<RestoreVerifyResult> {
    const messages: string[] = []
    if (!fs.existsSync(this.stagedArchivePath)) {
      return restoreVerifyResultOf(false, [`file staging aset tidak ditemukan: ${this.stagedArchivePath}`])
    }
    const actualSize = fs.statSync(this.stagedArchivePath).size
    if (actualSize !== entry.sizeBytes) {
      messages.push(`ukuran staging tidak cocok: diharapkan ${entry.sizeBytes}, aktual ${actualSize}`)
    }
    const actualSha = createHash('sha256').update(fs.readFileSync(this.stagedArchivePath)).digest('hex')
    if (actualSha !== entry.sha256.value) {
      messages.push('sha256 staging tidak cocok dengan entri manifest')
    }
    try {
      const zip = new AdmZip(this.stagedArchivePath)
      zip.getEntries()
    } catch (error) {
      messages.push(
        `arsip aset staging tidak dapat dibuka sebagai ZIP: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    }
    return restoreVerifyResultOf(messages.length === 0, messages)
  }

  async swapToLive(_entry: ManifestEntry): Promise<void> {
    if (!fs.existsSync(this.stagedArchivePath)) {
      throw new Error(`file aset staging tidak ditemukan: ${this.stagedArchivePath}`)
    }
    const archiveBackup = path.join(this.options.archiveDir, ASSET_BOOK_COVERS_ARCHIVE_FILENAME)
    fs.mkdirSync(this.options.archiveDir, { recursive: true })

    if (fs.existsSync(this.options.liveDir)) {
      moveFilePreserving(this.options.liveDir, archiveBackup)
    }
    fs.mkdirSync(this.options.liveDir, { recursive: true })

    const zip = new AdmZip(this.stagedArchivePath)
    try {
      for (const entry of zip.getEntries()) {
        if (entry.isDirectory) continue
        const target = resolveWithin(this.options.liveDir, entry.entryName)
        fs.mkdirSync(path.dirname(target), { recursive: true })
        fs.writeFileSync(target, entry.getData())
      }
    } catch (error) {
      try {
        if (fs.existsSync(this.options.liveDir)) {
          fs.rmSync(this.options.liveDir, { recursive: true, force: true })
        }
        if (fs.existsSync(archiveBackup)) {
          moveFilePreserving(archiveBackup, this.options.liveDir)
        }
      } catch {
        // best-effort pemulihan direktori aset live dari arsip
      }
      throw error
    }
  }

  async rollbackFrom(_entry: ManifestEntry): Promise<void> {
    // Jaringan pengaman restore (snapshot aman database) dikelola DatabaseRestoreHandler.
  }

  async cleanup(): Promise<void> {
    if (fs.existsSync(this.options.stagingDir)) {
      fs.rmSync(this.options.stagingDir, { recursive: true, force: true })
    }
  }
}
