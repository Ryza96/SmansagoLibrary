// WO-3 — Provider Domain — kesalahan domain murni.
// Digunakan oleh seluruh Value Object / kontrak di folder ini.
// Sama sekali tidak bergantung pada Electron, filesystem, zip, sqlite, atau manifest.

export class ProviderDomainError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProviderDomainError'
  }
}
