export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly type: string,
    message: string
  ) {
    super(message)
    this.name = 'AppError'
  }
}
