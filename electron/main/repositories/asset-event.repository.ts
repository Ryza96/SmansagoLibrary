import { Prisma } from '@prisma/client'
import { prisma } from '../database'

export interface RecordAssetEventInput {
  bookCopyId: string
  eventType: string
  actorType: string
  actorId?: string
  metadata?: string
  notes?: string
}

export class AssetEventRepository {
  async record(
    tx: Prisma.TransactionClient,
    input: RecordAssetEventInput
  ): Promise<void> {
    await tx.assetEvent.create({
      data: {
        bookCopyId: input.bookCopyId,
        eventType: input.eventType,
        actorType: input.actorType,
        actorId: input.actorId ?? null,
        metadata: input.metadata ?? null,
        notes: input.notes ?? null
      }
    })
  }

  async findByBookCopyId(bookCopyId: string) {
    return prisma.assetEvent.findMany({
      where: { bookCopyId },
      orderBy: { occurredAt: 'asc' }
    })
  }
}
