// WO-2 — Manifest Summary Value Object.
// Representasi summary pada RFC-002 §4.3 / ADR-001 (SSOT):
//   files, totalBytes — wajib.
//   tables?, members? — opsional (ADR-001 §8.2 Q5 masih open: data key DB masuk
//   summary atau tidak; dipertahankan opsional/additive agar kontrak maju).

import { ManifestDomainError } from './domain-error'
import { isNonNegativeInteger } from './entry'

export interface ManifestSummaryProps {
  files: number
  totalBytes: number
  tables?: number
  members?: number
}

export class ManifestSummary {
  private constructor(private readonly _props: ManifestSummaryProps) {}

  static of(props: ManifestSummaryProps): ManifestSummary {
    if (!isNonNegativeInteger(props.files)) {
      throw new ManifestDomainError('summary.files wajib bilangan bulat >= 0')
    }
    if (!isNonNegativeInteger(props.totalBytes)) {
      throw new ManifestDomainError('summary.totalBytes wajib bilangan bulat >= 0')
    }
    if (props.tables !== undefined && !isNonNegativeInteger(props.tables)) {
      throw new ManifestDomainError('summary.tables wajib bilangan bulat >= 0')
    }
    if (props.members !== undefined && !isNonNegativeInteger(props.members)) {
      throw new ManifestDomainError('summary.members wajib bilangan bulat >= 0')
    }
    return new ManifestSummary(props)
  }

  get files(): number {
    return this._props.files
  }

  get totalBytes(): number {
    return this._props.totalBytes
  }

  get tables(): number | undefined {
    return this._props.tables
  }

  get members(): number | undefined {
    return this._props.members
  }

  toJSON(): ManifestSummaryJSON {
    return {
      files: this._props.files,
      totalBytes: this._props.totalBytes,
      ...(this._props.tables !== undefined ? { tables: this._props.tables } : {}),
      ...(this._props.members !== undefined ? { members: this._props.members } : {}),
    }
  }
}

export interface ManifestSummaryJSON {
  files: number
  totalBytes: number
  tables?: number
  members?: number
}
