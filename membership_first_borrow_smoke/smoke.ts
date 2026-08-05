import { BorrowService } from '../src/main/services/borrow.service'
import { BorrowRepository } from '../src/main/repositories/borrow.repository'
import { BorrowDetailRepository } from '../src/main/repositories/borrow-detail.repository'
import { ReturnService } from '../src/main/services/return.service'
import { BookCopyRepository } from '../src/main/repositories/book-copy.repository'
import { MemberRepository } from '../src/main/repositories/member.repository'
import { EnrollmentService } from '../src/main/services/enrollment.service'
import { EnrollmentRepository } from '../src/main/repositories/enrollment.repository'
import { ClassRepository } from '../src/main/repositories/class.repository'
import { DashboardService } from '../src/main/services/dashboard.service'
import { DashboardRepository } from '../src/main/repositories/dashboard.repository'
import { getPrisma } from '../src/main/repositories/base/prisma'

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
  const enrollmentService = new EnrollmentService(new EnrollmentRepository(), memberRepo, new ClassRepository())
  const borrowService = new BorrowService(
    new BorrowRepository(),
    new BorrowDetailRepository(),
    memberRepo,
    new BookCopyRepository(),
    enrollmentService
  )
  const returnService = new ReturnService(
    new BorrowRepository(),
    new BorrowDetailRepository(),
    new BookCopyRepository()
  )
  const dashboardService = new DashboardService(new DashboardRepository())

  console.log('--- STEP 0: seed fresh DB ---')
  const curriculum = await prisma.curriculum.create({ data: { name: 'MERDEKA' } })
  const yearA = await prisma.academicYear.create({
    data: { name: '2025/2026', startDate: new Date('2025-07-01'), endDate: new Date('2026-06-30'), isActive: true }
  })
  const classA = await prisma.class.create({
    data: { academicYearId: yearA.id, curriculumId: curriculum.id, educationLevel: 'X', parallel: 'A', homeroomTeacher: null, isActive: true }
  })

  const m1 = await prisma.member.create({
    data: { memberNumber: 'S-000001', fullName: 'Siswa INACTIVE + Enrollment ACTIVE', memberType: 'student', status: 'INACTIVE' }
  })
  const mNoEnr = await prisma.member.create({
    data: { memberNumber: 'S-000002', fullName: 'Siswa INACTIVE tanpa enrollment', memberType: 'student', status: 'INACTIVE' }
  })
  const mActiveNoEnr = await prisma.member.create({
    data: { memberNumber: 'S-000003', fullName: 'Siswa ACTIVE tanpa enrollment', memberType: 'student', status: 'ACTIVE' }
  })
  const mT = await prisma.member.create({
    data: { memberNumber: 'G-000001', fullName: 'Guru INACTIVE tanpa enrollment', memberType: 'teacher', status: 'INACTIVE' }
  })
  await prisma.memberEnrollment.create({
    data: { memberId: m1.id, classId: classA.id, academicYearId: yearA.id, status: 'ACTIVE', enrolledAt: new Date(), leftAt: null }
  })

  const book = await prisma.book.create({ data: { title: 'Buku Uji Membership' } })
  async function makeCopy(invNum: string): Promise<string> {
    const c = await prisma.bookCopy.create({
      data: { bookId: book.id, inventoryNumber: invNum, barcode: invNum, shelfLocation: 'R1', status: 'AVAILABLE' }
    })
    return c.id
  }
  const c1 = await makeCopy('INV-000001')
  const c2 = await makeCopy('INV-000002')
  const c3 = await makeCopy('INV-000003')
  const c4 = await makeCopy('INV-000004')
  check('seed: 4 member + 1 buku + 4 eksemplar AVAILABLE', m1.id !== '' && c1 !== c2 && mNoEnr.id !== mActiveNoEnr.id)

  const statusOf = async (id: string): Promise<string | null> => (await prisma.member.findUnique({ where: { id } }))?.status ?? null

  console.log('--- STEP 1: Member INACTIVE → PINJAM PERTAMA → Status ACTIVE ---')
  expectEqual('baseline m1 status INACTIVE', await statusOf(m1.id), 'INACTIVE')
  const borrow1 = await borrowService.create({ memberId: m1.id, dueDate: futureDate(), bookCopyIds: [c1] })
  check('pinjam pertama sukses', borrow1.id !== '')
  expectEqual('setelah pinjam pertama → m1 status ACTIVE', await statusOf(m1.id), 'ACTIVE')

  console.log('--- STEP 2: PINJAM KEDUA → Status TETAP ACTIVE ---')
  const borrow2 = await borrowService.create({ memberId: m1.id, dueDate: futureDate(), bookCopyIds: [c2] })
  check('pinjam kedua sukses', borrow2.id !== '')
  expectEqual('setelah pinjam kedua → m1 status tetap ACTIVE', await statusOf(m1.id), 'ACTIVE')

  console.log('--- STEP 3: KEMBALIKAN SELURUH BUKU → Status TETAP ACTIVE ---')
  await returnService.returnBook({ bookCopyId: c1, condition: 'BAIK' })
  await returnService.returnBook({ bookCopyId: c2, condition: 'BAIK' })
  expectEqual('setelah semua buku dikembalikan → m1 status tetap ACTIVE', await statusOf(m1.id), 'ACTIVE')
  const borrow1Row = await prisma.borrow.findUnique({ where: { id: borrow1.id } })
  expectEqual('borrow1 returnDate terisi (selesai)', borrow1Row?.returnDate !== null, true)

  console.log('--- STEP 4: Eligibility tetap berbasis ENROLLMENT (tidak berubah) ---')
  await expectRejected(
    'siswa INACTIVE tanpa enrollment → ditolak (enrollment gate)',
    () => borrowService.create({ memberId: mNoEnr.id, dueDate: futureDate(), bookCopyIds: [c3] }),
    'tidak memiliki enrollment aktif'
  )
  expectEqual('borrow GAGAL → status mNoEnr tetap INACTIVE (tidak teraktivasi)', await statusOf(mNoEnr.id), 'INACTIVE')
  await expectRejected(
    'siswa ACTIVE tanpa enrollment → ditolak (status TIDAK memberi eligibilitas)',
    () => borrowService.create({ memberId: mActiveNoEnr.id, dueDate: futureDate(), bookCopyIds: [c4] }),
    'tidak memiliki enrollment aktif'
  )
  const borrowTeacher = await borrowService.create({ memberId: mT.id, dueDate: futureDate(), bookCopyIds: [c3] })
  check('guru INACTIVE tanpa enrollment → pinjam sukses', borrowTeacher.id !== '')
  expectEqual('guru pinjam pertama → status ACTIVE (aktivasi berlaku semua tipe)', await statusOf(mT.id), 'ACTIVE')

  console.log('--- STEP 5: Dashboard tetap berjalan ---')
  const overview = await dashboardService.getOverview()
  expectEqual('dashboard.summary.totalMembers == 4', overview.summary.totalMembers, 4)
  expectEqual('dashboard.summary.totalBooks == 1', overview.summary.totalBooks, 1)
  expectEqual('dashboard.summary.totalInventories == 4', overview.summary.totalInventories, 4)
  expectEqual('dashboard.summary.activeBorrowings == 1 (peminjaman guru aktif)', overview.summary.activeBorrowings, 1)
  expectEqual('dashboard.today.borrowed == 3', overview.today.borrowed, 3)
  expectEqual('dashboard.today.returned == 2', overview.today.returned, 2)
  check('dashboard.recentActivity tidak kosong', overview.recentActivity.length >= 1)

  await prisma.$disconnect()
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
