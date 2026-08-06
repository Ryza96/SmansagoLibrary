// WO-4 — Backup Verifier.
// Verifikasi pasca-package (ADR-001 §6 / RFC-003 §5.3): membuka wadah `.apbackup`
// dan membuktikan isinya utuh SEBELUM difinalisasi:
//   1. wadah adalah zip yang valid + memuat manifest.json
//   2. manifest.json adalah JSON valid dan lolos ManifestValidator (struktur,
//      schema version, duplicate entry, relative path, checksum format)
//   3. checksums.manifestSha256 cocok dengan payload manifest
//   4. setiap entri files[] ada di wadah + sizeBytes + sha256 cocok
//   5. database di dalam wadah lolos PRAGMA integrity_check (di-extract ke temp)
//   6. containerSha256 (SHA-256 atas SELURUH file output) dihitung untuk audit
// Infra: menyentuh filesystem + adm-zip + sqlite (read-only, DB temp).

import fs from 'fs'
import path from 'path'
import { createHash } from 'crypto'
import { PrismaClient } from '@prisma/client'
import AdmZip from 'adm-zip'
import { Manifest } from '../../domain/manifest/manifest'
import { ManifestValidator } from '../../domain/manifest/validator'
import { MANIFEST_ENTRY_KINDS } from '../../domain/manifest/entry'
import { computeManifestSha256 } from './manifest-builder'
import { MANIFEST_FILENAME } from './packager'

export interface BackupVerificationResult {
  ok: boolean
  messages: string[]
  manifest: Manifest | null
  containerSha256: string
}

export interface BackupVerifierOptions {
  tempDir: string
}

export class BackupVerifier {
  constructor(private readonly options: BackupVerifierOptions) {}

  async verify(archivePath: string): Promise<BackupVerificationResult> {
    const messages: string[] = []

    if (!fs.existsSync(archivePath)) {
      return {
        ok: false,
        messages: [`file backup tidak ditemukan: ${archivePath}`],
        manifest: null,
        containerSha256: '',
      }
    }

    const containerSha256 = createHash('sha256').update(fs.readFileSync(archivePath)).digest('hex')

    let zip: AdmZip
    try {
      zip = new AdmZip(archivePath)
    } catch (error) {
      return {
        ok: false,
        messages: [
          `wadah tidak dapat dibaca sebagai zip: ${
            error instanceof Error ? error.message : String(error)
          }`,
        ],
        manifest: null,
        containerSha256,
      }
    }

    const manifestEntry = zip.getEntry(MANIFEST_FILENAME)
    if (!manifestEntry) {
      return {
        ok: false,
        messages: [`wadah tidak memuat ${MANIFEST_FILENAME}`],
        manifest: null,
        containerSha256,
      }
    }

    let manifestRaw: unknown
    try {
      manifestRaw = JSON.parse(zip.readFile(MANIFEST_FILENAME)?.toString('utf8') ?? '')
    } catch (error) {
      return {
        ok: false,
        messages: [`${MANIFEST_FILENAME} bukan JSON valid: ${error instanceof Error ? error.message : String(error)}`],
        manifest: null,
        containerSha256,
      }
    }

    const validation = new ManifestValidator().validate(manifestRaw)
    if (validation.ok === false) {
      return { ok: false, messages: validation.errors, manifest: null, containerSha256 }
    }
    const manifest = validation.manifest

    const expectedManifestSha = computeManifestSha256(manifest)
    if (!expectedManifestSha.equals(manifest.checksums.manifestSha256)) {
      messages.push('checksums.manifestSha256 tidak cocok dengan payload manifest')
    }

    for (const entry of manifest.files) {
      const zipEntry = zip.getEntry(entry.path)
      if (!zipEntry) {
        messages.push(`entri "${entry.path}" tidak ada di dalam wadah`)
        continue
      }
      const data = zip.readFile(entry.path)
      if (!data) {
        messages.push(`entri "${entry.path}" tidak dapat dibaca`)
        continue
      }
      if (data.length !== entry.sizeBytes) {
        messages.push(
          `ukuran entri "${entry.path}" tidak cocok: diharapkan ${entry.sizeBytes}, aktual ${data.length}`
        )
      }
      const actualSha = createHash('sha256').update(data).digest('hex')
      if (actualSha !== entry.sha256.value) {
        messages.push(`sha256 entri "${entry.path}" tidak cocok`)
      }
    }

    const dbEntry = manifest.files.find((entry) => entry.kind === MANIFEST_ENTRY_KINDS.DATABASE)
    if (dbEntry) {
      messages.push(...(await this.verifyDatabaseIntegrity(zip, dbEntry.path)))
    }

    return { ok: messages.length === 0, messages, manifest, containerSha256 }
  }

  private async verifyDatabaseIntegrity(zip: AdmZip, dbPath: string): Promise<string[]> {
    const messages: string[] = []
    const tempPath = path.join(this.options.tempDir, `verify-${Date.now()}-${Math.random().toString(16).slice(2)}.db`)
    try {
      const data = zip.readFile(dbPath)
      if (!data) {
        messages.push(`entri database "${dbPath}" tidak dapat dibaca`)
        return messages
      }
      fs.writeFileSync(tempPath, data)
      const snapshotUrl = 'file:' + tempPath.replace(/\\/g, '/')
      const client = new PrismaClient({ datasources: { db: { url: snapshotUrl } } })
      try {
        const rows = (await client.$queryRawUnsafe('PRAGMA integrity_check')) as Array<{
          integrity_check: string
        }>
        if (!Array.isArray(rows) || rows.length === 0 || rows[0]?.integrity_check !== 'ok') {
          messages.push('PRAGMA integrity_check database di dalam wadah tidak lulus')
        }
      } catch (error) {
        messages.push(
          `database di dalam wadah tidak dapat dibuka untuk verifikasi: ${
            error instanceof Error ? error.message : String(error)
          }`
        )
      } finally {
        await client.$disconnect().catch(() => undefined)
      }
    } finally {
      if (fs.existsSync(tempPath)) {
        try {
          fs.unlinkSync(tempPath)
        } catch {
          // ignore cleanup failure
        }
      }
    }
    return messages
  }
}
