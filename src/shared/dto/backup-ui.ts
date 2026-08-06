// Backup & Restore UI — DTO kontrak renderer ↔ main (WO-6).
// UI HANYA klien: seluruh status/progress/nilai tampilan dibangun di main
// (controller layer), renderer hanya menampilkan + memanggil channel.
// Engine (WO-1..WO-5) TIDAK terikat DTO ini — kontrak berdiri sendiri.

// ---------------------------------------------------------------------------
// Tahapan progress backup (keputusan PO): stage 1 = preflight ASLI (engine),
// stage 2..6 = indicative pacing selama engine.run() berjalan, stage 7 = selesai.
// ---------------------------------------------------------------------------
export const BACKUP_UI_STAGES = [
  'validate',
  'collect',
  'manifest',
  'compress',
  'verify',
  'finalize',
  'complete',
] as const
export type BackupUIStage = (typeof BACKUP_UI_STAGES)[number]

// Tahapan progress restore: seluruh 8 tahap di-paced selama engine.run()
// berjalan (restore bersifat atomic — tidak ada sub-langkah yang dapat
// dilaporkan terpisah tanpa membocorkan internal engine).
export const RESTORE_UI_STAGES = [
  'validate',
  'extract',
  'verify',
  'snapshot',
  'restore',
  'verify-after',
  'cleanup',
  'complete',
] as const
export type RestoreUIStage = (typeof RESTORE_UI_STAGES)[number]

export interface BackupUIProgressEvent {
  stage: BackupUIStage
  current: number
  total: number
  startedAt: string
}

export interface RestoreUIProgressEvent {
  stage: RestoreUIStage
  current: number
  total: number
  startedAt: string
}

// ---------------------------------------------------------------------------
// Status hasil (UI-level, bukan enum domain engine) — dibuat main.
// ---------------------------------------------------------------------------
export type BackupUIStatus = 'SUCCESS' | 'SUCCESS_WITH_WARNING' | 'FAILED' | 'CANCELLED'
export type RestoreUIStatus = 'SUCCESS' | 'FAILED' | 'CANCELLED'

// ---------------------------------------------------------------------------
// Info lokasi penyimpanan (backup page) — path FIXED (keputusan PO #1):
// user tidak memilih folder; engine menulis ke userData/backup/manual.
// ---------------------------------------------------------------------------
export interface BackupTargetInfo {
  backupDir: string
  sampleFilename: string
  extension: string
}

export interface OpenFolderResult {
  ok: boolean
  message?: string
}

// ---------------------------------------------------------------------------
// Hasil run backup (backup page — ringkasan sukses/gagal).
// ---------------------------------------------------------------------------
export interface BackupUISummary {
  status: BackupUIStatus
  fileName: string | null
  filePath: string | null
  sizeBytes: number | null
  backupDir: string
  startedAt: string
  finishedAt: string
  durationMs: number
  warnings: string[]
  errors: string[]
}

// ---------------------------------------------------------------------------
// Info file .apbackup yang dipilih (restore dialog — SEBELUM konfirmasi).
// Nilai dihitung main dari manifest + DB di dalam wadah (BackupInspector);
// renderer TIDAK menurunkan angka.
// ---------------------------------------------------------------------------
export interface BackupFileInfo {
  ok: boolean
  fileName: string
  filePath: string
  sizeBytes: number
  backupDate: string | null
  appVersion: string
  schemaVersion: string
  backupVersion: number
  bookCount: number | null
  memberCount: number | null
  copyCount: number | null
  warnings: string[]
  errors: string[]
}

// Hasil pemilihan file via dialog OS.
export interface PickBackupResult {
  canceled: boolean
  filePath?: string
}

// ---------------------------------------------------------------------------
// Hasil run restore (restore dialog).
// ---------------------------------------------------------------------------
export interface RestoreUIResult {
  status: RestoreUIStatus
  sessionId: string
  startedAt: string
  finishedAt: string
  durationMs: number
  schemaVersionBefore: string | null
  schemaVersionRestored: string | null
  needsRestart: boolean
  warnings: string[]
  errors: string[]
}
