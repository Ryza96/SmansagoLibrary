// WO-3 — Provider Kind.
// Jenis data yang diwakili Provider (backup) / Restore Handler (restore) —
// RFC-003 §3.2 / ADR-001 (SSOT):
//   database, asset, configuration, log.
// Murni domain: tanpa filesystem/electron/zip/sqlite.

export const PROVIDER_KINDS = {
  DATABASE: 'database',
  ASSET: 'asset',
  CONFIGURATION: 'configuration',
  LOG: 'log',
} as const satisfies Record<string, string>

export type ProviderKind = (typeof PROVIDER_KINDS)[keyof typeof PROVIDER_KINDS]

export function isProviderKind(value: unknown): value is ProviderKind {
  return (
    typeof value === 'string' && (Object.values(PROVIDER_KINDS) as string[]).includes(value)
  )
}
