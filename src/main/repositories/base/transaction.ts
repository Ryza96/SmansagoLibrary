import { Prisma, PrismaClient } from '@prisma/client'

export interface TransactionOptions {
  maxWait?: number
  timeout?: number
}

const DEFAULT_TRANSACTION_OPTIONS: TransactionOptions = {
  maxWait: 5_000,
  timeout: 60_000
}

export async function runTransaction<T>(
  prisma: PrismaClient,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: TransactionOptions
): Promise<T> {
  return prisma.$transaction(fn, options ?? DEFAULT_TRANSACTION_OPTIONS)
}
