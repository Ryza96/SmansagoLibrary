import { BorrowService } from '../src/main/services/borrow.service'
import { BorrowRepository } from '../src/main/repositories/borrow.repository'
import { BorrowDetailRepository } from '../src/main/repositories/borrow-detail.repository'
import { BookCopyRepository } from '../src/main/repositories/book-copy.repository'
import { MemberRepository } from '../src/main/repositories/member.repository'
import { EnrollmentService } from '../src/main/services/enrollment.service'
import { EnrollmentRepository } from '../src/main/repositories/enrollment.repository'
import { ClassRepository } from '../src/main/repositories/class.repository'
import { AcademicYearRepository } from '../src/main/repositories/academic-year.repository'
import { CurriculumRepository } from '../src/main/repositories/curriculum.repository'
import { getPrisma } from '../src/main/repositories/base/prisma'

let pass = 0
let fail = 0

function check(name: string, ok: boolean, detail?: string): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`)
  if (ok) pass += 1
  else fail += 1
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
  const academicYearRepo = new AcademicYearRepository()
  const curriculumRepo = new CurriculumRepository()
  const enrollmentService = new EnrollmentService(enrollmentRepo, memberRepo, classRepo)
  const borrowService = new BorrowService(
    new BorrowRepository(),
    new BorrowDetailRepository(),
    memberRepo,
    new BookCopyRepository(),
    enrollmentService
  )

  console.log('--- SEED ---')
  const curriculum = await prisma.curriculum.create({ data: { name: 'MERDEKA' } })
  const yearA = await prisma.academicYear.create({
    data: { name: '2025/2026', startDate: new Date('2025-07-01'), endDate: new Date('2026-06-30'), isActive: true }
  })
  const classX = await prisma.class.create({
    data: { academicYearId: yearA.id, curriculumId: curriculum.id, educationLevel: 'X', parallel: 'A', homeroomTeacher: null, isActive: true }
  })
  const classXI = await prisma.class.create({
    data: { academicYearId: yearA.id, curriculumId: curriculum.id, educationLevel: 'XI', parallel: 'A', homeroomTeacher: null, isActive: true }
  })
  const classXII = await prisma.class.create({
    data: { academicYearId: yearA.id, curriculumId: curriculum.id, educationLevel: 'XII', parallel: 'A', homeroomTeacher: null, isActive: true }
  })
  const book = await prisma.book.create({ data: { title: 'Buku Uji Eligibilitas' } })
  let copySeq = 0
  async function makeCopy(): Promise<string> {
    copySeq += 1
    const invNum = `INV-${String(copySeq).padStart(6, '0')}`
    const c = await prisma.bookCopy.create({
      data: { bookId: book.id, inventoryNumber: invNum, barcode: invNum, shelfLocation: 'R1', status: 'AVAILABLE' }
    })
    return c.id
  }

  console.log('--- CASE 1: Student + Enrollment ACTIVE → PASS ---')
  const s1 = await prisma.member.create({
    data: { memberNumber: 'S-000001', fullName: 'Siswa Aktif', memberType: 'student', status: 'INACTIVE' }
  })
  await enrollmentService.enroll({ memberId: s1.id, classId: classX.id, academicYearId: yearA.id })
  const b1 = await borrowService.create({ memberId: s1.id, dueDate: futureDate(), bookCopyIds: [await makeCopy()] })
  check('case1 siswa+enrollmentACTIVE → borrow ok', b1.id !== '')

  console.log('--- CASE 2: Student + GRADUATED → FAIL ---')
  const s2 = await prisma.member.create({
    data: { memberNumber: 'S-000002', fullName: 'Siswa Lulus', memberType: 'student', status: 'INACTIVE' }
  })
  const e2 = await enrollmentService.enroll({ memberId: s2.id, classId: classXII.id, academicYearId: yearA.id })
  await enrollmentService.close(e2!.id, { status: 'GRADUATED', note: 'lulus' })
  await expectRejected(
    'case2 siswa+GRADUATED → ditolak',
    async () => await borrowService.create({ memberId: s2.id, dueDate: futureDate(), bookCopyIds: [await makeCopy()] }),
    'tidak memiliki enrollment aktif'
  )

  console.log('--- CASE 3: Student + TRANSFERRED → FAIL ---')
  const s3 = await prisma.member.create({
    data: { memberNumber: 'S-000003', fullName: 'Siswa Pindah', memberType: 'student', status: 'INACTIVE' }
  })
  const e3 = await enrollmentService.enroll({ memberId: s3.id, classId: classX.id, academicYearId: yearA.id })
  await enrollmentService.close(e3!.id, { status: 'TRANSFERRED', note: 'pindah' })
  await expectRejected(
    'case3 siswa+TRANSFERRED → ditolak',
    async () => await borrowService.create({ memberId: s3.id, dueDate: futureDate(), bookCopyIds: [await makeCopy()] }),
    'tidak memiliki enrollment aktif'
  )

  console.log('--- CASE 4: Student + DROPPED → FAIL ---')
  const s4 = await prisma.member.create({
    data: { memberNumber: 'S-000004', fullName: 'Siswa Keluar', memberType: 'student', status: 'INACTIVE' }
  })
  const e4 = await enrollmentService.enroll({ memberId: s4.id, classId: classXI.id, academicYearId: yearA.id })
  await enrollmentService.close(e4!.id, { status: 'DROPPED', note: 'keluar' })
  await expectRejected(
    'case4 siswa+DROPPED → ditolak',
    async () => await borrowService.create({ memberId: s4.id, dueDate: futureDate(), bookCopyIds: [await makeCopy()] }),
    'tidak memiliki enrollment aktif'
  )

  console.log('--- CASE 5: Teacher (tanpa enrollment) → PASS ---')
  const t = await prisma.member.create({
    data: { memberNumber: 'G-000001', fullName: 'Guru Uji', memberType: 'teacher', status: 'INACTIVE' }
  })
  const b5 = await borrowService.create({ memberId: t.id, dueDate: futureDate(), bookCopyIds: [await makeCopy()] })
  check('case5 guru tanpa enrollment → borrow ok', b5.id !== '')

  console.log('--- CASE 6: General (tanpa enrollment) → PASS ---')
  const g = await prisma.member.create({
    data: { memberNumber: 'U-000001', fullName: 'Umum Uji', memberType: 'general', status: 'INACTIVE' }
  })
  const b6 = await borrowService.create({ memberId: g.id, dueDate: futureDate(), bookCopyIds: [await makeCopy()] })
  check('case6 umum tanpa enrollment → borrow ok', b6.id !== '')

  console.log('--- CASE 7: UNKNOWN MemberType → Validation Error (WAJIB ditolak) ---')
  const unk = await prisma.member.create({
    data: { memberNumber: 'X-000001', fullName: 'Tipe Asing', memberType: 'vendor', status: 'ACTIVE' }
  })
  await expectRejected(
    'case7 memberType tidak dikenal → WAJIB ditolak',
    async () => await borrowService.create({ memberId: unk.id, dueDate: futureDate(), bookCopyIds: [await makeCopy()] }),
    'Tipe anggota'
  )

  await prisma.$disconnect()
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
