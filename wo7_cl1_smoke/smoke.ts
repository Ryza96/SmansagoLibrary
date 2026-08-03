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

  console.log('--- Seed: AcademicYear + Curriculum ---')
  const ay = await prisma.academicYear.create({
    data: { name: '2026/2027', startDate: new Date('2026-07-01'), endDate: new Date('2027-06-30'), isActive: true }
  })
  const curriculum = await prisma.curriculum.create({ data: { name: 'Kurikulum Merdeka' } })

  console.log('--- UAT 1: Create level valid ---')
  const c1 = await service.create({
    academicYearId: ay.id,
    curriculumId: curriculum.id,
    educationLevel: 'X',
    parallel: 'MERDEKA 1'
  })
  expectEqual('level tersimpan', c1.educationLevel, 'X')

  console.log('--- UAT 2: Invalid level ditolak ---')
  await expectRejected(
    'level IX ditolak (400)',
    () => service.create({ academicYearId: ay.id, curriculumId: curriculum.id, educationLevel: 'IX', parallel: 'A' }),
    'tidak valid'
  )
  await expectRejected(
    'level kosong ditolak (400)',
    () => service.create({ academicYearId: ay.id, curriculumId: curriculum.id, educationLevel: '', parallel: 'A' }),
    'tidak valid'
  )

  console.log('--- UAT 3: Lowercase normalization ---')
  const cLower = await service.create({
    academicYearId: ay.id,
    curriculumId: curriculum.id,
    educationLevel: ' xi ',
    parallel: 'MERDEKA 2'
  })
  expectEqual('level " xi " -> XI', cLower.educationLevel, 'XI')

  console.log('--- UAT 4: Duplicate guard ---')
  await expectRejected(
    'duplikat komposit ditolak (400)',
    () => service.create({ academicYearId: ay.id, curriculumId: curriculum.id, educationLevel: 'X', parallel: 'MERDEKA 1' }),
    'sudah ada'
  )

  console.log('--- UAT 5: Immutable educationLevel ---')
  await expectRejected(
    'update educationLevel ditolak (400)',
    () => service.update(c1.id, { educationLevel: 'XI' }),
    'immutable'
  )
  const c1AfterLevel = await service.findById(c1.id)
  expectEqual('educationLevel tetap X', c1AfterLevel.educationLevel, 'X')

  console.log('--- UAT 6: Immutable parallel ---')
  await expectRejected(
    'update parallel ditolak (400)',
    () => service.update(c1.id, { parallel: 'MERDEKA X' }),
    'immutable'
  )
  const c1AfterParallel = await service.findById(c1.id)
  expectEqual('parallel tetap MERDEKA 1', c1AfterParallel.parallel, 'MERDEKA 1')

  console.log('--- UAT 7: Regression CRUD ---')
  const cEdited = await service.update(c1.id, { homeroomTeacher: 'Pak Budi' })
  expectEqual('update homeroomTeacher sukses', cEdited.homeroomTeacher, 'Pak Budi')
  const cDeactivated = await service.update(c1.id, { isActive: false })
  expectEqual('update isActive sukses', cDeactivated.isActive, false)
  const cFound = await service.findById(c1.id)
  expectEqual('findById bekerja', cFound.id, c1.id)
  const list = await service.findMany()
  expectEqual('findMany list 2 kelas', list.data.length, 2)
  const search = await service.findMany('MERDEKA 2')
  expectEqual('findMany search 1 kelas', search.data.length, 1)
  const c3 = await service.create({
    academicYearId: ay.id,
    curriculumId: curriculum.id,
    educationLevel: 'XII',
    parallel: 'MERDEKA 3'
  })
  await service.delete(c3.id)
  const c3Gone = await service.findById(c3.id).catch(() => null)
  expectEqual('delete tanpa anggota sukses', c3Gone, null)
  const c1WithMember = await prisma.member.create({
    data: {
      memberNumber: 'S-0001',
      fullName: 'Member Test',
      memberType: 'STUDENT',
      status: 'ACTIVE',
      classId: c1.id
    }
  })
  await expectRejected(
    'delete kelas beranggota ditolak (400)',
    () => service.delete(c1.id),
    'anggota'
  )
  await prisma.member.delete({ where: { id: c1WithMember.id } })

  await prisma.$disconnect()
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
