import { AcademicYearService } from '../src/main/services/academic-year.service'
import { AcademicYearRepository } from '../src/main/repositories/academic-year.repository'
import { ClassRepository } from '../src/main/repositories/class.repository'
import { CurriculumRepository } from '../src/main/repositories/curriculum.repository'
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
  const classRepository = new ClassRepository()
  const service = new AcademicYearService(repository, classRepository)

  console.log('--- UAT 1: Create tahun (nonaktif) ---')
  const y1 = await service.create({
    name: '2026/2027',
    startDate: '2026-07-01T00:00:00.000Z',
    endDate: '2027-06-30T00:00:00.000Z',
    isActive: false
  })
  expectEqual('Y1 tersimpan', y1.name, '2026/2027')
  expectEqual('Y1 nonaktif', y1.isActive, false)
  expectEqual('active count == 0', await countActive(prisma), 0)

  console.log('--- UAT 2: Create tahun kedua AKTIF -> Y1 nonaktif (Active Year Guard) ---')
  const y2 = await service.create({
    name: '2027/2028',
    startDate: '2027-07-01T00:00:00.000Z',
    endDate: '2028-06-30T00:00:00.000Z',
    isActive: true
  })
  expectEqual('Y2 aktif', y2.isActive, true)
  expectEqual('active count == 1', await countActive(prisma), 1)
  const y1After = await service.findById(y1.id)
  expectEqual('Y1 otomatis nonaktif', y1After.isActive, false)

  console.log('--- UAT 3: Buka Tahun (activate) -> Y2 nonaktif ---')
  const y1Activated = await service.activate(y1.id)
  expectEqual('Y1 aktif setelah activate', y1Activated.isActive, true)
  expectEqual('active count == 1 (guard tetap)', await countActive(prisma), 1)
  const y2After = await service.findById(y2.id)
  expectEqual('Y2 otomatis nonaktif', y2After.isActive, false)

  console.log('--- UAT 3b: Update nama tanpa isActive (regresi, kontrak baru) ---')
  const y1Renamed = await service.update(y1.id, { name: '2026/2027 rev' })
  expectEqual('Y1 nama berubah', y1Renamed.name, '2026/2027 rev')
  expectEqual('Y1 tetap aktif', y1Renamed.isActive, true)
  expectEqual('active count == 1', await countActive(prisma), 1)

  console.log('--- UAT 3c: Update isActive ditolak (kontrak K3) ---')
  let activeChangeRejected = false
  try {
    await service.update(y2.id, { isActive: true })
  } catch (e: any) {
    activeChangeRejected = e?.message?.includes('activate/deactivate') === true
  }
  check('update isActive berubah ditolak (400)', activeChangeRejected)
  expectEqual('Y2 tetap nonaktif', (await service.findById(y2.id)).isActive, false)

  console.log('--- UAT 4: Delete tahun yang dipakai kelas (Delete Guard) ---')
  const curriculum = new CurriculumRepository()
  const cur = await curriculum.create({ name: 'Kurikulum Merdeka' })
  await classRepository.create({
    academicYearId: y1.id,
    curriculumId: cur.id,
    educationLevel: 'X',
    parallel: 'MERDEKA 1'
  })
  let deleteBlocked = false
  try {
    await service.delete(y1.id)
  } catch (e: any) {
    deleteBlocked = e?.message?.includes('kelas') || e?.message?.includes('Kelas')
  }
  check('delete tahun berkelas ditolak (400)', deleteBlocked)

  console.log('--- UAT 5: Delete tahun tanpa kelas (berhasil) ---')
  const y3 = await service.create({
    name: '2028/2029',
    startDate: '2028-07-01T00:00:00.000Z',
    endDate: '2029-06-30T00:00:00.000Z',
    isActive: false
  })
  await service.delete(y3.id)
  const y3Gone = await repository.findById(y3.id)
  expectEqual('Y3 terhapus', y3Gone, null)

  console.log('--- UAT 6: findMany (list) ---')
  const list = await service.findMany()
  expectEqual('list berisi 2 tahun', list.data.length, 2)
  expectEqual('total == 2', list.total, 2)

  console.log('--- UAT 7: Duplikat nama ditolak ---')
  let dupRejected = false
  try {
    await service.create({
      name: '2026/2027 rev',
      startDate: '2026-07-01T00:00:00.000Z',
      endDate: '2027-06-30T00:00:00.000Z',
      isActive: false
    })
  } catch {
    dupRejected = true
  }
  check('nama duplikat ditolak', dupRejected)

  await prisma.$disconnect()
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
