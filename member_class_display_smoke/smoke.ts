import { MemberService } from '../src/main/services/member.service'
import { MemberRepository } from '../src/main/repositories/member.repository'
import { EnrollmentRepository } from '../src/main/repositories/enrollment.repository'
import { ClassRepository } from '../src/main/repositories/class.repository'
import { NumberGeneratorService } from '../src/main/services/number-generator.service'
import { getPrisma } from '../src/main/repositories/base/prisma'
import type { MemberDTO } from '../src/shared/dto/member'

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

function classLabel(classInfo: MemberDTO['classInfo']): string | null {
  return classInfo ? `${classInfo.educationLevel} ${classInfo.parallel}` : null
}

async function main(): Promise<void> {
  const prisma = getPrisma()
  const memberRepo = new MemberRepository()
  const service = new MemberService(memberRepo, new NumberGeneratorService(memberRepo), new EnrollmentRepository(), new ClassRepository())

  console.log('--- STEP 0: seed ---')
  const curriculum = await prisma.curriculum.create({ data: { name: 'MERDEKA' } })
  const year = await prisma.academicYear.create({
    data: { name: '2026/2027', startDate: new Date('2026-07-01'), endDate: new Date('2027-06-30'), isActive: true }
  })
  const clsX = await prisma.class.create({
    data: { academicYearId: year.id, curriculumId: curriculum.id, educationLevel: 'X', parallel: 'Merdeka 1', isActive: true }
  })
  const clsXI = await prisma.class.create({
    data: { academicYearId: year.id, curriculumId: curriculum.id, educationLevel: 'XI', parallel: 'Merdeka 2', isActive: true }
  })

  // m1: student, Member.classId = null (gaya import MI-2+), enrollment ACTIVE → XI Merdeka 2.
  const m1 = await prisma.member.create({
    data: { memberNumber: 'S-000001', fullName: 'Abi Ali Permadi', memberType: 'student', status: 'INACTIVE', classId: null }
  })
  // m2: student, Member.classId = clsX (legacy TERISI) tapi TANPA enrollment → harus null.
  const m2 = await prisma.member.create({
    data: { memberNumber: 'S-000002', fullName: 'Budi Santoso', memberType: 'student', status: 'INACTIVE', classId: clsX.id }
  })
  // m3: student, classId null, enrollment DROPPED (terminal) → harus null.
  const m3 = await prisma.member.create({
    data: { memberNumber: 'S-000003', fullName: 'Citra Dewi', memberType: 'student', status: 'INACTIVE', classId: null }
  })
  // m4: teacher, classId null, enrollment ACTIVE → X Merdeka 1 (semua tipe).
  const m4 = await prisma.member.create({
    data: { memberNumber: 'G-000001', fullName: 'Dewi Guru', memberType: 'teacher', status: 'INACTIVE', classId: null }
  })
  // m5: student, classId null, 2 enrollment (ACTIVE XI + DROPPED X) → ACTIVE menang → XI Merdeka 2.
  const m5 = await prisma.member.create({
    data: { memberNumber: 'S-000004', fullName: 'Eko Nugroho', memberType: 'student', status: 'INACTIVE', classId: null }
  })

  await prisma.memberEnrollment.create({
    data: { memberId: m1.id, classId: clsXI.id, academicYearId: year.id, status: 'ACTIVE', enrolledAt: new Date(), leftAt: null }
  })
  await prisma.memberEnrollment.create({
    data: { memberId: m3.id, classId: clsX.id, academicYearId: year.id, status: 'DROPPED', enrolledAt: new Date(), leftAt: new Date() }
  })
  await prisma.memberEnrollment.create({
    data: { memberId: m4.id, classId: clsX.id, academicYearId: year.id, status: 'ACTIVE', enrolledAt: new Date(), leftAt: null }
  })
  await prisma.memberEnrollment.create({
    data: { memberId: m5.id, classId: clsXI.id, academicYearId: year.id, status: 'ACTIVE', enrolledAt: new Date('2026-07-15'), leftAt: null }
  })
  await prisma.memberEnrollment.create({
    data: { memberId: m5.id, classId: clsX.id, academicYearId: year.id, status: 'DROPPED', enrolledAt: new Date('2026-07-01'), leftAt: new Date('2026-07-14') }
  })
  check('seed: 5 member + 2 kelas + 5 enrollment', m1.id !== '' && m2.id !== '' && clsX.id !== clsXI.id)

  const byNumber = (rows: MemberDTO[], num: string) => rows.find((r) => r.memberNumber === num)

  console.log('--- STEP 1: Daftar Siswa menampilkan kelas dari Enrollment ACTIVE ---')
  const students = await service.findMany(undefined, 1, 100, 'student')
  expectEqual('total siswa == 4', students.data.length, 4)
  const s1 = byNumber(students.data, 'S-000001')
  const s2 = byNumber(students.data, 'S-000002')
  const s3 = byNumber(students.data, 'S-000003')
  const s5 = byNumber(students.data, 'S-000004')
  check('m1: enrollment ACTIVE → kelas "XI Merdeka 2"', classLabel(s1?.classInfo ?? null) === 'XI Merdeka 2')
  check('m2: classId legacy TERISI tapi tanpa enrollment → tetap null (tidak pakai Member.classId)', s2?.classInfo == null)
  check('m3: enrollment DROPPED (terminal) → null', s3?.classInfo == null)
  check('m5: 2 enrollment, yang ACTIVE dipakai → "XI Merdeka 2"', classLabel(s5?.classInfo ?? null) === 'XI Merdeka 2')

  console.log('--- STEP 2: Tipe lain (Guru) juga memakai enrollment ACTIVE ---')
  const teachers = await service.findMany(undefined, 1, 100, 'teacher')
  expectEqual('total guru == 1', teachers.data.length, 1)
  const t1 = teachers.data[0]
  check('m4: guru enrollment ACTIVE → "X Merdeka 1"', classLabel(t1?.classInfo ?? null) === 'X Merdeka 1')

  console.log('--- STEP 3: Konsistensi Daftar vs Detail (findById) ---')
  const d1 = await service.findById(m1.id)
  const d2 = await service.findById(m2.id)
  expectEqual('list m1 label == detail m1 label', classLabel(s1?.classInfo ?? null), classLabel(d1.classInfo))
  expectEqual('list m1 curriculum == detail m1 curriculum', s1?.classInfo?.curriculum?.name, d1.classInfo?.curriculum?.name)
  expectEqual('list m1 academicYear == detail m1 academicYear', s1?.classInfo?.academicYear?.name, d1.classInfo?.academicYear?.name)
  check('detail m2: tanpa enrollment → classInfo null (sama dengan list)', d2.classInfo == null && s2?.classInfo == null)

  console.log('--- STEP 4: Search & pagination tetap bekerja ---')
  const found = await service.findMany('S-000001', 1, 100, 'student')
  expectEqual('search memberNumber → 1 baris', found.data.length, 1)
  check('hasil search m1 tetap membawa kelas', classLabel(found.data[0]?.classInfo ?? null) === 'XI Merdeka 2')
  const page = await service.findMany(undefined, 1, 2, 'student')
  expectEqual('pagination limit 2 → 2 baris', page.data.length, 2)
  check('hasil pagination tetap membawa kelas', classLabel(page.data[0]?.classInfo ?? null) !== null)

  console.log('--- STEP 5: findMany tanpa filter tipe (semua 5) ---')
  const all = await service.findMany()
  expectEqual('total semua == 5', all.data.length, 5)
  const all4 = byNumber(all.data, 'G-000001')
  check('m4 (guru) di list penuh → kelas tetap benar', classLabel(all4?.classInfo ?? null) === 'X Merdeka 1')

  await prisma.$disconnect()
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
