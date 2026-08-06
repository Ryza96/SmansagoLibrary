// WO-2 — Schema Version Value Object.
// ADR-001 §6: schemaVersion adalah IDENTITAS skema database (mis. label migration),
// BUKAN jumlah migration. Pada WO ini masih murni Value Object — BELUM membaca
// migration dari Prisma (pembacaan & perbandingan versi = WO selanjutnya).
// Leaf node domain: tanpa import luar (hanya domain-error).

import { ManifestDomainError } from './domain-error'

export const SCHEMA_VERSION_MAX_LENGTH = 128
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001F\u007F]/

export function isSchemaVersion(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  if (trimmed.length === 0) return false
  if (trimmed.length > SCHEMA_VERSION_MAX_LENGTH) return false
  if (CONTROL_CHARACTER_PATTERN.test(trimmed)) return false
  return true
}

export class SchemaVersion {
  private constructor(private readonly _value: string) {}

  static of(value: string): SchemaVersion {
    if (!isSchemaVersion(value)) {
      throw new ManifestDomainError(
        `Schema version tidak valid: wajib string non-kosong tanpa karakter kontrol (maks ${SCHEMA_VERSION_MAX_LENGTH} karakter)`
      )
    }
    return new SchemaVersion(value.trim())
  }

  static isValid(value: unknown): boolean {
    return isSchemaVersion(value)
  }

  get value(): string {
    return this._value
  }

  equals(other: SchemaVersion): boolean {
    return this._value === other._value
  }
}
