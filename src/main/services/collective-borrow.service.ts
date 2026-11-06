import { BorrowRepository } from '../repositories/borrow.repository'
import { BorrowDetailRepository } from '../repositories/borrow-detail.repository'
import { MemberRepository } from '../repositories/member.repository'
import { BookCopyRepository } from '../repositories/book-copy.repository'
import { BookRepository } from '../repositories/book.repository'
import { ClassRepository } from '../repositories/class.repository'
import { generateBorrowNumber } from './borrow.service'
import {
  BORROW_TYPES,
  COLLECTIVE_DEFAULT_LOAN_DAYS,
  COLLECTIVE_MAX_COPIES
} from '../../shared/config/borrow-type'
import type {
  BorrowingDTO,
  BorrowingItemDetailDTO
} from '../../shared/dto/borrowing'
import type {
  CollectivePreviewCopyDTO,
  CollectivePreviewDTO,
  CreateCollectiveBorrowingInput,
  OutstandingCopiesResultDTO,
  OutstandingCopyDTO,
  PreviewCollectiveBorrowingInput
} from '../../shared/dto/collective-borrow'
import { AppError } from '../../../electron/main/errorHandler'

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
  borrowType: string
  purpose: string | null
  collectiveClassId: string | null
  collectiveClassName: string | null
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
    updatedAt: borrowing.updatedAt.toISOString(),
    borrowType: borrowing.borrowType,
    purpose: borrowing.purpose,
    collectiveClassId: borrowing.collectiveClassId,
    collectiveClassName: borrowing.collectiveClassName
  }
}

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

interface ResolvedCopy {
  bookCopyId: string
  bookId: string
  bookTitle: string
  barcode: string | null
  inventoryNumber: string
}

export class CollectiveBorrowService {
  constructor(
    private borrowRepository: BorrowRepository,
    private borrowDetailRepository: BorrowDetailRepository,
    private memberRepository: MemberRepository,
    private bookCopyRepository: BookCopyRepository,
    private bookRepository: BookRepository,
    private classRepository: ClassRepository
  ) {}

  // PREVIEW (tanpa menulis data): validasi penuh + kembalikan daftar
  // eksemplar terpilih agar renderer bisa menampilkan nomor inventaris
  // sebelum konfirmasi.
  async previewCollective(input: PreviewCollectiveBorrowingInput): Promise<CollectivePreviewDTO> {
    const resolved = await this.resolveAndValidate(input)
    return {
      copies: resolved.copies,
      totalCopies: resolved.copies.length,
      memberId: resolved.member.id,
      memberName: resolved.member.fullName,
      memberNumber: resolved.member.memberNumber,
      purpose: resolved.purpose,
      collectiveClassId: resolved.collectiveClassId,
      collectiveClassName: resolved.collectiveClassName,
      dueDate: resolved.dueDate.toISOString()
    }
  }

  async createCollective(input: CreateCollectiveBorrowingInput): Promise<BorrowingDTO> {
    const resolved = await this.resolveAndValidate(input)

    const borrowDate = new Date()
    const lastNumber = await this.borrowRepository.getLastBorrowNumber()
    const borrowNumber = generateBorrowNumber(lastNumber)

    const created = await this.borrowRepository.createCollectiveWithItems(
      {
        borrowNumber,
        memberId: resolved.member.id,
        memberName: resolved.member.fullName,
        memberNumber: resolved.member.memberNumber,
        borrowDate,
        dueDate: resolved.dueDate,
        notes: input.notes,
        className: resolved.collectiveClassName ?? undefined,
        purpose: resolved.purpose,
        collectiveClassId: resolved.collectiveClassId,
        collectiveClassName: resolved.collectiveClassName,
        activateMemberId: resolved.activateMember ? resolved.member.id : null
      },
      resolved.copies.map((c) => ({ bookCopyId: c.bookCopyId, bookTitle: c.bookTitle }))
    )

    return toDTO(created)
  }

  // Daftar eksemplar yang belum kembali untuk satu Borrow.
  // Status turunan dihitung di service (renderer hanya menampilkan).
  async listOutstanding(borrowId: string): Promise<OutstandingCopiesResultDTO> {
    const borrowing = await this.borrowRepository.findById(borrowId)
    if (!borrowing) {
      throw new AppError(404, 'Not Found', `Peminjaman ${borrowId} tidak ditemukan`)
    }
    const outstanding = await this.borrowDetailRepository.findOutstandingByBorrowId(borrowId)
    const today = startOfDay(new Date())
    const copies: OutstandingCopyDTO[] = outstanding.map((d) => {
      const overdue = startOfDay(borrowing.dueDate).getTime() < today.getTime()
      const overdueDays = overdue
        ? Math.floor((today.getTime() - startOfDay(borrowing.dueDate).getTime()) / 86_400_000)
        : 0
      return {
        borrowDetailId: d.id,
        bookCopyId: d.bookCopyId,
        bookTitle: d.bookCopy?.book?.title ?? d.bookTitle,
        barcode: d.bookCopy?.barcode ?? null,
        inventoryNumber: d.bookCopy?.inventoryNumber ?? '',
        dueDate: borrowing.dueDate.toISOString(),
        status: overdue ? 'OVERDUE' : 'BORROWED',
        overdueDays
      }
    })
    return {
      borrowingId: borrowing.id,
      borrowingNumber: borrowing.borrowNumber,
      borrowType: (borrowing as { borrowType?: string }).borrowType ?? BORROW_TYPES.INDIVIDUAL.code,
      totalOutstanding: copies.length,
      copies
    }
  }

  // Validasi bersama preview & create: tipe guru, status ACTIVE/INACTIVE,
  // purpose, kelas opsional, total 1..MAX, duplikat, ketersediaan
  // (advisory; guard atomik di repository). Preview read-only: tidak menulis
  // apa pun, termasuk tidak mengaktifkan guru.
  private async resolveAndValidate(input: CreateCollectiveBorrowingInput): Promise<{
    member: { id: string; fullName: string; memberNumber: string }
    activateMember: boolean
    purpose: string
    dueDate: Date
    collectiveClassId: string | null
    collectiveClassName: string | null
    copies: CollectivePreviewCopyDTO[]
  }> {
    const member = await this.memberRepository.findById(input.memberId)
    if (!member) {
      throw new AppError(404, 'Not Found', `Member ${input.memberId} tidak ditemukan`)
    }
    if (member.memberType !== 'teacher') {
      throw new AppError(400, 'Validation Error', 'Peminjaman kolektif hanya boleh dibuat oleh anggota dengan tipe GURU')
    }
    if (member.status !== 'ACTIVE' && member.status !== 'INACTIVE') {
      throw new AppError(400, 'Validation Error', `Status guru "${member.status}" tidak dikenal sehingga tidak dapat membuat pinjaman kolektif`)
    }

    const purpose = (input.purpose ?? '').trim()
    if (!purpose) {
      throw new AppError(400, 'Validation Error', 'Keperluan (purpose) wajib diisi untuk peminjaman kolektif')
    }

    let collectiveClassId: string | null = null
    let collectiveClassName: string | null = null
    if (input.collectiveClassId) {
      const classEntity = await this.classRepository.findById(input.collectiveClassId)
      if (!classEntity) {
        throw new AppError(404, 'Not Found', `Kelas ${input.collectiveClassId} tidak ditemukan`)
      }
      collectiveClassId = classEntity.id
      collectiveClassName = `${classEntity.educationLevel} ${classEntity.parallel}`
    }

    const now = new Date()
    let dueDate: Date
    if (input.dueDate) {
      dueDate = new Date(input.dueDate)
      if (Number.isNaN(dueDate.getTime())) {
        throw new AppError(400, 'Validation Error', 'Tanggal jatuh tempo tidak valid')
      }
      if (dueDate <= now) {
        throw new AppError(400, 'Validation Error', 'Tanggal jatuh tempo harus setelah hari ini')
      }
    } else {
      dueDate = new Date(now.getTime() + COLLECTIVE_DEFAULT_LOAN_DAYS * 24 * 60 * 60 * 1000)
    }

    const copies = await this.resolveCopies(input)

    if (copies.length < 1) {
      throw new AppError(400, 'Validation Error', 'Minimal satu eksemplar harus dipinjam')
    }
    if (copies.length > COLLECTIVE_MAX_COPIES) {
      throw new AppError(
        400,
        'Validation Error',
        `Jumlah eksemplar kolektif tidak boleh melebihi ${COLLECTIVE_MAX_COPIES} eksemplar`
      )
    }

    return { member, activateMember: member.status === 'INACTIVE', purpose, dueDate, collectiveClassId, collectiveClassName, copies }
  }

  private async resolveCopies(input: CreateCollectiveBorrowingInput): Promise<ResolvedCopy[]> {
    const resolved: ResolvedCopy[] = []
    const seen = new Set<string>()

    const titleQuantities = input.titleQuantities ?? []
    for (const tq of titleQuantities) {
      if (!Number.isInteger(tq.quantity) || tq.quantity < 1) {
        throw new AppError(400, 'Validation Error', 'Jumlah setiap judul minimal 1 eksemplar')
      }
      const book = await this.bookRepository.findById(tq.bookId)
      if (!book) {
        throw new AppError(404, 'Not Found', `Buku ${tq.bookId} tidak ditemukan`)
      }
      const available = await this.bookCopyRepository.findAvailableCopiesByBookId(tq.bookId, tq.quantity)
      if (available.length < tq.quantity) {
        throw new AppError(
          400,
          'Validation Error',
          `Stok "${book.title}" kurang: tersedia ${available.length}, diminta ${tq.quantity}`
        )
      }
      for (const copy of available) {
        if (seen.has(copy.id)) {
          throw new AppError(400, 'Validation Error', 'Tidak boleh ada eksemplar yang sama dua kali dalam satu transaksi')
        }
        seen.add(copy.id)
        resolved.push({
          bookCopyId: copy.id,
          bookId: copy.bookId,
          bookTitle: copy.book?.title ?? book.title,
          barcode: copy.barcode,
          inventoryNumber: copy.inventoryNumber
        })
      }
    }

    const scannedIds: string[] = [...(input.bookCopyIds ?? [])]
    for (const barcode of input.barcodes ?? []) {
      const trimmed = barcode.trim()
      if (!trimmed) continue
      const copy = await this.bookCopyRepository.findByBarcodeWithBook(trimmed)
      if (!copy) {
        throw new AppError(404, 'Not Found', `Barcode ${trimmed} tidak ditemukan`)
      }
      scannedIds.push(copy.id)
    }

    if (scannedIds.length > 0) {
      const copies = await Promise.all(scannedIds.map((id) => this.bookCopyRepository.findById(id)))
      for (let i = 0; i < scannedIds.length; i++) {
        const copy = copies[i]
        if (!copy) {
          throw new AppError(404, 'Not Found', 'Eksemplar buku tidak ditemukan')
        }
        if (seen.has(copy.id)) {
          throw new AppError(400, 'Validation Error', 'Tidak boleh ada eksemplar yang sama dua kali dalam satu transaksi')
        }
        seen.add(copy.id)
        if (copy.status !== 'AVAILABLE') {
          throw new AppError(
            400,
            'Validation Error',
            `Buku "${copy.book?.title ?? ''}" (${copy.inventoryNumber}) sedang tidak tersedia`
          )
        }
        resolved.push({
          bookCopyId: copy.id,
          bookId: copy.bookId,
          bookTitle: copy.book?.title ?? '',
          barcode: copy.barcode,
          inventoryNumber: copy.inventoryNumber
        })
      }
    }

    return resolved
  }
}
