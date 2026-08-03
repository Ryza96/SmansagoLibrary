import { CurriculumService } from '../src/main/services/curriculum.service'
import { CurriculumRepository } from '../src/main/repositories/curriculum.repository'
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

async function main(): Promise<void> {
  const prisma = getPrisma()
  const repository = new CurriculumRepository()
  const classRepository = new ClassRepository()
  const service = new CurriculumService(repository, classRepository)

  console.log('--- UAT 1: Create kurikulum ---')
  const c1 = await service.create({ name: 'Kurikulum Merdeka' })
  expectEqual('C1 tersimpan', c1.name, 'Kurikulum Merdeka')

  console.log('--- UAT 2: Duplicate Name Guard ---')
  let dupRejected = false
  try {
    await service.create({ name: 'Kurikulum Merdeka' })
  } catch (e: any) {
    dupRejected = e?.message?.includes('sudah digunakan')
  }
  check('duplikat nama ditolak (400)', dupRejected)

  console.log('--- UAT 3: Edit kurikulum ---')
  const c1Edited = await service.update(c1.id, { name: 'Kurikulum 2024' })
  expectEqual('nama berubah', c1Edited.name, 'Kurikulum 2024')
  let dupOnEdit = false
  try {
    await service.update(c1.id, { name: 'Kurikulum 2024' })
  } catch {
    dupOnEdit = true
  }
  check('rename ke nama sendiri tidak error', !dupOnEdit)
  const c2 = await service.create({ name: 'Kurikulum Lama' })
  let dupOnEditOther = false
  try {
    await service.update(c1.id, { name: 'Kurikulum Lama' })
  } catch (e: any) {
    dupOnEditOther = e?.message?.includes('sudah digunakan')
  }
  check('rename ke nama kurikulum lain ditolak', dupOnEditOther)

  console.log('--- UAT 4: Delete kurikulum yang dipakai kelas (Delete Guard) ---')
  await prisma.academicYear.create({
    data: { name: '2026/2027', startDate: new Date('2026-07-01'), endDate: new Date('2027-06-30') }
  })
  const ay = await prisma.academicYear.findUnique({ where: { name: '2026/2027' } })
  await classRepository.create({
    academicYearId: ay!.id,
    curriculumId: c2.id,
    educationLevel: 'X',
    parallel: 'MERDEKA 1'
  })
  let deleteBlocked = false
  try {
    await service.delete(c2.id)
  } catch (e: any) {
    deleteBlocked = e?.message?.includes('kelas')
  }
  check('delete kurikulum berkelas ditolak (400)', deleteBlocked)

  console.log('--- UAT 5: Delete kurikulum tanpa kelas (berhasil) ---')
  const c3 = await service.create({ name: 'Kurikulum 2013' })
  await service.delete(c3.id)
  const c3Gone = await repository.findById(c3.id)
  expectEqual('C3 terhapus', c3Gone, null)

  console.log('--- UAT 6: findMany (list + search) ---')
  const list = await service.findMany()
  expectEqual('list berisi 2 kurikulum', list.data.length, 2)
  const search = await service.findMany('Kurikulum 2024')
  expectEqual('search menemukan 1', search.data.length, 1)
  expectEqual('search total == 1', search.total, 1)

  await prisma.$disconnect()
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
