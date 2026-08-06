// WO-5 — Restore domain error.
// Error domain Restore Engine (RFC-004 / ADR-001). Dipakai RestoreService untuk
// menolak run ketika prasyarat tidak terpenuhi (mis. single-flight aktif) dan
// oleh komponen restore lainnya untuk kegagalan domain.
// Murni domain: tanpa IO/Electron.

export class RestoreDomainError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RestoreDomainError'
  }
}
