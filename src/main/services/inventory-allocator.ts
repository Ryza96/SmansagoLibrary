import type { Prisma } from '@prisma/client'

const SEQUENCE_ID = 'default'
const PREFIX = 'INV'
const PAD_LENGTH = 6

export class InventoryAllocator {
  async allocate(tx: Prisma.TransactionClient, count: number): Promise<string[]> {
    const maxUsedNumber = await this.findMaxUsedNumber(tx)
    const record = await tx.inventorySequence.findUnique({ where: { id: SEQUENCE_ID } })

    const needsHealing = !record || record.lastNumber < maxUsedNumber

    let lastNumber: number
    if (needsHealing) {
      lastNumber = maxUsedNumber + count
      await tx.inventorySequence.upsert({
        where: { id: SEQUENCE_ID },
        create: {
          id: SEQUENCE_ID,
          prefix: PREFIX,
          lastNumber,
        },
        update: {
          lastNumber: { set: lastNumber },
        },
      })
    } else {
      const updated = await tx.inventorySequence.update({
        where: { id: SEQUENCE_ID },
        data: { lastNumber: { increment: count } },
      })
      lastNumber = updated.lastNumber
    }

    const startNumber = lastNumber - count + 1

    return Array.from({ length: count }, (_, i) => {
      const seq = startNumber + i
      return `${PREFIX}-${seq.toString().padStart(PAD_LENGTH, '0')}`
    })
  }

  private async findMaxUsedNumber(tx: Prisma.TransactionClient): Promise<number> {
    const copies = await tx.bookCopy.findMany({ select: { inventoryNumber: true } })
    const prefix = `${PREFIX}-`
    let max = 0
    for (const copy of copies) {
      const value = copy.inventoryNumber
      if (!value.startsWith(prefix)) continue
      const num = Number(value.slice(prefix.length))
      if (Number.isFinite(num) && num > max) max = num
    }
    return max
  }
}
