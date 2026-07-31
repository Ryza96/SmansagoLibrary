import { Prisma } from '@prisma/client'

const SEQUENCE_ID = 'default'
const PREFIX = 'INV'
const PAD_LENGTH = 6

export class InventoryAllocator {
  async allocate(
    tx: Prisma.TransactionClient,
    count: number
  ): Promise<string[]> {
    const record = await tx.inventorySequence.upsert({
      where: { id: SEQUENCE_ID },
      create: {
        id: SEQUENCE_ID,
        prefix: PREFIX,
        lastNumber: count
      },
      update: {
        lastNumber: { increment: count }
      }
    })

    const startNumber = record.lastNumber - count + 1

    return Array.from({ length: count }, (_, i) => {
      const seq = startNumber + i
      return `${PREFIX}-${seq.toString().padStart(PAD_LENGTH, '0')}`
    })
  }
}
