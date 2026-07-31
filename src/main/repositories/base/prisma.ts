import { PrismaClient } from '@prisma/client'

let prisma: PrismaClient

function getPrisma(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient()
  }
  return prisma
}

async function connectPrisma(): Promise<void> {
  const client = getPrisma()
  try {
    await client.$connect()
    console.log('[DB] SQLite connected successfully')
  } catch (error) {
    console.error('[DB] Failed to connect:', error)
    throw error
  }
}

async function disconnectPrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect()
    console.log('[DB] SQLite disconnected')
  }
}

export { getPrisma, connectPrisma, disconnectPrisma }
