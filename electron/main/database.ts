import { PrismaClient } from '@prisma/client'

let prisma: PrismaClient

async function initDatabase(): Promise<void> {
  prisma = new PrismaClient()

  try {
    await prisma.$connect()
    console.log('[DB] SQLite connected successfully')
  } catch (error) {
    console.error('[DB] Failed to connect:', error)
    throw error
  }
}

async function closeDatabase(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect()
    console.log('[DB] SQLite disconnected')
  }
}

export { prisma, initDatabase, closeDatabase }
