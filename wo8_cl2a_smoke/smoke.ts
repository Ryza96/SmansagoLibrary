import { ClassService } from '../src/main/services/class.service'
import { ClassRepository } from '../src/main/repositories/class.repository'
import { AcademicYearRepository } from '../src/main/repositories/academic-year.repository'
import { CurriculumRepository } from '../src/main/repositories/curriculum.repository'
import { MemberRepository } from '../src/main/repositories/member.repository'
import { getPrisma } from '../src/main/repositories/base/prisma'
import type { ClassDTO } from '../src/shared/dto/academic'

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

function clientFilter(classes: ClassDTO[], yearFilter: string, curriculumFilter: string, search: string): ClassDTO[] {
  const needle = search.trim().toLowerCase()
  return classes.filter((c) => {
    if (yearFilter && c.academicYearId !== yearFilter) return false
    if (curriculumFilter && c.curriculumId !== curriculumFilter) return false
    if (needle && !`${c.educationLevel} ${c.parallel}`.toLowerCase().includes(needle)) return false
    return true
  })
}

async function main(): Promise<void> {
  const prisma = getPrisma()
  const service = new ClassService(
    new ClassRepository(),
    new AcademicYearRepository(),
    new CurriculumRepository(),
    new MemberRepository()
  )

  console.log('--- Seed: 2 AcademicYear + 2 Curriculum ---')
  const ay1 = await prisma.academicYear.create({ data: { name: '2025/2026', startDate: new Date('2025-07-01'), endDate: new Date('2026-06-30') } })
  const ay2 = await prisma.academicYear.create({ data: { name: '2026/2027', startDate: new Date('2026-07-01'), endDate: new Date('2027-06-30'), isActive: true } })
  const cur1 = await prisma.curriculum.create({ data: { name: 'Kurikulum 2013' } })
  const cur2 = await prisma.curriculum.create({ data: { name: 'Kurikulum Merdeka' } })

  console.log('--- UAT 1: Create (payload UI) ---')
  const c1 = await service.create({ academicYearId: ay1.id, curriculumId: cur1.id, educationLevel: 'X', parallel: 'MERDEKA 1', homeroomTeacher: 'Pak Budi', isActive: true })
  expectEqual('create X MERDEKA 1', c1.displayName, 'X MERDEKA 1')
  const c2 = await service.create({ academicYearId: ay2.id, curriculumId: cur2.id, educationLevel: 'XI', parallel: 'MERDEKA 2', isActive: false })
  expectEqual('create XI MERDEKA 2', c2.displayName, 'XI MERDEKA 2')
  const c3 = await service.create({ academicYearId: ay2.id, curriculumId: cur2.id, educationLevel: 'X', parallel: 'MERDEKA 1' })
  expectEqual('create X MERDEKA 1 (tahun aktif)', c3.displayName, 'X MERDEKA 1')

  console.log('--- UAT 2: Fetch-all (limit 100 loop) ---')
  const page1 = await service.findMany(undefined, 1, 100)
  expectEqual('findMany page 1 memuat semua (3 <= 100)', page1.data.length, 3)
  expectEqual('total == 3', page1.total, 3)

  console.log('--- UAT 3: Client-side filter (fetch-all + filter) ---')
  const all: ClassDTO[] = page1.data
  const byYear2 = clientFilter(all, ay2.id, '', '')
  expectEqual('filter tahun 2026/2027 -> 2 kelas', byYear2.length, 2)
  const byYear2Cur2 = clientFilter(all, ay2.id, cur2.id, '')
  expectEqual('filter tahun+kurikulum -> 2 kelas', byYear2Cur2.length, 2)
  const bySearch = clientFilter(all, '', '', 'xi')
  expectEqual('filter search "xi" -> 1 kelas', bySearch.length, 1)
  const noMatch = clientFilter(all, '00000000-0000-0000-0000-000000000000', '', '')
  expectEqual('filter tahun tak dikenal -> 0', noMatch.length, 0)

  console.log('--- UAT 4: Update (payload UI, tanpa educationLevel/parallel) ---')
  const edited = await service.update(c1.id, { homeroomTeacher: 'Ibu Sari', isActive: false })
  expectEqual('update guru -> Ibu Sari', edited.homeroomTeacher, 'Ibu Sari')
  expectEqual('update isActive -> false', edited.isActive, false)

  console.log('--- UAT 5: Immutable (regresi CL-1) ---')
  await expectRejected(
    'update educationLevel ditolak',
    () => service.update(c1.id, { educationLevel: 'XI' }),
    'immutable'
  )
  await expectRejected(
    'update parallel ditolak',
    () => service.update(c1.id, { parallel: 'MERDEKA 9' }),
    'immutable'
  )

  console.log('--- UAT 6: Duplicate guard ---')
  await expectRejected(
    'duplikat (X MERDEKA 1 @ 2025/2026 + K13) ditolak',
    () => service.create({ academicYearId: ay1.id, curriculumId: cur1.id, educationLevel: 'X', parallel: 'MERDEKA 1' }),
    'sudah ada'
  )

  console.log('--- UAT 7: Delete guard (beranggota) ---')
  const member = await prisma.member.create({
    data: { memberNumber: 'S-0001', fullName: 'Member Test', memberType: 'STUDENT', status: 'ACTIVE', classId: c2.id }
  })
  await expectRejected(
    'delete kelas beranggota ditolak',
    () => service.delete(c2.id),
    'anggota'
  )
  await prisma.member.delete({ where: { id: member.id } })

  console.log('--- UAT 8: Delete tanpa anggota ---')
  await service.delete(c2.id)
  const afterDelete = await service.findMany()
  expectEqual('total menjadi 2', afterDelete.total, 2)

  await prisma.$disconnect()
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
