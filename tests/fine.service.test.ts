import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { getPrisma } from '../src/main/repositories/base/prisma'
import { FineService } from '../src/main/services/fine.service'

const prisma = getPrisma()
const service = new FineService()

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

async function seed() {
  const member = await prisma.member.create({ data: { memberNumber: 'S-1', memberType: 'student', fullName: 'Andi', status: 'ACTIVE' } })
  const book = await prisma.book.create({ data: { title: 'B' } })
  const copy = await prisma.bookCopy.create({ data: { bookId: book.id, inventoryNumber: 'INV-1', barcode: 'INV-1', status: 'BORROWED', condition: 'GOOD', shelfLocation: 'R' } })
  const borrow = await prisma.borrow.create({ data: { borrowNumber: 'PJ/1', memberId: member.id, borrowDate: new Date(), dueDate: new Date(), memberName: 'Andi', memberNumber: 'S-1' } })
  const detail = await prisma.borrowDetail.create({ data: { borrowId: borrow.id, bookCopyId: copy.id, bookTitle: 'B' } })
  const late = await prisma.fine.create({ data: { borrowId: borrow.id, type: 'LATE', amount: 5000, status: 'UNPAID', dedupeKey: `LATE:${borrow.id}` } })
  const damage = await prisma.fine.create({ data: { borrowId: borrow.id, borrowDetailId: detail.id, type: 'HEAVY_DAMAGE', amount: 75000, status: 'UNPAID', dedupeKey: `DETAIL:${detail.id}` } })
  return { member, borrow, detail, late, damage }
}

beforeEach(async () => {
  await cleanup()
})

afterAll(async () => {
  await cleanup()
  await prisma.$disconnect()
})

describe('FineService', () => {
  it('(a) list tanpa filter', async () => {
    await seed()
    const rows = await service.list()
    expect(rows.length).toBe(2)
  })

  it('(b) filter status UNPAID', async () => {
    const { damage } = await seed()
    await service.markPaid(damage.id)
    const rows = await service.list({ status: 'UNPAID' })
    expect(rows.length).toBe(1)
    expect(rows[0].status).toBe('UNPAID')
  })

  it('(c) search nama anggota dan nomor peminjaman', async () => {
    await seed()
    expect((await service.list({ search: 'Andi' })).length).toBe(2)
    expect((await service.list({ search: 'PJ/1' })).length).toBe(2)
    expect((await service.list({ search: 'tidakada' })).length).toBe(0)
  })

  it('(d) markPaid mengubah ke PAID, mengisi paidAt, amount tetap', async () => {
    const { damage } = await seed()
    await service.markPaid(damage.id)
    const row = await prisma.fine.findUnique({ where: { id: damage.id } })
    expect(row?.status).toBe('PAID')
    expect(row?.paidAt).not.toBeNull()
    expect(row?.amount).toBe(75000)
  })

  it('(e) markPaid dua kali → error pada panggilan kedua', async () => {
    const { damage } = await seed()
    await service.markPaid(damage.id)
    await expect(service.markPaid(damage.id)).rejects.toThrow()
  })

  it('(f) waive tanpa alasan / spasi saja → error, status tetap UNPAID', async () => {
    const { late } = await seed()
    await expect(service.waive(late.id, '')).rejects.toThrow()
    await expect(service.waive(late.id, '   ')).rejects.toThrow()
    expect((await prisma.fine.findUnique({ where: { id: late.id } }))?.status).toBe('UNPAID')
  })

  it('(g) waive dengan alasan → WAIVED, waivedReason tersimpan', async () => {
    const { late } = await seed()
    await service.waive(late.id, 'Buku tidak hilang')
    const row = await prisma.fine.findUnique({ where: { id: late.id } })
    expect(row?.status).toBe('WAIVED')
    expect(row?.waivedReason).toBe('Buku tidak hilang')
  })

  it('(h) markPaid/waive pada denda PAID atau WAIVED → error', async () => {
    const { damage, late } = await seed()
    await service.markPaid(damage.id)
    await service.waive(late.id, 'alasan')
    await expect(service.markPaid(damage.id)).rejects.toThrow()
    await expect(service.waive(damage.id, 'x')).rejects.toThrow()
    await expect(service.markPaid(late.id)).rejects.toThrow()
    await expect(service.waive(late.id, 'x')).rejects.toThrow()
  })

  it('(i) id tidak ada → error', async () => {
    await expect(service.markPaid('nope')).rejects.toThrow('Denda tidak ditemukan.')
    await expect(service.waive('nope', 'alasan')).rejects.toThrow('Denda tidak ditemukan.')
  })

  it('(j) bookTitle terisi untuk rusak/hilang, kosong untuk LATE', async () => {
    await seed()
    const rows = await service.list()
    const late = rows.find((r) => r.type === 'LATE')
    const damage = rows.find((r) => r.type === 'HEAVY_DAMAGE')
    expect(damage?.bookTitle).toBe('B')
    expect(late?.bookTitle ?? null).toBeNull()
  })
})
