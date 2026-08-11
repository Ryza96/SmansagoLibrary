import { getPrisma } from '../src/main/repositories/base/prisma'
import { InventoryAllocator as NewInventoryAllocator } from '../src/main/services/inventory-allocator'
import { InventoryAllocator as LegacyInventoryAllocator } from '../electron/main/services/inventory-allocator'
import { DatabaseReconciliationService } from '../src/main/services/database-reconciliation.service'
import { ResetDatabaseService } from '../src/main/services/reset-database.service'
import { SettingRepository } from '../electron/main/repositories/setting.repository'
import { SettingService } from '../electron/main/services/setting.service'
import { initDatabase } from '../electron/main/database'
import { AppError } from '../electron/main/errorHandler'
import path from 'path'
import os from 'os'

// inventory_prefix_smoke — Identitas Barcode & Awalan Nomor Inventaris
//
// Konsolidasi identitas: kolom `inventoryNumber` SELALU 'INV-XXXXXX' dan
// `barcode` = inventoryNumber (nilai identik). Setting.inventoryPrefix TIDAK
// lagi membentuk nilai barcode; prefix tetap disimpan di record
// InventorySequence (kosmetik, DEPRECATED untuk alokasi). Kedua kolom memakai
// SATU counter urutan yang sama. Scope:
//   1. BOTH allocators (src/main baru + electron/main legacy) mengembalikan
//      pasangan { inventoryNumber: 'INV-...', barcode: 'INV-...' } (identik).
//   2. Perubahan prefix TIDAK me-reset urutan — nomor berlanjut (dua kolom
//      berbagi counter).
//   3. Healing membaca kolom inventoryNumber dengan needle TETAP 'INV-' —
//      nilai ber-prefix lain (mis. legacy 'BC-...') TIDAK memengaruhi urutan.
//   4. Reconciliation Database (startup) memakai needle tetap 'INV-',
//      independen dari Setting.inventoryPrefix.
//   5. Reset Database mempertahankan prefix setting di InventorySequence.
//   6. Backend SettingService.update: validasi + normalisasi (uppercase/trim).
//
// Semua kode produksi (allocator/service/repository) dipakai apa adanya.
// Fresh DB temp per run (pola smoke repo).

let pass = 0
let fail = 0

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]))
  }
  if (
    typeof a === 'object' &&
    a !== null &&
    typeof b === 'object' &&
    b !== null &&
    !Array.isArray(a) &&
    !Array.isArray(b)
  ) {
    const ka = Object.keys(a as Record<string, unknown>)
    const kb = Object.keys(b as Record<string, unknown>)
    return (
      ka.length === kb.length &&
      ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
    )
  }
  return false
}

function expectEqual(label: string, actual: unknown, expected: unknown): void {
  if (deepEqual(actual, expected)) {
    pass++
    console.log(`  ok ${label} = ${JSON.stringify(actual)}`)
  } else {
    fail++
    console.error(`  FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

function expectTrue(label: string, cond: boolean): void {
  if (cond) {
    pass++
    console.log(`  ok ${label}`)
  } else {
    fail++
    console.error(`  FAIL ${label}`)
  }
}

async function expectRejected(fn: () => Promise<unknown>, messagePart: string): Promise<void> {
  try {
    await fn()
    fail++
    console.error(`  FAIL expected rejection (${messagePart})`)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (message.includes(messagePart)) {
      pass++
      console.log(`  ok rejected with "${messagePart}"`)
    } else {
      fail++
      console.error(`  FAIL rejection message "${message}" does not include "${messagePart}"`)
    }
  }
}

interface AllocatedPair {
  inventoryNumber: string
  barcode: string
}

async function main(): Promise<void> {
  await initDatabase()
  const prisma = getPrisma()
  const newAllocator = new NewInventoryAllocator()
  const legacyAllocator = new LegacyInventoryAllocator()
  const reconciliation = new DatabaseReconciliationService()
  const resetService = new ResetDatabaseService()

  const ts = Date.now().toString(36)

  async function setPrefix(prefix: string): Promise<void> {
    await prisma.setting.update({ where: { id: (await prisma.setting.findFirstOrThrow()).id }, data: { inventoryPrefix: prefix } })
  }

  async function allocateNew(count: number): Promise<AllocatedPair[]> {
    return prisma.$transaction((tx) => newAllocator.allocate(tx, count))
  }

  async function allocateLegacy(count: number): Promise<AllocatedPair[]> {
    return prisma.$transaction((tx) => legacyAllocator.allocate(tx, count))
  }

  console.log('--- STEP 1: setting + buku seed ---')
  await prisma.setting.create({ data: { libraryName: `Perpus Uji-${ts}` } })
  await setPrefix('BC')
  const author = await prisma.author.create({ data: { name: `Penulis Uji-${ts}` } })
  const publisher = await prisma.publisher.create({ data: { name: `Penerbit Uji-${ts}` } })
  const category = await prisma.category.create({ data: { code: `CAT-${ts}`, name: `Kategori Uji-${ts}` } })
  const book = await prisma.book.create({
    data: { isbn: `978-${ts}`, title: `Buku Uji-${ts}`, authorId: author.id, publisherId: publisher.id, categoryId: category.id },
  })

  console.log('--- STEP 2: allocator BARU — barcode identik inventoryNumber ---')
  expectEqual(
    'BC allocate(2)',
    await allocateNew(2),
    [
      { inventoryNumber: 'INV-000001', barcode: 'INV-000001' },
      { inventoryNumber: 'INV-000002', barcode: 'INV-000002' },
    ]
  )
  expectEqual('BC allocate(1)', await allocateNew(1), [{ inventoryNumber: 'INV-000003', barcode: 'INV-000003' }])
  const seqAfterBc = await prisma.inventorySequence.findUniqueOrThrow({ where: { id: 'default' } })
  expectEqual('lastNumber', seqAfterBc.lastNumber, 3)
  expectEqual('record.prefix = BC (kosmetik)', seqAfterBc.prefix, 'BC')

  console.log('--- STEP 3: ganti prefix PSA — urutan BERLANJUT (tidak reset) ---')
  await setPrefix('PSA')
  expectEqual('PSA allocate(1) lanjut nomor', await allocateNew(1), [{ inventoryNumber: 'INV-000004', barcode: 'INV-000004' }])
  const seqAfterPsa = await prisma.inventorySequence.findUniqueOrThrow({ where: { id: 'default' } })
  expectEqual('lastNumber tetap berlanjut', seqAfterPsa.lastNumber, 4)
  expectEqual('record.prefix berubah (kosmetik)', seqAfterPsa.prefix, 'PSA')

  console.log('--- STEP 4: healing needle TETAP INV- (bukan prefix aktif) ---')
  await prisma.bookCopy.create({
    data: { bookId: book.id, inventoryNumber: 'INV-000020', barcode: 'INV-000020', condition: 'GOOD', status: 'AVAILABLE', shelfLocation: 'R1' },
  })
  await prisma.bookCopy.create({
    data: { bookId: book.id, inventoryNumber: 'BC-000099', barcode: 'BC-000099', condition: 'GOOD', status: 'AVAILABLE', shelfLocation: 'R1' },
  })
  await setPrefix('BC')
  expectEqual('healing ambil max INV=20', await allocateNew(1), [{ inventoryNumber: 'INV-000021', barcode: 'INV-000021' }])
  const seqAfterHeal = await prisma.inventorySequence.findUniqueOrThrow({ where: { id: 'default' } })
  expectEqual('lastNumber healing', seqAfterHeal.lastNumber, 21)
  expectEqual('BC-000099 legacy diabaikan', await allocateNew(1), [{ inventoryNumber: 'INV-000022', barcode: 'INV-000022' }])

  console.log('--- STEP 5: allocator LEGACY juga mengembalikan pasangan identik ---')
  await setPrefix('LGC')
  expectEqual(
    'legacy LGC allocate(2)',
    await allocateLegacy(2),
    [
      { inventoryNumber: 'INV-000023', barcode: 'INV-000023' },
      { inventoryNumber: 'INV-000024', barcode: 'INV-000024' },
    ]
  )
  expectEqual('legacy LGC allocate(1)', await allocateLegacy(1), [{ inventoryNumber: 'INV-000025', barcode: 'INV-000025' }])

  console.log('--- STEP 6: fallback INV bila prefix kosong ---')
  await setPrefix('')
  expectEqual('fallback INV (inv & barcode sama)', await allocateNew(1), [{ inventoryNumber: 'INV-000026', barcode: 'INV-000026' }])
  const seqAfterInv = await prisma.inventorySequence.findUniqueOrThrow({ where: { id: 'default' } })
  expectEqual('lastNumber fallback', seqAfterInv.lastNumber, 26)
  expectEqual('record.prefix fallback', seqAfterInv.prefix, 'INV')

  console.log('--- STEP 7: reconciliation needle TETAP INV- ---')
  await setPrefix('REC')
  await prisma.bookCopy.create({
    data: { bookId: book.id, inventoryNumber: 'INV-000099', barcode: 'INV-000099', condition: 'GOOD', status: 'AVAILABLE', shelfLocation: 'R1' },
  })
  await prisma.bookCopy.create({
    data: { bookId: book.id, inventoryNumber: 'REC-000999', barcode: 'REC-000999', condition: 'GOOD', status: 'AVAILABLE', shelfLocation: 'R1' },
  })
  const rec1 = await reconciliation.run()
  expectEqual('max INV=99 (REC-000999 diabaikan)', rec1.maxInventoryNumber, 99)
  expectTrue('reconcile tersinkron', rec1.sequenceSynced)
  expectEqual('sequenceLastNumber = 99', rec1.sequenceLastNumber, 99)
  const seqAfterRec = await prisma.inventorySequence.findUniqueOrThrow({ where: { id: 'default' } })
  expectEqual('record.prefix = REC (kosmetik)', seqAfterRec.prefix, 'REC')
  const rec2 = await reconciliation.run()
  expectTrue('run ulang tanpa sync', !rec2.sequenceSynced)
  expectEqual('lastNumber stabil', rec2.sequenceLastNumber, 99)

  console.log('--- STEP 8: allocator menormalkan lowercase prefix ---')
  await setPrefix('lwr')
  expectEqual('lwr -> LWR uppercase', await allocateNew(1), [{ inventoryNumber: 'INV-000100', barcode: 'INV-000100' }])

  console.log('--- STEP 9: reset database memakai prefix setting ---')
  await setPrefix('RST')
  await resetService.resetDatabase()
  const seqAfterReset = await prisma.inventorySequence.findUniqueOrThrow({ where: { id: 'default' } })
  expectEqual('reset: lastNumber 0', seqAfterReset.lastNumber, 0)
  expectEqual('reset: prefix setting dipertahankan', seqAfterReset.prefix, 'RST')
  expectEqual('reset: bookCopy bersih', await prisma.bookCopy.count(), 0)
  expectEqual('reset: book bersih', await prisma.book.count(), 0)
  expectEqual('reset: setting dipertahankan', await prisma.setting.count(), 1)

  console.log('--- STEP 10: backend validation SettingService.update ---')
  const service = new SettingService(new SettingRepository(), path.join(os.tmpdir(), `logo-${ts}`))
  const s1 = await service.update({ inventoryPrefix: '  abc  ' })
  expectEqual('trim+uppercase abc', s1.inventoryPrefix, 'ABC')
  const s2 = await service.update({ inventoryPrefix: 'ABCDEFGHIJ' })
  expectEqual('maks 10 karakter', s2.inventoryPrefix, 'ABCDEFGHIJ')
  const s3 = await service.update({ libraryName: 'Nama Baru' })
  expectEqual('field lain tanpa prefix: prefix tidak berubah', s3.inventoryPrefix, 'ABCDEFGHIJ')
  await expectRejected(() => service.update({ inventoryPrefix: 'P@J' }), 'hanya huruf/angka')
  await expectRejected(() => service.update({ inventoryPrefix: '' }), 'hanya huruf/angka')
  await expectRejected(() => service.update({ inventoryPrefix: 'ABCDEFGHIJK' }), 'hanya huruf/angka')
  await expectRejected(() => service.update({ inventoryPrefix: 'A B' }), 'hanya huruf/angka')

  console.log('--- STEP 11: AppError memiliki statusCode 400 ---')
  try {
    await service.update({ inventoryPrefix: 'x y' })
    fail++
    console.error('  FAIL expected AppError')
  } catch (e) {
    if (e instanceof AppError) {
      expectEqual('statusCode', e.statusCode, 400)
      expectEqual('type', e.type, 'ValidationError')
    } else {
      fail++
      console.error(`  FAIL unexpected error type: ${e instanceof Error ? e.constructor.name : typeof e}`)
    }
  }

  console.log(`\ninventory-prefix smoke: ${pass} PASS, ${fail} FAIL`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
