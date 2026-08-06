// WO-3 — Backup Provider kontrak.
// Kontrak Provider RFC-003 §3.4 / ADR-001 (SSOT):
//   id/version · required/optional · collect() · verify() · cleanup().
// Provider = unit otonom yang mengumpulkan SATU jenis data menjadi SATU unit
// yang siap masuk wadah backup. Engine tidak tahu detail sumber data.
// Murni domain: ini hanya KONTRAK — implementasi (infra) menyediakan sumber data.

import { ProviderDomainError } from './domain-error'
import { ProviderId } from './provider-id'
import { ProviderKind, isProviderKind } from './provider-kind'
import { ManifestEntry } from '../manifest/entry'

export const PROVIDER_REQUIREMENTS = {
  REQUIRED: 'required',
  OPTIONAL: 'optional',
} as const satisfies Record<string, string>

export type ProviderRequirement = (typeof PROVIDER_REQUIREMENTS)[keyof typeof PROVIDER_REQUIREMENTS]

export function isProviderRequirement(value: unknown): value is ProviderRequirement {
  return (
    typeof value === 'string' &&
    (Object.values(PROVIDER_REQUIREMENTS) as string[]).includes(value)
  )
}

export const PROVIDER_REQUIREMENT_LABEL: Record<ProviderRequirement, string> = {
  required: 'WAJIB',
  optional: 'OPSIONAL',
}

export interface ProviderCollectResult {
  kind: ProviderKind
  relativePath: string
  sizeBytes: number
}

export interface ProviderVerifyResult {
  ok: boolean
  messages: string[]
}

export function collectResultOf(props: ProviderCollectResult): ProviderCollectResult {
  if (!isProviderKind(props.kind)) {
    throw new ProviderDomainError('collect.kind tidak dikenal (database|asset|configuration|log)')
  }
  if (typeof props.relativePath !== 'string' || props.relativePath.length === 0) {
    throw new ProviderDomainError('collect.relativePath wajib string non-kosong')
  }
  if (typeof props.sizeBytes !== 'number' || !Number.isInteger(props.sizeBytes) || props.sizeBytes < 0) {
    throw new ProviderDomainError('collect.sizeBytes wajib bilangan bulat >= 0')
  }
  return { kind: props.kind, relativePath: props.relativePath, sizeBytes: props.sizeBytes }
}

export function verifyResultOf(ok: boolean, messages: string[] = []): ProviderVerifyResult {
  if (typeof ok !== 'boolean') {
    throw new ProviderDomainError('verify.ok wajib boolean')
  }
  if (!Array.isArray(messages)) {
    throw new ProviderDomainError('verify.messages wajib array')
  }
  return { ok, messages: [...messages] }
}

export interface BackupProvider {
  readonly id: ProviderId
  readonly kind: ProviderKind
  readonly requirement: ProviderRequirement
  collect(): Promise<ProviderCollectResult>
  verify(entry: ManifestEntry): Promise<ProviderVerifyResult>
  cleanup(): Promise<void>
}
