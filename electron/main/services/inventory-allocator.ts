import { Prisma } from '@prisma/client'

const SEQUENCE_ID = 'default'
const DEFAULT_PREFIX = 'INV'
const PAD_LENGTH = 6

// Alokasi nomor inventaris + barcode — sisi legacy (jalur tambah eksemplar).
// inventoryNumber SELALU 'INV-XXXXXX'; barcode = '<Setting.inventoryPrefix>-XXXXXX'.
// Keduanya berbagi SATU counter (tidak di-reset saat prefix berubah).
// Tanpa healing — urutan dari lastNumber; kolisi ditangani retry P2002 caller.
// Prefix dibaca dari `Setting.inventoryPrefix` di dalam transaksi yang sama;
// fallback 'INV'.

export interface InventoryAllocation {
  inventoryNumber: string
  barcode: string
}

export class InventoryAllocator {
  async allocate(
    tx: Prisma.TransactionClient,
    count: number
  ): Promise<InventoryAllocation[]> {
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
      return {
        inventoryNumber: `${DEFAULT_PREFIX}-${seq.toString().padStart(PAD_LENGTH, '0')}`,
        barcode: `${prefix}-${seq.toString().padStart(PAD_LENGTH, '0')}`
      }
    })
  }

  private async readPrefix(tx: Prisma.TransactionClient): Promise<string> {
    const setting = await tx.setting.findFirst()
    const prefix = setting?.inventoryPrefix?.trim().toUpperCase()
    return prefix && prefix.length > 0 ? prefix : DEFAULT_PREFIX
  }
}
