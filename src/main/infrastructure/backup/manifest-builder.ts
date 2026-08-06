// WO-4 — Manifest Builder.
// Membangun Manifest (RFC-002 §4 / ADR-001 §6) dari hasil collect provider:
//   meta (backupVersion/appVersion/schemaVersion/createdAt/appName/type/engine/integrity),
//   files[] (path relatif, sizeBytes, sha256 per entri — SHA-256 dihitung di sini),
//   summary (files, totalBytes),
//   checksums.manifestSha256 = SHA-256 atas payload (format+meta+files+summary).
// Infra: boleh menyentuh filesystem (membaca file staging untuk hashing) —
// hasilnya murni domain (Manifest). Pemetaan ProviderKind → ManifestEntryKind
// wajib hati-hati: configuration TIDAK punya pasangan di manifest entry kind.

import fs from 'fs'
import { createHash } from 'crypto'
import { Manifest, MANIFEST_FORMAT } from '../../domain/manifest/manifest'
import {
  ManifestMetadata,
  MANIFEST_BACKUP_VERSION,
  MANIFEST_BACKUP_TYPE_FULL,
} from '../../domain/manifest/metadata'
import { ManifestEntry, ManifestEntryKind, MANIFEST_ENTRY_KINDS } from '../../domain/manifest/entry'
import { ManifestSummary } from '../../domain/manifest/summary'
import { SchemaVersion } from '../../domain/manifest/schema-version'
import { Checksum } from '../../domain/manifest/checksum'
import { ProviderKind } from '../../domain/provider/provider-kind'
import { ManifestDomainError } from '../../domain/manifest/domain-error'

export const MANIFEST_INTEGRITY_OK = 'ok'

export interface ManifestEntrySource {
  relativePath: string
  stagingPath: string
  kind: ProviderKind
}

export interface ManifestBuildOptions {
  appVersion: string
  appName: string
  schemaVersion: SchemaVersion
  createdAt: Date
  engine: string
  entries: ManifestEntrySource[]
}

export function providerKindToManifestKind(kind: ProviderKind): ManifestEntryKind {
  if (kind === 'database') return MANIFEST_ENTRY_KINDS.DATABASE
  if (kind === 'asset') return MANIFEST_ENTRY_KINDS.ASSET
  if (kind === 'log') return MANIFEST_ENTRY_KINDS.LOG
  throw new ManifestDomainError(
    `provider kind "${kind}" tidak dapat dipetakan ke manifest entry kind (database|asset|log)`
  )
}

// Payload manifest TANPA checksums — kontrak RFC-002: manifestSha256 dihitung
// atas isi manifest, bukan termasuk dirinya sendiri (deteksi rusak/terpotong).
export function buildManifestPayloadJson(manifest: Manifest): string {
  return JSON.stringify({
    format: manifest.format,
    meta: manifest.meta.toJSON(),
    files: manifest.files.map((entry) => entry.toJSON()),
    summary: manifest.summary.toJSON(),
  })
}

export function computeManifestSha256(manifest: Manifest): Checksum {
  return Checksum.of(
    createHash('sha256').update(buildManifestPayloadJson(manifest), 'utf8').digest('hex')
  )
}

export class ManifestBuilder {
  async build(options: ManifestBuildOptions): Promise<Manifest> {
    const entries = options.entries.map((source) => {
      const buffer = fs.readFileSync(source.stagingPath)
      return ManifestEntry.of({
        path: source.relativePath,
        sizeBytes: buffer.length,
        sha256: Checksum.of(createHash('sha256').update(buffer).digest('hex')),
        kind: providerKindToManifestKind(source.kind),
      })
    })

    const totalBytes = entries.reduce((sum, entry) => sum + entry.sizeBytes, 0)
    const summary = ManifestSummary.of({ files: entries.length, totalBytes })
    const meta = ManifestMetadata.of({
      backupVersion: MANIFEST_BACKUP_VERSION,
      appVersion: options.appVersion,
      schemaVersion: options.schemaVersion,
      createdAt: options.createdAt,
      appName: options.appName,
      type: MANIFEST_BACKUP_TYPE_FULL,
      engine: options.engine,
      integrity: MANIFEST_INTEGRITY_OK,
    })

    const draft = Manifest.create({
      format: MANIFEST_FORMAT,
      meta,
      files: entries,
      summary,
      checksums: { manifestSha256: Checksum.of('0'.repeat(64)) },
    })

    return Manifest.create({
      format: MANIFEST_FORMAT,
      meta,
      files: entries,
      summary,
      checksums: { manifestSha256: computeManifestSha256(draft) },
    })
  }
}
