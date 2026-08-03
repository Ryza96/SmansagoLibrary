import { MemberImportService } from '../src/main/services/member-import.service'
import { MemberClassResolver } from '../src/main/services/member-class-resolver.service'
import { MemberDuplicateChecker } from '../src/main/services/member-duplicate-checker.service'
import { MemberRepository } from '../src/main/repositories/member.repository'
import { EnrollmentRepository } from '../src/main/repositories/enrollment.repository'
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

function row(rowNumber: number, className: string, nisn: string, email?: string): MemberImportRowInput {
  return {
    rowNumber,
    fullName: `Siswa MI3 ${rowNumber}`,
    className,
    gender: 'male',
    nisn,
    email,
    address: 'Jl. Uji',
    phone: '0812'
  }
}

// Stub untuk uji rollback: enrollment write DIJADIKAN gagal (simulasi error
// sistem -> throw -> Prisma ROLLBACK penuh).
class ThrowingEnrollmentRepository extends EnrollmentRepository {
  async createManyWithTx(): Promise<void> {
    throw new Error('simulated enrollment write failure')
  }
}

async function main(): Promise<void> {
  const prisma = getPrisma()
  const memberRepo = new MemberRepository()
  const enrollmentRepo = new EnrollmentRepository()
  const classResolver = new MemberClassResolver(new ClassRepository())

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
  const classD = await prisma.class.create({
    data: { academicYearId: yearB.id, curriculumId: k1.id, educationLevel: 'X', parallel: 'A', homeroomTeacher: null, isActive: true }
  })
  check('seed: kurikulum, 2 tahun, 2 kelas', k1.id !== '' && classD.id !== '')

  console.log('--- STEP 1: member BARU -> create Member + Enrollment ACTIVE ---')
  const service = makeService(enrollmentRepo)
  const res1 = await service.import(
    [row(1, 'X A', '4001', 'satu@example.com'), row(2, 'X A', '4002', 'dua@example.com')],
    { scope: { academicYearId: yearA.id, curriculumId: k1.id } }
  )
  expectEqual('import sukses', res1.success, true)
  expectEqual('created 2', res1.created, 2)
  expectEqual('skipped 0', res1.skipped, 0)
  expectEqual('failed 0', res1.failed, 0)
  const m1 = await prisma.member.findFirst({ where: { nisn: '4001' } })
  const m2 = await prisma.member.findFirst({ where: { nisn: '4002' } })
  check('member 4001 dibuat', m1 !== null)
  check('member 4002 dibuat', m2 !== null)
  const en1 = await enrollmentRepo.findManyByMember(m1!.id)
  expectEqual('4001: 1 enrollment ACTIVE', en1.filter((e) => e.status === 'ACTIVE' && e.leftAt === null).length, 1)
  check('4001: enrollment di yearA', en1[0]?.academicYearId === yearA.id)

  console.log('--- STEP 2: member SUDAH ADA, tanpa ACTIVE di tahun target -> enrollment-only ---')
  const res2 = await service.import([row(3, 'X A', '4001', 'satu@example.com')], {
    scope: { academicYearId: yearB.id, curriculumId: k1.id }
  })
  expectEqual('import sukses', res2.success, true)
  expectEqual('created 1 (hanya enrollment)', res2.created, 1)
  expectEqual('skipped 0', res2.skipped, 0)
  const memberCountAfter2 = await prisma.member.count()
  expectEqual('TIDAK ada Member baru', memberCountAfter2, 2)
  const en1b = await enrollmentRepo.findManyByMember(m1!.id)
  expectEqual('4001: total 2 enrollment (yearA + yearB)', en1b.length, 2)
  const enYearB = en1b.find((e) => e.academicYearId === yearB.id)
  check('4001: enrollment baru di yearB ACTIVE', enYearB?.status === 'ACTIVE' && enYearB?.leftAt === null)
  check('4001: enrollment baru classId == classD', enYearB?.classId === classD.id)

  console.log('--- STEP 3: member SUDAH ADA + SUDAH ACTIVE di tahun target -> SKIP (strategi A) ---')
  const res3 = await service.import([row(4, 'X A', '4001', 'satu@example.com')], {
    scope: { academicYearId: yearB.id, curriculumId: k1.id }
  })
  expectEqual('import sukses', res3.success, true)
  expectEqual('created 0', res3.created, 0)
  expectEqual('skipped 1', res3.skipped, 1)
  const en1c = await enrollmentRepo.findManyByMember(m1!.id)
  expectEqual('4001: total enrollment tetap 2 (tidak ada duplikat)', en1c.length, 2)

  console.log('--- STEP 4: email BLOCKER hanya untuk member BARU ---')
  const res4 = await service.import([row(5, 'X A', '4003', 'satu@example.com')], {
    scope: { academicYearId: yearB.id, curriculumId: k1.id }
  })
  expectEqual('member baru email bentrok -> gagal', res4.success, false)
  expectEqual('failed 1', res4.failed, 1)
  expectEqual('error emailInDb', res4.errors[0]?.messageKey, 'memberImport.duplicateEmailInDb')
  check('error menyebut existing member', res4.errors[0]?.existingMemberNumber === m1?.memberNumber)

  console.log('--- STEP 5: email bentrok pada baris NISN existing TIDAK memblokir ---')
  const res5 = await service.import([row(6, 'X A', '4002', 'satu@example.com')], {
    scope: { academicYearId: yearB.id, curriculumId: k1.id }
  })
  expectEqual('import sukses (email tidak dicek utk member existing)', res5.success, true)
  expectEqual('created 1', res5.created, 1)
  expectEqual('skipped 0', res5.skipped, 0)
  const en2 = await enrollmentRepo.findManyByMember(m2!.id)
  check('4002: enrollment yearB ACTIVE', en2.some((e) => e.academicYearId === yearB.id && e.status === 'ACTIVE'))

  console.log('--- STEP 6: campuran baris (baru + existing) dalam satu batch ---')
  const res6 = await service.import(
    [
      row(7, 'X A', '4004', 'empat@example.com'),
      row(8, 'X A', '4002', 'dua@example.com'),
      row(9, 'X A', '4001', 'satu@example.com')
    ],
    { scope: { academicYearId: yearB.id, curriculumId: k1.id } }
  )
  expectEqual('import sukses', res6.success, true)
  expectEqual('created 1 (hanya 4004 baru)', res6.created, 1)
  expectEqual('skipped 2 (4002 & 4001 sudah ACTIVE yearB)', res6.skipped, 2)
  const memberCountAfter6 = await prisma.member.count()
  expectEqual('member total 3', memberCountAfter6, 3)
  const en1d = await enrollmentRepo.findManyByMember(m1!.id)
  const en2b = await enrollmentRepo.findManyByMember(m2!.id)
  expectEqual('4001: total 2 enrollment', en1d.length, 2)
  expectEqual('4002: total 2 enrollment', en2b.length, 2)

  console.log('--- STEP 7: invariant satu-ACTIVE per tahun ---')
  const all = await prisma.memberEnrollment.findMany()
  const activePerYear = new Map<string, number>()
  for (const e of all) {
    if (e.status === 'ACTIVE' && e.leftAt === null) {
      const key = `${e.memberId}|${e.academicYearId}`
      activePerYear.set(key, (activePerYear.get(key) ?? 0) + 1)
    }
  }
  let invariantOk = true
  for (const [key, count] of activePerYear) {
    if (count > 1) {
      invariantOk = false
      console.log(`  invariant melanggar: ${key} = ${count}`)
    }
  }
  check('tidak ada 2 ACTIVE untuk (member, tahun)', invariantOk)

  console.log('--- STEP 8: rollback bila enrollment GAGAL (batch campuran) ---')
  const beforeMembers = await prisma.member.count()
  const beforeEnrollments = await prisma.memberEnrollment.count()
  const brokenService = makeService(new ThrowingEnrollmentRepository())
  let rejected = false
  try {
    await brokenService.import(
      [row(10, 'X A', '4101', 'sepuluh@example.com'), row(11, 'X A', '4001', 'satu@example.com')],
      { scope: { academicYearId: yearB.id, curriculumId: k1.id } }
    )
  } catch {
    rejected = true
  }
  check('import dilempar (enrollment write failure)', rejected)
  const afterMembers = await prisma.member.count()
  const afterEnrollments = await prisma.memberEnrollment.count()
  expectEqual('0 member baru tersimpan (rollback)', afterMembers, beforeMembers)
  expectEqual('0 enrollment baru tersimpan (rollback)', afterEnrollments, beforeEnrollments)

  await prisma.$disconnect()
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
