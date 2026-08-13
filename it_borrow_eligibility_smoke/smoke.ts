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
import { memberBorrowRights } from '../src/shared/config/member-type'

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
  const borrowRepo = new BorrowRepository()
  const borrowService = new BorrowService(
    borrowRepo,
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

  console.log('--- CASE 8: maxBooks boundary (20 eksemplar, config-driven) ---')
  const s8 = await prisma.member.create({
    data: { memberNumber: 'S-000008', fullName: 'Siswa Batas Buku', memberType: 'student', status: 'INACTIVE' }
  })
  await enrollmentService.enroll({ memberId: s8.id, classId: classX.id, academicYearId: yearA.id })

  const c8a = await Promise.all(Array.from({ length: 19 }, () => makeCopy()))
  const b8a = await borrowService.create({ memberId: s8.id, dueDate: futureDate(), bookCopyIds: c8a })
  check('case8 borrow 19 buku dalam 1 transaksi → ok', b8a.id !== '')

  const b8b = await borrowService.create({ memberId: s8.id, dueDate: futureDate(), bookCopyIds: [await makeCopy()] })
  check('case8 19+1 = 20 buku → ok', b8b.id !== '')

  await expectRejected(
    'case8 20+1 = 21 buku → ditolak',
    async () => await borrowService.create({ memberId: s8.id, dueDate: futureDate(), bookCopyIds: [await makeCopy()] }),
    'tidak boleh melebihi 20 eksemplar'
  )

  await borrowRepo.processReturn(b8a.items[0].id, 'BAIK', null)
  const b8d = await borrowService.create({ memberId: s8.id, dueDate: futureDate(), bookCopyIds: [await makeCopy()] })
  check('case8 return 1 → 19 aktif → borrow lagi → ok (returned tak dihitung)', b8d.id !== '')

  const s8b = await prisma.member.create({
    data: { memberNumber: 'S-000009', fullName: 'Siswa Batas Buku 2', memberType: 'student', status: 'INACTIVE' }
  })
  await enrollmentService.enroll({ memberId: s8b.id, classId: classX.id, academicYearId: yearA.id })
  const c8e = await Promise.all(Array.from({ length: 21 }, () => makeCopy()))
  await expectRejected(
    'case8 21 buku dalam 1 transaksi → ditolak',
    async () => await borrowService.create({ memberId: s8b.id, dueDate: futureDate(), bookCopyIds: c8e }),
    'tidak boleh melebihi 20 eksemplar'
  )

  console.log('--- CASE 8b: guard ATOMIK maxBooks in-transaction (bypass pre-check) ---')
  const c8f = await Promise.all(Array.from({ length: 2 }, () => makeCopy()))
  await expectRejected(
    'case8b createWithItems langsung (20 aktif + 2) → dibatalkan atomik',
    async () =>
      await borrowRepo.createWithItems(
        {
          borrowNumber: 'PJ/202608/CASE8ATOMIC',
          memberId: s8.id,
          memberName: 'Siswa Batas Buku',
          memberNumber: 'S-000008',
          borrowDate: new Date(),
          dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000)
        },
        c8f.map((id) => ({ bookCopyId: id, bookTitle: 'Buku Uji Eligibilitas' })),
        20
      ),
    'tidak boleh melebihi 20 eksemplar'
  )
  const s8Active = await new BorrowDetailRepository().countActiveByMemberId(s8.id)
  check('case8b rollback: detail aktif tetap 20', s8Active === 20, `active=${s8Active}`)
  const c8fStatuses = await prisma.bookCopy.findMany({ where: { id: { in: c8f } }, select: { status: true } })
  check('case8b rollback: 2 copy tetap AVAILABLE (no partial)', c8fStatuses.every((x) => x.status === 'AVAILABLE'))

  console.log('--- CASE 9: maxDays boundary (90 hari, config-driven) ---')
  const s9 = await prisma.member.create({
    data: { memberNumber: 'S-000010', fullName: 'Siswa Batas Hari', memberType: 'student', status: 'INACTIVE' }
  })
  await enrollmentService.enroll({ memberId: s9.id, classId: classX.id, academicYearId: yearA.id })

  const d30 = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  const b9a = await borrowService.create({ memberId: s9.id, dueDate: d30, bookCopyIds: [await makeCopy()] })
  check('case9 dueDate +30 hari → ok', b9a.id !== '')

  const d90 = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
  const b9b = await borrowService.create({ memberId: s9.id, dueDate: d90, bookCopyIds: [await makeCopy()] })
  check('case9 dueDate PAS 90 hari → ok (<= maxDays)', b9b.id !== '')

  await expectRejected(
    'case9 dueDate 91 hari → ditolak',
    async () => await borrowService.create({ memberId: s9.id, dueDate: new Date(Date.now() + 91 * 24 * 60 * 60 * 1000).toISOString(), bookCopyIds: [await makeCopy()] }),
    'Masa pinjam tidak boleh melebihi 90 hari'
  )

  await expectRejected(
    'case9 dueDate hari ini → ditolak',
    async () => await borrowService.create({ memberId: s9.id, dueDate: new Date().toISOString(), bookCopyIds: [await makeCopy()] }),
    'harus setelah hari ini'
  )

  console.log('--- CASE 10: kesetaraan hak pinjam semua tipe (config SSOT) ---')
  for (const code of ['student', 'teacher', 'general'] as const) {
    const rights = memberBorrowRights(code)
    check(`case10 ${code} maxBooks=20`, rights?.maxBooks === 20)
    check(`case10 ${code} maxDays=90`, rights?.maxDays === 90)
  }
  check('case10 extensions tetap (1x/3x/Tidak Terbatas)',
    memberBorrowRights('student')?.extensions === '1x' &&
      memberBorrowRights('teacher')?.extensions === '3x' &&
      memberBorrowRights('general')?.extensions === 'Tidak Terbatas')

  await prisma.$disconnect()
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
