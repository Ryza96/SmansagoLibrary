import type { PrismaClient } from '@prisma/client'
import { getPrisma } from './prisma'

export abstract class BaseRepository {
  protected readonly prisma: PrismaClient

  constructor() {
    this.prisma = getPrisma()
  }
}
