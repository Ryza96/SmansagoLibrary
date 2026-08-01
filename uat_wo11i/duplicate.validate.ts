import { DatabaseReconciliationService } from '../src/main/services/database-reconciliation.service'
import { getPrisma } from '../src/main/repositories/base/prisma'
import type { PrismaClient } from '@prisma/client'

let pass = 0
let fail = 0

function check(name: string, ok: boolean, detail?: string): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`)
  if (ok) pass += 1
  else fail += 1
}

async function main(): Promise<void> {
  const prisma = getPrisma()

  await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS BookCopy')
  await prisma.$executeRawUnsafe(`
    CREATE TABLE "BookCopy" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "bookId" TEXT NOT NULL,
      "inventoryNumber" TEXT NOT NULL,
      "barcode" TEXT NOT NULL,
      "condition" TEXT NOT NULL DEFAULT 'GOOD',
      "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
      "shelfLocation" TEXT NOT NULL,
      "acquisitionDate" DATETIME,
      "acquisitionSource" TEXT,
      "acquisitionCost" INTEGER,
      "acquisitionSourceDetail" TEXT,
      "acquisitionNotes" TEXT,
      "notes" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await prisma.$executeRawUnsafe(`
    INSERT INTO "BookCopy" ("id", "bookId", "inventoryNumber", "barcode", "condition", "status", "shelfLocation")
    VALUES
      ('a1', 'b1', 'INV-000001', 'BC-AAA-1', 'GOOD', 'AVAILABLE', 'Rak-A'),
      ('a2', 'b1', 'INV-000001', 'BC-AAA-2', 'GOOD', 'AVAILABLE', 'Rak-A'),
      ('a3', 'b1', 'INV-000002', 'BC-BBB-1', 'GOOD', 'AVAILABLE', 'Rak-A'),
      ('a4', 'b1', 'INV-000003', 'BC-BBB-1', 'GOOD', 'AVAILABLE', 'Rak-A')
  `)

  const service = new DatabaseReconciliationService()
  const r1 = await service.run()
  console.log('RESULT1=' + JSON.stringify(r1))

  const invDupCount = await prisma.bookCopy.count({ where: { inventoryNumber: 'INV-000001' } })
  const barcodeDupCount = await prisma.bookCopy.count({ where: { barcode: 'BC-BBB-1' } })
  const total = await prisma.bookCopy.count()

  check('C1: duplikat inventoryNumber terdeteksi', r1.duplicateInventoryNumbers.includes('INV-000001'), JSON.stringify(r1.duplicateInventoryNumbers))
  check('C2: duplikat barcode terdeteksi', r1.duplicateBarcodes.includes('BC-BBB-1'), JSON.stringify(r1.duplicateBarcodes))
  check('C3: TIDAK diperbaiki otomatis (baris dup tetap ada)', invDupCount === 2 && barcodeDupCount === 2, `invDup=${invDupCount} barcodeDup=${barcodeDupCount}`)
  check('C4: tidak ada baris dihapus/ditambah', total === 4, `total=${total}`)

  const r2 = await service.run()
  const r2Total = await prisma.bookCopy.count()
  check('C5: run kedua idempotent (laporan sama, data utuh)', r2Total === 4 && r2.duplicateInventoryNumbers.includes('INV-000001'), `total=${r2Total}`)

  await prisma.$disconnect()
  console.log(`TOTAL PASS=${pass} FAIL=${fail}`)
  process.exit(fail > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error('PROBE_ERROR ' + e.message)
  process.exit(1)
})
