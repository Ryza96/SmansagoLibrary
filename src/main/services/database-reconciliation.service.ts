import { getPrisma } from '../repositories/base/prisma'

const SEQUENCE_ID = 'default'
const PREFIX = 'INV'

export interface DatabaseReconciliationResult {
  sequenceExisted: boolean
  sequenceSynced: boolean
  sequenceLastNumber: number
  maxInventoryNumber: number
  duplicateInventoryNumbers: string[]
  duplicateBarcodes: string[]
}

export class DatabaseReconciliationService {
  async run(): Promise<DatabaseReconciliationResult> {
    const prisma = getPrisma()

    const copies = await prisma.bookCopy.findMany({
      select: { inventoryNumber: true, barcode: true },
    })

    const maxInventoryNumber = this.maxInventoryNumber(copies.map((c) => c.inventoryNumber))
    const duplicateInventoryNumbers = this.findDuplicates(copies.map((c) => c.inventoryNumber))
    const duplicateBarcodes = this.findDuplicates(copies.map((c) => c.barcode))

    const existing = await prisma.inventorySequence.findUnique({ where: { id: SEQUENCE_ID } })
    const sequenceExisted = existing !== null

    const needsSync = !existing || existing.lastNumber < maxInventoryNumber

    let sequenceSynced = false
    let sequenceLastNumber: number
    if (needsSync) {
      sequenceLastNumber = maxInventoryNumber
      await prisma.inventorySequence.upsert({
        where: { id: SEQUENCE_ID },
        create: {
          id: SEQUENCE_ID,
          prefix: PREFIX,
          lastNumber: maxInventoryNumber,
        },
        update: {
          lastNumber: { set: maxInventoryNumber },
        },
      })
      sequenceSynced = true
    } else {
      sequenceLastNumber = existing!.lastNumber
    }

    for (const inventoryNumber of duplicateInventoryNumbers) {
      console.error(`[RECONCILE] DATABASE INCONSISTENCY: duplicate inventoryNumber "${inventoryNumber}"`)
    }
    for (const barcode of duplicateBarcodes) {
      console.error(`[RECONCILE] DATABASE INCONSISTENCY: duplicate barcode "${barcode}"`)
    }
    console.log(
      `[RECONCILE] InventorySequence lastNumber=${sequenceLastNumber} maxInventoryNumber=${maxInventoryNumber} synced=${sequenceSynced}`
    )

    return {
      sequenceExisted,
      sequenceSynced,
      sequenceLastNumber,
      maxInventoryNumber,
      duplicateInventoryNumbers,
      duplicateBarcodes,
    }
  }

  private maxInventoryNumber(inventoryNumbers: string[]): number {
    const prefix = `${PREFIX}-`
    let max = 0
    for (const value of inventoryNumbers) {
      if (!value.startsWith(prefix)) continue
      const num = Number(value.slice(prefix.length))
      if (Number.isFinite(num) && num > max) max = num
    }
    return max
  }

  private findDuplicates(values: string[]): string[] {
    const counts = new Map<string, number>()
    for (const value of values) {
      counts.set(value, (counts.get(value) ?? 0) + 1)
    }
    return [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([value]) => value)
      .sort()
  }
}

export const databaseReconciliationService = new DatabaseReconciliationService()
