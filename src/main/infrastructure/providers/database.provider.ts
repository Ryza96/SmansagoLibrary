// WO-3 — DatabaseProvider (implementasi BackupProvider).
// Satu-satunya Provider yang didaftarkan pada rilis pertama (ADR-001 §8.2:
// "daftarkan jenis data saat ini — Database WAJIB"; aset/configuration/log
// didaftarkan saat data-nya tersedia — future).
// Snapshot memakai VACUUM INTO (metode teknis bebas ADR-001 — hasil wajib
// konsisten); verification via PRAGMA integrity_check pada file snapshot.
// Implementasi infra: boleh menyentuh filesystem/sqlite — kontraknya di domain.

import fs from 'fs'
import path from 'path'
import { createHash } from 'crypto'
import { PrismaClient } from '@prisma/client'
import { getPrisma } from '../../repositories/base/prisma'
import {
  BackupProvider,
  ProviderCollectResult,
  ProviderVerifyResult,
  collectResultOf,
  verifyResultOf,
} from '../../domain/provider/provider'
import { ProviderId } from '../../domain/provider/provider-id'
import { PROVIDER_KINDS } from '../../domain/provider/provider-kind'
import { ManifestEntry } from '../../domain/manifest/entry'

export const DATABASE_SNAPSHOT_FILENAME = 'aplibrary.db'
export const DATABASE_PROVIDER_ENGINE = 'vacuum-into'

export interface DatabaseProviderOptions {
  stagingDir: string
}

export class DatabaseProvider implements BackupProvider {
  readonly id: ProviderId
  readonly kind = PROVIDER_KINDS.DATABASE
  readonly requirement = 'required' as const

  constructor(private readonly options: DatabaseProviderOptions) {
    this.id = ProviderId.of({ name: 'database', version: '1.0.0' })
  }

  get snapshotPath(): string {
    return path.join(this.options.stagingDir, DATABASE_SNAPSHOT_FILENAME)
  }

  async collect(): Promise<ProviderCollectResult> {
    // VACUUM INTO menolak target yang sudah ada ("output file already exists") →
    // unlink dulu agar collect idempoten.
    if (fs.existsSync(this.snapshotPath)) {
      fs.unlinkSync(this.snapshotPath)
    }
    const escaped = this.snapshotPath.replace(/'/g, "''")
    await getPrisma().$executeRawUnsafe(`VACUUM INTO '${escaped}'`)
    if (!fs.existsSync(this.snapshotPath)) {
      throw new Error(`snapshot database gagal dibuat: ${this.snapshotPath}`)
    }
    const sizeBytes = fs.statSync(this.snapshotPath).size
    return collectResultOf({
      kind: PROVIDER_KINDS.DATABASE,
      relativePath: DATABASE_SNAPSHOT_FILENAME,
      sizeBytes,
    })
  }

  async verify(entry: ManifestEntry): Promise<ProviderVerifyResult> {
    const messages: string[] = []
    if (!fs.existsSync(this.snapshotPath)) {
      return verifyResultOf(false, [`file snapshot tidak ditemukan: ${this.snapshotPath}`])
    }
    const actualSize = fs.statSync(this.snapshotPath).size
    if (actualSize !== entry.sizeBytes) {
      messages.push(`ukuran snapshot tidak cocok: diharapkan ${entry.sizeBytes}, aktual ${actualSize}`)
    }
    const actualSha = createHash('sha256').update(fs.readFileSync(this.snapshotPath)).digest('hex')
    if (actualSha !== entry.sha256.value) {
      messages.push('sha256 snapshot tidak cocok dengan entri manifest')
    }
    const snapshotUrl = 'file:' + this.snapshotPath.replace(/\\/g, '/')
    const snapshotClient = new PrismaClient({ datasources: { db: { url: snapshotUrl } } })
    try {
      const rows = (await snapshotClient.$queryRawUnsafe('PRAGMA integrity_check')) as Array<{
        integrity_check: string
      }>
      if (!Array.isArray(rows) || rows.length === 0 || rows[0]?.integrity_check !== 'ok') {
        messages.push('PRAGMA integrity_check snapshot tidak lulus')
      }
    } catch (error) {
      messages.push(
        `gagal membuka snapshot untuk verifikasi: ${error instanceof Error ? error.message : String(error)}`
      )
    } finally {
      await snapshotClient.$disconnect().catch(() => undefined)
    }
    return verifyResultOf(messages.length === 0, messages)
  }

  async cleanup(): Promise<void> {
    if (fs.existsSync(this.snapshotPath)) {
      fs.unlinkSync(this.snapshotPath)
    }
  }
}
