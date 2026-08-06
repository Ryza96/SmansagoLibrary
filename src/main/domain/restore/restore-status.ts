// WO-5 — Restore run status.
// RFC-004 §1.1: status SATU sesi restore — SUCCESS | FAILED | CANCELLED.
// Murni domain (config leaf, pola config/status domain lain:
// academic-status / book-copy-status / backup-status).

export const RESTORE_STATUS = {
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const satisfies Record<string, string>

export type RestoreStatus = (typeof RESTORE_STATUS)[keyof typeof RESTORE_STATUS]

export function isRestoreStatus(value: unknown): value is RestoreStatus {
  return typeof value === 'string' && (Object.values(RESTORE_STATUS) as string[]).includes(value)
}
