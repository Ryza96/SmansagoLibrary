// WO-3 — Provider Identity Value Object.
// Identitas & versi data yang disuplai Provider / Restore Handler —
// RFC-003 §3.4 / ADR-001 (SSOT): id = nama + versi.
// Murni domain: tanpa filesystem/electron/zip/sqlite.

import { ProviderDomainError } from './domain-error'

export const PROVIDER_ID_MAX_NAME = 64
export const PROVIDER_ID_MAX_VERSION = 32

export function isNonEmptyTrimmedString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export interface ProviderIdProps {
  name: string
  version: string
}

export class ProviderId {
  private constructor(private readonly _props: ProviderIdProps) {}

  static of(props: ProviderIdProps): ProviderId {
    if (!isNonEmptyTrimmedString(props.name) || props.name.trim().length > PROVIDER_ID_MAX_NAME) {
      throw new ProviderDomainError(
        `provider name wajib string non-kosong (maks ${PROVIDER_ID_MAX_NAME} karakter)`
      )
    }
    if (
      !isNonEmptyTrimmedString(props.version) ||
      props.version.trim().length > PROVIDER_ID_MAX_VERSION
    ) {
      throw new ProviderDomainError(
        `provider version wajib string non-kosong (maks ${PROVIDER_ID_MAX_VERSION} karakter)`
      )
    }
    return new ProviderId({
      name: props.name.trim(),
      version: props.version.trim(),
    })
  }

  static isProviderId(value: unknown): value is ProviderId {
    return value instanceof ProviderId
  }

  get name(): string {
    return this._props.name
  }

  get version(): string {
    return this._props.version
  }

  get fullName(): string {
    return `${this._props.name}@${this._props.version}`
  }

  equals(other: ProviderId): boolean {
    return this._props.name === other._props.name && this._props.version === other._props.version
  }

  toJSON(): ProviderIdJSON {
    return { name: this._props.name, version: this._props.version }
  }
}

export interface ProviderIdJSON {
  name: string
  version: string
}

export function isProviderIdJSON(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return isNonEmptyTrimmedString(record.name) && isNonEmptyTrimmedString(record.version)
}
