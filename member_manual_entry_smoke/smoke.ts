import { MemberService } from '../src/main/services/member.service'
import { MemberRepository } from '../src/main/repositories/member.repository'
import { NumberGeneratorService } from '../src/main/services/number-generator.service'
import { EnrollmentService } from '../src/main/services/enrollment.service'
import { EnrollmentRepository } from '../src/main/repositories/enrollment.repository'
import { ClassRepository } from '../src/main/repositories/class.repository'
import { BorrowService } from '../src/main/services/borrow.service'
import { BorrowRepository } from '../src/main/repositories/borrow.repository'
import { BorrowDetailRepository } from '../src/main/repositories/borrow-detail.repository'
import { BookCopyRepository } from '../src/main/repositories/book-copy.repository'
import { getPrisma } from '../src/main/repositories/base/prisma'
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
  const memberService = new MemberService(memberRepo, numberGenerator, enrollmentRepo, classRepo, path.join(os.tmpdir(), 'member-photos-manual-entry'))
  const borrowService = new BorrowService(
    new BorrowRepository(),
    new BorrowDetailRepository(),
    memberRepo,
    new BookCopyRepository(),
    enrollmentService
  )

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
  const classOtherYear = await prisma.class.create({
    data: { academicYearId: yearB.id, curriculumId: curriculum.id, educationLevel: 'X', parallel: 'A', homeroomTeacher: null, isActive: true }
  })
  const book = await prisma.book.create({ data: { title: 'Buku Uji Manual Entry' } })
  const copy = await prisma.bookCopy.create({
    data: { bookId: book.id, inventoryNumber: 'INV-000001', barcode: 'INV-000001', shelfLocation: 'R1', status: 'AVAILABLE' }
  })
  check('seed: kelas yearA + kelas yearB + 1 eksemplar', classA.id !== '' && classOtherYear.id !== '' && copy.id !== '')

  console.log('--- STEP 1: create siswa manual dgn academicYearId+classId → Member + Enrollment ACTIVE ---')
  const s1 = await memberService.create({ fullName: 'Siswa Manual', memberType: 'student', academicYearId: yearA.id, classId: classA.id })
  expectEqual('memberNumber ter-generate', s1.memberNumber, 'S-000001')
  expectEqual('status INACTIVE (pola existing)', s1.status, 'INACTIVE')
  const s1Row = await prisma.member.findUnique({ where: { id: s1.id } })
  expectEqual('DB classId legacy null (SSOT = enrollment)', s1Row?.classId, null)
  const s1Enr = await prisma.memberEnrollment.findFirst({
    where: { memberId: s1.id, status: 'ACTIVE', leftAt: null }
  })
  check('enrollment ACTIVE dibuat', s1Enr !== null)
  check('enrollment.classId == classA', s1Enr?.classId === classA.id)
  check('enrollment.academicYearId == yearA', s1Enr?.academicYearId === yearA.id)
  check('findById classInfo dari SSOT (educationLevel X / parallel A)', s1.classInfo?.educationLevel === 'X' && s1.classInfo?.parallel === 'A')
  check('classInfo.academicYear.name == 2025/2026 & aktif', s1.classInfo?.academicYear?.name === '2025/2026' && s1.classInfo?.academicYear?.isActive === true)
  check('classInfo.curriculum.name == MERDEKA', s1.classInfo?.curriculum?.name === 'MERDEKA')

  console.log('--- STEP 2: siswa TANPA academicYearId (hanya classId) → ditolak ---')
  await expectRejected(
    'create siswa tanpa academicYearId ditolak',
    () => memberService.create({ fullName: 'Siswa No Year', memberType: 'student', classId: classA.id }),
    'Anggota siswa wajib memilih Tahun Ajaran dan Kelas'
  )

  console.log('--- STEP 3: siswa TANPA classId (hanya academicYearId) → ditolak ---')
  await expectRejected(
    'create siswa tanpa classId ditolak',
    () => memberService.create({ fullName: 'Siswa No Class', memberType: 'student', academicYearId: yearA.id }),
    'Anggota siswa wajib memilih Tahun Ajaran dan Kelas'
  )

  console.log('--- STEP 4: siswa dgn classId tidak ada → ditolak ---')
  await expectRejected(
    'create siswa classId tidak ada ditolak',
    () => memberService.create({ fullName: 'Siswa Bad Class', memberType: 'student', academicYearId: yearA.id, classId: 'class-tidak-ada' }),
    'tidak ditemukan'
  )

  console.log('--- STEP 5: siswa dgn kelas tahun lain → ditolak ---')
  await expectRejected(
    'create siswa kelas yearB + AY yearA ditolak',
    () => memberService.create({ fullName: 'Siswa Wrong Year', memberType: 'student', academicYearId: yearA.id, classId: classOtherYear.id }),
    'Kelas tidak termasuk Tahun Ajaran yang dipilih'
  )

  console.log('--- STEP 6: guru/umum TANPA AY/kelas → sukses, tanpa enrollment ---')
  const teacher = await memberService.create({ fullName: 'Guru Manual', memberType: 'teacher' })
  expectEqual('guru memberNumber', teacher.memberNumber, 'G-000001')
  const teacherEnr = await prisma.memberEnrollment.findFirst({ where: { memberId: teacher.id } })
  check('guru tanpa enrollment', teacherEnr === null)
  const general = await memberService.create({ fullName: 'Umum Manual', memberType: 'general' })
  expectEqual('umum memberNumber', general.memberNumber, 'U-000001')
  const generalEnr = await prisma.memberEnrollment.findFirst({ where: { memberId: general.id } })
  check('umum tanpa enrollment', generalEnr === null)

  console.log('--- STEP 7: atomicity — tidak ada partial write dari kasus ditolak ---')
  const memberCount = await prisma.member.count()
  expectEqual('hanya 3 member (1 siswa + 1 guru + 1 umum + 0 gagal)', memberCount, 3)
  const enrollmentCount = await prisma.memberEnrollment.count()
  expectEqual('hanya 1 enrollment ACTIVE (siswa STEP 1)', enrollmentCount, 1)

  console.log('--- STEP 8: invarian satu-ACTIVE + guard borrow eligibility ---')
  const s1ActiveCount = await prisma.memberEnrollment.count({
    where: { memberId: s1.id, status: 'ACTIVE', leftAt: null }
  })
  expectEqual('s1 tepat 1 enrollment ACTIVE', s1ActiveCount, 1)

  const borrow = await borrowService.create({
    memberId: s1.id,
    dueDate: futureDate(),
    bookCopyIds: [copy.id]
  })
  check('siswa manual entry LULUS guard borrow (enrollment ACTIVE)', borrow.id !== '')
  expectEqual('status pinjam ACTIVE', borrow.status, 'ACTIVE')
  const s1AfterBorrow = await prisma.member.findUnique({ where: { id: s1.id } })
  expectEqual('first-borrow activation → status ACTIVE', s1AfterBorrow?.status, 'ACTIVE')

  console.log(`\nRESULT: ${pass} PASS, ${fail} FAIL`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
