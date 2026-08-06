// WO-2 — Manifest Metadata Value Object.
// Representasi meta pada RFC-002 §4.1 / ADR-001 (SSOT):
//   backupVersion, appVersion, schemaVersion, createdAt, appName, type,
//   engine?, integrity? — additive-only (field baru ditambahkan, bukan diubah).
// Murni domain: tanpa filesystem/electron/sqlite/provider.

import { ManifestDomainError } from './domain-error'
import { SchemaVersion, isSchemaVersion } from './schema-version'

export const MANIFEST_BACKUP_VERSION = 1
export const MANIFEST_BACKUP_TYPE_FULL = 'full'

export interface ManifestMetadataProps {
  backupVersion: number
  appVersion: string
  schemaVersion: SchemaVersion
  createdAt: Date
  appName: string
  type: string
  engine?: string
  integrity?: string
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1
}

export class ManifestMetadata {
  private constructor(private readonly _props: ManifestMetadataProps) {}

  static of(props: ManifestMetadataProps): ManifestMetadata {
    if (!isPositiveInteger(props.backupVersion)) {
      throw new ManifestDomainError('meta.backupVersion wajib bilangan bulat >= 1')
    }
    if (!isNonEmptyString(props.appVersion)) {
      throw new ManifestDomainError('meta.appVersion wajib string non-kosong')
    }
    if (!isNonEmptyString(props.appName)) {
      throw new ManifestDomainError('meta.appName wajib string non-kosong')
    }
    if (!isNonEmptyString(props.type)) {
      throw new ManifestDomainError('meta.type wajib string non-kosong')
    }
    if (!(props.schemaVersion instanceof SchemaVersion)) {
      throw new ManifestDomainError('meta.schemaVersion wajib berupa SchemaVersion')
    }
    if (!(props.createdAt instanceof Date) || Number.isNaN(props.createdAt.getTime())) {
      throw new ManifestDomainError('meta.createdAt wajib berupa tanggal valid')
    }
    // Revisi PO (immutability): simpan COPY objek props + COPY Date —
    // mutasi props/Date oleh caller setelah konstruksi tidak boleh mengubah state internal.
    return new ManifestMetadata({
      ...props,
      createdAt: new Date(props.createdAt.getTime()),
    })
  }

  get backupVersion(): number {
    return this._props.backupVersion
  }

  get appVersion(): string {
    return this._props.appVersion
  }

  get schemaVersion(): SchemaVersion {
    return this._props.schemaVersion
  }

  get createdAt(): Date {
    // Revisi PO (immutability): kembalikan COPY Date, bukan instance internal.
    return new Date(this._props.createdAt.getTime())
  }

  get appName(): string {
    return this._props.appName
  }

  get type(): string {
    return this._props.type
  }

  get engine(): string | undefined {
    return this._props.engine
  }

  get integrity(): string | undefined {
    return this._props.integrity
  }

  toJSON(): ManifestMetadataJSON {
    return {
      backupVersion: this._props.backupVersion,
      appVersion: this._props.appVersion,
      schemaVersion: this._props.schemaVersion.value,
      createdAt: this._props.createdAt.toISOString(),
      appName: this._props.appName,
      type: this._props.type,
      ...(this._props.engine !== undefined ? { engine: this._props.engine } : {}),
      ...(this._props.integrity !== undefined ? { integrity: this._props.integrity } : {}),
    }
  }
}

export interface ManifestMetadataJSON {
  backupVersion: number
  appVersion: string
  schemaVersion: string
  createdAt: string
  appName: string
  type: string
  engine?: string
  integrity?: string
}

export function isManifestMetadataJSON(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const meta = value as Record<string, unknown>
  if (!isPositiveInteger(meta.backupVersion)) return false
  if (!isNonEmptyString(meta.appVersion)) return false
  if (!isSchemaVersion(meta.schemaVersion)) return false
  if (!isNonEmptyString(meta.appName)) return false
  if (!isNonEmptyString(meta.type)) return false
  if (typeof meta.createdAt !== 'string' || Number.isNaN(new Date(meta.createdAt).getTime())) return false
  return true
}
