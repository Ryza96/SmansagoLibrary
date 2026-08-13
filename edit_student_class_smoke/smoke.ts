import * as fs from 'fs'
import * as path from 'path'
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
  const repoRoot = process.argv[2] ?? path.resolve(__dirname, '..', '..')
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
  const classC = await prisma.class.create({
    data: { academicYearId: yearB.id, curriculumId: curriculum.id, educationLevel: 'X', parallel: 'C', homeroomTeacher: null, isActive: true }
  })
  const s1 = await prisma.member.create({ data: { memberNumber: 'S-000001', fullName: 'Siswa Satu', memberType: 'student', status: 'ACTIVE' } })
  const s2 = await prisma.member.create({ data: { memberNumber: 'S-000002', fullName: 'Siswa Dua', memberType: 'student', status: 'ACTIVE' } })
  const s3 = await prisma.member.create({ data: { memberNumber: 'S-000003', fullName: 'Siswa Tiga', memberType: 'student', status: 'ACTIVE' } })
  const teacher = await prisma.member.create({ data: { memberNumber: 'G-000001', fullName: 'Guru Uji', memberType: 'teacher', status: 'ACTIVE' } })
  const general = await prisma.member.create({ data: { memberNumber: 'U-000001', fullName: 'Umum Uji', memberType: 'general', status: 'ACTIVE' } })
  check('seed: 2 tahun, 3 kelas, 5 member', curriculum.id !== '')

  console.log('--- TEST 2 (edit, same year): repoint = ganti kelas tahun sama ---')
  const en1 = await service.enroll({ memberId: s1.id, classId: classA.id, academicYearId: yearA.id })
  const repointed = await service.repoint(en1.id, { targetClassId: classB.id, note: 'pindah kelas dalam tahun' })
  expectEqual('status ACTIVE setelah repoint', repointed.status, ACADEMIC_STATUS.active)
  expectEqual('classId baru', repointed.classId, classB.id)
  expectEqual('academicYear tetap', repointed.academicYearId, yearA.id)
  const oldRow = await prisma.memberEnrollment.findUnique({ where: { id: en1.id } })
  expectEqual('enrollment lama REDISTRIBUTED', oldRow?.status, ACADEMIC_STATUS.redistributed)
  expectEqual('histori s1 == 2', await prisma.memberEnrollment.count({ where: { memberId: s1.id } }), 2)
  expectEqual('countActive s1 == 1', await new EnrollmentRepository().countActiveByMember(s1.id), 1)

  console.log('--- TEST 3 (edit, cross-year): transfer = pindah ke tahun ajaran lain (atomik) ---')
  const transferred = await service.transfer(repointed.id, {
    targetAcademicYearId: yearB.id,
    targetClassId: classC.id,
    note: 'naik tahun'
  })
  expectEqual('status ACTIVE setelah transfer', transferred.status, ACADEMIC_STATUS.active)
  expectEqual('classId baru', transferred.classId, classC.id)
  expectEqual('academicYear baru', transferred.academicYearId, yearB.id)
  const oldRow2 = await prisma.memberEnrollment.findUnique({ where: { id: repointed.id } })
  expectEqual('enrollment lama TRANSFERRED', oldRow2?.status, ACADEMIC_STATUS.transferred)
  expectEqual('enrollment lama leftAt set', oldRow2?.leftAt !== null, true)
  expectEqual('histori s1 == 3 (tidak pernah DELETE)', await prisma.memberEnrollment.count({ where: { memberId: s1.id } }), 3)
  expectEqual('countActive s1 == 1', await new EnrollmentRepository().countActiveByMember(s1.id), 1)
  const activeS1 = await service.findActiveByMember(s1.id)
  expectEqual('findActiveByMember == baris baru', activeS1?.id, transferred.id)
  expectEqual('className', activeS1?.className, 'X C')
  expectEqual('academicYearName', activeS1?.academicYearName, '2026/2027')

  console.log('--- TEST 4 (CRITICAL): atomisitas transfer — gagal buat target = rollback penuh ---')
  const en2 = await service.enroll({ memberId: s2.id, classId: classA.id, academicYearId: yearA.id })
  const originalCreate = EnrollmentRepository.prototype.createActiveWithTx
  EnrollmentRepository.prototype.createActiveWithTx = async () => {
    throw new Error('forced failure')
  }
  try {
    await expectRejected(
      'transfer ditolak saat createActiveWithTx gagal',
      () => service.transfer(en2.id, { targetAcademicYearId: yearB.id, targetClassId: classC.id }),
      'forced failure'
    )
  } finally {
    EnrollmentRepository.prototype.createActiveWithTx = originalCreate
  }
  const afterRollback = await prisma.memberEnrollment.findUnique({ where: { id: en2.id } })
  expectEqual('enrollment lama TETAP ACTIVE setelah rollback', afterRollback?.status, ACADEMIC_STATUS.active)
  expectEqual('enrollment lama leftAt tetap null', afterRollback?.leftAt, null)
  expectEqual('histori s2 == 1 (tidak ada baris baru)', await prisma.memberEnrollment.count({ where: { memberId: s2.id } }), 1)
  expectEqual('countActive s2 == 1', await new EnrollmentRepository().countActiveByMember(s2.id), 1)
  const stillEligible = await service.findActiveByMember(s2.id)
  expectEqual('siswa tetap eligible (enrollment lama masih ACTIVE)', stillEligible?.id, en2.id)

  console.log('--- TEST 4b: transfer valid setelah rollback (engine tetap bekerja) ---')
  const transferred2 = await service.transfer(en2.id, { targetAcademicYearId: yearB.id, targetClassId: classC.id })
  expectEqual('transfer kedua sukses', transferred2.status, ACADEMIC_STATUS.active)
  expectEqual('academicYear baru', transferred2.academicYearId, yearB.id)
  expectEqual('histori s2 == 2', await prisma.memberEnrollment.count({ where: { memberId: s2.id } }), 2)
  expectEqual('countActive s2 == 1', await new EnrollmentRepository().countActiveByMember(s2.id), 1)

  console.log('--- TEST 5 (edit, tanpa enrollment ACTIVE): enroll saat siswa belum terdaftar ---')
  const en3 = await service.enroll({ memberId: s3.id, classId: classA.id, academicYearId: yearA.id })
  expectEqual('enroll s3 sukses ACTIVE', en3.status, ACADEMIC_STATUS.active)
  expectEqual('countActive s3 == 1', await new EnrollmentRepository().countActiveByMember(s3.id), 1)

  console.log('--- TEST 8: kelas tidak sesuai tahun target ditolak / guard transfer ---')
  await expectRejected(
    'transfer: kelas dari tahun lain ditolak',
    () => service.transfer(en3.id, { targetAcademicYearId: yearB.id, targetClassId: classB.id }),
    'bukan milik tahun ajaran'
  )
  await expectRejected(
    'transfer: kelas target tidak ditemukan',
    () => service.transfer(en3.id, { targetAcademicYearId: yearB.id, targetClassId: 'class-nope' }),
    'tidak ditemukan'
  )
  await expectRejected(
    'transfer: tahun target sama dengan tahun sekarang ditolak (pakai repoint)',
    () => service.transfer(transferred2.id, { targetAcademicYearId: yearB.id, targetClassId: classC.id }),
    'harus berbeda dari tahun ajaran saat ini'
  )
  await expectRejected(
    'transfer: enrollment tidak ditemukan',
    () => service.transfer('enroll-nope', { targetAcademicYearId: yearB.id, targetClassId: classC.id }),
    'tidak ditemukan'
  )
  await expectRejected(
    'transfer: enrollment tidak aktif ditolak',
    () => service.transfer(en1.id, { targetAcademicYearId: yearB.id, targetClassId: classC.id }),
    'tidak aktif'
  )
  await expectRejected(
    'enroll: kelas bukan milik tahun yang dipilih ditolak',
    () => service.enroll({ memberId: s3.id, classId: classC.id, academicYearId: yearA.id }),
    'bukan milik tahun ajaran'
  )

  console.log('--- TEST 7 (backend): non-siswa tidak memiliki rekor akademik (enrollment tidak tersentuh) ---')
  await expectRejected(
    'enroll guru ditolak',
    () => service.enroll({ memberId: teacher.id, classId: classA.id, academicYearId: yearA.id }),
    'rekor akademik'
  )
  expectEqual('findActive guru null', await service.findActiveByMember(teacher.id), null)
  expectEqual('histori guru == 0', await prisma.memberEnrollment.count({ where: { memberId: teacher.id } }), 0)
  expectEqual('findActive umum null', await service.findActiveByMember(general.id), null)

  console.log('--- TEST 1 (UI statis): edit tanpa perubahan → tidak ada operasi enrollment ---')
  const memberFormSrc = fs.readFileSync(path.join(repoRoot, 'src', 'components', 'members', 'MemberForm.tsx'), 'utf8')
  check('MemberForm: cabang enroll bila tanpa enrollment ACTIVE', memberFormSrc.includes('if (!activeEnrollment)'))
  check('MemberForm: cabang transfer bila tahun berubah', memberFormSrc.includes('activeEnrollment.academicYearId !== academicYearId'))
  check('MemberForm: cabang repoint bila hanya kelas berubah', memberFormSrc.includes('activeEnrollment.classId !== classId'))
  check('MemberForm: tanpa perubahan = tanpa operasi (tidak ada else dengan pemanggilan)', memberFormSrc.includes('tanpa perubahan → tidak ada operasi'))

  console.log('--- TEST 6 (UI statis): validasi student membutuhkan Tahun + Kelas di mode EDIT ---')
  check('MemberForm: validasi student tidak lagi di-skip saat edit (early-return isEditMode dihapus)', !memberFormSrc.includes('if (isEditMode) {\n      setErrors(e)\n      return Object.keys(e).length === 0'))
  check('MemberForm: cek academicYearId wajib utk student', memberFormSrc.includes('if (!academicYearId) e.academicYearId = LABELS.MEMBER_CLASS.REQUIRED_STUDENT'))
  check('MemberForm: cek classId wajib utk student', memberFormSrc.includes('if (!classId) e.classId = LABELS.MEMBER_CLASS.REQUIRED_STUDENT'))

  console.log('--- TEST 7 (UI statis): non-siswa tidak menampilkan section kelas & tidak menyentuh enrollment ---')
  const memberClassSectionSrc = fs.readFileSync(path.join(repoRoot, 'src', 'components', 'members', 'MemberClassSection.tsx'), 'utf8')
  const memberEditSrc = fs.readFileSync(path.join(repoRoot, 'src', 'pages', 'MemberEditPage.tsx'), 'utf8')
  check('MemberClassSection: self-gate non-siswa', memberClassSectionSrc.includes('if (!isStudent) return null'))
  check('MemberForm: section kelas dirender tanpa gate !isEditMode', !memberFormSrc.includes('{!isEditMode && ('))
  check('MemberEditPage: mengambil enrollment ACTIVE', memberEditSrc.includes('api.enrollments.findActiveByMember(id)'))
  check('MemberEditPage: seed academicYearId dari enrollment', memberEditSrc.includes('academicYearId: active?.academicYearId ?? \'\''))
  check('MemberEditPage: seed classId dari enrollment', memberEditSrc.includes('classId: active?.classId ?? \'\''))

  console.log('--- invariant: satu-ACTIVE per member (groupBy) ---')
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
