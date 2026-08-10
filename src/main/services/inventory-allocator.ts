import type { Prisma } from '@prisma/client'

const SEQUENCE_ID = 'default'
const DEFAULT_PREFIX = 'INV'
const PAD_LENGTH = 6

// Alokasi nomor inventaris (INV-XXXXXX). Prefix dibaca dari konfigurasi
// `Setting.inventoryPrefix` (fallback 'INV') di dalam transaksi yang sama
// sehingga perubahan prefix di Pengaturan langsung berlaku tanpa restart.
// Nomor urut TIDAK di-reset saat prefix berubah — urutan berlanjut dari
// nilai terakhir yang disimpan (mis. lastNumber 28 -> BC-000029).

export class InventoryAllocator {
  async allocate(tx: Prisma.TransactionClient, count: number): Promise<string[]> {
    const prefix = await this.readPrefix(tx)
    const maxUsedNumber = await this.findMaxUsedNumber(tx, prefix)
    const record = await tx.inventorySequence.findUnique({ where: { id: SEQUENCE_ID } })

    const needsHealing = !record || record.lastNumber < maxUsedNumber

    let lastNumber: number
    if (needsHealing) {
      lastNumber = maxUsedNumber + count
      await tx.inventorySequence.upsert({
        where: { id: SEQUENCE_ID },
        create: {
          id: SEQUENCE_ID,
          prefix,
          lastNumber,
        },
        update: {
          lastNumber: { set: lastNumber },
          prefix,
        },
      })
    } else {
      const updated = await tx.inventorySequence.update({
        where: { id: SEQUENCE_ID },
        data: { lastNumber: { increment: count }, prefix },
      })
      lastNumber = updated.lastNumber
    }

    const startNumber = lastNumber - count + 1

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

  private async findMaxUsedNumber(tx: Prisma.TransactionClient, prefix: string): Promise<number> {
    const copies = await tx.bookCopy.findMany({ select: { inventoryNumber: true } })
    const needle = `${prefix}-`
    let max = 0
    for (const copy of copies) {
      const value = copy.inventoryNumber
      if (!value.startsWith(needle)) continue
      const num = Number(value.slice(needle.length))
      if (Number.isFinite(num) && num > max) max = num
    }
    return max
  }
}
