import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { getPrisma } from '../src/main/repositories/base/prisma'
import { BorrowService } from '../src/main/services/borrow.service'
import { CollectiveBorrowService } from '../src/main/services/collective-borrow.service'
import { ReturnService } from '../src/main/services/return.service'
import { BorrowRepository } from '../src/main/repositories/borrow.repository'
import { BorrowDetailRepository } from '../src/main/repositories/borrow-detail.repository'
import { MemberRepository } from '../src/main/repositories/member.repository'
import { BookCopyRepository } from '../src/main/repositories/book-copy.repository'
import { BookRepository } from '../src/main/repositories/book.repository'
import { ClassRepository } from '../src/main/repositories/class.repository'
import { EnrollmentService } from '../src/main/services/enrollment.service'
import { EnrollmentRepository } from '../src/main/repositories/enrollment.repository'

const prisma = getPrisma()

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

async function createAcademic() {
  const academicYear = await prisma.academicYear.create({
    data: { name: '2026/2027', startDate: new Date('2026-07-01'), endDate: new Date('2027-06-30'), isActive: true }
  })
  const curriculum = await prisma.curriculum.create({ data: { name: 'Kurikulum Merdeka' } })
  const classEntity = await prisma.class.create({
    data: {
      academicYearId: academicYear.id,
      curriculumId: curriculum.id,
      educationLevel: 'X',
      parallel: '1',
      homeroomTeacher: 'Guru Test',
      isActive: true
    }
  })
  return { academicYear, curriculum, classEntity }
}

async function createTeacher(status = 'ACTIVE') {
  return prisma.member.create({
    data: { memberNumber: `G-${Date.now()}${Math.floor(Math.random() * 1000)}`, memberType: 'teacher', fullName: 'Guru Kolektif', status }
  })
}

async function createStudentWithEnrollment(classId: string, academicYearId: string) {
  const student = await prisma.member.create({
    data: { memberNumber: `S-${Date.now()}${Math.floor(Math.random() * 1000)}`, memberType: 'student', fullName: 'Siswa Test', status: 'ACTIVE' }
  })
  await prisma.memberEnrollment.create({ data: { memberId: student.id, classId, academicYearId, status: 'ACTIVE' } })
  return student
}

async function createBookWithCopies(title: string, count: number, startSeq = 1) {
  const book = await prisma.book.create({ data: { title } })
  const copies = []
  for (let i = 0; i < count; i++) {
    const seq = String(startSeq + i).padStart(6, '0')
    copies.push(
      await prisma.bookCopy.create({
        data: {
          bookId: book.id,
          inventoryNumber: `INV-${seq}-${title.length}`,
          barcode: `BC-${seq}-${title.length}-${Date.now()}`,
          status: 'AVAILABLE',
          condition: 'GOOD',
          shelfLocation: 'Rak A'
        }
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
  const bookRepo = new BookRepository()
  const classRepo = new ClassRepository()
  const enrollmentRepo = new EnrollmentRepository()
  const enrollmentService = new EnrollmentService(enrollmentRepo, memberRepo, classRepo)
  const collective = new CollectiveBorrowService(borrowRepo, borrowDetailRepo, memberRepo, bookCopyRepo, bookRepo, classRepo)
  const borrowService = new BorrowService(borrowRepo, borrowDetailRepo, memberRepo, bookCopyRepo, enrollmentService)
  const returnService = new ReturnService(borrowRepo, borrowDetailRepo, bookCopyRepo)
  return { collective, borrowService, returnService, borrowRepo }
}

const dueIn7Days = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

describe('CollectiveBorrowService', () => {
  beforeEach(async () => {
    await cleanup()
  })

  afterAll(async () => {
    await cleanup()
    await prisma.$disconnect()
  })

  it('ditolak: anggota bukan GURU', async () => {
    const { collective } = createServices()
    const { classEntity, academicYear } = await createAcademic()
    const student = await createStudentWithEnrollment(classEntity.id, academicYear.id)
    const { book, copies } = await createBookWithCopies('Buku A', 2)
    void book
    await expect(
      collective.createCollective({ memberId: student.id, purpose: 'Bimbel', bookCopyIds: [copies[0].id] })
    ).rejects.toThrow('hanya boleh dibuat oleh anggota dengan tipe GURU')
  })

  it('guru INACTIVE otomatis ACTIVE setelah pinjaman kolektif sukses', async () => {
    const { collective } = createServices()
    const teacher = await createTeacher('INACTIVE')
    const { copies } = await createBookWithCopies('Buku B', 2)
    const result = await collective.createCollective({ memberId: teacher.id, purpose: 'Bimbel', bookCopyIds: [copies[0].id] })
    expect(result.borrowType).toBe('COLLECTIVE')
    const updated = await prisma.member.findUnique({ where: { id: teacher.id } })
    expect(updated?.status).toBe('ACTIVE')
  })

  it('guru INACTIVE tetap INACTIVE bila transaksi gagal', async () => {
    const { collective } = createServices()
    const teacher = await createTeacher('INACTIVE')
    const { copies } = await createBookWithCopies('Buku B2', 2)
    await prisma.bookCopy.update({ where: { id: copies[0].id }, data: { status: 'BORROWED' } })
    await expect(
      collective.createCollective({ memberId: teacher.id, purpose: 'Bimbel', bookCopyIds: [copies[0].id] })
    ).rejects.toThrow('tidak tersedia')
    const updated = await prisma.member.findUnique({ where: { id: teacher.id } })
    expect(updated?.status).toBe('INACTIVE')
    expect(await prisma.borrow.count()).toBe(0)
  })

  it('preview tidak mengubah status guru', async () => {
    const { collective } = createServices()
    const teacher = await createTeacher('INACTIVE')
    const { book } = await createBookWithCopies('Buku B3', 2)
    const preview = await collective.previewCollective({
      memberId: teacher.id,
      purpose: 'Bimbel',
      titleQuantities: [{ bookId: book.id, quantity: 1 }]
    })
    expect(preview.totalCopies).toBe(1)
    const updated = await prisma.member.findUnique({ where: { id: teacher.id } })
    expect(updated?.status).toBe('INACTIVE')
    expect(await prisma.borrow.count()).toBe(0)
  })

  it('ditolak: status guru tak dikenal', async () => {
    const { collective } = createServices()
    const teacher = await prisma.member.create({
      data: { memberNumber: `G-${Date.now()}X`, memberType: 'teacher', fullName: 'Guru Aneh', status: 'SUSPENDED' }
    })
    const { copies } = await createBookWithCopies('Buku B4', 2)
    await expect(
      collective.createCollective({ memberId: teacher.id, purpose: 'Bimbel', bookCopyIds: [copies[0].id] })
    ).rejects.toThrow('tidak dikenal')
  })

  it('ditolak: purpose kosong', async () => {
    const { collective } = createServices()
    const teacher = await createTeacher()
    const { copies } = await createBookWithCopies('Buku C', 2)
    await expect(
      collective.createCollective({ memberId: teacher.id, purpose: '   ', bookCopyIds: [copies[0].id] })
    ).rejects.toThrow('wajib diisi')
  })

  it('ditolak: quantity 0', async () => {
    const { collective } = createServices()
    const teacher = await createTeacher()
    const { book } = await createBookWithCopies('Buku D', 2)
    await expect(
      collective.createCollective({ memberId: teacher.id, purpose: 'Bimbel', titleQuantities: [{ bookId: book.id, quantity: 0 }] })
    ).rejects.toThrow('minimal 1')
  })

  it('ditolak: total melebihi COLLECTIVE_MAX_COPIES', async () => {
    const { collective } = createServices()
    const teacher = await createTeacher()
    const { book } = await createBookWithCopies('Buku E', 55, 100)
    await expect(
      collective.createCollective({ memberId: teacher.id, purpose: 'Bimbel', titleQuantities: [{ bookId: book.id, quantity: 51 }] })
    ).rejects.toThrow('melebihi 50')
  })

  it('ditolak: stok AVAILABLE kurang dan pesan memuat jumlah tersedia', async () => {
    const { collective } = createServices()
    const teacher = await createTeacher()
    const { book } = await createBookWithCopies('Buku F', 3, 200)
    await expect(
      collective.createCollective({ memberId: teacher.id, purpose: 'Bimbel', titleQuantities: [{ bookId: book.id, quantity: 5 }] })
    ).rejects.toThrow(/tersedia 3.*diminta 5/)
  })

  it('ditolak: eksemplar duplikat', async () => {
    const { collective } = createServices()
    const teacher = await createTeacher()
    const { copies } = await createBookWithCopies('Buku G', 2, 300)
    await expect(
      collective.createCollective({ memberId: teacher.id, purpose: 'Bimbel', bookCopyIds: [copies[0].id, copies[0].id] })
    ).rejects.toThrow('dua kali')
  })

  it('ditolak: eksemplar bukan AVAILABLE', async () => {
    const { collective } = createServices()
    const teacher = await createTeacher()
    const { copies } = await createBookWithCopies('Buku H', 2, 400)
    await prisma.bookCopy.update({ where: { id: copies[0].id }, data: { status: 'BORROWED' } })
    await expect(
      collective.createCollective({ memberId: teacher.id, purpose: 'Bimbel', bookCopyIds: [copies[0].id] })
    ).rejects.toThrow('tidak tersedia')
  })

  it('preview: tanpa menulis data, kembalikan daftar eksemplar terpilih', async () => {
    const { collective } = createServices()
    const teacher = await createTeacher()
    const { book } = await createBookWithCopies('Buku Preview', 5, 500)
    const preview = await collective.previewCollective({
      memberId: teacher.id,
      purpose: 'Bimbel Preview',
      titleQuantities: [{ bookId: book.id, quantity: 3 }]
    })
    expect(preview.totalCopies).toBe(3)
    expect(preview.copies).toHaveLength(3)
    expect(preview.copies[0].inventoryNumber).toBeDefined()
    expect(await prisma.borrow.count()).toBe(0)
    expect(await prisma.borrowDetail.count()).toBe(0)
  })

  it('sukses: mode judul+jumlah 30 eksemplar, status menjadi BORROWED', async () => {
    const { collective } = createServices()
    const teacher = await createTeacher()
    const { classEntity } = await createAcademic()
    const { book } = await createBookWithCopies('Bahasa Indonesia', 30, 600)
    const result = await collective.createCollective({
      memberId: teacher.id,
      purpose: 'Bimbel Bahasa Indonesia',
      collectiveClassId: classEntity.id,
      titleQuantities: [{ bookId: book.id, quantity: 30 }]
    })
    expect(result.borrowType).toBe('COLLECTIVE')
    expect(result.totalItems).toBe(30)
    expect(result.memberName).toBe('Guru Kolektif')
    expect(result.collectiveClassName).toBe('X 1')
    const dbBorrow = await prisma.borrow.findUnique({ where: { id: result.id } })
    expect(dbBorrow?.borrowType).toBe('COLLECTIVE')
    expect(dbBorrow?.purpose).toBe('Bimbel Bahasa Indonesia')
    expect(await prisma.bookCopy.count({ where: { bookId: book.id, status: 'BORROWED' } })).toBe(30)
  })

  it('sukses: mode scan barcode', async () => {
    const { collective } = createServices()
    const teacher = await createTeacher()
    const { copies } = await createBookWithCopies('Buku Scan', 3, 700)
    const result = await collective.createCollective({
      memberId: teacher.id,
      purpose: 'Bimbel Scan',
      barcodes: [copies[0].barcode, copies[1].barcode]
    })
    expect(result.borrowType).toBe('COLLECTIVE')
    expect(result.totalItems).toBe(2)
  })

  it('sukses: mode campuran judul+jumlah dan scan', async () => {
    const { collective } = createServices()
    const teacher = await createTeacher()
    const { book } = await createBookWithCopies('Buku Campur A', 5, 800)
    const { copies: copiesB } = await createBookWithCopies('Buku Campur B', 3, 900)
    const result = await collective.createCollective({
      memberId: teacher.id,
      purpose: 'Bimbel Campur',
      titleQuantities: [{ bookId: book.id, quantity: 2 }],
      bookCopyIds: [copiesB[0].id]
    })
    expect(result.totalItems).toBe(3)
  })

  it('atomik: repository rollback bila satu eksemplar gagal di dalam transaksi', async () => {
    const { borrowRepo } = createServices()
    const teacher = await createTeacher()
    const { copies } = await createBookWithCopies('Buku Atomik', 2, 1000)
    await prisma.bookCopy.update({ where: { id: copies[1].id }, data: { status: 'BORROWED' } })
    await expect(
      borrowRepo.createCollectiveWithItems(
        {
          borrowNumber: 'PJ/209901/0001',
          memberId: teacher.id,
          memberName: teacher.fullName,
          memberNumber: teacher.memberNumber,
          borrowDate: new Date(),
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          purpose: 'Uji atomik'
        },
        [
          { bookCopyId: copies[0].id, bookTitle: 'Buku Atomik' },
          { bookCopyId: copies[1].id, bookTitle: 'Buku Atomik' }
        ]
      )
    ).rejects.toThrow('dibatalkan')
    expect(await prisma.borrow.count()).toBe(0)
    expect(await prisma.borrowDetail.count()).toBe(0)
    const first = await prisma.bookCopy.findUnique({ where: { id: copies[0].id } })
    expect(first?.status).toBe('AVAILABLE')
  })

  it('pengembalian parsial: transaksi selesai hanya jika semua kembali', async () => {
    const { collective, returnService } = createServices()
    const teacher = await createTeacher()
    const { copies } = await createBookWithCopies('Buku Parsial', 3, 1100)
    const result = await collective.createCollective({
      memberId: teacher.id,
      purpose: 'Bimbel Parsial',
      bookCopyIds: copies.map((c) => c.id)
    })
    const details = await prisma.borrowDetail.findMany({ where: { borrowId: result.id } })
    expect(details).toHaveLength(3)

    const first = await returnService.batchReturn({
      borrowingId: result.id,
      books: [{ borrowDetailId: details[0].id, condition: 'BAIK' }]
    })
    expect(first.returnedCount).toBe(1)
    expect(first.stillBorrowedCount).toBe(2)
    const mid = await prisma.borrow.findUnique({ where: { id: result.id } })
    expect(mid?.returnDate).toBeNull()

    const rest = await returnService.batchReturn({
      borrowingId: result.id,
      books: [
        { borrowDetailId: details[1].id, condition: 'BAIK' },
        { borrowDetailId: details[2].id, condition: 'BAIK' }
      ]
    })
    expect(rest.stillBorrowedCount).toBe(0)
    const done = await prisma.borrow.findUnique({ where: { id: result.id } })
    expect(done?.returnDate).not.toBeNull()
  })

  it('denda: eksemplar terlambat menghasilkan Fine atas pinjaman guru', async () => {
    const { collective, returnService } = createServices()
    const teacher = await createTeacher()
    const { copies } = await createBookWithCopies('Buku Denda', 2, 1200)
    const result = await collective.createCollective({
      memberId: teacher.id,
      purpose: 'Bimbel Denda',
      dueDate: dueIn7Days(),
      bookCopyIds: copies.map((c) => c.id)
    })
    await prisma.borrow.update({
      where: { id: result.id },
      data: { dueDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) }
    })
    const details = await prisma.borrowDetail.findMany({ where: { borrowId: result.id } })
    await returnService.batchReturn({
      borrowingId: result.id,
      books: details.map((d) => ({ borrowDetailId: d.id, condition: 'BAIK' as const }))
    })
    const fines = await prisma.fine.findMany({ where: { borrowId: result.id } })
    expect(fines.length).toBeGreaterThan(0)
    const late = fines.find((f) => f.type === 'LATE')
    expect(late).toBeDefined()
    expect(late!.amount).toBeGreaterThan(0)
    const borrow = await prisma.borrow.findUnique({ where: { id: result.id } })
    expect(borrow?.memberId).toBe(teacher.id)
  })

  it('outstanding: hanya eksemplar belum kembali, status turunan dihitung service', async () => {
    const { collective, returnService } = createServices()
    const teacher = await createTeacher()
    const { copies } = await createBookWithCopies('Buku Outstanding', 2, 1300)
    const result = await collective.createCollective({
      memberId: teacher.id,
      purpose: 'Bimbel Outstanding',
      bookCopyIds: copies.map((c) => c.id)
    })
    const details = await prisma.borrowDetail.findMany({ where: { borrowId: result.id } })
    await returnService.batchReturn({
      borrowingId: result.id,
      books: [{ borrowDetailId: details[0].id, condition: 'BAIK' }]
    })
    const outstanding = await collective.listOutstanding(result.id)
    expect(outstanding.totalOutstanding).toBe(1)
    expect(outstanding.copies[0].status).toBe('BORROWED')
    expect(outstanding.copies[0].overdueDays).toBe(0)
  })

  it('regresi: pinjaman INDIVIDUAL tetap berjalan seperti sebelumnya', async () => {
    const { borrowService } = createServices()
    const { classEntity, academicYear } = await createAcademic()
    const student = await createStudentWithEnrollment(classEntity.id, academicYear.id)
    const { copies } = await createBookWithCopies('Buku Regresi', 2, 1400)
    const result = await borrowService.create({
      memberId: student.id,
      dueDate: dueIn7Days(),
      bookCopyIds: [copies[0].id]
    })
    expect(result.status).toBe('ACTIVE')
    expect(result.borrowType).toBe('INDIVIDUAL')
    const dbBorrow = await prisma.borrow.findUnique({ where: { id: result.id } })
    expect(dbBorrow?.borrowType).toBe('INDIVIDUAL')
  })
})
