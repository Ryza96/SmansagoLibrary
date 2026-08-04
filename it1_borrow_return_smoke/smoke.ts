import { BorrowService } from '../src/main/services/borrow.service'
import { BorrowRepository } from '../src/main/repositories/borrow.repository'
import { BorrowDetailRepository } from '../src/main/repositories/borrow-detail.repository'
import { ReturnService } from '../src/main/services/return.service'
import { BookCopyRepository } from '../src/main/repositories/book-copy.repository'
import { BookCopyService } from '../src/main/services/book-copy.service'
import { MemberRepository } from '../src/main/repositories/member.repository'
import { EnrollmentService } from '../src/main/services/enrollment.service'
import { EnrollmentRepository } from '../src/main/repositories/enrollment.repository'
import { ClassRepository } from '../src/main/repositories/class.repository'
import { getPrisma } from '../src/main/repositories/base/prisma'
import { BOOK_COPY_STATUS, canTransitionStatus } from '../src/shared/config/book-copy-status'

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
  const bookCopyService = new BookCopyService(new BookCopyRepository())
  const borrowRepo = new BorrowRepository()

  console.log('--- STEP 0: seed fresh DB ---')
  const m1 = await prisma.member.create({
    data: { memberNumber: 'S-000001', fullName: 'Siswa Satu', memberType: 'student', status: 'ACTIVE' }
  })
  const m2 = await prisma.member.create({
    data: { memberNumber: 'S-000002', fullName: 'Siswa Dua', memberType: 'student', status: 'ACTIVE' }
  })
  const book = await prisma.book.create({ data: { title: 'Buku Uji IT-1' } })
  async function makeCopy(invNum: string): Promise<string> {
    const c = await prisma.bookCopy.create({
      data: { bookId: book.id, inventoryNumber: invNum, barcode: invNum, shelfLocation: 'R1', status: BOOK_COPY_STATUS.AVAILABLE }
    })
    return c.id
  }
  const copy1 = await makeCopy('INV-000001')
  const copy2 = await makeCopy('INV-000002')
  const copy3 = await makeCopy('INV-000003')
  const copy4 = await makeCopy('INV-000004')
  const copy5 = await makeCopy('INV-000005')
  const copy6 = await makeCopy('INV-000006')
  check('seed: 2 member + 1 buku + 6 eksemplar AVAILABLE', m1.id !== '' && copy1 !== copy2)

  console.log('--- STEP 1: double-borrow ditolak (service guard) ---')
  const borrow1 = await borrowService.create({ memberId: m1.id, dueDate: futureDate(), bookCopyIds: [copy1] })
  const copy1After = await prisma.bookCopy.findUnique({ where: { id: copy1 } })
  expectEqual('copy1 status BORROWED', copy1After?.status, 'BORROWED')
  await expectRejected(
    'borrow copy1 oleh m2 ditolak',
    () => borrowService.create({ memberId: m2.id, dueDate: futureDate(), bookCopyIds: [copy1] }),
    'sedang tidak tersedia'
  )
  expectEqual('total borrow tetap 1', await borrowRepo.count(), 1)
  expectEqual('total borrowDetail tetap 1', await new BorrowDetailRepository().count(), 1)

  console.log('--- STEP 2: guard ATOMIK in-transaction (bypass pre-check) ---')
  await expectRejected(
    'createWithItems [copy2 AVAILABLE, copy1 BORROWED] dibatalkan atomik',
    () =>
      borrowRepo.createWithItems(
        {
          borrowNumber: 'PJ/202608/TEST2',
          memberId: m2.id,
          memberName: 'Siswa Dua',
          memberNumber: 'S-000002',
          borrowDate: new Date(),
          dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000)
        },
        [
          { bookCopyId: copy2, bookTitle: 'Buku Uji IT-1' },
          { bookCopyId: copy1, bookTitle: 'Buku Uji IT-1' }
        ]
      ),
    'tidak tersedia'
  )
  expectEqual('rollback: total borrow tetap 1', await borrowRepo.count(), 1)
  expectEqual('rollback: total borrowDetail tetap 1', await new BorrowDetailRepository().count(), 1)
  const copy2After = await prisma.bookCopy.findUnique({ where: { id: copy2 } })
  expectEqual('copy2 tetap AVAILABLE (tidak semi-ter-borrow)', copy2After?.status, 'AVAILABLE')
  const copy1After2 = await prisma.bookCopy.findUnique({ where: { id: copy1 } })
  expectEqual('copy1 tetap BORROWED', copy1After2?.status, 'BORROWED')

  console.log('--- STEP 3: decommission DITOLAK saat BORROWED (keputusan PO #2) ---')
  await expectRejected(
    'decommission copy1 (BORROWED) ditolak',
    () => bookCopyService.decommissionCopy(copy1),
    'sedang dipinjam'
  )
  const copy1After3 = await prisma.bookCopy.findUnique({ where: { id: copy1 } })
  expectEqual('copy1 tetap BORROWED setelah decommission ditolak', copy1After3?.status, 'BORROWED')

  console.log('--- STEP 4: return normal → AVAILABLE ---')
  const returned = await returnService.returnBook({ bookCopyId: copy1, condition: 'BAIK', notes: null })
  const copy1After4 = await prisma.bookCopy.findUnique({ where: { id: copy1 } })
  expectEqual('copy1 status AVAILABLE setelah return', copy1After4?.status, 'AVAILABLE')
  expectEqual('return borrow status COMPLETED', returned.status, 'COMPLETED')
  const detail1 = await prisma.borrowDetail.findFirst({ where: { bookCopyId: copy1, returnedAt: { not: null } } })
  expectEqual('conditionBack disimpan BAIK', detail1?.conditionBack, 'BAIK')

  console.log('--- STEP 5: return HILANG → LOST + conditionBack HILANG (keputusan PO #1) ---')
  await borrowService.create({ memberId: m2.id, dueDate: futureDate(), bookCopyIds: [copy2] })
  await returnService.returnBook({ bookCopyId: copy2, condition: 'HILANG', notes: null })
  const copy2After5 = await prisma.bookCopy.findUnique({ where: { id: copy2 } })
  expectEqual('copy2 status LOST', copy2After5?.status, 'LOST')
  const detail2 = await prisma.borrowDetail.findFirst({ where: { bookCopyId: copy2, returnedAt: { not: null } } })
  expectEqual('conditionBack tetap HILANG (audit)', detail2?.conditionBack, 'HILANG')

  console.log('--- STEP 6: decommission LOST → REMOVED ---')
  await bookCopyService.decommissionCopy(copy2)
  const copy2After6 = await prisma.bookCopy.findUnique({ where: { id: copy2 } })
  expectEqual('copy2 status REMOVED (row tetap ada, punya history)', copy2After6?.status, 'REMOVED')

  console.log('--- STEP 7: decommission AVAILABLE tanpa history → DELETE ---')
  await bookCopyService.decommissionCopy(copy3)
  const copy3After = await prisma.bookCopy.findUnique({ where: { id: copy3 } })
  expectEqual('copy3 terhapus fisik (tanpa history)', copy3After, null)

  console.log('--- STEP 8: decommission AVAILABLE dengan history → REMOVED ---')
  await borrowService.create({ memberId: m1.id, dueDate: futureDate(), bookCopyIds: [copy4] })
  await returnService.returnBook({ bookCopyId: copy4, condition: 'BAIK', notes: null })
  await bookCopyService.decommissionCopy(copy4)
  const copy4After = await prisma.bookCopy.findUnique({ where: { id: copy4 } })
  expectEqual('copy4 status REMOVED (punya history, tidak dihapus)', copy4After?.status, 'REMOVED')

  console.log('--- STEP 9: return pada copy REMOVED → TIDAK resurrection ---')
  await borrowService.create({ memberId: m1.id, dueDate: futureDate(), bookCopyIds: [copy5] })
  await prisma.bookCopy.update({ where: { id: copy5 }, data: { status: BOOK_COPY_STATUS.REMOVED } })
  await returnService.returnBook({ bookCopyId: copy5, condition: 'BAIK', notes: null })
  const copy5After = await prisma.bookCopy.findUnique({ where: { id: copy5 } })
  expectEqual('copy5 tetap REMOVED (tidak kembali AVAILABLE)', copy5After?.status, 'REMOVED')
  const borrow5 = await prisma.borrow.findFirst({
    where: { details: { some: { bookCopyId: copy5 } } }
  })
  expectEqual('borrow copy5 tetap COMPLETED', borrow5?.returnDate !== null, true)

  console.log('--- STEP 10: return buku tidak sedang dipinjam ditolak ---')
  await expectRejected(
    'return copy5 (sudah dikembalikan) ditolak',
    () => returnService.returnBook({ bookCopyId: copy5, condition: 'BAIK', notes: null }),
    'tidak sedang dipinjam'
  )
  await expectRejected(
    'return copy6 (tidak pernah dipinjam) ditolak',
    () => returnService.returnBook({ bookCopyId: copy6, condition: 'BAIK', notes: null }),
    'tidak sedang dipinjam'
  )

  console.log('--- STEP 11: matriks transisi SATU otoritas ---')
  check('AVAILABLE→BORROWED legal', canTransitionStatus('AVAILABLE', 'BORROWED'))
  check('AVAILABLE→LOST legal', canTransitionStatus('AVAILABLE', 'LOST'))
  check('AVAILABLE→REMOVED legal', canTransitionStatus('AVAILABLE', 'REMOVED'))
  check('BORROWED→AVAILABLE legal', canTransitionStatus('BORROWED', 'AVAILABLE'))
  check('BORROWED→LOST legal', canTransitionStatus('BORROWED', 'LOST'))
  check('BORROWED→REMOVED DILARANG (keputusan PO #2)', !canTransitionStatus('BORROWED', 'REMOVED'))
  check('LOST→REMOVED legal', canTransitionStatus('LOST', 'REMOVED'))
  check('LOST→AVAILABLE DILARANG', !canTransitionStatus('LOST', 'AVAILABLE'))
  check('REMOVED→AVAILABLE DILARANG (no resurrection)', !canTransitionStatus('REMOVED', 'AVAILABLE'))
  check('same-status dianggap legal (no-op)', canTransitionStatus('BORROWED', 'BORROWED'))

  await prisma.$disconnect()
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
