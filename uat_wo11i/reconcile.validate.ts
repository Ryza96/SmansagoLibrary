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

async function snapshot(prisma: PrismaClient): Promise<string> {
  const copies = await prisma.bookCopy.findMany({ orderBy: { inventoryNumber: 'asc' } })
  const seq = await prisma.inventorySequence.findMany()
  return JSON.stringify({
    copies: copies.map((c) => ({ inv: c.inventoryNumber, barcode: c.barcode })),
    seq,
    bookCount: await prisma.book.count(),
    copyCount: copies.length,
  })
}

async function scenarioEmptySequence(prisma: PrismaClient): Promise<void> {
  console.log('--- SCENARIO A: sequence kosong (dev DB tanpa row sequence) ---')
  await prisma.inventorySequence.deleteMany()

  const service = new DatabaseReconciliationService()
  const r1 = await service.run()
  console.log('RESULT1=' + JSON.stringify(r1))
  const after1 = await snapshot(prisma)

  const r2 = await service.run()
  console.log('RESULT2=' + JSON.stringify(r2))
  const after2 = await snapshot(prisma)

  const seqRow = (await prisma.inventorySequence.findMany())[0]
  const maxInv = r1.maxInventoryNumber

  check('A1: sequence dibuat saat kosong', r1.sequenceExisted === false && r1.sequenceSynced === true, `existed=${r1.sequenceExisted} synced=${r1.sequenceSynced}`)
  check('A2: lastNumber == MAX inventory', seqRow !== undefined && seqRow.lastNumber === maxInv, `lastNumber=${seqRow?.lastNumber} max=${maxInv}`)
  check('A3: run kedua tidak menyentuh sequence', r2.sequenceSynced === false, `synced=${r2.sequenceSynced}`)
  check('A4: run kedua tidak mengubah data', after1 === after2)
}

async function scenarioLaggingSequence(prisma: PrismaClient): Promise<void> {
  console.log('--- SCENARIO B: sequence tertinggal (lastNumber < MAX) ---')
  await prisma.inventorySequence.upsert({
    where: { id: 'default' },
    create: { id: 'default', prefix: 'INV', lastNumber: 5 },
    update: { lastNumber: 5 },
  })

  const service = new DatabaseReconciliationService()
  const r1 = await service.run()
  console.log('RESULT1=' + JSON.stringify(r1))

  const r2 = await service.run()
  const seqRow = (await prisma.inventorySequence.findMany())[0]

  check('B1: sequence disinkronkan ke MAX', r1.sequenceSynced === true && seqRow!.lastNumber === r1.maxInventoryNumber, `lastNumber=${seqRow!.lastNumber} max=${r1.maxInventoryNumber}`)
  check('B2: run kedua tidak mengubah lagi', r2.sequenceSynced === false)
}

async function scenarioDuplicate(prisma: PrismaClient): Promise<void> {
  console.log('--- SCENARIO C: duplikat inventoryNumber & barcode (tidak diperbaiki, dilaporkan) ---')
  await prisma.inventorySequence.deleteMany()
  const first = (await prisma.bookCopy.findFirst()) as { id: string; bookId: string; inventoryNumber: string; barcode: string; condition: string; status: string; shelfLocation: string }
  await prisma.$executeRawUnsafe(
    `INSERT INTO BookCopy (id, bookId, inventoryNumber, barcode, condition, status, shelfLocation, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    'dup-copy-1',
    first.bookId,
    first.inventoryNumber,
    'BC-DUP-BARCODE-001',
    first.condition,
    first.status,
    first.shelfLocation
  )
  await prisma.$executeRawUnsafe(
    `INSERT INTO BookCopy (id, bookId, inventoryNumber, barcode, condition, status, shelfLocation, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    'dup-copy-2',
    first.bookId,
    'INV-999999',
    first.barcode,
    first.condition,
    first.status,
    first.shelfLocation
  )

  const service = new DatabaseReconciliationService()
  const r1 = await service.run()
  console.log('RESULT1=' + JSON.stringify(r1))

  const dupInvCount = await prisma.bookCopy.count({ where: { inventoryNumber: first.inventoryNumber } })
  const dupBarcodeCount = await prisma.bookCopy.count({ where: { barcode: first.barcode } })
  const inv999Count = await prisma.bookCopy.count({ where: { inventoryNumber: 'INV-999999' } })

  check('C1: duplikat inventoryNumber terdeteksi', r1.duplicateInventoryNumbers.includes(first.inventoryNumber), JSON.stringify(r1.duplicateInventoryNumbers))
  check('C2: duplikat barcode terdeteksi', r1.duplicateBarcodes.includes(first.barcode), JSON.stringify(r1.duplicateBarcodes))
  check('C3: TIDAK diperbaiki otomatis (dup baris tetap ada)', dupInvCount === 2 && dupBarcodeCount === 2, `invCount=${dupInvCount} barcodeCount=${dupBarcodeCount}`)
  check('C4: baris lain tidak diubah', inv999Count === 1, `inv999Count=${inv999Count}`)
}

async function main(): Promise<void> {
  const prisma = getPrisma()

  const baseSnapshot = await snapshot(prisma)
  const maxInv = (await prisma.bookCopy.findMany({ select: { inventoryNumber: true } }))
    .map((c) => c.inventoryNumber)
    .filter((v) => v.startsWith('INV-'))
    .map((v) => Number(v.slice(4)))
    .reduce((m, n) => (n > m ? n : m), 0)
  check('S0: DB siap diuji (ada BookCopy)', maxInv > 0, `maxInventory=${maxInv}`)
  check('S0b: snapshot baseline konsisten', baseSnapshot.length > 0)

  await scenarioEmptySequence(prisma)
  await scenarioLaggingSequence(prisma)
  await scenarioDuplicate(prisma)

  await prisma.$disconnect()
  console.log(`TOTAL PASS=${pass} FAIL=${fail}`)
  process.exit(fail > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error('PROBE_ERROR ' + e.message)
  process.exit(1)
})
