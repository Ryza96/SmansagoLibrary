import { MemberImportService } from '../src/main/services/member-import.service'
import { MemberClassResolver } from '../src/main/services/member-class-resolver.service'
import { MemberDuplicateChecker } from '../src/main/services/member-duplicate-checker.service'
import { MemberRepository } from '../src/main/repositories/member.repository'
import { EnrollmentRepository } from '../src/main/repositories/enrollment.repository'
import { AcademicYearRepository } from '../src/main/repositories/academic-year.repository'
import { ClassRepository } from '../src/main/repositories/class.repository'
import { NumberGeneratorService } from '../src/main/services/number-generator.service'
import { getPrisma } from '../src/main/repositories/base/prisma'
import type { MemberImportRowInput } from '../src/shared/dto/member'

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

function row(rowNumber: number, className: string, nisn: string): MemberImportRowInput {
  return {
    rowNumber,
    fullName: `Siswa MI2 ${rowNumber}`,
    className,
    gender: 'male',
    nisn,
    address: 'Jl. Uji',
    phone: '0812'
  }
}

// Stub untuk uji rollback: enrollment write DIJADIKAN gagal setelah Member
// createMany berhasil di dalam transaksi yang sama.
class ThrowingEnrollmentRepository extends EnrollmentRepository {
  async createManyWithTx(): Promise<void> {
    throw new Error('simulated enrollment write failure')
  }
}

async function main(): Promise<void> {
  const prisma = getPrisma()
  const memberRepo = new MemberRepository()
  const enrollmentRepo = new EnrollmentRepository()
  const classResolver = new MemberClassResolver(new AcademicYearRepository(), new ClassRepository())

  function makeService(enrollmentRepoImpl: EnrollmentRepository): MemberImportService {
    return new MemberImportService(
      new MemberDuplicateChecker(memberRepo),
      classResolver,
      new NumberGeneratorService(memberRepo),
      memberRepo,
      enrollmentRepoImpl
    )
  }

  console.log('--- STEP 0: seed master (fresh DB) ---')
  const k1 = await prisma.curriculum.create({ data: { name: 'MERDEKA' } })
  const yearA = await prisma.academicYear.create({
    data: { name: '2025/2026', startDate: new Date('2025-07-01'), endDate: new Date('2026-06-30'), isActive: true }
  })
  const yearB = await prisma.academicYear.create({
    data: { name: '2026/2027', startDate: new Date('2026-07-01'), endDate: new Date('2027-06-30'), isActive: false }
  })
  const classA = await prisma.class.create({
    data: { academicYearId: yearA.id, curriculumId: k1.id, educationLevel: 'X', parallel: 'A', homeroomTeacher: null, isActive: true }
  })
  const classB = await prisma.class.create({
    data: { academicYearId: yearA.id, curriculumId: k1.id, educationLevel: 'X', parallel: 'B', homeroomTeacher: null, isActive: true }
  })
  const classD = await prisma.class.create({
    data: { academicYearId: yearB.id, curriculumId: k1.id, educationLevel: 'X', parallel: 'A', homeroomTeacher: null, isActive: true }
  })
  check('seed: kurikulum, 2 tahun, 3 kelas', k1.id !== '' && classD.id !== '')

  console.log('--- STEP 1: import menulis Member + Enrollment ACTIVE (1 transaksi) ---')
  const service = makeService(enrollmentRepo)
  const res1 = await service.import([row(1, 'X A', '3001'), row(2, 'X B', '3002')], {
    scope: { academicYearId: yearA.id, curriculumId: k1.id }
  })
  expectEqual('import success', res1.success, true)
  expectEqual('import created 2', res1.created, 2)
  const members1 = await prisma.member.findMany({ where: { nisn: { in: ['3001', '3002'] } }, orderBy: { nisn: 'asc' } })
  expectEqual('2 member dibuat', members1.length, 2)
  const memberA = members1[0]
  const memberB = members1[1]
  expectEqual('memberNumber S-000001', memberA?.memberNumber, 'S-000001')
  expectEqual('memberNumber S-000002', memberB?.memberNumber, 'S-000002')
  expectEqual('member status INACTIVE (RFC step 5)', memberA?.status, 'INACTIVE')
  expectEqual('member.classId TIDAK ditulis (null)', memberA?.classId, null)
  expectEqual('member.classId TIDAK ditulis (null)', memberB?.classId, null)

  console.log('--- STEP 2: enrollment ACTIVE + kelas dari skop (SSOT) ---')
  const enrollments1 = await prisma.memberEnrollment.findMany({
    where: { memberId: { in: [memberA!.id, memberB!.id] } },
    orderBy: { memberId: 'asc' }
  })
  expectEqual('2 enrollment dibuat', enrollments1.length, 2)
  const enA = enrollments1.find((e) => e.memberId === memberA!.id)
  const enB = enrollments1.find((e) => e.memberId === memberB!.id)
  check('enrollment A: status ACTIVE', enA?.status === 'ACTIVE')
  check('enrollment A: classId == classA', enA?.classId === classA.id)
  check('enrollment A: academicYearId == yearA', enA?.academicYearId === yearA.id)
  check('enrollment A: leftAt null', enA?.leftAt === null)
  check('enrollment A: enrolledAt terisi', enA?.enrolledAt instanceof Date)
  check('enrollment B: classId == classB', enB?.classId === classB.id)
  expectEqual('invariant: 1 Member = 1 Enrollment', enrollments1.length, members1.length)

  console.log('--- STEP 3: histori Enrollment benar (findManyByMember) ---')
  const histA = await enrollmentRepo.findManyByMember(memberA!.id)
  expectEqual('histori A: 1 baris', histA.length, 1)
  check('histori A: classId == classA', histA[0]?.classId === classA.id)
  check('histori A: academicYearId == yearA', histA[0]?.academicYearId === yearA.id)
  check('histori A: status ACTIVE', histA[0]?.status === 'ACTIVE')
  check('histori A: leftAt null', histA[0]?.leftAt === null)
  check('histori A: member.fullName cocok', histA[0]?.member?.fullName === 'Siswa MI2 1')

  console.log('--- STEP 4: import ke tahun lain menulis enrollment tahun itu ---')
  const res2 = await service.import([row(3, 'X A', '3003')], {
    scope: { academicYearId: yearB.id, curriculumId: k1.id }
  })
  expectEqual('import tahun B success', res2.success, true)
  const member3 = await prisma.member.findFirst({ where: { nisn: '3003' } })
  expectEqual('member3.classId null', member3?.classId, null)
  const hist3 = await enrollmentRepo.findManyByMember(member3!.id)
  expectEqual('histori 3: 1 baris', hist3.length, 1)
  check('histori 3: classId == classD (tahun B)', hist3[0]?.classId === classD.id)
  check('histori 3: academicYearId == yearB', hist3[0]?.academicYearId === yearB.id)
  check('histori 3: status ACTIVE', hist3[0]?.status === 'ACTIVE')

  console.log('--- STEP 5: rollback bila enrollment GAGAL (tidak ada Member tanpa Enrollment) ---')
  const beforeMembers = await prisma.member.count({ where: { nisn: { in: ['3101', '3102'] } } })
  const beforeEnrollments = await prisma.memberEnrollment.count()
  const brokenService = makeService(new ThrowingEnrollmentRepository())
  await expectRejected(
    'import ditolak (enrollment write failure)',
    () => brokenService.import([row(4, 'X A', '3101'), row(5, 'X B', '3102')], {
      scope: { academicYearId: yearA.id, curriculumId: k1.id }
    }),
    'simulated enrollment write failure'
  )
  const afterMembers = await prisma.member.count({ where: { nisn: { in: ['3101', '3102'] } } })
  const afterEnrollments = await prisma.memberEnrollment.count()
  expectEqual('0 member tersimpan (rollback)', afterMembers, beforeMembers)
  expectEqual('0 enrollment tersimpan (rollback)', afterEnrollments, beforeEnrollments)

  console.log('--- STEP 6: backward-compat tanpa scope -> enrollment tahun aktif ---')
  const res3 = await service.import([row(6, 'X A', '3004')])
  expectEqual('import tanpa scope success', res3.success, true)
  const member4 = await prisma.member.findFirst({ where: { nisn: '3004' } })
  const hist4 = await enrollmentRepo.findManyByMember(member4!.id)
  expectEqual('histori 4: 1 baris', hist4.length, 1)
  check('histori 4: academicYearId == yearA (tahun aktif)', hist4[0]?.academicYearId === yearA.id)
  check('histori 4: classId == classA', hist4[0]?.classId === classA.id)
  expectEqual('member4.classId null', member4?.classId, null)

  await prisma.$disconnect()
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
