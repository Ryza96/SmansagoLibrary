import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { getPrisma } from '../src/main/repositories/base/prisma'
import { BorrowService } from '../src/main/services/borrow.service'
import { BorrowRepository } from '../src/main/repositories/borrow.repository'
import { BorrowDetailRepository } from '../src/main/repositories/borrow-detail.repository'
import { MemberRepository } from '../src/main/repositories/member.repository'
import { BookCopyRepository } from '../src/main/repositories/book-copy.repository'
import { EnrollmentService } from '../src/main/services/enrollment.service'
import { EnrollmentRepository } from '../src/main/repositories/enrollment.repository'
import { ClassRepository } from '../src/main/repositories/class.repository'
import { AcademicYearRepository } from '../src/main/repositories/academic-year.repository'
import { CurriculumRepository } from '../src/main/repositories/curriculum.repository'
import { AppError } from '../electron/main/errorHandler'

const prisma = getPrisma()

// Helper: bersihkan semua data sebelum setiap test
async function cleanup() {
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

// Helper: buat data dasar lengkap
async function createBaseData() {
  const academicYear = await prisma.academicYear.create({
    data: {
      name: '2026/2027',
      startDate: new Date('2026-07-01'),
      endDate: new Date('2027-06-30'),
      isActive: true,
    },
  })

  const curriculum = await prisma.curriculum.create({
    data: { name: 'Kurikulum Merdeka' },
  })

  const classEntity = await prisma.class.create({
    data: {
      academicYearId: academicYear.id,
      curriculumId: curriculum.id,
      educationLevel: 'X',
      parallel: '1',
      homeroomTeacher: 'Test Teacher',
      isActive: true,
    },
  })

  const student = await prisma.member.create({
    data: {
      memberNumber: 'S-000001',
      memberType: 'student',
      fullName: 'Test Student',
      status: 'ACTIVE',
    },
  })

  const teacher = await prisma.member.create({
    data: {
      memberNumber: 'G-000001',
      memberType: 'teacher',
      fullName: 'Test Teacher',
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

  return { academicYear, curriculum, classEntity, student, teacher, book, copy1, copy2 }
}

// Helper: buat enrollment ACTIVE untuk siswa
async function createActiveEnrollment(memberId: string, classId: string, academicYearId: string) {
  return prisma.memberEnrollment.create({
    data: {
      memberId,
      classId,
      academicYearId,
      status: 'ACTIVE',
    },
  })
}

// Helper: buat service dengan repository yang terhubung ke DB sementara
function createBorrowService() {
  const borrowRepo = new BorrowRepository()
  const borrowDetailRepo = new BorrowDetailRepository()
  const memberRepo = new MemberRepository()
  const bookCopyRepo = new BookCopyRepository()
  const enrollmentRepo = new EnrollmentRepository()
  const enrollmentService = new EnrollmentService(enrollmentRepo, memberRepo, new ClassRepository())

  return new BorrowService(borrowRepo, borrowDetailRepo, memberRepo, bookCopyRepo, enrollmentService)
}

describe('BorrowService.create', () => {
  let service: BorrowService

  beforeEach(async () => {
    await cleanup()
    service = createBorrowService()
  })

  afterAll(async () => {
    await cleanup()
    await prisma.$disconnect()
  })

  it('should reject when member does not exist', async () => {
    const { copy1 } = await createBaseData()

    await expect(
      service.create({
        memberId: 'non-existent-id',
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        bookCopyIds: [copy1.id],
      })
    ).rejects.toThrow('Member non-existent-id tidak ditemukan')
  })

  it('should reject when member type is invalid', async () => {
    const { copy1 } = await createBaseData()
    const invalidMember = await prisma.member.create({
      data: {
        memberNumber: 'X-000001',
        memberType: 'invalid_type',
        fullName: 'Invalid Member',
        status: 'ACTIVE',
      },
    })

    await expect(
      service.create({
        memberId: invalidMember.id,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        bookCopyIds: [copy1.id],
      })
    ).rejects.toThrow('Tipe anggota "invalid_type" tidak valid')
  })

  it('should reject when student has no ACTIVE enrollment', async () => {
    const { student, copy1 } = await createBaseData()

    await expect(
      service.create({
        memberId: student.id,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        bookCopyIds: [copy1.id],
      })
    ).rejects.toThrow('tidak memiliki enrollment aktif')
  })

  it('should reject when dueDate is not after borrowDate', async () => {
    const { student, classEntity, academicYear, copy1 } = await createBaseData()
    await createActiveEnrollment(student.id, classEntity.id, academicYear.id)

    await expect(
      service.create({
        memberId: student.id,
        dueDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        bookCopyIds: [copy1.id],
      })
    ).rejects.toThrow('Tanggal jatuh tempo harus setelah hari ini')
  })

  it('should reject when dueDate exceeds maxDays', async () => {
    const { student, classEntity, academicYear, copy1 } = await createBaseData()
    await createActiveEnrollment(student.id, classEntity.id, academicYear.id)

    // maxDays untuk student = 90 hari, coba 91 hari
    await expect(
      service.create({
        memberId: student.id,
        dueDate: new Date(Date.now() + 91 * 24 * 60 * 60 * 1000).toISOString(),
        bookCopyIds: [copy1.id],
      })
    ).rejects.toThrow('Masa pinjam tidak boleh melebihi 90 hari')
  })

  it('should reject when book list is empty', async () => {
    const { student, classEntity, academicYear } = await createBaseData()
    await createActiveEnrollment(student.id, classEntity.id, academicYear.id)

    await expect(
      service.create({
        memberId: student.id,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        bookCopyIds: [],
      })
    ).rejects.toThrow('Minimal satu buku harus dipinjam')
  })

  it('should reject when duplicate book IDs', async () => {
    const { student, classEntity, academicYear, copy1 } = await createBaseData()
    await createActiveEnrollment(student.id, classEntity.id, academicYear.id)

    await expect(
      service.create({
        memberId: student.id,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        bookCopyIds: [copy1.id, copy1.id],
      })
    ).rejects.toThrow('Tidak boleh ada buku yang sama dua kali dalam satu transaksi')
  })

  it('should reject when book copy does not exist', async () => {
    const { student, classEntity, academicYear } = await createBaseData()
    await createActiveEnrollment(student.id, classEntity.id, academicYear.id)

    await expect(
      service.create({
        memberId: student.id,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        bookCopyIds: ['non-existent-copy-id'],
      })
    ).rejects.toThrow('Eksemplar buku tidak ditemukan')
  })

  it('should reject when book copy status is not AVAILABLE', async () => {
    const { student, classEntity, academicYear, book } = await createBaseData()
    await createActiveEnrollment(student.id, classEntity.id, academicYear.id)

    const borrowedCopy = await prisma.bookCopy.create({
      data: {
        bookId: book.id,
        inventoryNumber: 'INV-000003',
        barcode: 'INV-000003',
        status: 'BORROWED',
        condition: 'GOOD',
        shelfLocation: 'Rak A',
      },
    })

    await expect(
      service.create({
        memberId: student.id,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        bookCopyIds: [borrowedCopy.id],
      })
    ).rejects.toThrow('sedang tidak tersedia')
  })

  it('should reject when total borrowed exceeds maxBooks', async () => {
    const { student, classEntity, academicYear, book } = await createBaseData()
    await createActiveEnrollment(student.id, classEntity.id, academicYear.id)

    // Buat 20 eksemplar dan pinjam semuanya (maxBooks = 20)
    // Mulai dari i=2 karena createBaseData sudah membuat INV-000001 dan INV-000002
    const copies = []
    for (let i = 2; i < 22; i++) {
      const copy = await prisma.bookCopy.create({
        data: {
          bookId: book.id,
          inventoryNumber: `INV-${String(i + 1).padStart(6, '0')}`,
          barcode: `INV-${String(i + 1).padStart(6, '0')}`,
          status: 'AVAILABLE',
          condition: 'GOOD',
          shelfLocation: 'Rak A',
        },
      })
      copies.push(copy)
    }

    // Pinjam 20 buku (mencapai batas)
    await service.create({
      memberId: student.id,
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      bookCopyIds: copies.map((c) => c.id),
    })

    // Coba pinjam 1 lagi (total 21, melebihi maxBooks)
    const extraCopy = await prisma.bookCopy.create({
      data: {
        bookId: book.id,
        inventoryNumber: 'INV-000099',
        barcode: 'INV-000099',
        status: 'AVAILABLE',
        condition: 'GOOD',
        shelfLocation: 'Rak A',
      },
    })

    await expect(
      service.create({
        memberId: student.id,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        bookCopyIds: [extraCopy.id],
      })
    ).rejects.toThrow('Total buku yang dipinjam tidak boleh melebihi 20 eksemplar')
  })

  it('should succeed with valid data and update copy status', async () => {
    const { student, classEntity, academicYear, copy1 } = await createBaseData()
    await createActiveEnrollment(student.id, classEntity.id, academicYear.id)

    const result = await service.create({
      memberId: student.id,
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      bookCopyIds: [copy1.id],
    })

    expect(result.id).toBeDefined()
    expect(result.borrowingNumber).toMatch(/^PJ\/\d{6}\/\d{4}$/)
    expect(result.memberName).toBe('Test Student')
    expect(result.memberNumber).toBe('S-000001')
    expect(result.status).toBe('ACTIVE')
    expect(result.totalItems).toBe(1)

    // Verify copy status changed
    const updatedCopy = await prisma.bookCopy.findUnique({ where: { id: copy1.id } })
    expect(updatedCopy?.status).toBe('BORROWED')

    // Verify snapshot bookTitle
    const borrowDetail = await prisma.borrowDetail.findFirst({
      where: { borrowId: result.id },
    })
    expect(borrowDetail?.bookTitle).toBe('Test Book')
  })

  // KETIDAKSEMPURNAAN YANG DIKETAHUI, bukan perilaku yang diinginkan
  it('KNOWN ISSUE: member with overdue loan can still borrow', async () => {
    const { student, classEntity, academicYear, copy1, copy2 } = await createBaseData()
    await createActiveEnrollment(student.id, classEntity.id, academicYear.id)

    // Buat pinjaman pertama yang sudah lewat jatuh tempo
    const pastDueDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
    await prisma.borrow.create({
      data: {
        borrowNumber: 'PJ/202610/0001',
        memberId: student.id,
        borrowDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        dueDate: pastDueDate,
        memberName: student.fullName,
        memberNumber: student.memberNumber,
      },
    })

    // Buat detail pinjaman
    await prisma.borrowDetail.create({
      data: {
        borrowId: (await prisma.borrow.findFirst())!.id,
        bookCopyId: copy1.id,
        bookTitle: 'Test Book',
      },
    })

    // Update status copy jadi BORROWED
    await prisma.bookCopy.update({
      where: { id: copy1.id },
      data: { status: 'BORROWED' },
    })

    // Sekarang coba pinjaman baru - ini SEHARUSNYA ditolak tapi saat ini BOLEH
    const result = await service.create({
      memberId: student.id,
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      bookCopyIds: [copy2.id],
    })

    // Dokumentasi: saat ini BOLEH (seharusnya ditolak)
    expect(result.id).toBeDefined()
  })

  // KETIDAKSEMPURNAAN YANG DIKETAHUI, bukan perilaku yang diinginkan
  it('KNOWN ISSUE: copy with HEAVY_DAMAGE condition but AVAILABLE status can still be borrowed', async () => {
    const { student, classEntity, academicYear, book } = await createBaseData()
    await createActiveEnrollment(student.id, classEntity.id, academicYear.id)

    const damagedCopy = await prisma.bookCopy.create({
      data: {
        bookId: book.id,
        inventoryNumber: 'INV-000005',
        barcode: 'INV-000005',
        status: 'AVAILABLE',
        condition: 'HEAVY_DAMAGE',
        shelfLocation: 'Rak A',
      },
    })

    // Seharusnya ditolak karena kondisi HEAVY_DAMAGE, tapi saat ini BOLEH
    const result = await service.create({
      memberId: student.id,
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      bookCopyIds: [damagedCopy.id],
    })

    // Dokumentasi: saat ini BOLEH (seharusnya ditolak)
    expect(result.id).toBeDefined()
  })
})
