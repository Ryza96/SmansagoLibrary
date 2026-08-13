import { EnrollmentService } from '../src/main/services/enrollment.service'
import { EnrollmentRepository } from '../src/main/repositories/enrollment.repository'
import { MemberRepository } from '../src/main/repositories/member.repository'
import { ClassRepository } from '../src/main/repositories/class.repository'
import { NumberGeneratorService } from '../src/main/services/number-generator.service'
import { MemberService } from '../src/main/services/member.service'
import { getPrisma } from '../src/main/repositories/base/prisma'
import { ACADEMIC_STATUS } from '../src/shared/config/academic-status'
import os from 'os'
import path from 'path'

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

async function main(): Promise<void> {
  const prisma = getPrisma()
  const memberRepo = new MemberRepository()
  const enrollmentRepo = new EnrollmentRepository()
  const classRepo = new ClassRepository()
  const memberService = new MemberService(
    memberRepo,
    new NumberGeneratorService(memberRepo),
    enrollmentRepo,
    classRepo,
    path.join(os.tmpdir(), 'member-photos-wo15-e3')
  )
  const enrollmentService = new EnrollmentService(enrollmentRepo, memberRepo, classRepo)

  const seedStudent = (memberNumber: string, fullName: string) =>
    prisma.member.create({ data: { memberNumber, fullName, memberType: 'student', status: 'ACTIVE' } })
  const enrollActive = (memberId: string, classId: string, academicYearId: string) =>
    enrollmentService.enroll({ memberId, classId, academicYearId })

  console.log('--- STEP 0: seed master data (fresh DB) ---')
  const curriculum = await prisma.curriculum.create({ data: { name: 'MERDEKA' } })
  const yearA = await prisma.academicYear.create({
    data: { name: '2025/2026', startDate: new Date('2025-07-01'), endDate: new Date('2026-06-30'), isActive: true }
  })
  const yearB = await prisma.academicYear.create({
    data: { name: '2026/2027', startDate: new Date('2026-07-01'), endDate: new Date('2027-06-30'), isActive: false }
  })
  const classA = await prisma.class.create({
    data: { academicYearId: yearA.id, curriculumId: curriculum.id, educationLevel: 'X', parallel: 'A', homeroomTeacher: null, isActive: true }
  })
  const classB = await prisma.class.create({
    data: { academicYearId: yearA.id, curriculumId: curriculum.id, educationLevel: 'X', parallel: 'B', homeroomTeacher: null, isActive: true }
  })
  const classOtherYear = await prisma.class.create({
    data: { academicYearId: yearB.id, curriculumId: curriculum.id, educationLevel: 'X', parallel: 'A', homeroomTeacher: null, isActive: true }
  })
  const teacher = await prisma.member.create({
    data: { memberNumber: 'G-000001', fullName: 'Guru Uji', memberType: 'teacher', status: 'ACTIVE' }
  })
  const student1 = await seedStudent('S-000001', 'Siswa Satu')
  check('seed: 2 tahun, 3 kelas, guru, siswa', curriculum.id !== '' && student1.id !== '')

  console.log('--- STEP 1: enroll → ACTIVE; member.status tidak berubah ---')
  const en1 = await enrollActive(student1.id, classA.id, yearA.id)
  expectEqual('enroll status ACTIVE', en1.status, ACADEMIC_STATUS.active)
  expectEqual('enroll leftAt null', en1.leftAt, null)
  const m1 = await memberRepo.findById(student1.id)
  expectEqual('member.status tetap ACTIVE setelah enroll', m1?.status, 'ACTIVE')

  console.log('--- STEP 3: invalid transition — enroll ---')
  await expectRejected('enroll kedua ditolak (satu-ACTIVE)', () => enrollActive(student1.id, classB.id, yearA.id), 'masih memiliki enrollment aktif')
  await expectRejected('enroll guru ditolak (tanpa rekor akademik)', () => enrollActive(teacher.id, classA.id, yearA.id), 'rekor akademik')
  await expectRejected('enroll member tidak ada ditolak', () => enrollActive('member-nope', classA.id, yearA.id), 'tidak ditemukan')
  await expectRejected('enroll kelas tidak ada ditolak', () => enrollActive(student1.id, 'class-nope', yearA.id), 'tidak ditemukan')
  await expectRejected('enroll kelas tahun lain ditolak', () => enrollActive(student1.id, classOtherYear.id, yearA.id), 'bukan milik tahun ajaran')

  console.log('--- STEP 4: close lifecycle — seluruh status terminal (matriks §4.1) ---')
  // MEMBER_STATUS_ALIGNMENT (Fase 1): close() TIDAK lagi menyinkronkan Member.status —
  // status keanggotaan dan status akademik adalah dua domain terpisah.
  const terminalStatuses = ['PROMOTED', 'REPEATED', 'REDISTRIBUTED', 'TRANSFERRED', 'DROPPED', 'GRADUATED']
  for (const status of terminalStatuses) {
    const s = await seedStudent(`S-0002${terminalStatuses.indexOf(status)}0`, `Siswa ${status}`)
    const en = await enrollActive(s.id, classA.id, yearA.id)
    const closed = await enrollmentService.close(en.id, { status, note: `close-${status}` })
    expectEqual(`close(${status}) status tersimpan`, closed.status, status)
    expectEqual(`close(${status}) leftAt set`, closed.leftAt !== null, true)
    expectEqual(`close(${status}) note tersimpan`, closed.note, `close-${status}`)
    const memberAfter = await memberRepo.findById(s.id)
    expectEqual(`close(${status}) → member.status TIDAK berubah (tetap ACTIVE)`, memberAfter?.status, 'ACTIVE')
    expectEqual(`close(${status}) findActiveByMember null`, await enrollmentService.findActiveByMember(s.id), null)
    const row = await prisma.memberEnrollment.findUnique({ where: { id: en.id } })
    expectEqual(`close(${status}) row tidak dihapus (histori utuh)`, row !== null, true)
  }

  console.log('--- STEP 5: invalid transition — close ---')
  const closedGrad = await prisma.memberEnrollment.findFirst({
    where: { member: { memberNumber: 'S-000250' } }
  })
  await expectRejected('close enrollment sudah ditutup ditolak', () => enrollmentService.close(closedGrad!.id, { status: ACADEMIC_STATUS.dropped }), 'tidak aktif')
  const sCloseBad = await seedStudent('S-000110', 'Siswa Close Invalid')
  const enCloseBad = await enrollActive(sCloseBad.id, classA.id, yearA.id)
  await expectRejected('close status ACTIVE ditolak (non-terminal)', () => enrollmentService.close(enCloseBad.id, { status: ACADEMIC_STATUS.active }), 'status terminal')
  await expectRejected('close status acak ditolak', () => enrollmentService.close(enCloseBad.id, { status: 'SOMETHING' }), 'status terminal')
  await expectRejected('close enrollment tidak ada ditolak', () => enrollmentService.close('enroll-nope', { status: ACADEMIC_STATUS.dropped }), 'tidak ditemukan')
  await enrollmentService.close(enCloseBad.id, { status: ACADEMIC_STATUS.graduated })

  console.log('--- STEP 6: repoint lifecycle (REDISTRIBUTED) ---')
  const sRepoint = await seedStudent('S-000106', 'Siswa Repoint')
  const enR1 = await enrollActive(sRepoint.id, classA.id, yearA.id)
  const repointed = await enrollmentService.repoint(enR1.id, { targetClassId: classB.id, note: 'redistribusi' })
  expectEqual('repoint baru ACTIVE', repointed.status, ACADEMIC_STATUS.active)
  expectEqual('repoint classId baru', repointed.classId, classB.id)
  const oldRow = await prisma.memberEnrollment.findUnique({ where: { id: enR1.id } })
  expectEqual('repoint enrollment lama REDISTRIBUTED', oldRow?.status, ACADEMIC_STATUS.redistributed)
  expectEqual('repoint enrollment lama leftAt set', oldRow?.leftAt !== null, true)
  const sRepointAfter = await memberRepo.findById(sRepoint.id)
  expectEqual('repoint member.status tetap ACTIVE', sRepointAfter?.status, 'ACTIVE')
  expectEqual('repoint histori == 2 baris (tidak pernah DELETE)', await prisma.memberEnrollment.count({ where: { memberId: sRepoint.id } }), 2)
  await expectRejected('repoint enrollment sudah ditutup ditolak', () => enrollmentService.repoint(enR1.id, { targetClassId: classA.id }), 'tidak aktif')
  await expectRejected('repoint kelas target sama ditolak', () => enrollmentService.repoint(repointed.id, { targetClassId: classB.id }), 'tidak boleh sama')
  await expectRejected('repoint kelas tahun lain ditolak', () => enrollmentService.repoint(repointed.id, { targetClassId: classOtherYear.id }), 'bukan milik tahun ajaran yang sama')
  await expectRejected('repoint kelas target tidak ada ditolak', () => enrollmentService.repoint(repointed.id, { targetClassId: 'class-nope' }), 'tidak ditemukan')

  console.log('--- STEP 7: invariant satu-ACTIVE (groupBy) ---')
  const activeGroups = await prisma.memberEnrollment.groupBy({
    by: ['memberId'],
    where: { status: ACADEMIC_STATUS.active, leftAt: null },
    _count: true
  })
  for (const row of activeGroups) {
    expectEqual(`satu-ACTIVE member ${row.memberId}`, row._count, 1)
  }
  expectEqual('student1 masih satu ACTIVE', await enrollmentRepo.countActiveByMember(student1.id), 1)

  console.log('--- STEP 8: history tetap utuh (append-only) ---')
  const totalRows = await prisma.memberEnrollment.count()
  expectEqual('tidak ada DELETE (semua baris tersimpan)', totalRows >= 9, true)

  console.log('--- STEP 9: regression E-2 — classInfo dari enrollment + sync status via MemberService ---')
  const sReg = await seedStudent('S-000107', 'Siswa Regresi')
  const enReg = await enrollActive(sReg.id, classA.id, yearA.id)
  const dto1 = await memberService.findById(sReg.id)
  check('classInfo.id == classA.id', dto1.classInfo?.id === classA.id)
  check('classInfo.educationLevel == X', dto1.classInfo?.educationLevel === 'X')
  check('classInfo.parallel == A', dto1.classInfo?.parallel === 'A')
  check('classInfo.curriculum.name == MERDEKA', dto1.classInfo?.curriculum?.name === 'MERDEKA')
  check('classInfo.academicYear.isActive == true', dto1.classInfo?.academicYear?.isActive === true)
  expectEqual('member.status ACTIVE saat enroll', dto1.status, 'ACTIVE')
  await enrollmentService.close(enReg.id, { status: ACADEMIC_STATUS.graduated, note: 'tamat' })
  const dto2 = await memberService.findById(sReg.id)
  expectEqual('classInfo null setelah close', dto2.classInfo, null)
  // MEMBER_STATUS_ALIGNMENT (Fase 1): close() TIDAK menyinkronkan Member.status —
  // status keanggotaan tetap ACTIVE (dipicu by-borrow, bukan akademik).
  expectEqual('member.status TIDAK berubah setelah GRADUATED', dto2.status, 'ACTIVE')

  await prisma.$disconnect()
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
