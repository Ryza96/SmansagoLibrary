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

async function countActive(prisma: ReturnType<typeof getPrisma>): Promise<number> {
  return prisma.academicYear.count({ where: { isActive: true } })
}

async function main(): Promise<void> {
  const prisma = getPrisma()
  const repository = new AcademicYearRepository()
  const service = new AcademicYearService(repository, new ClassRepository())

  console.log('--- STEP 1: create A aktif (tidak ada tahun lain) ---')
  const a = await service.create({
    name: '2024/2025',
    startDate: '2024-07-01T00:00:00.000Z',
    endDate: '2025-06-30T00:00:00.000Z',
    isActive: true
  })
  expectEqual('A isActive', a.isActive, true)
  expectEqual('active count == 1', await countActive(prisma), 1)
  const activeAfterA = await repository.findActive()
  expectEqual('findActive returns A', activeAfterA?.id, a.id)

  console.log('--- STEP 2: create B aktif -> A harus nonaktif (guard) ---')
  const b = await service.create({
    name: '2025/2026',
    startDate: '2025-07-01T00:00:00.000Z',
    endDate: '2026-06-30T00:00:00.000Z',
    isActive: true
  })
  expectEqual('B isActive', b.isActive, true)
  expectEqual('active count == 1 (B saja)', await countActive(prisma), 1)
  const aAfterB = await service.findById(a.id)
  expectEqual('A nonaktif setelah B aktif', aAfterB.isActive, false)
  const activeAfterB = await repository.findActive()
  expectEqual('findActive returns B', activeAfterB?.id, b.id)

  console.log('--- STEP 3: create C nonaktif -> path biasa, tidak menyentuh B ---')
  const c = await service.create({
    name: '2026/2027',
    startDate: '2026-07-01T00:00:00.000Z',
    endDate: '2027-06-30T00:00:00.000Z',
    isActive: false
  })
  expectEqual('C isActive', c.isActive, false)
  expectEqual('active count tetap 1', await countActive(prisma), 1)
  const bAfterC = await service.findById(b.id)
  expectEqual('B tetap aktif', bAfterC.isActive, true)

  console.log('--- STEP 4: update A aktif -> C dan B nonaktif (guard via update) ---')
  const aUpdated = await service.update(a.id, { isActive: true })
  expectEqual('A aktif setelah update', aUpdated.isActive, true)
  expectEqual('active count == 1 (A saja)', await countActive(prisma), 1)
  const bAfterUpdate = await service.findById(b.id)
  const cAfterUpdate = await service.findById(c.id)
  expectEqual('B nonaktif', bAfterUpdate.isActive, false)
  expectEqual('C nonaktif', cAfterUpdate.isActive, false)
  const activeAfterUpdate = await repository.findActive()
  expectEqual('findActive returns A (update path)', activeAfterUpdate?.id, a.id)

  console.log('--- STEP 5: update B nonaktif -> path biasa, A tidak terganggu ---')
  const bDeactivated = await service.update(b.id, { isActive: false })
  expectEqual('B tetap nonaktif', bDeactivated.isActive, false)
  expectEqual('active count tetap 1', await countActive(prisma), 1)
  const aFinal = await service.findById(a.id)
  expectEqual('A tetap aktif', aFinal.isActive, true)

  console.log('--- STEP 6: nama duplikat tetap ditolak (regresi create) ---')
  let dupRejected = false
  try {
    await service.create({
      name: '2024/2025',
      startDate: '2024-07-01T00:00:00.000Z',
      endDate: '2025-06-30T00:00:00.000Z',
      isActive: true
    })
  } catch {
    dupRejected = true
  }
  check('create nama duplikat ditolak', dupRejected)

  console.log('--- STEP 7: id tidak ada saat update ditolak (regresi update) ---')
  let notFound = false
  try {
    await service.update('does-not-exist', { isActive: true })
  } catch {
    notFound = true
  }
  check('update id tidak ada ditolak', notFound)

  console.log('--- STEP 8: assert akhir findActive() <= 1 ---')
  expectEqual('active count akhir == 1', await countActive(prisma), 1)

  await prisma.$disconnect()
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
