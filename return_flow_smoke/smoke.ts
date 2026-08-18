import { ReturnService } from '../src/main/services/return.service'
import { BorrowService } from '../src/main/services/borrow.service'
import { BorrowRepository } from '../src/main/repositories/borrow.repository'
import { BorrowDetailRepository } from '../src/main/repositories/borrow-detail.repository'
import { BookCopyRepository } from '../src/main/repositories/book-copy.repository'
import { MemberRepository } from '../src/main/repositories/member.repository'
import { EnrollmentService } from '../src/main/services/enrollment.service'
import { EnrollmentRepository } from '../src/main/repositories/enrollment.repository'
import { ClassRepository } from '../src/main/repositories/class.repository'
import { getPrisma } from '../src/main/repositories/base/prisma'
import { BOOK_COPY_STATUS } from '../src/shared/config/book-copy-status'

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
  const borrowRepo = new BorrowRepository()
  const borrowService = new BorrowService(
    borrowRepo,
    new BorrowDetailRepository(),
    memberRepo,
    new BookCopyRepository(),
    enrollmentService
  )
  const returnService = new ReturnService(
    borrowRepo,
    new BorrowDetailRepository(),
    new BookCopyRepository()
  )

  // --- Seed ---
  console.log('--- SEED: member, enrollment, 4 copies ---')
  const m1 = await prisma.member.create({
    data: { memberNumber: 'S-000100', fullName: 'Return Tester', memberType: 'student', status: 'ACTIVE' }
  })
  const curriculum = await prisma.curriculum.create({ data: { name: 'RETURN-FLOW-TEST' } })
  const year = await prisma.academicYear.create({
    data: { name: '2099/2100', startDate: new Date('2099-07-01'), endDate: new Date('2100-06-30'), isActive: true }
  })
  const cls = await prisma.class.create({
    data: { academicYearId: year.id, curriculumId: curriculum.id, educationLevel: 'X', parallel: 'Z', homeroomTeacher: null, isActive: true }
  })
  await prisma.memberEnrollment.create({
    data: { memberId: m1.id, classId: cls.id, academicYearId: year.id, status: 'ACTIVE', enrolledAt: new Date(), leftAt: null }
  })

  const book = await prisma.book.create({ data: { title: 'Return Flow Test Book' } })
  const copyIds: string[] = []
  for (let i = 1; i <= 4; i++) {
    const c = await prisma.bookCopy.create({
      data: { bookId: book.id, inventoryNumber: `INV-RF00${i}`, barcode: `BC-RF00${i}`, shelfLocation: 'R1', status: BOOK_COPY_STATUS.AVAILABLE }
    })
    copyIds.push(c.id)
  }
  check('seed complete', copyIds.length === 4)

  // --- Create borrow with 3 books ---
  console.log('--- STEP 1: create borrow with 3 books ---')
  const borrow1 = await borrowService.create({ memberId: m1.id, dueDate: futureDate(), bookCopyIds: copyIds.slice(0, 3) })
  expectEqual('borrow created with 3 items', borrow1.totalItems, 3)
  expectEqual('borrow status ACTIVE', borrow1.status, 'ACTIVE')
  const borrowNumber = borrow1.borrowingNumber

  // Verify copies are BORROWED
  for (const cid of copyIds.slice(0, 3)) {
    const c = await prisma.bookCopy.findUnique({ where: { id: cid } })
    expectEqual(`copy ${cid.slice(-4)} BORROWED`, c?.status, 'BORROWED')
  }
  expectEqual('copy4 still AVAILABLE', (await prisma.bookCopy.findUnique({ where: { id: copyIds[3] } }))?.status, 'AVAILABLE')

  // --- findByBorrowNumber ---
  console.log('--- STEP 2: findByBorrowNumber ---')
  const found = await returnService.findByBorrowNumber(borrowNumber)
  expectEqual('found.id == borrow1.id', found.id, borrow1.id)
  expectEqual('found.borrowingNumber', found.borrowingNumber, borrowNumber)
  expectEqual('found.items.length', found.items.length, 3)
  expectEqual('all items BORROWED', found.items.every((i) => i.status === 'BORROWED'), true)

  await expectRejected(
    'findByBorrowNumber nonexistent → 404',
    () => returnService.findByBorrowNumber('PJ000000000'),
    'tidak ditemukan'
  )

  // --- batchReturn: partial (1 book) ---
  console.log('--- STEP 3: batchReturn partial (1 of 3 books) ---')
  const detail1 = found.items[0]
  const partial = await returnService.batchReturn({
    borrowingId: borrow1.id,
    books: [{ borrowDetailId: detail1.id, condition: 'BAIK' }]
  })
  expectEqual('returnedCount=1', partial.returnedCount, 1)
  expectEqual('stillBorrowedCount=2', partial.stillBorrowedCount, 2)
  expectEqual('borrow STILL ACTIVE (partial)', partial.borrowing.status, 'ACTIVE')
  expectEqual('partial returned item RETURNED', partial.borrowing.items.find((i) => i.id === detail1.id)?.status, 'RETURNED')
  expectEqual('copy1 back to AVAILABLE', (await prisma.bookCopy.findUnique({ where: { id: detail1.bookCopyId } }))?.status, 'AVAILABLE')
  const rawBorrow = await prisma.borrow.findUnique({ where: { id: borrow1.id } })
  expectEqual('borrow.returnDate still null', rawBorrow?.returnDate, null)

  // --- batchReturn: already-returned rejected ---
  console.log('--- STEP 4: batchReturn on already-returned → rejected ---')
  await expectRejected(
    'batchReturn already-returned detail',
    () => returnService.batchReturn({ borrowingId: borrow1.id, books: [{ borrowDetailId: detail1.id, condition: 'BAIK' }] }),
    'sudah dikembalikan'
  )

  // --- batchReturn: wrong borrowingId → rejected ---
  console.log('--- STEP 5: batchReturn with wrong borrowingId → rejected ---')
  const detail2 = found.items[1]
  await expectRejected(
    'batchReturn detail from wrong borrowing',
    () => returnService.batchReturn({ borrowingId: '00000000-0000-0000-0000-000000000000', books: [{ borrowDetailId: detail2.id, condition: 'BAIK' }] }),
    'tidak ditemukan'
  )

  // --- batchReturn: return remaining 2 books (full) ---
  console.log('--- STEP 6: batchReturn remaining 2 → COMPLETED ---')
  const full = await returnService.batchReturn({
    borrowingId: borrow1.id,
    books: [
      { borrowDetailId: detail2.id, condition: 'BAIK' },
      { borrowDetailId: found.items[2].id, condition: 'RUSAK' }
    ]
  })
  expectEqual('returnedCount=2', full.returnedCount, 2)
  expectEqual('stillBorrowedCount=0', full.stillBorrowedCount, 0)
  expectEqual('borrow COMPLETED (all returned)', full.borrowing.status, 'COMPLETED')
  expectEqual('borrow.returnDate is set', (await prisma.borrow.findUnique({ where: { id: borrow1.id } }))?.returnDate !== null, true)
  expectEqual('copy2 back to AVAILABLE', (await prisma.bookCopy.findUnique({ where: { id: detail2.bookCopyId } }))?.status, 'AVAILABLE')

  // --- findByBorrowNumber on COMPLETED → 404 ---
  console.log('--- STEP 6b: findByBorrowNumber on COMPLETED → rejected ---')
  await expectRejected(
    'findByBorrowNumber COMPLETED → 404',
    () => returnService.findByBorrowNumber(borrowNumber),
    'tidak ditemukan atau sudah dikembalikan'
  )

  // --- batchReturn: HILANG condition → LOST ---
  console.log('--- STEP 7: batchReturn with HILANG → LOST ---')
  const borrow2 = await borrowService.create({ memberId: m1.id, dueDate: futureDate(), bookCopyIds: [copyIds[3]] })
  const found2 = await returnService.findByBorrowNumber(borrow2.borrowingNumber)
  const lostBook = found2.items[0]
  const lostResult = await returnService.batchReturn({
    borrowingId: borrow2.id,
    books: [{ borrowDetailId: lostBook.id, condition: 'HILANG' }]
  })
  expectEqual('copy4 status LOST', (await prisma.bookCopy.findUnique({ where: { id: copyIds[3] } }))?.status, 'LOST')
  expectEqual('conditionBack = HILANG', lostResult.borrowing.items[0].condition, 'HILANG')
  expectEqual('single book → COMPLETED', lostResult.borrowing.status, 'COMPLETED')

  // --- ATOMIC ROLLBACK TEST (STEP 8) ---
  console.log('--- STEP 8: atomic rollback — inject failure mid-batch ---')
  // copyIds[0..1] are AVAILABLE after STEP 6, copyIds[2] AVAILABLE after STEP 6,
  // copyIds[3] is LOST after STEP 7.  Create a fresh borrow with 2 available copies.
  const borrow3 = await borrowService.create({
    memberId: m1.id,
    dueDate: futureDate(),
    bookCopyIds: [copyIds[0], copyIds[1]]
  })
  expectEqual('borrow3 created', borrow3.totalItems, 2)
  expectEqual('borrow3 ACTIVE', borrow3.status, 'ACTIVE')

  // Snapshot pre-return state
  const copy0Before = await prisma.bookCopy.findUnique({ where: { id: copyIds[0] } })
  const copy1Before = await prisma.bookCopy.findUnique({ where: { id: copyIds[1] } })
  expectEqual('copy0 BORROWED before rollback test', copy0Before?.status, 'BORROWED')
  expectEqual('copy1 BORROWED before rollback test', copy1Before?.status, 'BORROWED')

  const found3 = await returnService.findByBorrowNumber(borrow3.borrowingNumber)
  expectEqual('borrow3 has 2 items', found3.items.length, 2)

  // --- Inject failure: intercept $transaction to throw on 2nd borrowDetail.update ---
  const realPrisma = getPrisma()
  const origTxMethod = (realPrisma as any).$transaction.bind(realPrisma)
  let detailUpdateCount = 0

  ;(realPrisma as any).$transaction = async (fn: (tx: any) => Promise<any>, opts?: any) => {
    return origTxMethod(async (tx: any) => {
      // Wrap borrowDetail.update to count calls and throw on #2
      const origBorrowDetailUpdate = tx.borrowDetail.update.bind(tx.borrowDetail)
      tx.borrowDetail.update = async (args: any) => {
        detailUpdateCount++
        if (detailUpdateCount === 2) {
          throw new Error('INJECTED: atomic rollback test failure')
        }
        return origBorrowDetailUpdate(args)
      }
      return fn(tx)
    }, opts)
  }

  // batchReturn must fail
  await expectRejected(
    'batchReturn rolls back on mid-transaction error',
    () =>
      returnService.batchReturn({
        borrowingId: borrow3.id,
        books: [
          { borrowDetailId: found3.items[0].id, condition: 'BAIK' },
          { borrowDetailId: found3.items[1].id, condition: 'BAIK' }
        ]
      }),
    'INJECTED'
  )

  // Restore original $transaction
  ;(realPrisma as any).$transaction = origTxMethod

  // Verify injection actually happened (1st update succeeded but was rolled back)
  check('injection triggered (detailUpdateCount=2)', detailUpdateCount === 2, `actual=${detailUpdateCount}`)

  // --- Verify ALL state unchanged — full rollback ---
  const copy0After = await prisma.bookCopy.findUnique({ where: { id: copyIds[0] } })
  const copy1After = await prisma.bookCopy.findUnique({ where: { id: copyIds[1] } })
  expectEqual('rollback: copy0 still BORROWED', copy0After?.status, 'BORROWED')
  expectEqual('rollback: copy1 still BORROWED', copy1After?.status, 'BORROWED')
  expectEqual(
    'rollback: copy0 status unchanged',
    copy0After?.status,
    copy0Before?.status
  )
  expectEqual(
    'rollback: copy1 status unchanged',
    copy1After?.status,
    copy1Before?.status
  )

  const borrow3Raw = await prisma.borrow.findUnique({ where: { id: borrow3.id } })
  expectEqual('rollback: borrow.returnDate still null', borrow3Raw?.returnDate, null)

  const detail0After = await prisma.borrowDetail.findUnique({ where: { id: found3.items[0].id } })
  const detail1After = await prisma.borrowDetail.findUnique({ where: { id: found3.items[1].id } })
  expectEqual('rollback: detail0.returnedAt still null', detail0After?.returnedAt, null)
  expectEqual('rollback: detail1.returnedAt still null', detail1After?.returnedAt, null)
  expectEqual('rollback: detail0.conditionBack still null', detail0After?.conditionBack, null)
  expectEqual('rollback: detail1.conditionBack still null', detail1After?.conditionBack, null)

  // Borrow still ACTIVE (not COMPLETED)
  const found3After = await returnService.findByBorrowNumber(borrow3.borrowingNumber)
  expectEqual('rollback: borrow still ACTIVE via service', found3After.status, 'ACTIVE')
  expectEqual('rollback: both items still BORROWED via service', found3After.items.every((i) => i.status === 'BORROWED'), true)

  // --- Summary ---
  await prisma.$disconnect()
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
