import { Prisma } from '@prisma/client'

const SEQUENCE_ID = 'default'
const DEFAULT_PREFIX = 'INV'
const PAD_LENGTH = 6

// Alokasi nomor inventaris (INV-XXXXXX) — sisi legacy (jalur import buku).
// Prefix dibaca dari `Setting.inventoryPrefix` di dalam transaksi yang sama;
// fallback 'INV'. Nomor urut berlanjut (tidak di-reset saat prefix berubah).

export class InventoryAllocator {
  async allocate(
    tx: Prisma.TransactionClient,
    count: number
  ): Promise<string[]> {
    const prefix = await this.readPrefix(tx)
    const record = await tx.inventorySequence.upsert({
      where: { id: SEQUENCE_ID },
      create: {
        id: SEQUENCE_ID,
        prefix,
        lastNumber: count
      },
      update: {
        lastNumber: { increment: count },
        prefix
      }
    })

    const startNumber = record.lastNumber - count + 1

    return Array.from({ length: count }, (_, i) => {
      const seq = startNumber + i
      return `${prefix}-${seq.toString().padStart(PAD_LENGTH, '0')}`
    })
  }

  private async readPrefix(tx: Prisma.TransactionClient): Promise<string> {
    const setting = await tx.setting.findFirst()
    const prefix = setting?.inventoryPrefix?.trim().toUpperCase()
    return prefix && prefix.length > 0 ? prefix : DEFAULT_PREFIX
  }
}
