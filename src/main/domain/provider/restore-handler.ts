// WO-3 — Restore Handler kontrak.
// Kontrak Restore Handler ADR-001 §3.4 (SSOT):
//   id/version · required/optional · matches(kind) · stage() · verifyStaged() ·
//   swapToLive() · rollbackFrom(snapshot) · cleanup().
// Restore Handler = sisi kebalikan Provider (RFC-004 §8): tahu cara menempatkan
// SATU jenis data dari staging ke lokasi live-nya. SwapToLive HANYA dipanggil
// Swapper (satu-satunya titik tulis restore).
// Murni domain: ini hanya KONTRAK — implementasi (infra) menyentuh filesystem/sqlite.

import { ProviderDomainError } from './domain-error'
import { ProviderId } from './provider-id'
import { ProviderKind } from './provider-kind'
import { ProviderRequirement, isProviderRequirement, PROVIDER_REQUIREMENTS } from './provider'
import { ManifestEntry } from '../manifest/entry'

export interface RestoreVerifyResult {
  ok: boolean
  messages: string[]
}

export function restoreVerifyResultOf(ok: boolean, messages: string[] = []): RestoreVerifyResult {
  if (typeof ok !== 'boolean') {
    throw new ProviderDomainError('restoreVerify.ok wajib boolean')
  }
  if (!Array.isArray(messages)) {
    throw new ProviderDomainError('restoreVerify.messages wajib array')
  }
  return { ok, messages: [...messages] }
}

export interface RestoreHandler {
  readonly id: ProviderId
  readonly kind: ProviderKind
  readonly requirement: ProviderRequirement
  matches(entry: ManifestEntry): boolean
  stage(entry: ManifestEntry): Promise<void>
  verifyStaged(entry: ManifestEntry): Promise<RestoreVerifyResult>
  swapToLive(entry: ManifestEntry): Promise<void>
  rollbackFrom(entry: ManifestEntry): Promise<void>
  cleanup(): Promise<void>
}

export function assertProviderRequirement(value: ProviderRequirement): void {
  if (!isProviderRequirement(value)) {
    throw new ProviderDomainError('requirement tidak dikenal (required|optional)')
  }
}

export { PROVIDER_REQUIREMENTS }
