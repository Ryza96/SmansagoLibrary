import { MemberService } from '../src/main/services/member.service'
import { MemberRepository } from '../src/main/repositories/member.repository'
import { NumberGeneratorService } from '../src/main/services/number-generator.service'
import { EnrollmentService } from '../src/main/services/enrollment.service'
import { EnrollmentRepository } from '../src/main/repositories/enrollment.repository'
import { ClassRepository } from '../src/main/repositories/class.repository'
import { AcademicYearRepository } from '../src/main/repositories/academic-year.repository'
import { CurriculumRepository } from '../src/main/repositories/curriculum.repository'
import { ClassService } from '../src/main/services/class.service'
import { BorrowService } from '../src/main/services/borrow.service'
import { BorrowRepository } from '../src/main/repositories/borrow.repository'
import { BorrowDetailRepository } from '../src/main/repositories/borrow-detail.repository'
import { BookCopyRepository } from '../src/main/repositories/book-copy.repository'
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

function futureDate(): string {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
}

async function main(): Promise<void> {
  const prisma = getPrisma()
  const memberRepo = new MemberRepository()
  const enrollmentRepo = new EnrollmentRepository()
  const classRepo = new ClassRepository()
  const numberGenerator = new NumberGeneratorService(memberRepo)
  const enrollmentService = new EnrollmentService(enrollmentRepo, memberRepo, classRepo)
  const memberService = new MemberService(
    memberRepo,
    numberGenerator,
    enrollmentRepo,
    classRepo,
    path.join(os.tmpdir(), 'member-photos-wo14-e2')
  )
  const borrowService = new BorrowService(
    new BorrowRepository(),
    new BorrowDetailRepository(),
    memberRepo,
    new BookCopyRepository(),
    enrollmentService
  )
  const classService = new ClassService(classRepo, new AcademicYearRepository(), new CurriculumRepository(), enrollmentRepo)

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
    data: { academicYearId: yearA.id, curriculumId: curriculum.id, educationLevel: 'XI', parallel: 'A', homeroomTeacher: null, isActive: true }
  })
  const classOtherYear = await prisma.class.create({
    data: { academicYearId: yearB.id, curriculumId: curriculum.id, educationLevel: 'X', parallel: 'A', homeroomTeacher: null, isActive: true }
  })
  const student1 = await prisma.member.create({
    data: { memberNumber: 'S-000001', fullName: 'Siswa Satu', memberType: 'student', status: 'ACTIVE' }
  })
  const student2 = await prisma.member.create({
    data: { memberNumber: 'S-000002', fullName: 'Siswa Dua', memberType: 'student', status: 'ACTIVE', classId: classA.id }
  })
  const student3 = await prisma.member.create({
    data: { memberNumber: 'S-000003', fullName: 'Siswa Tiga', memberType: 'student', status: 'ACTIVE' }
  })
  const teacher = await prisma.member.create({
    data: { memberNumber: 'G-000001', fullName: 'Guru Uji', memberType: 'teacher', status: 'ACTIVE' }
  })
  const book = await prisma.book.create({ data: { title: 'Buku Uji E2' } })
  const copy1 = await prisma.bookCopy.create({
    data: { bookId: book.id, inventoryNumber: 'INV-000001', barcode: 'INV-000001', shelfLocation: 'R1', status: 'AVAILABLE' }
  })
  const copy2 = await prisma.bookCopy.create({
    data: { bookId: book.id, inventoryNumber: 'INV-000002', barcode: 'INV-000002', shelfLocation: 'R1', status: 'AVAILABLE' }
  })
  check('seed: 2 tahun, 4 kelas, 4 member, 2 eksemplar', curriculum.id !== '' && copy1.id !== copy2.id)

  console.log('--- STEP 1: findById tanpa enrollment → classInfo null ---')
  const m1 = await memberService.findById(student1.id)
  expectEqual('student1 classInfo null (tanpa enrollment)', m1.classInfo, null)

  console.log('--- STEP 2: dengan enrollment aktif → classInfo dari enrollment (SSOT) ---')
  await enrollmentService.enroll({ memberId: student1.id, classId: classA.id, academicYearId: yearA.id })
  const m1b = await memberService.findById(student1.id)
  check('classInfo.id == classA.id', m1b.classInfo?.id === classA.id)
  check('classInfo.educationLevel == X', m1b.classInfo?.educationLevel === 'X')
  check('classInfo.parallel == A', m1b.classInfo?.parallel === 'A')
  check('classInfo.academicYear.name == 2025/2026', m1b.classInfo?.academicYear?.name === '2025/2026')
  check('classInfo.academicYear.isActive == true', m1b.classInfo?.academicYear?.isActive === true)
  check('classInfo.curriculum.name == MERDEKA', m1b.classInfo?.curriculum?.name === 'MERDEKA')

  console.log('--- STEP 3: legacy classId TIDAK dipakai — student2 punya classId tapi tanpa enrollment → classInfo null ---')
  const m2 = await memberService.findById(student2.id)
  check('student2 classId legacy tetap tersimpan', m2.classId === classA.id)
  check('student2 classInfo null (enrollment = SSOT)', m2.classInfo === null)

  console.log('--- STEP 4: create siswa manual → Member + Enrollment ACTIVE (Opsi A) ---')
  const created = await memberService.create({ fullName: 'Siswa Baru', memberType: 'student', academicYearId: yearA.id, classId: classB.id })
  const createdRow = await prisma.member.findUnique({ where: { id: created.id } })
  expectEqual('created DTO classId null', created.classId, null)
  expectEqual('created DB classId null', createdRow?.classId, null)
  expectEqual('created number ter-generate', created.memberNumber, 'S-000004')
  const createdEnrollment = await enrollmentRepo.findActiveByMember(created.id)
  check('create siswa → enrollment ACTIVE dibuat (SSOT kelas)', createdEnrollment?.classId === classB.id)
  check('create siswa → enrollment academicYearId == yearA', createdEnrollment?.academicYearId === yearA.id)
  expectEqual('create siswa → member status INACTIVE', createdRow?.status, 'INACTIVE')

  console.log('--- STEP 5: update TIDAK lagi menulis classId ---')
  await memberService.update(student2.id, { classId: classB.id })
  const m2After = await prisma.member.findUnique({ where: { id: student2.id } })
  expectEqual('update tidak menimpa classId legacy (tetap classA)', m2After?.classId, classA.id)
  const m2Dto = await memberService.findById(student2.id)
  expectEqual('classInfo tetap null setelah update', m2Dto.classInfo, null)

  console.log('--- STEP 6: repoint → classInfo mengikuti enrollment baru ---')
  const active = await enrollmentService.findActiveByMember(student1.id)
  check('pre-repoint ada 1 aktif', active !== null)
  await enrollmentService.repoint(active!.id, { targetClassId: classB.id, note: 'redistribusi' })
  const m1c = await memberService.findById(student1.id)
  check('classInfo.parallel == B setelah repoint', m1c.classInfo?.parallel === 'B')

  console.log('--- STEP 7: close → classInfo null ---')
  const activeAfterRepoint = await enrollmentService.findActiveByMember(student1.id)
  await enrollmentService.close(activeAfterRepoint!.id, { status: ACADEMIC_STATUS.graduated, note: 'tamat' })
  const m1d = await memberService.findById(student1.id)
  expectEqual('classInfo null setelah close', m1d.classInfo, null)

  console.log('--- STEP 8: Borrow snapshot kelas diambil dari enrollment aktif ---')
  await enrollmentService.enroll({ memberId: student3.id, classId: classA.id, academicYearId: yearA.id })
  const borrow1 = await borrowService.create({ memberId: student3.id, dueDate: futureDate(), bookCopyIds: [copy1.id] })
  const borrow1Row = await prisma.borrow.findUnique({ where: { id: borrow1.id } })
  expectEqual('borrow.className == "X A" (dari enrollment)', borrow1Row?.className, 'X A')
  check('borrow DTO memberName', borrow1.memberName === 'Siswa Tiga')

  console.log('--- STEP 9: Borrow snapshot MENGABAIKAN legacy classId ---')
  const teacherWithClassId = await prisma.member.create({
    data: { memberNumber: 'G-000002', fullName: 'Guru Legacy', memberType: 'teacher', status: 'ACTIVE', classId: classA.id }
  })
  const copyForTeacher = await prisma.bookCopy.create({
    data: { bookId: book.id, inventoryNumber: 'INV-000003', barcode: 'INV-000003', shelfLocation: 'R1', status: 'AVAILABLE' }
  })
  const borrow2 = await borrowService.create({ memberId: teacherWithClassId.id, dueDate: futureDate(), bookCopyIds: [copyForTeacher.id] })
  const borrow2Row = await prisma.borrow.findUnique({ where: { id: borrow2.id } })
  expectEqual('borrow.className null (teacher punya classId legacy, tanpa enrollment)', borrow2Row?.className, null)

  console.log('--- STEP 10: Borrow regression guards ---')
  const inactiveMember = await prisma.member.create({
    data: { memberNumber: 'S-000009', fullName: 'Siswa Inaktif', memberType: 'student', status: 'INACTIVE' }
  })
  await expectRejected(
    'borrow siswa tanpa enrollment ditolak',
    () => borrowService.create({ memberId: inactiveMember.id, dueDate: futureDate(), bookCopyIds: [copy1.id] }),
    'tidak memiliki enrollment aktif'
  )
  const borrow1byId = await borrowService.findById(borrow1.id)
  expectEqual('borrow findById totalItems', borrow1byId.totalItems, 1)
  expectEqual('borrow findById status', borrow1byId.status, 'ACTIVE')
  const copy1After = await prisma.bookCopy.findUnique({ where: { id: copy1.id } })
  expectEqual('bookCopy status BORROWED', copy1After?.status, 'BORROWED')

  console.log('--- STEP 11: delete guard kelas ber-enrollment AKTIF ditolak (count enrollment, bukan member.classId) ---')
  const countA = await enrollmentRepo.countByClass(classA.id)
  expectEqual('enrollmentRepo.countByClass(classA) == 1', countA, 1)
  await expectRejected('delete classA ditolak (1 enrollment aktif)', () => classService.delete(classA.id), 'masih memiliki 1 anggota')

  console.log('--- STEP 12: guard menghitung enrollment AKTIF saja (bukan yang DITUTUP) ---')
  await enrollmentService.enroll({ memberId: student1.id, classId: classC.id, academicYearId: yearA.id })
  const enC = await enrollmentService.findActiveByMember(student1.id)
  await enrollmentService.close(enC!.id, { status: ACADEMIC_STATUS.graduated })
  expectEqual('countByClass(classC) == 0 (hanya closed)', await enrollmentRepo.countByClass(classC.id), 0)
  // Catatan: penghapusan fisik classC tetap ditolak FK RESTRICT (P2003) karena baris
  // MemberEnrollment (closed) tidak pernah dihapus — perilaku DB pre-existing, di luar scope E-2 (Deferred).

  console.log('--- STEP 13: delete kelas tanpa enrollment diperbolehkan ---')
  await classService.delete(classOtherYear.id)
  const classOtherGone = await prisma.class.findUnique({ where: { id: classOtherYear.id } })
  expectEqual('classOtherYear terhapus', classOtherGone, null)

  console.log('--- STEP 14: regression E-1 (enroll/close/repoint/findActive) ---')
  await expectRejected(
    'enroll guru ditolak',
    () => enrollmentService.enroll({ memberId: teacher.id, classId: classB.id, academicYearId: yearA.id }),
    'rekor akademik'
  )
  await expectRejected(
    'enroll kelas tidak ada ditolak',
    () => enrollmentService.enroll({ memberId: student1.id, classId: 'class-nope', academicYearId: yearA.id }),
    'tidak ditemukan'
  )
  const activeNow = await enrollmentService.findActiveByMember(student3.id)
  expectEqual('student3 masih aktif di classA', activeNow?.classId, classA.id)
  const activeGroups = await prisma.memberEnrollment.groupBy({
    by: ['memberId'],
    where: { status: ACADEMIC_STATUS.active, leftAt: null },
    _count: true
  })
  for (const row of activeGroups) {
    expectEqual(`invariant satu-ACTIVE member ${row.memberId}`, row._count, 1)
  }

  console.log('--- STEP 15: regression ClassService CRUD ---')
  const newClass = await classService.create({
    academicYearId: yearB.id,
    curriculumId: curriculum.id,
    educationLevel: 'xii',
    parallel: 'C'
  })
  expectEqual('create normalisasi level', newClass.educationLevel, 'XII')
  const fetched = await classService.findById(newClass.id)
  expectEqual('findById displayName', fetched.displayName, 'XII C')
  const updated = await classService.update(newClass.id, { homeroomTeacher: 'Pak Guru' })
  expectEqual('update homeroomTeacher', updated.homeroomTeacher, 'Pak Guru')

  await prisma.$disconnect()
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
