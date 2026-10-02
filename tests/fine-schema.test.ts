import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { getPrisma } from '../src/main/repositories/base/prisma'

const prisma = getPrisma()

async function cleanup() {
  await prisma.fine.deleteMany()
  await prisma.borrowDetail.deleteMany()
  await prisma.borrow.deleteMany()
  await prisma.memberEnrollment.deleteMany()
  await prisma.bookCopy.deleteMany()
  await prisma.book.deleteMany()
  await prisma.member.deleteMany()
  await prisma.class.deleteMany()
  await prisma.curriculum.deleteMany()
  await prisma.academicYear.deleteMany()
  await prisma.inventorySequence.deleteMany()
  await prisma.setting.deleteMany()
}

async function createBaseData() {
  const member = await prisma.member.create({
    data: {
      memberNumber: 'S-000001',
      memberType: 'student',
      fullName: 'Test Student',
      status: 'ACTIVE',
    },
  })

  const book = await prisma.book.create({
    data: {
      title: 'Test Book',
      isbn: '978-1234567890',
    },
  })

  const copy1 = await prisma.bookCopy.create({
    data: {
      bookId: book.id,
      inventoryNumber: 'INV-000001',
      barcode: 'INV-000001',
      status: 'AVAILABLE',
      condition: 'GOOD',
      shelfLocation: 'Rak A',
    },
  })

  const copy2 = await prisma.bookCopy.create({
    data: {
      bookId: book.id,
      inventoryNumber: 'INV-000002',
      barcode: 'INV-000002',
      status: 'AVAILABLE',
      condition: 'GOOD',
      shelfLocation: 'Rak A',
    },
  })

  return { member, book, copy1, copy2 }
}

let borrowSeq = 0

async function createBorrow(memberId: string) {
  borrowSeq += 1
  return prisma.borrow.create({
    data: {
      borrowNumber: `PJ-FINE-${Date.now()}-${borrowSeq}`,
      memberId,
      borrowDate: new Date(),
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      memberName: 'Test Student',
      memberNumber: 'S-000001',
    },
  })
}

async function createBorrowDetail(borrowId: string, bookCopyId: string) {
  return prisma.borrowDetail.create({
    data: {
      borrowId,
      bookCopyId,
      bookTitle: 'Test Book',
    },
  })
}

describe('Fine schema', () => {
  beforeEach(async () => {
    await cleanup()
  })

  afterAll(async () => {
    await cleanup()
    await prisma.$disconnect()
  })

  it('1. should create a LATE Fine without borrowDetailId and read it back with the same values', async () => {
    const { member } = await createBaseData()
    const borrow = await createBorrow(member.id)

    const created = await prisma.fine.create({
      data: {
        borrowId: borrow.id,
        type: 'LATE',
        amount: 5000,
        lateDays: 3,
        ratePerDay: 1000,
        dedupeKey: `LATE:${borrow.id}`,
      },
    })

    expect(created.borrowDetailId).toBeNull()

    const found = await prisma.fine.findUnique({
      where: { dedupeKey: `LATE:${borrow.id}` },
    })
    expect(found).not.toBeNull()
    expect(found?.borrowId).toBe(borrow.id)
    expect(found?.borrowDetailId).toBeNull()
    expect(found?.type).toBe('LATE')
    expect(found?.amount).toBe(5000)
    expect(found?.lateDays).toBe(3)
    expect(found?.ratePerDay).toBe(1000)
    expect(found?.dedupeKey).toBe(`LATE:${borrow.id}`)
  })

  it('2. should reject a second Fine with the same dedupeKey (LATE:<borrowId> and DETAIL:<borrowDetailId>)', async () => {
    const { member, copy1 } = await createBaseData()
    const borrow = await createBorrow(member.id)
    const detail = await createBorrowDetail(borrow.id, copy1.id)

    // Kasus 1: LATE:<borrowId>
    await prisma.fine.create({
      data: {
        borrowId: borrow.id,
        type: 'LATE',
        amount: 1000,
        dedupeKey: `LATE:${borrow.id}`,
      },
    })
    await expect(
      prisma.fine.create({
        data: {
          borrowId: borrow.id,
          type: 'LATE',
          amount: 1000,
          dedupeKey: `LATE:${borrow.id}`,
        },
      })
    ).rejects.toMatchObject({ code: 'P2002' })

    // Kasus 2: DETAIL:<borrowDetailId>
    await prisma.fine.create({
      data: {
        borrowId: borrow.id,
        borrowDetailId: detail.id,
        type: 'HEAVY_DAMAGE',
        amount: 25000,
        dedupeKey: `DETAIL:${detail.id}`,
      },
    })
    await expect(
      prisma.fine.create({
        data: {
          borrowId: borrow.id,
          borrowDetailId: detail.id,
          type: 'HEAVY_DAMAGE',
          amount: 25000,
          dedupeKey: `DETAIL:${detail.id}`,
        },
      })
    ).rejects.toMatchObject({ code: 'P2002' })
  })

  it('3. should allow two LATE Fines for two different Borrows (different dedupeKey)', async () => {
    const { member, copy1, copy2 } = await createBaseData()
    const borrow1 = await createBorrow(member.id)
    const borrow2 = await createBorrow(member.id)
    const detail1 = await createBorrowDetail(borrow1.id, copy1.id)
    const detail2 = await createBorrowDetail(borrow2.id, copy2.id)

    await prisma.fine.create({
      data: {
        borrowId: borrow1.id,
        borrowDetailId: detail1.id,
        type: 'LATE',
        amount: 1000,
        lateDays: 1,
        ratePerDay: 1000,
        dedupeKey: `LATE:${borrow1.id}`,
      },
    })
    await prisma.fine.create({
      data: {
        borrowId: borrow2.id,
        borrowDetailId: detail2.id,
        type: 'LATE',
        amount: 2000,
        lateDays: 2,
        ratePerDay: 1000,
        dedupeKey: `LATE:${borrow2.id}`,
      },
    })

    const count = await prisma.fine.count()
    expect(count).toBe(2)

    const fine1 = await prisma.fine.findUnique({ where: { dedupeKey: `LATE:${borrow1.id}` } })
    const fine2 = await prisma.fine.findUnique({ where: { dedupeKey: `LATE:${borrow2.id}` } })
    expect(fine1?.borrowId).toBe(borrow1.id)
    expect(fine2?.borrowId).toBe(borrow2.id)
  })

  it('4. should default status to UNPAID when not provided', async () => {
    const { member } = await createBaseData()
    const borrow = await createBorrow(member.id)

    const created = await prisma.fine.create({
      data: {
        borrowId: borrow.id,
        type: 'LOST',
        amount: 50000,
        dedupeKey: `LOST:${borrow.id}`,
      },
    })

    expect(created.status).toBe('UNPAID')
  })

  it('5. should reject deleting a Borrow or BorrowDetail that still has a Fine (onDelete Restrict)', async () => {
    const { member, copy1 } = await createBaseData()
    const borrow = await createBorrow(member.id)
    const detail = await createBorrowDetail(borrow.id, copy1.id)

    await prisma.fine.create({
      data: {
        borrowId: borrow.id,
        type: 'LATE',
        amount: 1000,
        dedupeKey: `LATE:${borrow.id}`,
      },
    })

    await expect(
      prisma.borrow.delete({ where: { id: borrow.id } })
    ).rejects.toMatchObject({ code: 'P2003' })
    expect(await prisma.borrow.findUnique({ where: { id: borrow.id } })).not.toBeNull()

    await prisma.fine.create({
      data: {
        borrowId: borrow.id,
        borrowDetailId: detail.id,
        type: 'HEAVY_DAMAGE',
        amount: 20000,
        dedupeKey: `DETAIL:${detail.id}`,
      },
    })

    await expect(
      prisma.borrowDetail.delete({ where: { id: detail.id } })
    ).rejects.toMatchObject({ code: 'P2003' })
    expect(await prisma.borrowDetail.findUnique({ where: { id: detail.id } })).not.toBeNull()
  })
})
