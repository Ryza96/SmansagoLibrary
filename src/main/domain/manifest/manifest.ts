// WO-2 — Manifest Model (aggregate root).
// Representasi manifest.json sesuai RFC-002 §4 / ADR-001 (SSOT):
//   format, meta, files[], summary, checksums.
// Murni domain: tidak mengetahui filesystem, zip, electron, sqlite, atau provider.
// Parser dari data mentah (unknown) dilakukan ManifestValidator; model ini
// hanya menyimpan bentuk TERTYPE + serialisasi (toJSON).

import { ManifestDomainError } from './domain-error'
import { ManifestMetadata, ManifestMetadataJSON, isManifestMetadataJSON } from './metadata'
import { ManifestEntry, ManifestEntryJSON, isNonNegativeInteger } from './entry'
import { ManifestSummary, ManifestSummaryJSON } from './summary'
import { Checksum } from './checksum'

export const MANIFEST_FORMAT = 'aplibrary-backup'

export interface ManifestChecksums {
  manifestSha256: Checksum
}

export interface ManifestProps {
  format: string
  meta: ManifestMetadata
  files: ManifestEntry[]
  summary: ManifestSummary
  checksums: ManifestChecksums
}

export class Manifest {
  private constructor(private readonly _props: ManifestProps) {}

  static create(props: ManifestProps): Manifest {
    if (props.format !== MANIFEST_FORMAT) {
      throw new ManifestDomainError(
        `format manifest tidak dikenal: "${String(props.format)}" (wajib "${MANIFEST_FORMAT}")`
      )
    }
    if (!(props.meta instanceof ManifestMetadata)) {
      throw new ManifestDomainError('manifest.meta wajib berupa ManifestMetadata')
    }
    if (!Array.isArray(props.files) || props.files.some((entry) => !(entry instanceof ManifestEntry))) {
      throw new ManifestDomainError('manifest.files wajib berupa array ManifestEntry')
    }
    if (!(props.summary instanceof ManifestSummary)) {
      throw new ManifestDomainError('manifest.summary wajib berupa ManifestSummary')
    }
    if (!(props.checksums.manifestSha256 instanceof Checksum)) {
      throw new ManifestDomainError('manifest.checksums.manifestSha256 wajib berupa Checksum')
    }
    return new Manifest(props)
  }

  get format(): string {
    return this._props.format
  }

  get meta(): ManifestMetadata {
    return this._props.meta
  }

  get files(): ManifestEntry[] {
    return this._props.files
  }

  get summary(): ManifestSummary {
    return this._props.summary
  }

  get checksums(): ManifestChecksums {
    return this._props.checksums
  }

  toJSON(): ManifestJSON {
    return {
      format: this._props.format,
      meta: this._props.meta.toJSON(),
      files: this._props.files.map((entry) => entry.toJSON()),
      summary: this._props.summary.toJSON(),
      checksums: {
        manifestSha256: this._props.checksums.manifestSha256.value,
      },
    }
  }
}

export interface ManifestJSON {
  format: string
  meta: ManifestMetadataJSON
  files: ManifestEntryJSON[]
  summary: ManifestSummaryJSON
  checksums: {
    manifestSha256: string
  }
}

export function isManifestJSON(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const manifest = value as Record<string, unknown>
  if (manifest.format !== MANIFEST_FORMAT) return false
  if (!isManifestMetadataJSON(manifest.meta)) return false
  if (!Array.isArray(manifest.files)) return false
  const summary = manifest.summary
  if (typeof summary !== 'object' || summary === null || Array.isArray(summary)) return false
  const summaryRecord = summary as Record<string, unknown>
  if (!isNonNegativeInteger(summaryRecord.files)) return false
  if (!isNonNegativeInteger(summaryRecord.totalBytes)) return false
  const checksums = manifest.checksums
  if (typeof checksums !== 'object' || checksums === null || Array.isArray(checksums)) return false
  const checksumsRecord = checksums as Record<string, unknown>
  if (typeof checksumsRecord.manifestSha256 !== 'string') return false
  return true
}
