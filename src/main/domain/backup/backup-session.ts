// WO-4 — Backup Session.
// RFC-003 §1 langkah 1 / ADR-001 (SSOT): setiap run backup = SATU sesi tunggal
// dengan id unik + timestamp mulai. Sesi memberi jejak audit dan mencegah dua run
// menimpa area staging yang sama (RFC-003 §4.1: "Tidak ada sesi backup lain berjalan").
// Murni domain: tanpa filesystem/electron/zip/sqlite/crypto — id DIBANGKITKAN caller
// (infra/service) lalu divalidasi VO ini; VO hanya membungkus & meng-copy nilai.

import { BackupDomainError } from './domain-error'

export const BACKUP_SESSION_ID_MAX_LENGTH = 128
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001F\u007F]/

export function isBackupSessionId(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  if (trimmed.length === 0) return false
  if (trimmed.length > BACKUP_SESSION_ID_MAX_LENGTH) return false
  if (CONTROL_CHARACTER_PATTERN.test(trimmed)) return false
  return true
}

export class BackupSessionId {
  private constructor(private readonly _value: string) {}

  static of(value: string): BackupSessionId {
    if (!isBackupSessionId(value)) {
      throw new BackupDomainError(
        `Backup session id tidak valid: wajib string non-kosong tanpa karakter kontrol (maks ${BACKUP_SESSION_ID_MAX_LENGTH} karakter)`
      )
    }
    return new BackupSessionId(value.trim())
  }

  get value(): string {
    return this._value
  }

  equals(other: BackupSessionId): boolean {
    return this._value === other._value
  }
}

export interface BackupSessionProps {
  id: BackupSessionId
  startedAt: Date
}

export class BackupSession {
  private constructor(private readonly _props: BackupSessionProps) {}

  static of(props: BackupSessionProps): BackupSession {
    if (!(props.id instanceof BackupSessionId)) {
      throw new BackupDomainError('backup session.id wajib berupa BackupSessionId')
    }
    if (!(props.startedAt instanceof Date) || Number.isNaN(props.startedAt.getTime())) {
      throw new BackupDomainError('backup session.startedAt wajib berupa Date valid')
    }
    // Immutability: copy Date — mutasi objek milik caller setelah konstruksi tidak berpengaruh.
    return new BackupSession({
      id: props.id,
      startedAt: new Date(props.startedAt.getTime()),
    })
  }

  get id(): BackupSessionId {
    return this._props.id
  }

  get startedAt(): Date {
    // Immutability: kembalikan COPY Date, bukan referensi internal.
    return new Date(this._props.startedAt.getTime())
  }
}
