import { prisma } from '../database'
import { AppError } from '../errorHandler'
import { BorrowingRepository } from '../repositories/borrowing.repository'
import { BorrowingItemRepository } from '../repositories/borrowing-item.repository'
import { ReturnRepository } from '../repositories/return.repository'
import { MemberRepository } from '../repositories/member.repository'
import { BookCopyRepository } from '../repositories/book-copy.repository'
import { BorrowingStatus, BorrowingItemStatus, MemberStatus } from '../shared/borrowing-status'
import { BookCopyStatus } from '../shared/book-copy-status'
import type { BorrowingDTO, BorrowingListItemDTO, BorrowingItemDetailDTO, CreateBorrowingInput } from '../../shared/dto/borrowing'

const MAX_BOOKS = 20

function generateBorrowingNumber(lastNumber: string | null): string {
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

function toBorrowingItemDetailDTO(
  item: any
): BorrowingItemDetailDTO {
  return {
    id: item.id,
    bookCopyId: item.bookCopyId,
    status: item.status,
    returnedAt: item.returnedAt?.toISOString() ?? null,
    condition: item.condition ?? null,
    fine: item.fine ?? null,
    notes: item.notes ?? null,
    bookTitle: item.bookCopy?.book?.title ?? '',
    barcode: item.bookCopy?.barcode ?? null,
    inventoryNumber: item.bookCopy?.inventoryNumber ?? ''
  }
}

function toBorrowingDTO(
  borrowing: any
): BorrowingDTO {
  return {
    id: borrowing.id,
    borrowingNumber: borrowing.borrowingNumber,
    memberId: borrowing.memberId,
    memberName: borrowing.member?.fullName ?? '',
    memberNumber: borrowing.member?.number ?? '',
    borrowDate: borrowing.borrowDate.toISOString(),
    dueDate: borrowing.dueDate.toISOString(),
    status: borrowing.status,
    notes: borrowing.notes ?? null,
    totalItems: borrowing.totalItems,
    items: (borrowing.items ?? []).map(toBorrowingItemDetailDTO),
    createdAt: borrowing.createdAt.toISOString(),
    updatedAt: borrowing.updatedAt.toISOString()
  }
}

function toBorrowingListItemDTO(borrowing: any): BorrowingListItemDTO {
  return {
    id: borrowing.id,
    borrowingNumber: borrowing.borrowingNumber,
    memberName: borrowing.member?.fullName ?? '',
    memberNumber: borrowing.member?.number ?? '',
    borrowDate: borrowing.borrowDate.toISOString(),
    dueDate: borrowing.dueDate.toISOString(),
    status: borrowing.status,
    totalItems: borrowing.totalItems
  }
}

export class BorrowingService {
  constructor(
    private borrowingRepository: BorrowingRepository,
    private borrowingItemRepository: BorrowingItemRepository,
    private returnRepository: ReturnRepository,
    private memberRepository: MemberRepository,
    private bookCopyRepository: BookCopyRepository
  ) {}

  async getAll(): Promise<BorrowingListItemDTO[]> {
    const borrowings = await this.borrowingRepository.findMany()
    return borrowings.map(toBorrowingListItemDTO)
  }

  async getById(id: string): Promise<BorrowingDTO> {
    const borrowing = await this.borrowingRepository.findById(id)
    if (!borrowing) {
      throw new AppError(404, 'Not Found', `Peminjaman ${id} tidak ditemukan`)
    }
    return toBorrowingDTO(borrowing)
  }

  async create(input: CreateBorrowingInput): Promise<BorrowingDTO> {
    await this.getMemberOrThrow(input.memberId)

    this.validateDueDate(input.dueDate)
    this.validateBookCopyIds(input.bookCopyIds)

    await this.getAvailableBookCopiesOrThrow(input.bookCopyIds)
    await this.validateNoOverdueItems(input.memberId)
    await this.validateBookLimit(input.memberId, input.bookCopyIds.length)

    const borrowing = await this.executeCreateTransaction(input)

    return toBorrowingDTO(borrowing)
  }

  async findBookCopyByBarcode(barcode: string) {
    const bookCopy = await this.bookCopyRepository.findByBarcodeWithBook(barcode)
    if (!bookCopy) {
      throw new AppError(404, 'Not Found', 'Buku tidak ditemukan.')
    }
    return bookCopy
  }

  private async getMemberOrThrow(memberId: string) {
    const member = await this.memberRepository.findById(memberId)
    if (!member) {
      throw new AppError(404, 'Not Found', `Member ${memberId} tidak ditemukan`)
    }
    return member
  }

  private validateDueDate(dueDate: string) {
    const date = new Date(dueDate)
    if (date <= new Date()) {
      throw new AppError(400, 'Validation Error', 'Tanggal jatuh tempo harus setelah hari ini')
    }
  }

  private validateBookCopyIds(ids: string[]) {
    if (ids.length === 0) {
      throw new AppError(400, 'Validation Error', 'Minimal satu buku harus dipinjam')
    }
  }

  private async getAvailableBookCopiesOrThrow(bookCopyIds: string[]) {
    const bookCopies = await Promise.all(
      bookCopyIds.map((id) => this.bookCopyRepository.findById(id))
    )
    for (const bc of bookCopies) {
      if (!bc) {
        throw new AppError(404, 'Not Found', 'Eksemplar buku tidak ditemukan')
      }
      if (bc.status !== BookCopyStatus.AVAILABLE) {
        throw new AppError(400, 'Validation Error', `Buku "${bc.book?.title ?? ''}" (${bc.inventoryNumber}) sedang tidak tersedia`)
      }
    }
  }

  private async validateNoOverdueItems(memberId: string) {
    const hasOverdue = await this.borrowingItemRepository.hasOverdueByMemberId(memberId)
    if (hasOverdue) {
      throw new AppError(400, 'Validation Error', 'Tidak dapat meminjam karena masih ada peminjaman yang melewati jatuh tempo')
    }
  }

  private async validateBookLimit(memberId: string, newCount: number) {
    const currentCount = await this.borrowingItemRepository.countActiveByMemberId(memberId)
    if (currentCount + newCount > MAX_BOOKS) {
      throw new AppError(400, 'Validation Error', `Total buku yang dipinjam tidak boleh melebihi ${MAX_BOOKS} eksemplar`)
    }
  }

  private async executeCreateTransaction(input: CreateBorrowingInput) {
    const dueDate = new Date(input.dueDate)

    return prisma.$transaction(async (tx) => {
      const existingCount = await tx.borrowing.count({
        where: { memberId: input.memberId }
      })
      const isFirstTransaction = existingCount === 0

      const lastNumber = await this.borrowingRepository.getLastBorrowingNumber()
      const borrowingNumber = generateBorrowingNumber(lastNumber)

      const borrowing = await tx.borrowing.create({
        data: {
          borrowingNumber,
          memberId: input.memberId,
          borrowDate: new Date(),
          dueDate,
          status: BorrowingStatus.ACTIVE,
          notes: input.notes ?? null,
          totalItems: input.bookCopyIds.length,
          items: {
            createMany: {
              data: input.bookCopyIds.map((bookCopyId) => ({
                bookCopyId,
                status: BorrowingItemStatus.BORROWED
              }))
            }
          }
        },
        include: {
          member: { select: { id: true, fullName: true, number: true } },
          items: {
            include: {
              bookCopy: {
                include: { book: { select: { title: true } } }
              }
            }
          },
          returns: true
        }
      })

      await tx.bookCopy.updateMany({
        where: { id: { in: input.bookCopyIds } },
        data: { status: BookCopyStatus.BORROWED }
      })

      if (isFirstTransaction) {
        await tx.member.update({
          where: { id: input.memberId },
          data: { status: MemberStatus.ACTIVE }
        })
      }

      return borrowing
    })
  }
}
