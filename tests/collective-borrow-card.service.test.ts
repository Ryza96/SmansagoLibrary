import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { getPrisma } from '../src/main/repositories/base/prisma'
import { BorrowRepository } from '../src/main/repositories/borrow.repository'
import { BorrowDetailRepository } from '../src/main/repositories/borrow-detail.repository'
import { MemberRepository } from '../src/main/repositories/member.repository'
import { BookCopyRepository } from '../src/main/repositories/book-copy.repository'
import { BookRepository } from '../src/main/repositories/book.repository'
import { ClassRepository } from '../src/main/repositories/class.repository'
import { CollectiveBorrowService } from '../src/main/services/collective-borrow.service'
import { ReturnService } from '../src/main/services/return.service'
import {
  buildCollectiveCardData,
  generateCollectiveCardHtml,
  CollectiveBorrowCardService
} from '../src/main/services/collective-borrow-card.service'
import { buildBorrowCardData, generateBorrowCardHtml } from '../src/main/services/borrow-card.service'
import { paginateCollectiveCardRows, COLLECTIVE_CARD_TERMS } from '../src/shared/config/collective-card'
import { buildCollectiveCardPdfFilename } from '../electron/main/services/print.service'

const prisma = getPrisma()
const stubDeps = { readFileAsDataUri: async (_p: string) => null }
const stubSettings = { libraryName: 'Perpus Test', schoolName: 'SMP Test', address: 'Jl. Test 1', logoPath: '', librarianName: 'Petugas' }

let seq = 0
const nextTag = () => `T${Date.now()}-${seq++}`

async function cleanup() {
  await prisma.borrowDetail.deleteMany()
  await prisma.fine.deleteMany()
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

async function createClass() {
  const academicYear = await prisma.academicYear.create({
    data: { name: `TA-${nextTag()}`, startDate: new Date('2026-07-01'), endDate: new Date('2027-06-30'), isActive: true }
  })
  const curriculum = await prisma.curriculum.create({ data: { name: `Kur-${nextTag()}` } })
  return prisma.class.create({
    data: { academicYearId: academicYear.id, curriculumId: curriculum.id, educationLevel: 'XI', parallel: '2', isActive: true }
  })
}

async function createTeacher(extra: Record<string, unknown> = {}) {
  const tag = nextTag()
  return prisma.member.create({
    data: { memberNumber: `G-${tag}`, memberType: 'teacher', fullName: 'Guru Kartu', status: 'ACTIVE', ...extra }
  })
}

async function createBookWithCopies(title: string, count: number) {
  const tag = nextTag()
  const book = await prisma.book.create({ data: { title: `${title} ${tag}` } })
  const copies = []
  for (let i = 0; i < count; i++) {
    const inv = `INV-${tag}-${String(i).padStart(3, '0')}`
    copies.push(
      await prisma.bookCopy.create({
        data: { bookId: book.id, inventoryNumber: inv, barcode: `BC-${inv}`, status: 'AVAILABLE', condition: 'GOOD', shelfLocation: 'Rak A' }
      })
    )
  }
  return { book, copies }
}

function createServices() {
  const borrowRepo = new BorrowRepository()
  const borrowDetailRepo = new BorrowDetailRepository()
  const memberRepo = new MemberRepository()
  const bookCopyRepo = new BookCopyRepository()
  const collective = new CollectiveBorrowService(borrowRepo, borrowDetailRepo, memberRepo, bookCopyRepo, new BookRepository(), new ClassRepository())
  const returnService = new ReturnService(borrowRepo, borrowDetailRepo, bookCopyRepo)
  const cardService = new CollectiveBorrowCardService(borrowRepo)
  return { collective, returnService, cardService }
}

const dueIn7Days = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

describe('CollectiveBorrowCardService', () => {
  beforeEach(async () => {
    await cleanup()
  })

  afterAll(async () => {
    await cleanup()
    await prisma.$disconnect()
  })

  it('404 bila Borrow tidak ditemukan', async () => {
    const { cardService } = createServices()
    await expect(cardService.getCollectiveCard('tidak-ada', stubSettings, stubDeps)).rejects.toThrow('tidak ditemukan')
  })

  it('INDIVIDUAL ditolak dengan 400', async () => {
    const { cardService } = createServices()
    const teacher = await createTeacher()
    const { copies } = await createBookWithCopies('Individu', 1)
    const borrow = await prisma.borrow.create({
      data: {
        borrowNumber: `PJ/209901/${nextTag()}`,
        memberId: teacher.id,
        borrowDate: new Date(),
        dueDate: new Date(Date.now() + 7 * 86400000),
        memberName: teacher.fullName,
        memberNumber: teacher.memberNumber,
        borrowType: 'INDIVIDUAL'
      }
    })
    await prisma.borrowDetail.create({ data: { borrowId: borrow.id, bookCopyId: copies[0].id, bookTitle: 'x' } })
    await expect(cardService.getCollectiveCard(borrow.id, stubSettings, stubDeps)).rejects.toThrow('kolektif')
  })

  it('data lengkap: guru, NIP, purpose, kelas, total, QR terisi', async () => {
    const { collective, cardService } = createServices()
    const teacher = await createTeacher({ nip: '198001012010011001' })
    const classEntity = await createClass()
    const { book } = await createBookWithCopies('Kolektif A', 3)
    const created = await collective.createCollective({
      memberId: teacher.id,
      purpose: 'Bimbel MTK',
      collectiveClassId: classEntity.id,
      titleQuantities: [{ bookId: book.id, quantity: 3 }]
    })
    const data = await cardService.getCollectiveCard(created.id, stubSettings, stubDeps)
    expect(data.teacher.fullName).toBe('Guru Kartu')
    expect(data.teacher.memberNumber).toBe(teacher.memberNumber)
    expect(data.teacher.identityNumber).toBe('198001012010011001')
    expect(data.borrow.purpose).toBe('Bimbel MTK')
    expect(data.borrow.collectiveClassName).toBe('XI 2')
    expect(data.summary.totalCopies).toBe(3)
    expect(data.summary.returnedCount).toBe(0)
    expect(data.summary.outstandingCount).toBe(3)
    expect(data.qrSvg).toContain('<svg')
    expect(data.printedAt).toBeDefined()
    expect(data.school.libraryName).toBe('Perpus Test')
  })

  it('identityNumber: NUPTK bila NIP kosong; memberNumber bila keduanya kosong', async () => {
    const { collective, cardService } = createServices()
    const t1 = await createTeacher({ nip: '', nuptk: '1234567890123456' })
    const t2 = await createTeacher({ nip: null, nuptk: null })
    const { book } = await createBookWithCopies('Identitas', 2)
    const c1 = await collective.createCollective({ memberId: t1.id, purpose: 'P1', titleQuantities: [{ bookId: book.id, quantity: 1 }] })
    const d1 = await cardService.getCollectiveCard(c1.id, stubSettings, stubDeps)
    expect(d1.teacher.identityNumber).toBe('1234567890123456')
    const c2 = await collective.createCollective({ memberId: t2.id, purpose: 'P2', titleQuantities: [{ bookId: book.id, quantity: 1 }] })
    const d2 = await cardService.getCollectiveCard(c2.id, stubSettings, stubDeps)
    expect(d2.teacher.identityNumber).toBe(t2.memberNumber)
  })

  it('kelas null bila tanpa collectiveClassId; eksemplar urut inventoryNumber', async () => {
    const { collective, cardService } = createServices()
    const teacher = await createTeacher()
    const { copies } = await createBookWithCopies('Urut', 3)
    const reversed = [...copies].reverse()
    const created = await collective.createCollective({
      memberId: teacher.id,
      purpose: 'Tanpa kelas',
      bookCopyIds: reversed.map((c) => c.id)
    })
    const data = await cardService.getCollectiveCard(created.id, stubSettings, stubDeps)
    expect(data.borrow.collectiveClassName).toBeNull()
    const invs = data.copies.map((c) => c.inventoryNumber)
    expect(invs).toEqual([...invs].sort())
    expect(data.copies.map((c) => c.sequence)).toEqual([1, 2, 3])
  })

  it('returnedAt terisi hanya untuk yang dikembalikan; ringkasan parsial benar', async () => {
    const { collective, returnService, cardService } = createServices()
    const teacher = await createTeacher()
    const { copies } = await createBookWithCopies('Parsial', 4)
    const created = await collective.createCollective({
      memberId: teacher.id,
      purpose: 'Parsial',
      bookCopyIds: copies.map((c) => c.id)
    })
    const details = await prisma.borrowDetail.findMany({ where: { borrowId: created.id } })
    await returnService.batchReturn({ borrowingId: created.id, books: [{ borrowDetailId: details[0].id, condition: 'BAIK' }] })
    const data = await cardService.getCollectiveCard(created.id, stubSettings, stubDeps)
    expect(data.summary.totalCopies).toBe(4)
    expect(data.summary.returnedCount).toBe(1)
    expect(data.summary.outstandingCount).toBe(3)
    const returned = data.copies.filter((c) => c.status === 'RETURNED')
    const borrowed = data.copies.filter((c) => c.status === 'BORROWED')
    expect(returned).toHaveLength(1)
    expect(borrowed).toHaveLength(3)
    expect(returned[0].returnedDate).toMatch(/^\d{2}-\d{2}-\d{4}$/)
    expect(borrowed.every((c) => c.returnedDate === '')).toBe(true)
  })
})

describe('paginateCollectiveCardRows', () => {
  it('1 eksemplar: satu halaman, tanda tangan di halaman terakhir', () => {
    expect(paginateCollectiveCardRows(1)).toEqual({ pages: [1], signaturePage: 'last' })
  })

  it('20 eksemplar: [19, 1], tanda tangan di halaman terakhir', () => {
    expect(paginateCollectiveCardRows(20)).toEqual({ pages: [19, 1], signaturePage: 'last' })
  })

  it('30 eksemplar: [19, 11], tanda tangan di halaman terakhir', () => {
    expect(paginateCollectiveCardRows(30)).toEqual({ pages: [19, 11], signaturePage: 'last' })
  })

  it('50 eksemplar: [19, 25, 6], tanda tangan di halaman terakhir', () => {
    expect(paginateCollectiveCardRows(50)).toEqual({ pages: [19, 25, 6], signaturePage: 'last' })
  })

  it('48 eksemplar: [19, 25, 4], tanda tangan di halaman terakhir', () => {
    expect(paginateCollectiveCardRows(48)).toEqual({ pages: [19, 25, 4], signaturePage: 'last' })
  })

  it('44 eksemplar: sisa 25 > 25-8 sehingga tanda tangan pindah halaman', () => {
    expect(paginateCollectiveCardRows(44)).toEqual({ pages: [19, 25], signaturePage: 'new' })
  })

  it('invarian 1..50: total baris utuh, urutan terjaga, tak ada halaman melebihi kapasitas', () => {
    for (let n = 1; n <= 50; n++) {
      const p = paginateCollectiveCardRows(n)
      expect(p.pages.reduce((a, b) => a + b, 0)).toBe(n)
      expect(p.pages.length).toBeGreaterThan(0)
      p.pages.forEach((rows, i) => {
        expect(rows).toBeGreaterThan(0)
        expect(rows).toBeLessThanOrEqual(i === 0 ? 19 : 25)
      })
    }
  })

  it('input tidak valid: pages kosong', () => {
    expect(paginateCollectiveCardRows(0)).toEqual({ pages: [], signaturePage: 'last' })
  })
})

describe('generateCollectiveCardHtml', () => {
  it('50 eksemplar: 3 halaman konten, tanpa baris hilang/duplikat, urutan terjaga', async () => {
    const { collective } = createServices()
    const teacher = await createTeacher()
    const { book } = await createBookWithCopies('HTML 50', 50)
    const created = await collective.createCollective({
      memberId: teacher.id,
      purpose: 'Uji HTML',
      titleQuantities: [{ bookId: book.id, quantity: 50 }]
    })
    const borrowing = await new BorrowRepository().findById(created.id)
    const data = await buildCollectiveCardData(borrowing!, stubSettings, stubDeps)
    const html = generateCollectiveCardHtml(data, { termsText: COLLECTIVE_CARD_TERMS })
    expect(html).toContain('KARTU PEMINJAMAN KOLEKTIF')
    expect(html).toContain(created.borrowingNumber)
    expect(html).toContain(COLLECTIVE_CARD_TERMS)
    expect(html).toContain(data.qrSvg.slice(0, 60))
    const sheets = html.split('class="a4-sheet"').length - 1
    expect(sheets).toBe(3)
    expect(html).toContain('Halaman 3 dari 3')
    const theads = (html.match(/<thead>/g) ?? []).length
    expect(theads).toBe(3)
    const seqs = [...html.matchAll(/<td class="c-no">(\d+)<\/td>/g)].map((m) => Number(m[1]))
    expect(seqs).toEqual(Array.from({ length: 50 }, (_, i) => i + 1))
    expect(html).toContain('<td class="c-title"><div class="ttl">')
  })

  it('tanda tangan pindah halaman baru bila halaman terakhir penuh', async () => {
    const { collective } = createServices()
    const teacher = await createTeacher()
    const { book } = await createBookWithCopies('HTML 44', 44)
    const created = await collective.createCollective({
      memberId: teacher.id,
      purpose: 'Uji sig',
      titleQuantities: [{ bookId: book.id, quantity: 44 }]
    })
    const borrowing = await new BorrowRepository().findById(created.id)
    const data = await buildCollectiveCardData(borrowing!, stubSettings, stubDeps)
    const html = generateCollectiveCardHtml(data, { termsText: COLLECTIVE_CARD_TERMS })
    const sheets = html.split('class="a4-sheet"').length - 1
    expect(sheets).toBe(3)
    expect(html).toContain('Halaman 3 dari 3')
    expect(html).toContain('Guru Penanggung Jawab')
  })

  it('escape HTML pada input berbahaya', async () => {
    const { collective } = createServices()
    const teacher = await createTeacher()
    const { book } = await createBookWithCopies('Ampersand & <Test>', 1)
    const created = await collective.createCollective({
      memberId: teacher.id,
      purpose: '<script>alert(1)</script>',
      titleQuantities: [{ bookId: book.id, quantity: 1 }]
    })
    const borrowing = await new BorrowRepository().findById(created.id)
    const data = await buildCollectiveCardData(borrowing!, stubSettings, stubDeps)
    const html = generateCollectiveCardHtml(data, { termsText: COLLECTIVE_CARD_TERMS })
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })
})

describe('buildCollectiveCardPdfFilename', () => {
  it('format nama file dan sanitasi karakter ilegal', () => {
    expect(buildCollectiveCardPdfFilename({ borrowNumber: 'PJ/202610/0001', memberName: 'Guru Test' })).toBe(
      'Kartu Kolektif - PJ2026100001 - Guru Test.pdf'
    )
    expect(buildCollectiveCardPdfFilename({ borrowNumber: '', memberName: '' })).toBe('Kartu Kolektif - PEMINJAMAN - Guru.pdf')
  })
})

describe('regresi kartu individu', () => {
  it('template A6 tidak berubah: render data minimal', async () => {
    const data = await buildBorrowCardData(
      {
        id: 'borrow-1',
        borrowNumber: 'PJ/202610/0001',
        borrowDate: new Date('2026-10-01'),
        dueDate: new Date('2026-10-08'),
        returnDate: null,
        memberName: 'Siswa Test',
        memberNumber: 'S-1',
        className: 'X 1',
        member: { fullName: 'Siswa Test', memberNumber: 'S-1', memberType: 'student' },
        details: [{ bookTitle: 'Buku X', bookCopy: { inventoryNumber: 'INV-1', book: { title: 'Buku X' } }, returnedAt: null }]
      },
      { libraryName: 'Perpus', schoolName: 'SMP', logoPath: '', librarianName: 'Petugas' },
      { readFileAsDataUri: async () => null }
    )
    const html = generateBorrowCardHtml(data)
    expect(html).toContain('PJ/202610/0001')
    expect(html).toContain('105mm 148mm')
  })
})
