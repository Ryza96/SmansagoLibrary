// WO-2 — Checksum Value Object.
// ADR-001 §6: checksum memakai SHA-256. Pada WO ini masih murni Value Object —
// BELUM menghitung SHA256 (komputasi asli dilakukan Backup Engine WO selanjutnya).
// Validator hanya memeriksa FORMAT: 64 karakter hex (SHA-256).

import { ManifestDomainError } from './domain-error'

export const SHA256_HEX_LENGTH = 64
const CHECKSUM_HEX_PATTERN = /^[a-f0-9]{64}$/

export function isChecksum(value: unknown): value is string {
  if (typeof value !== 'string') return false
  return CHECKSUM_HEX_PATTERN.test(value.trim().toLowerCase())
}

export class Checksum {
  private constructor(private readonly _value: string) {}

  static of(value: string): Checksum {
    if (typeof value !== 'string' || !CHECKSUM_HEX_PATTERN.test(value.trim().toLowerCase())) {
      throw new ManifestDomainError('Checksum tidak valid: wajib 64 karakter hex (SHA-256)')
    }
    return new Checksum(value.trim().toLowerCase())
  }

  static isValid(value: unknown): boolean {
    return isChecksum(value)
  }

  get value(): string {
    return this._value
  }

  equals(other: Checksum): boolean {
    return this._value === other._value
  }
}
