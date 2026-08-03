import { EnrollmentService } from '../src/main/services/enrollment.service'
import { EnrollmentRepository } from '../src/main/repositories/enrollment.repository'
import { MemberRepository } from '../src/main/repositories/member.repository'
import { ClassRepository } from '../src/main/repositories/class.repository'
import { getPrisma } from '../src/main/repositories/base/prisma'
import { ACADEMIC_STATUS } from '../src/shared/config/academic-status'

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
  const service = new EnrollmentService(new EnrollmentRepository(), new MemberRepository(), new ClassRepository())

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
  const student = await prisma.member.create({
    data: { memberNumber: 'S-000001', fullName: 'Siswa Uji', memberType: 'student', status: 'ACTIVE' }
  })
  const student2 = await prisma.member.create({
    data: { memberNumber: 'S-000002', fullName: 'Siswa Uji Dua', memberType: 'student', status: 'ACTIVE' }
  })
  const teacher = await prisma.member.create({
    data: { memberNumber: 'G-000001', fullName: 'Guru Uji', memberType: 'teacher', status: 'ACTIVE' }
  })
  const general = await prisma.member.create({
    data: { memberNumber: 'U-000001', fullName: 'Umum Uji', memberType: 'general', status: 'ACTIVE' }
  })
  check('seed: 2 tahun, 3 kelas, 4 member', curriculum.id !== '')

  console.log('--- STEP 1: enroll siswa ke X A (tahun A) ---')
  const en1 = await service.enroll({ memberId: student.id, classId: classA.id, academicYearId: yearA.id })
  expectEqual('status ACTIVE', en1.status, ACADEMIC_STATUS.active)
  expectEqual('leftAt null', en1.leftAt, null)
  expectEqual('className', en1.className, 'X A')
  expectEqual('academicYearName', en1.academicYearName, '2025/2026')
  expectEqual('memberNumber', en1.memberNumber, 'S-000001')
  const active1 = await service.findActiveByMember(student.id)
  expectEqual('findActiveByMember == en1', active1?.id, en1.id)
  expectEqual('countActiveByMember == 1', await new EnrollmentRepository().countActiveByMember(student.id), 1)

  console.log('--- STEP 2: enroll ulang ditolak (satu-ACTIVE) ---')
  await expectRejected(
    'enroll kedua ditolak',
    () => service.enroll({ memberId: student.id, classId: classB.id, academicYearId: yearA.id }),
    'masih memiliki enrollment aktif'
  )

  console.log('--- STEP 3: enroll non-siswa ditolak (hasAcademicRecord=false) ---')
  await expectRejected(
    'enroll guru ditolak',
    () => service.enroll({ memberId: teacher.id, classId: classA.id, academicYearId: yearA.id }),
    'rekor akademik'
  )
  await expectRejected(
    'enroll umum ditolak',
    () => service.enroll({ memberId: general.id, classId: classA.id, academicYearId: yearA.id }),
    'rekor akademik'
  )

  console.log('--- STEP 4: enroll member tidak ada / kelas tidak ada ditolak ---')
  await expectRejected(
    'enroll member tidak ada',
    () => service.enroll({ memberId: 'member-nope', classId: classA.id, academicYearId: yearA.id }),
    'tidak ditemukan'
  )
  await expectRejected(
    'enroll kelas tidak ada',
    () => service.enroll({ memberId: student2.id, classId: 'class-nope', academicYearId: yearA.id }),
    'tidak ditemukan'
  )

  console.log('--- STEP 5: kelas tahun lain ditolak (class.academicYearId !== input.academicYearId) ---')
  await expectRejected(
    'enroll kelas tahun lain ditolak',
    () => service.enroll({ memberId: student2.id, classId: classOtherYear.id, academicYearId: yearA.id }),
    'bukan milik tahun ajaran'
  )

  console.log('--- STEP 6: enroll student2 valid (prep untuk close guard) ---')
  const en2 = await service.enroll({ memberId: student2.id, classId: classB.id, academicYearId: yearA.id })
  expectEqual('en2 status ACTIVE', en2.status, ACADEMIC_STATUS.active)

  console.log('--- STEP 7: close dengan status non-terminal ditolak ---')
  await expectRejected(
    'close(status=ACTIVE) ditolak',
    () => service.close(en2.id, { status: ACADEMIC_STATUS.active }),
    'status terminal'
  )
  await expectRejected(
    'close(status=random) ditolak',
    () => service.close(en2.id, { status: 'SOMETHING' }),
    'status terminal'
  )

  console.log('--- STEP 8: close valid (GRADUATED) ---')
  const closed2 = await service.close(en2.id, { status: ACADEMIC_STATUS.graduated, note: 'tamat' })
  expectEqual('status GRADUATED', closed2.status, ACADEMIC_STATUS.graduated)
  expectEqual('leftAt set', closed2.leftAt !== null, true)
  expectEqual('note tersimpan', closed2.note, 'tamat')
  const activeAfterClose = await service.findActiveByMember(student2.id)
  expectEqual('findActiveByMember null setelah close', activeAfterClose, null)
  expectEqual('countActiveByMember == 0', await new EnrollmentRepository().countActiveByMember(student2.id), 0)

  console.log('--- STEP 9: close ulang ditolak (sudah tidak aktif) ---')
  await expectRejected(
    'close ulang ditolak',
    () => service.close(en2.id, { status: ACADEMIC_STATUS.dropped }),
    'tidak aktif'
  )

  console.log('--- STEP 10: repoint siswa (mutasi tengah tahun) ---')
  const active = await service.findActiveByMember(student.id)
  expectEqual('pre-repoint ada 1 aktif', active?.id, en1.id)
  const repointed = await service.repoint(en1.id, { targetClassId: classB.id, note: 'redistribusi' })
  expectEqual('repoint status ACTIVE', repointed.status, ACADEMIC_STATUS.active)
  expectEqual('repoint classId', repointed.classId, classB.id)
  expectEqual('repoint academicYear sama', repointed.academicYearId, yearA.id)
  const oldRow = await prisma.memberEnrollment.findUnique({ where: { id: en1.id } })
  expectEqual('enrollment lama REDISTRIBUTED', oldRow?.status, ACADEMIC_STATUS.redistributed)
  expectEqual('enrollment lama leftAt set', oldRow?.leftAt !== null, true)
  const activeAfterRepoint = await service.findActiveByMember(student.id)
  expectEqual('findActiveByMember == baris baru', activeAfterRepoint?.id, repointed.id)
  expectEqual('histori siswa == 2 (tidak pernah DELETE)', await prisma.memberEnrollment.count({ where: { memberId: student.id } }), 2)
  expectEqual('countActiveByMember tetap 1', await new EnrollmentRepository().countActiveByMember(student.id), 1)

  console.log('--- STEP 11: repoint guard ---')
  await expectRejected(
    'repoint enrollment sudah ditutup ditolak',
    () => service.repoint(en2.id, { targetClassId: classB.id }),
    'tidak aktif'
  )
  await expectRejected(
    'repoint kelas target tidak ada ditolak',
    () => service.repoint(repointed.id, { targetClassId: 'class-nope' }),
    'tidak ditemukan'
  )
  await expectRejected(
    'repoint kelas tahun lain ditolak',
    () => service.repoint(repointed.id, { targetClassId: classOtherYear.id }),
    'bukan milik tahun ajaran yang sama'
  )
  await expectRejected(
    'repoint kelas yang sama ditolak',
    () => service.repoint(repointed.id, { targetClassId: classB.id }),
    'tidak boleh sama'
  )

  console.log('--- STEP 12: findActiveByMember tanpa enrollment → null ---')
  const none = await service.findActiveByMember(general.id)
  expectEqual('general tanpa enrollment → null', none, null)
  const none2 = await service.findActiveByMember('member-nope')
  expectEqual('member tidak ada → null', none2, null)

  console.log('--- STEP 13: invariant satu-ACTIVE per member (groupBy) ---')
  const activeGroups = await prisma.memberEnrollment.groupBy({
    by: ['memberId'],
    where: { status: ACADEMIC_STATUS.active, leftAt: null },
    _count: true
  })
  for (const row of activeGroups) {
    expectEqual(`active count member ${row.memberId} == 1`, row._count, 1)
  }

  await prisma.$disconnect()
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
