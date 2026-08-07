import { getPrisma } from '../src/main/repositories/base/prisma'
import { ResetDatabaseService } from '../src/main/services/reset-database.service'

// settings_db_reset_smoke — Reset Database (Settings → Manajemen Data → Reset Database)
//
// Memakai kode PRODUKSI: ResetDatabaseService asli (service reset) + PrismaClient
// asli (getPrisma). Fresh DB temp per run (pola semua smoke repo).
//
// Fokus pengujian:
//   1. Seluruh data transaksional & katalog terhapus (0 baris).
//   2. Data master aman (AcademicYear/Curriculum/Class) TIDAK dihapus.
//   3. Konfigurasi (Setting) & keamanan (Admin/AdminSession) TIDAK dihapus.
//   4. InventorySequence di-reset ke lastNumber 0 (prefix dipertahankan).
//   5. Idempotent — reset kedua tanpa error.
//   6. ALL-OR-NOTHING — bila salah satu DELETE gagal, Prisma me-rollback
//      seluruh transaksi (tidak ada database "setengah di-reset").

let pass = 0
let fail = 0

function expectEqual(label: string, actual: unknown, expected: unknown): void {
  if (actual === expected) {
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

async function count(prisma: ReturnType<typeof getPrisma>, model: 'borrowDetail' | 'borrow' | 'assetEvent' | 'promotionRunItem' | 'promotionRun' | 'memberEnrollment' | 'member' | 'bookCopy' | 'book' | 'author' | 'publisher' | 'category' | 'academicYear' | 'curriculum' | 'class' | 'setting' | 'admin' | 'adminSession'): Promise<number> {
  const delegate = prisma[model] as { count(args?: object): Promise<number> }
  return delegate.count()
}

const TRANSACTIONAL_MODELS = [
  'borrowDetail',
  'borrow',
  'assetEvent',
  'promotionRunItem',
  'promotionRun',
  'memberEnrollment',
  'member',
  'bookCopy',
  'book',
  'author',
  'publisher',
  'category',
] as const

const PROTECTED_MODELS = ['academicYear', 'curriculum', 'class', 'setting', 'admin', 'adminSession'] as const

async function main(): Promise<void> {
  const prisma = getPrisma()
  const service = new ResetDatabaseService()

  const ts = Date.now().toString(36)

  console.log('--- STEP 1: seed data transaksional + data aman ---')

  const beforeProtected = new Map<string, number>()
  for (const m of PROTECTED_MODELS) {
    beforeProtected.set(m, await count(prisma, m))
  }

  const year = await prisma.academicYear.create({
    data: { name: `2026/2027-${ts}`, startDate: new Date('2026-07-01'), endDate: new Date('2027-06-30'), isActive: true },
  })
  const curriculum = await prisma.curriculum.create({ data: { name: `Kurikulum Uji-${ts}` } })
  const cls = await prisma.class.create({
    data: { academicYearId: year.id, curriculumId: curriculum.id, educationLevel: 'X', parallel: 'A' },
  })
  const author = await prisma.author.create({ data: { name: `Penulis Uji-${ts}` } })
  const publisher = await prisma.publisher.create({ data: { name: `Penerbit Uji-${ts}` } })
  const category = await prisma.category.create({ data: { code: `CAT-${ts}`, name: `Kategori Uji-${ts}` } })
  const book = await prisma.book.create({
    data: { isbn: `978-${ts}`, title: `Buku Uji-${ts}`, authorId: author.id, publisherId: publisher.id, categoryId: category.id },
  })
  const bookCopy = await prisma.bookCopy.create({
    data: { bookId: book.id, inventoryNumber: `INV-${ts}`, barcode: `INV-${ts}`, condition: 'GOOD', status: 'AVAILABLE', shelfLocation: 'A1' },
  })
  const member = await prisma.member.create({
    data: { memberNumber: `S-${ts}`, memberType: 'student', fullName: 'Siswa Uji', status: 'ACTIVE' },
  })
  await prisma.memberEnrollment.create({
    data: { memberId: member.id, classId: cls.id, academicYearId: year.id, status: 'ACTIVE' },
  })
  const borrow = await prisma.borrow.create({
    data: {
      borrowNumber: `PJ-${ts}`,
      memberId: member.id,
      borrowDate: new Date(),
      dueDate: new Date(Date.now() + 7 * 86400000),
      memberName: 'Siswa Uji',
      memberNumber: `S-${ts}`,
      className: 'X A',
    },
  })
  await prisma.borrowDetail.create({
    data: { borrowId: borrow.id, bookCopyId: bookCopy.id, bookTitle: `Buku Uji-${ts}` },
  })
  await prisma.assetEvent.create({ data: { bookCopyId: bookCopy.id, eventType: 'CREATED', actorType: 'SYSTEM' } })
  const promotionRun = await prisma.promotionRun.create({
    data: { fromYearId: year.id, toYearId: year.id, mode: 'AUTOMATIC', status: 'SUCCESS' },
  })
  await prisma.promotionRunItem.create({
    data: { promotionRunId: promotionRun.id, memberId: member.id, sourceClassId: cls.id, outcome: 'PROMOTED' },
  })
  await prisma.setting.create({ data: { libraryName: 'Perpus Uji' } })
  const admin = await prisma.admin.create({ data: { username: `admin-${ts}`, passwordHash: 'hash' } })
  await prisma.adminSession.create({
    data: { adminId: admin.id, sessionId: `tok-${ts}`, expiresAt: new Date(Date.now() + 86400000) },
  })
  await prisma.inventorySequence.upsert({
    where: { id: 'default' },
    create: { id: 'default', prefix: 'INV', lastNumber: 42 },
    update: {},
  })

  for (const m of TRANSACTIONAL_MODELS) {
    expectEqual(`seeded ${m}`, await count(prisma, m), 1)
  }
  expectEqual('seeded InventorySequence.lastNumber', (await prisma.inventorySequence.findUnique({ where: { id: 'default' } }))?.lastNumber, 42)

  console.log('--- STEP 2: jalankan resetDatabase() ---')

  await service.resetDatabase()

  console.log('--- STEP 3: verifikasi hasil reset ---')

  for (const m of TRANSACTIONAL_MODELS) {
    expectEqual(`reset ${m}`, await count(prisma, m), 0)
  }
  for (const m of PROTECTED_MODELS) {
    const before = beforeProtected.get(m) ?? 0
    expectEqual(`protected ${m} dipertahankan`, await count(prisma, m), before + 1)
  }
  const seqAfter = await prisma.inventorySequence.findUnique({ where: { id: 'default' } })
  expectEqual('InventorySequence.lastNumber direset', seqAfter?.lastNumber, 0)
  expectEqual('InventorySequence.prefix dipertahankan', seqAfter?.prefix, 'INV')

  console.log('--- STEP 4: idempotent (reset kedua) ---')

  await service.resetDatabase()
  expectEqual('idempotent member', await count(prisma, 'member'), 0)
  expectEqual('idempotent class (protected)', await count(prisma, 'class'), (beforeProtected.get('class') ?? 0) + 1)

  console.log('--- STEP 5: rollback all-or-nothing ---')

  await prisma.book.create({
    data: { isbn: `978-rb-${ts}`, title: `Buku Rollback-${ts}` },
  })
  await prisma.member.create({
    data: { memberNumber: `S-rb-${ts}`, memberType: 'student', fullName: 'Siswa Rollback', status: 'ACTIVE' },
  })
  const originalPerform = service.performResetTx.bind(service)
  service.performResetTx = async (tx) => {
    await originalPerform(tx)
    throw new Error('simulasi kegagalan di tengah transaksi')
  }
  let threw = false
  try {
    await service.resetDatabase()
  } catch {
    threw = true
  }
  service.performResetTx = originalPerform

  expectTrue('gagal melempar error', threw)
  expectEqual('rollback book tetap ada', await count(prisma, 'book'), 1)
  expectEqual('rollback member tetap ada', await count(prisma, 'member'), 1)
  expectEqual('rollback class (protected) tetap ada', await count(prisma, 'class'), (beforeProtected.get('class') ?? 0) + 1)
  expectEqual('rollback setting tetap ada', await count(prisma, 'setting'), (beforeProtected.get('setting') ?? 0) + 1)

  console.log('--- STEP 6: reset final ---')

  await service.resetDatabase()
  for (const m of TRANSACTIONAL_MODELS) {
    expectEqual(`final ${m}`, await count(prisma, m), 0)
  }
  for (const m of PROTECTED_MODELS) {
    const before = beforeProtected.get(m) ?? 0
    expectEqual(`final protected ${m}`, await count(prisma, m), before + 1)
  }

  await prisma.$disconnect()
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
