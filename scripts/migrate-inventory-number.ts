import { PrismaClient } from '@prisma/client'
import { runTransaction } from '../src/main/repositories/base/transaction'

// Migrasi data satu kali (dev DB): inventoryNumber buku yang masih memakai
// prefix khusus (mis. 'BC-000102') diseragamkan ke 'INV-<seq>' — konsisten
// desain baru di mana kolom inventoryNumber SELALU 'INV-XXXXXX' dan hanya
// kolom barcode yang boleh memakai Setting.inventoryPrefix.
// Kolom barcode TIDAK diubah (nilai legacy dipertahankan agar label/QR lama
// tetap valid). Skrip idempoten: baris yang sudah 'INV-' tidak disentuh.

export interface InventoryNumberMigrationResult {
  totalNonInv: number
  migrated: number
  collisions: string[]
  invalid: string[]
}

export async function runInventoryNumberMigration(
  prisma: PrismaClient
): Promise<InventoryNumberMigrationResult> {
  const copies = await prisma.bookCopy.findMany({
    select: { id: true, inventoryNumber: true, barcode: true },
    orderBy: { inventoryNumber: 'asc' }
  })

  const existing = new Set(copies.map((c) => c.inventoryNumber))
  const result: InventoryNumberMigrationResult = {
    totalNonInv: 0,
    migrated: 0,
    collisions: [],
    invalid: []
  }

  const updates: Array<{ id: string; oldValue: string; newValue: string }> = []

  for (const copy of copies) {
    const value = copy.inventoryNumber
    if (!value) continue
    if (value.startsWith('INV-')) continue

    result.totalNonInv += 1

    const dash = value.indexOf('-')
    if (dash <= 0 || dash === value.length - 1) {
      result.invalid.push(value)
      continue
    }
    const seqPart = value.slice(dash + 1)
    if (!/^\d+$/.test(seqPart)) {
      result.invalid.push(value)
      continue
    }

    const candidate = `INV-${seqPart}`
    if (existing.has(candidate) || updates.some((u) => u.newValue === candidate)) {
      result.collisions.push(`${value} -> ${candidate}`)
      continue
    }

    existing.delete(value)
    existing.add(candidate)
    updates.push({ id: copy.id, oldValue: value, newValue: candidate })
  }

  if (updates.length > 0) {
    await runTransaction(prisma, async (tx) => {
      for (const update of updates) {
        await tx.bookCopy.update({
          where: { id: update.id },
          data: { inventoryNumber: update.newValue }
        })
      }
    })
    result.migrated = updates.length
  }

  return result
}

async function main(): Promise<void> {
  const prisma = new PrismaClient()
  try {
    const result = await runInventoryNumberMigration(prisma)
    console.log('=== INVENTORY NUMBER MIGRATION ===')
    console.log(`totalNonInv: ${result.totalNonInv}`)
    console.log(`migrated: ${result.migrated}`)
    console.log(`collisions: ${result.collisions.length}`)
    for (const c of result.collisions) console.log(`  [COLLISION] ${c}`)
    console.log(`invalid: ${result.invalid.length}`)
    for (const v of result.invalid) console.log(`  [INVALID] ${v}`)
    const invCount = await prisma.bookCopy.count({ where: { inventoryNumber: { startsWith: 'INV-' } } })
    const total = await prisma.bookCopy.count()
    console.log(`inventoryNumber INV-: ${invCount} / ${total}`)
    console.log('=== DONE ===')
  } finally {
    await prisma.$disconnect()
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
