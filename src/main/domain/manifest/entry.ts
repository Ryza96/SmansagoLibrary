// WO-2 — Manifest Entry Value Object.
// Satu baris files[] pada RFC-002 §4.2 / ADR-001 (SSOT):
//   path (relatif, forward-slash), sizeBytes, sha256, kind.
// Path divalidasi sebagai path RELATIF kanonik — tanpa filesystem/node:path
// (implementasi murni lintas-platform).

import { ManifestDomainError } from './domain-error'
import { Checksum } from './checksum'

export const MANIFEST_ENTRY_KINDS = {
  DATABASE: 'database',
  ASSET: 'asset',
  LOG: 'log',
} as const satisfies Record<string, string>

export type ManifestEntryKind = (typeof MANIFEST_ENTRY_KINDS)[keyof typeof MANIFEST_ENTRY_KINDS]

export function isManifestEntryKind(value: unknown): value is ManifestEntryKind {
  return (
    typeof value === 'string' && (Object.values(MANIFEST_ENTRY_KINDS) as string[]).includes(value)
  )
}

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001F\u007F]/
const DRIVE_LETTER_PATTERN = /^[A-Za-z]:/
const URI_SCHEME_PATTERN = /^[A-Za-z][A-Za-z0-9+.-]*:\/\//

export function isRelativeManifestPath(value: unknown): value is string {
  if (typeof value !== 'string') return false
  if (value.length === 0) return false
  if (value === '.' || value === '..') return false
  if (value.startsWith('/') || value.startsWith('\\')) return false
  if (value.includes('\\')) return false
  if (value.endsWith('/')) return false
  if (CONTROL_CHARACTER_PATTERN.test(value)) return false
  if (DRIVE_LETTER_PATTERN.test(value)) return false
  if (URI_SCHEME_PATTERN.test(value)) return false
  const segments = value.split('/')
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) return false
  return true
}

export interface ManifestEntryProps {
  path: string
  sizeBytes: number
  sha256: Checksum
  kind: ManifestEntryKind
}

export class ManifestEntry {
  private constructor(private readonly _props: ManifestEntryProps) {}

  static of(props: ManifestEntryProps): ManifestEntry {
    if (!isRelativeManifestPath(props.path)) {
      throw new ManifestDomainError('files[].path wajib path relatif kanonik (forward-slash, tanpa ../)')
    }
    if (!isNonNegativeInteger(props.sizeBytes)) {
      throw new ManifestDomainError('files[].sizeBytes wajib bilangan bulat >= 0')
    }
    if (!(props.sha256 instanceof Checksum)) {
      throw new ManifestDomainError('files[].sha256 wajib berupa Checksum')
    }
    if (!isManifestEntryKind(props.kind)) {
      throw new ManifestDomainError('files[].kind tidak dikenal (database|asset|log)')
    }
    // Revisi PO (immutability): simpan COPY objek props — mutasi objek milik
    // caller setelah konstruksi tidak boleh mengubah state internal.
    return new ManifestEntry({ ...props })
  }

  get path(): string {
    return this._props.path
  }

  get sizeBytes(): number {
    return this._props.sizeBytes
  }

  get sha256(): Checksum {
    return this._props.sha256
  }

  get kind(): ManifestEntryKind {
    return this._props.kind
  }

  toJSON(): ManifestEntryJSON {
    return {
      path: this._props.path,
      sizeBytes: this._props.sizeBytes,
      sha256: this._props.sha256.value,
      kind: this._props.kind,
    }
  }
}

export interface ManifestEntryJSON {
  path: string
  sizeBytes: number
  sha256: string
  kind: string
}

export function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}
