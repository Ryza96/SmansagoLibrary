import { AcademicYearService } from '../src/main/services/academic-year.service'
import { AcademicYearRepository } from '../src/main/repositories/academic-year.repository'
import { ClassRepository } from '../src/main/repositories/class.repository'
import { getPrisma } from '../src/main/repositories/base/prisma'

let pass = 0
let fail = 0

function check(name: string, ok: boolean, detail?: string): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`)
  if (ok) pass += 1
  else fail += 1
}

function expectEqual<T>(name: string, actual: T, expected: T): void {
  check(name, actual === expected, `expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`)
}

async function expectRejected(name: string, fn: () => Promise<unknown>, messagePart: string): Promise<void> {
  try {
    await fn()
    check(name, false, 'seharusnya ditolak, tetapi berhasil')
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    check(name, msg.includes(messagePart), `message="${msg}"`)
  }
}

async function countActive(prisma: ReturnType<typeof getPrisma>): Promise<number> {
  return prisma.academicYear.count({ where: { isActive: true } })
}

async function main(): Promise<void> {
  const prisma = getPrisma()
  const repository = new AcademicYearRepository()
  const service = new AcademicYearService(repository, new ClassRepository())

  console.log('--- STEP 1: create A aktif (tahun pertama) ---')
  const a = await service.create({
    name: '2024/2025',
    startDate: '2024-07-01T00:00:00.000Z',
    endDate: '2025-06-30T00:00:00.000Z',
    isActive: true
  })
  expectEqual('A isActive', a.isActive, true)
  expectEqual('active count == 1', await countActive(prisma), 1)

  console.log('--- STEP 2: create B nonaktif ---')
  const b = await service.create({
    name: '2025/2026',
    startDate: '2025-07-01T00:00:00.000Z',
    endDate: '2026-06-30T00:00:00.000Z',
    isActive: false
  })
  expectEqual('B isActive', b.isActive, false)
  expectEqual('active count tetap 1', await countActive(prisma), 1)
  expectEqual('A tetap aktif', (await service.findById(a.id)).isActive, true)

  console.log('--- STEP 3: activate B -> A nonaktif ---')
  const bAct = await service.activate(b.id)
  expectEqual('B aktif setelah activate', bAct.isActive, true)
  expectEqual('active count == 1', await countActive(prisma), 1)
  expectEqual('A nonaktif setelah activate', (await service.findById(a.id)).isActive, false)
  expectEqual('findActive returns B', (await repository.findActive())?.id, b.id)

  console.log('--- STEP 4: deactivate satu-satunya tahun aktif (B) -> DITOLAK ---')
  await expectRejected('deactivate B (sole active) ditolak', () => service.deactivate(b.id), 'satu-satunya tahun aktif')
  expectEqual('active count tetap 1', await countActive(prisma), 1)

  console.log('--- STEP 5: activate C (tahun baru) -> B nonaktif ---')
  const c = await service.create({
    name: '2026/2027',
    startDate: '2026-07-01T00:00:00.000Z',
    endDate: '2027-06-30T00:00:00.000Z',
    isActive: false
  })
  const cAct = await service.activate(c.id)
  expectEqual('C aktif', cAct.isActive, true)
  expectEqual('active count == 1', await countActive(prisma), 1)
  expectEqual('B nonaktif', (await service.findById(b.id)).isActive, false)
  expectEqual('findActive returns C', (await repository.findActive())?.id, c.id)

  console.log('--- STEP 6: deactivate tahun sudah tidak aktif (A) -> DITOLAK ---')
  await expectRejected('deactivate A (inactive) ditolak', () => service.deactivate(a.id), 'sudah tidak aktif')

  console.log('--- STEP 7: deactivate satu-satunya tahun aktif (C) -> DITOLAK ---')
  await expectRejected('deactivate C (sole active) ditolak', () => service.deactivate(c.id), 'satu-satunya tahun aktif')

  console.log('--- STEP 8: update dengan isActive BERUBAH -> DITOLAK (K3) ---')
  await expectRejected('update(B, isActive:true) ditolak', () => service.update(b.id, { isActive: true }), 'activate/deactivate')
  await expectRejected('update(C, isActive:false) ditolak', () => service.update(c.id, { isActive: false }), 'activate/deactivate')
  expectEqual('B tetap nonaktif', (await service.findById(b.id)).isActive, false)
  expectEqual('C tetap aktif', (await service.findById(c.id)).isActive, true)
  expectEqual('active count == 1', await countActive(prisma), 1)

  console.log('--- STEP 9: update dengan isActive SAMA -> diizinkan (no-op) ---')
  const aSame = await service.update(a.id, { isActive: false })
  expectEqual('A update isActive sama sukses', aSame.isActive, false)
  expectEqual('active count == 1', await countActive(prisma), 1)

  console.log('--- STEP 10: update normal tanpa isActive -> regresi ---')
  const cRenamed = await service.update(c.id, {
    name: '2026/2027 rev',
    startDate: '2026-07-01T00:00:00.000Z',
    endDate: '2027-06-30T00:00:00.000Z'
  })
  expectEqual('C name berubah', cRenamed.name, '2026/2027 rev')
  expectEqual('C tetap aktif', cRenamed.isActive, true)
  expectEqual('active count == 1', await countActive(prisma), 1)

  console.log('--- STEP 11: update nama duplikat -> ditolak (regresi) ---')
  await expectRejected('update nama duplikat ditolak', () => service.update(c.id, { name: '2024/2025' }), 'sudah digunakan')

  console.log('--- STEP 12: update id tidak ada -> 404 (regresi) ---')
  await expectRejected('update id tidak ada ditolak', () => service.update('nope', { name: 'X' }), 'tidak ditemukan')

  console.log('--- STEP 13: activate/deactivate id tidak ada -> 404 ---')
  await expectRejected('activate id tidak ada ditolak', () => service.activate('nope'), 'tidak ditemukan')
  await expectRejected('deactivate id tidak ada ditolak', () => service.deactivate('nope'), 'tidak ditemukan')

  console.log('--- STEP 14: activate idempotent (C sudah aktif) ---')
  const cAgain = await service.activate(c.id)
  expectEqual('C tetap aktif', cAgain.isActive, true)
  expectEqual('active count == 1', await countActive(prisma), 1)

  console.log('--- STEP 15: defensive - 2 aktif (raw SQL) lalu deactivate salah satu -> tersisa 1 ---')
  await prisma.$executeRawUnsafe('UPDATE "AcademicYear" SET "isActive" = true WHERE "id" = ?', b.id)
  expectEqual('2 aktif (force raw)', await countActive(prisma), 2)
  const bDeactivated = await service.deactivate(b.id)
  expectEqual('B nonaktif setelah deactivate', bDeactivated.isActive, false)
  expectEqual('active count == 1', await countActive(prisma), 1)
  expectEqual('C tetap aktif', (await service.findById(c.id)).isActive, true)

  console.log('--- STEP 16: create nama duplikat -> ditolak (regresi) ---')
  await expectRejected(
    'create nama duplikat ditolak',
    () =>
      service.create({
        name: '2024/2025',
        startDate: '2024-07-01T00:00:00.000Z',
        endDate: '2025-06-30T00:00:00.000Z',
        isActive: true
      }),
    'sudah digunakan'
  )

  console.log('--- STEP 17: assert akhir - tepat satu aktif ---')
  expectEqual('active count akhir == 1', await countActive(prisma), 1)
  expectEqual('findActive returns C', (await repository.findActive())?.id, c.id)

  await prisma.$disconnect()
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
