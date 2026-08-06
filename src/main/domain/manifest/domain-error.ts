// Domain Manifest — kesalahan domain murni.
// Digunakan oleh seluruh Value Object / Model di folder ini.
// Sama sekali tidak bergantung pada Electron, filesystem, zip, sqlite, atau provider.

export class ManifestDomainError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ManifestDomainError'
  }
}
