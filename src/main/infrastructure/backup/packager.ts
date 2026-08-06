// WO-4 — Backup Packager.
// Membungkus hasil collect provider + manifest.json ke SATU wadah `.apbackup`
// (RFC-002 §3 / ADR-001 §6): zip berisi entry data (path relatif kanonik) +
// manifest.json (compact, satu baris). Infra: menyentuh filesystem + adm-zip.
// Setelah ditulis, wadah WAJIB diverifikasi oleh BackupVerifier (round-trip).

import fs from 'fs'
import AdmZip from 'adm-zip'

export const MANIFEST_FILENAME = 'manifest.json'
export const APBACKUP_EXTENSION = '.apbackup'

export interface PackageEntryInput {
  stagingPath: string
  relativePath: string
}

export interface PackageInput {
  entries: PackageEntryInput[]
  manifestJson: string
  outputPath: string
}

export interface PackageResult {
  outputPath: string
  sizeBytes: number
}

export class BackupPackager {
  async package(input: PackageInput): Promise<PackageResult> {
    const zip = new AdmZip()
    for (const entry of input.entries) {
      zip.addLocalFile(entry.stagingPath, '', entry.relativePath)
    }
    zip.addFile(MANIFEST_FILENAME, Buffer.from(input.manifestJson, 'utf8'))
    await zip.writeZipPromise(input.outputPath, { overwrite: true })
    return { outputPath: input.outputPath, sizeBytes: fs.statSync(input.outputPath).size }
  }
}
