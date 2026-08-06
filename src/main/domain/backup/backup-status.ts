// WO-4 — Backup Status + aturan transisi.
// Status akhir sebuah run backup — ADR-001 (SSOT):
//   SUCCESS / SUCCESS_WITH_WARNING / FAILED / CANCELLED.
//   - Provider WAJIB gagal → Abort → FAILED.
//   - Provider OPSIONAL gagal → dilewati → SUCCESS_WITH_WARNING (manifest menandai yang dilewati).
//   - CANCELLED = pembatalan user / app-exit sebelum finalisasi (tidak ada file permanen).
// Murni domain: tanpa filesystem/electron/zip/sqlite.

export const BACKUP_STATUS = {
  SUCCESS: 'SUCCESS',
  SUCCESS_WITH_WARNING: 'SUCCESS_WITH_WARNING',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const satisfies Record<string, string>

export type BackupStatus = (typeof BACKUP_STATUS)[keyof typeof BACKUP_STATUS]

export function isBackupStatus(value: unknown): value is BackupStatus {
  return (
    typeof value === 'string' && (Object.values(BACKUP_STATUS) as string[]).includes(value)
  )
}

export const BACKUP_STATUS_LABEL: Record<BackupStatus, string> = {
  SUCCESS: 'Berhasil',
  SUCCESS_WITH_WARNING: 'Berhasil dengan Peringatan',
  FAILED: 'Gagal',
  CANCELLED: 'Dibatalkan',
}

export function isSuccessBackupStatus(status: BackupStatus): boolean {
  return status === BACKUP_STATUS.SUCCESS || status === BACKUP_STATUS.SUCCESS_WITH_WARNING
}

// Keempat status adalah HASIL AKHIR (terminal) — sekali run selesai, status tidak
// dapat berubah lagi. Tidak ada status "sedang berjalan" di level hasil; jalannya run
// dijejaki sesi (BackupSession).
export const BACKUP_TERMINAL_STATUSES: readonly BackupStatus[] = [
  BACKUP_STATUS.SUCCESS,
  BACKUP_STATUS.SUCCESS_WITH_WARNING,
  BACKUP_STATUS.FAILED,
  BACKUP_STATUS.CANCELLED,
]

export function isTerminalBackupStatus(status: BackupStatus): boolean {
  return (BACKUP_TERMINAL_STATUSES as readonly BackupStatus[]).includes(status)
}

// Matriks transisi legal antar-status (dipakai engine saat menetapkan hasil akhir).
//   - SUCCESS dapat "diturunkan" menjadi SUCCESS_WITH_WARNING bila selama run muncul
//     warning (mis. provider OPSIONAL dilewati) — keputusan terakhir tetap satu.
//   - Status lain terminal: tidak pernah berpindah ke status mana pun.
export const BACKUP_STATUS_TRANSITIONS: Record<BackupStatus, readonly BackupStatus[]> = {
  SUCCESS: [BACKUP_STATUS.SUCCESS, BACKUP_STATUS.SUCCESS_WITH_WARNING],
  SUCCESS_WITH_WARNING: [],
  FAILED: [],
  CANCELLED: [],
}

export function canTransitionBackupStatus(from: BackupStatus, to: BackupStatus): boolean {
  return (BACKUP_STATUS_TRANSITIONS[from] as readonly BackupStatus[]).includes(to)
}
