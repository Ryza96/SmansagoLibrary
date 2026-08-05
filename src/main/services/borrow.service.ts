import { BorrowRepository } from '../repositories/borrow.repository'
import { BorrowDetailRepository } from '../repositories/borrow-detail.repository'
import { MemberRepository } from '../repositories/member.repository'
import { BookCopyRepository } from '../repositories/book-copy.repository'
import { EnrollmentService } from './enrollment.service'
import type { BorrowingDTO, BorrowingItemDetailDTO, CreateBorrowingInput } from '../../shared/dto/borrowing'
import { getMemberType } from '../../shared/config/member-type'
import { AppError } from '../../../electron/main/errorHandler'

// TECHNICAL DEBT: MAX_BOOKS masih hardcoded.
// Nantinya akan dipindahkan ke configuration / application settings.
// Bukan bagian dari WO-006.
const MAX_BOOKS = 20

function generateBorrowNumber(lastNumber: string | null): string {
  const now = new Date()
  const yyyy = now.getFullYear().toString()
  const mm = (now.getMonth() + 1).toString().padStart(2, '0')
  const prefix = `PJ/${yyyy}${mm}/`

  if (!lastNumber || !lastNumber.startsWith(prefix)) {
    return `${prefix}0001`
  }

  const lastSeq = parseInt(lastNumber.slice(-4), 10)
  const nextSeq = lastSeq + 1
  return `${prefix}${nextSeq.toString().padStart(4, '0')}`
}

function toItemDTO(item: {
  id: string
  bookCopyId: string
  returnedAt: Date | null
  conditionBack: string | null
  note: string | null
  bookTitle: string
  bookCopy: { barcode: string | null; inventoryNumber: string; book: { title: string } } | null
}): BorrowingItemDetailDTO {
  return {
    id: item.id,
    bookCopyId: item.bookCopyId,
    status: item.returnedAt ? 'RETURNED' : 'BORROWED',
    returnedAt: item.returnedAt?.toISOString() ?? null,
    condition: item.conditionBack ?? null,
    fine: null,
    notes: item.note ?? null,
    bookTitle: item.bookCopy?.book?.title ?? item.bookTitle,
    barcode: item.bookCopy?.barcode ?? null,
    inventoryNumber: item.bookCopy?.inventoryNumber ?? ''
  }
}

function toDTO(borrowing: {
  id: string
  borrowNumber: string
  memberId: string
  borrowDate: Date
  dueDate: Date
  returnDate: Date | null
  notes: string | null
  memberName: string
  memberNumber: string
  className: string | null
  createdAt: Date
  updatedAt: Date
  member: { fullName: string; memberNumber: string } | null
  details: Array<{
    id: string
    bookCopyId: string
    returnedAt: Date | null
    conditionBack: string | null
    note: string | null
    bookTitle: string
    bookCopy: { barcode: string | null; inventoryNumber: string; book: { title: string } } | null
  }>
}): BorrowingDTO {
  return {
    id: borrowing.id,
    borrowingNumber: borrowing.borrowNumber,
    memberId: borrowing.memberId,
    memberName: borrowing.member?.fullName ?? borrowing.memberName,
    memberNumber: borrowing.member?.memberNumber ?? borrowing.memberNumber,
    borrowDate: borrowing.borrowDate.toISOString(),
    dueDate: borrowing.dueDate.toISOString(),
    status: borrowing.returnDate ? 'COMPLETED' : 'ACTIVE',
    notes: borrowing.notes,
    totalItems: borrowing.details.length,
    items: borrowing.details.map(toItemDTO),
    createdAt: borrowing.createdAt.toISOString(),
    updatedAt: borrowing.updatedAt.toISOString()
  }
}

export class BorrowService {
  constructor(
    private borrowRepository: BorrowRepository,
    private borrowDetailRepository: BorrowDetailRepository,
    private memberRepository: MemberRepository,
    private bookCopyRepository: BookCopyRepository,
    private enrollmentService: EnrollmentService
  ) {}

  async findMany(search?: string, page?: number, limit?: number) {
    const result = await this.borrowRepository.findMany({ search, pagination: { page, limit } })
    return {
      ...result,
      data: result.data.map((b: any) => ({
        id: b.id,
        borrowingNumber: b.borrowNumber,
        memberName: b.memberName,
        memberNumber: b.memberNumber,
        borrowDate: b.borrowDate.toISOString(),
        dueDate: b.dueDate.toISOString(),
        status: b.returnDate ? 'COMPLETED' as const : 'ACTIVE' as const,
        totalItems: b._count?.details ?? 0
      }))
    }
  }

  async findById(id: string): Promise<BorrowingDTO> {
    const borrowing = await this.borrowRepository.findById(id)
    if (!borrowing) {
      throw new AppError(404, 'Not Found', `Peminjaman ${id} tidak ditemukan`)
    }
    return toDTO(borrowing)
  }

  async create(input: CreateBorrowingInput): Promise<BorrowingDTO> {
    const member = await this.memberRepository.findById(input.memberId)
    if (!member) {
      throw new AppError(404, 'Not Found', `Member ${input.memberId} tidak ditemukan`)
    }

    // Business Rule baru (PO):
    // - Tipe anggota WAJIB dikenal (student/teacher/general).
    // - SISWA wajib punya Enrollment ACTIVE untuk meminjam.
    // - GURU/UMUM tidak membutuhkan Enrollment — lolos tanpa pengecekan enrollment.
    const memberType = getMemberType(member.memberType)
    if (!memberType) {
      throw new AppError(400, 'Validation Error', `Tipe anggota "${member.memberType}" tidak valid`)
    }

    const hasAcademicRecord = memberType.hasAcademicRecord === true
    const enrollment = hasAcademicRecord
      ? await this.enrollmentService.findActiveByMember(input.memberId)
      : null

    if (hasAcademicRecord && !enrollment) {
      throw new AppError(400, 'Validation Error', `Member ${member.fullName} tidak memiliki enrollment aktif`)
    }

    const dueDate = new Date(input.dueDate)
    if (dueDate <= new Date()) {
      throw new AppError(400, 'Validation Error', 'Tanggal jatuh tempo harus setelah hari ini')
    }

    if (input.bookCopyIds.length === 0) {
      throw new AppError(400, 'Validation Error', 'Minimal satu buku harus dipinjam')
    }

    const uniqueIds = new Set(input.bookCopyIds)
    if (uniqueIds.size !== input.bookCopyIds.length) {
      throw new AppError(400, 'Validation Error', 'Tidak boleh ada buku yang sama dua kali dalam satu transaksi')
    }

    const bookCopies = await Promise.all(
      input.bookCopyIds.map((id) => this.bookCopyRepository.findById(id))
    )

    for (const bc of bookCopies) {
      if (!bc) {
        throw new AppError(404, 'Not Found', 'Eksemplar buku tidak ditemukan')
      }
      if (bc.status !== 'AVAILABLE') {
        throw new AppError(400, 'Validation Error', `Buku "${bc.book?.title ?? ''}" (${bc.inventoryNumber}) sedang tidak tersedia`)
      }
    }

    const activeCount = await this.borrowDetailRepository.countActiveByMemberId(input.memberId)
    if (activeCount + input.bookCopyIds.length > MAX_BOOKS) {
      throw new AppError(400, 'Validation Error', `Total buku yang dipinjam tidak boleh melebihi ${MAX_BOOKS} eksemplar`)
    }

    const lastNumber = await this.borrowRepository.getLastBorrowNumber()
    const borrowNumber = generateBorrowNumber(lastNumber)

    const className = enrollment?.className

    const created = await this.borrowRepository.createWithItems(
      {
        borrowNumber,
        memberId: input.memberId,
        memberName: member.fullName,
        memberNumber: member.memberNumber,
        borrowDate: new Date(),
        dueDate,
        notes: input.notes,
        className
      },
      input.bookCopyIds.map((bookCopyId, i) => ({
        bookCopyId,
        bookTitle: bookCopies[i]?.book?.title ?? ''
      }))
    )

    // FIRST BORROW ACTIVATION — Membership Status (bukan Academic Status):
    // peminjaman pertama yang BERHASIL mengaktifkan keanggotaan (INACTIVE → ACTIVE).
    // Status ACTIVE TIDAK boleh kembali INACTIVE hanya karena buku dikembalikan
    // (ReturnService tidak pernah menulis Member.status). Membership ≠ eligibility:
    // guard peminjaman tetap berbasis Enrollment (tidak berubah).
    if (member.status === 'INACTIVE') {
      await this.memberRepository.update(member.id, { status: 'ACTIVE' })
    }

    return toDTO(created)
  }
}
