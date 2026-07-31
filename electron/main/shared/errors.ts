export class DuplicateResourceError extends Error {
  constructor(
    public readonly resource: string,
    public readonly field: string,
    public readonly value: string
  ) {
    super(`${resource} dengan ${field} "${value}" sudah digunakan.`)
    this.name = 'DuplicateResourceError'
  }
}

export class ResourceInUseError extends Error {
  constructor(
    public readonly resource: string,
    public readonly resourceName: string
  ) {
    super(`${resource} "${resourceName}" tidak dapat dihapus karena masih digunakan oleh buku.`)
    this.name = 'ResourceInUseError'
  }
}
