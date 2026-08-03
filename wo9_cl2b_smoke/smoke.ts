import { ClassService } from '../src/main/services/class.service'
import { ClassRepository } from '../src/main/repositories/class.repository'
import { AcademicYearRepository } from '../src/main/repositories/academic-year.repository'
import { CurriculumRepository } from '../src/main/repositories/curriculum.repository'
import { MemberRepository } from '../src/main/repositories/member.repository'
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
    check(name, false, 'tidak melempar error')
  } catch (e: any) {
    check(name, e?.message?.includes(messagePart) === true, `err=${e?.message}`)
  }
}

async function main(): Promise<void> {
  const prisma = getPrisma()
  const service = new ClassService(
    new ClassRepository(),
    new AcademicYearRepository(),
    new CurriculumRepository(),
    new MemberRepository()
  )

  console.log('--- Seed: 2 AcademicYear + 2 Curriculum + kelas sumber ---')
  const ay1 = await prisma.academicYear.create({ data: { name: '2025/2026', startDate: new Date('2025-07-01'), endDate: new Date('2026-06-30') } })
  const ay2 = await prisma.academicYear.create({ data: { name: '2026/2027', startDate: new Date('2026-07-01'), endDate: new Date('2027-06-30'), isActive: true } })
  const cur1 = await prisma.curriculum.create({ data: { name: 'Kurikulum 2013' } })
  const cur2 = await prisma.curriculum.create({ data: { name: 'Kurikulum Merdeka' } })

  const s1 = await service.create({ academicYearId: ay1.id, curriculumId: cur1.id, educationLevel: 'X', parallel: 'MERDEKA 1', homeroomTeacher: 'Pak Budi', isActive: false })
  const s2 = await service.create({ academicYearId: ay1.id, curriculumId: cur1.id, educationLevel: 'X', parallel: 'MERDEKA 2', homeroomTeacher: 'Ibu Sari', isActive: true })
  const s3 = await service.create({ academicYearId: ay1.id, curriculumId: cur2.id, educationLevel: 'XI', parallel: 'MERDEKA 1' })

  console.log('--- UAT 1: Clone menghasilkan row baru (copy curriculumId/level/parallel) ---')
  const result1 = await service.cloneToYear(ay1.id, ay2.id)
  expectEqual('created = 3', result1.created, 3)
  expectEqual('skipped = 0', result1.skipped, 0)

  const targetClasses = await service.findMany(undefined, 1, 100)
  expectEqual('total kelas = 6 (3 sumber + 3 clone)', targetClasses.total, 6)

  const cloned = (await prisma.class.findMany({ where: { academicYearId: ay2.id } }))
  expectEqual('jumlah kelas di tahun target = 3', cloned.length, 3)
  const c1 = cloned.find((c) => c.parallel === 'MERDEKA 1' && c.curriculumId === cur1.id)
  const c2 = cloned.find((c) => c.parallel === 'MERDEKA 2' && c.curriculumId === cur1.id)
  const c3 = cloned.find((c) => c.parallel === 'MERDEKA 1' && c.curriculumId === cur2.id)
  check('clone #1 ada (X MERDEKA 1 K13)', c1 !== undefined)
  check('clone #2 ada (X MERDEKA 2 K13)', c2 !== undefined)
  check('clone #3 ada (XI MERDEKA 1 Merdeka)', c3 !== undefined)
  expectEqual('clone #1 educationLevel = X', c1?.educationLevel, 'X')
  expectEqual('clone #2 curriculumId tersalin', c2?.curriculumId, cur1.id)
  expectEqual('clone #3 educationLevel = XI', c3?.educationLevel, 'XI')
  expectEqual('clone #3 parallel tersalin', c3?.parallel, 'MERDEKA 1')

  console.log('--- UAT 2: homeroomTeacher = null, isActive = true (PO decision) ---')
  expectEqual('clone #1 homeroomTeacher = null', c1?.homeroomTeacher, null)
  expectEqual('clone #2 homeroomTeacher = null (sumber punya guru)', c2?.homeroomTeacher, null)
  expectEqual('clone #3 homeroomTeacher = null', c3?.homeroomTeacher, null)
  expectEqual('clone #1 isActive = true', c1?.isActive, true)
  expectEqual('clone #2 isActive = true (sumber non-aktif)', c2?.isActive, true)

  console.log('--- UAT 3: Idempotency (run ulang) ---')
  const result2 = await service.cloneToYear(ay1.id, ay2.id)
  expectEqual('run ulang created = 0', result2.created, 0)
  expectEqual('run ulang skipped = 3', result2.skipped, 3)
  const totalAfter = await service.findMany()
  expectEqual('total tetap 6', totalAfter.total, 6)

  console.log('--- UAT 4: Duplicate skip (clone ke tahun yang sudah punya kelas) ---')
  const result3 = await service.cloneToYear(ay2.id, ay1.id)
  expectEqual('clone balik created = 0 (semua sudah ada)', result3.created, 0)
  expectEqual('clone balik skipped = 3', result3.skipped, 3)

  console.log('--- UAT 5: Source = Target ditolak ---')
  await expectRejected(
    'cloneToYear(ay1, ay1) ditolak',
    () => service.cloneToYear(ay1.id, ay1.id),
    'tidak boleh sama'
  )

  console.log('--- UAT 6: Tahun tidak ditemukan ---')
  const ghostId = '00000000-0000-0000-0000-000000000000'
  await expectRejected(
    'clone sumber tidak ada ditolak',
    () => service.cloneToYear(ghostId, ay2.id),
    'tidak ditemukan'
  )
  await expectRejected(
    'clone target tidak ada ditolak',
    () => service.cloneToYear(ay1.id, ghostId),
    'tidak ditemukan'
  )

  console.log('--- UAT 7: Regresi CRUD classes ---')
  const edited = await service.update(s1.id, { homeroomTeacher: 'Guru Baru' })
  expectEqual('update guru tetap jalan', edited.homeroomTeacher, 'Guru Baru')
  await expectRejected(
    'update educationLevel tetap ditolak (CL-1)',
    () => service.update(s1.id, { educationLevel: 'XI' }),
    'immutable'
  )

  await prisma.$disconnect()
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
