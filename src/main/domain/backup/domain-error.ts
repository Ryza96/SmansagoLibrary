// WO-4 — Backup Domain — kesalahan domain murni.
// Digunakan oleh seluruh Value Object / kontrak di folder ini.
// Sama sekali tidak bergantung pada Electron, filesystem, zip, sqlite, provider, atau manifest.

export class BackupDomainError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BackupDomainError'
  }
}
