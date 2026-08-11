import type { Prisma } from '@prisma/client'

const SEQUENCE_ID = 'default'
const DEFAULT_PREFIX = 'INV'
const PAD_LENGTH = 6

// Alokasi nomor inventaris + barcode dari SATU counter yang sama.
//   inventoryNumber SELALU 'INV-XXXXXX' (identitas stabil lintas perubahan
//     prefix).
//   barcode = inventoryNumber (identitas yang sama — konsumen barcode memakai
//     kolom `inventoryNumber`). Setting.inventoryPrefix TIDAK lagi membentuk
//     nilai barcode; prefix tetap disimpan di record InventorySequence
//     (field kosmetik, DEPRECATED untuk alokasi) agar setting tidak hilang.
// Keduanya memakai nomor urut yang sama dalam satu transaksi sehingga tetap
// 1:1 per eksemplar. Nomor urut TIDAK di-reset saat prefix berubah — urutan
// berlanjut. Healing membaca kolom `inventoryNumber` dengan needle TETAP
// 'INV-'; nilai ber-prefix lain TIDAK memengaruhi urutan.

export interface InventoryAllocation {
  inventoryNumber: string
  barcode: string
}

export class InventoryAllocator {
  async allocate(tx: Prisma.TransactionClient, count: number): Promise<InventoryAllocation[]> {
    const prefix = await this.readPrefix(tx)
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
      const inventoryNumber = `${DEFAULT_PREFIX}-${seq.toString().padStart(PAD_LENGTH, '0')}`
      return {
        inventoryNumber,
        barcode: inventoryNumber,
      }
    })
  }

  private async readPrefix(tx: Prisma.TransactionClient): Promise<string> {
    const setting = await tx.setting.findFirst()
    const prefix = setting?.inventoryPrefix?.trim().toUpperCase()
    return prefix && prefix.length > 0 ? prefix : DEFAULT_PREFIX
  }

  private async findMaxUsedNumber(tx: Prisma.TransactionClient): Promise<number> {
    const copies = await tx.bookCopy.findMany({ select: { inventoryNumber: true } })
    const needle = `${DEFAULT_PREFIX}-`
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
