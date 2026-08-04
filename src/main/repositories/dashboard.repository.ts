import { BaseRepository } from './base/base.repository'
import { BOOK_COPY_STATUS } from '../../shared/config/book-copy-status'

export interface RecentBorrowRow {
  id: string
  borrowNumber: string
  memberName: string
  borrowDate: Date
  totalItems: number
}

export interface RecentReturnRow {
  id: string
  borrowId: string
  bookTitle: string
  returnedAt: Date
  borrow: { borrowNumber: string; memberName: string } | null
}

export interface DueBorrowRow {
  id: string
  borrowNumber: string
  memberName: string
  dueDate: Date
}

export interface LostCopyRow {
  id: string
  inventoryNumber: string
  title: string
}

export class DashboardRepository extends BaseRepository {
  // ── Summary ──
  async countBooks(): Promise<number> {
    return this.prisma.book.count()
  }

  async countBookCopies(): Promise<number> {
    return this.prisma.bookCopy.count()
  }

  async countMembers(): Promise<number> {
    return this.prisma.member.count()
  }

  async countActiveBorrows(): Promise<number> {
    return this.prisma.borrow.count({ where: { returnDate: null } })
  }

  // ── KPI hari ini ──
  async countBorrowedBetween(start: Date, end: Date): Promise<number> {
    return this.prisma.borrow.count({ where: { borrowDate: { gte: start, lte: end } } })
  }

  async countReturnedBetween(start: Date, end: Date): Promise<number> {
    return this.prisma.borrowDetail.count({ where: { returnedAt: { gte: start, lte: end } } })
  }

  async countOverdueBefore(threshold: Date): Promise<number> {
    return this.prisma.borrow.count({ where: { returnDate: null, dueDate: { lt: threshold } } })
  }

  async countDueBetween(start: Date, end: Date): Promise<number> {
    return this.prisma.borrow.count({ where: { returnDate: null, dueDate: { gte: start, lte: end } } })
  }

  // ── Aktivitas terbaru ──
  async findRecentBorrows(limit: number): Promise<RecentBorrowRow[]> {
    const rows = await this.prisma.borrow.findMany({
      orderBy: { borrowDate: 'desc' },
      take: limit,
      select: {
        id: true,
        borrowNumber: true,
        memberName: true,
        borrowDate: true,
        _count: { select: { details: true } }
      }
    })
    return rows.map((r) => ({
      id: r.id,
      borrowNumber: r.borrowNumber,
      memberName: r.memberName,
      borrowDate: r.borrowDate,
      totalItems: r._count.details
    }))
  }

  async findRecentReturns(limit: number): Promise<RecentReturnRow[]> {
    const rows = await this.prisma.borrowDetail.findMany({
      where: { returnedAt: { not: null } },
      orderBy: { returnedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        borrowId: true,
        bookTitle: true,
        returnedAt: true,
        borrow: { select: { borrowNumber: true, memberName: true } }
      }
    })
    return rows.map((r) => ({
      id: r.id,
      borrowId: r.borrowId,
      bookTitle: r.bookTitle,
      returnedAt: r.returnedAt as Date,
      borrow: r.borrow
    }))
  }

  // ── Perlu Perhatian ──
  async findOverdueBorrows(before: Date, limit: number): Promise<DueBorrowRow[]> {
    const rows = await this.prisma.borrow.findMany({
      where: { returnDate: null, dueDate: { lt: before } },
      orderBy: { dueDate: 'asc' },
      take: limit,
      select: { id: true, borrowNumber: true, memberName: true, dueDate: true }
    })
    return rows.map((r) => ({ id: r.id, borrowNumber: r.borrowNumber, memberName: r.memberName, dueDate: r.dueDate }))
  }

  async findDueTodayBorrows(start: Date, end: Date, limit: number): Promise<DueBorrowRow[]> {
    const rows = await this.prisma.borrow.findMany({
      where: { returnDate: null, dueDate: { gte: start, lte: end } },
      orderBy: { dueDate: 'asc' },
      take: limit,
      select: { id: true, borrowNumber: true, memberName: true, dueDate: true }
    })
    return rows.map((r) => ({ id: r.id, borrowNumber: r.borrowNumber, memberName: r.memberName, dueDate: r.dueDate }))
  }

  async findLostCopies(limit: number): Promise<LostCopyRow[]> {
    const rows = await this.prisma.bookCopy.findMany({
      where: { status: BOOK_COPY_STATUS.LOST },
      orderBy: { inventoryNumber: 'asc' },
      take: limit,
      select: { id: true, inventoryNumber: true, book: { select: { title: true } } }
    })
    return rows.map((r) => ({ id: r.id, inventoryNumber: r.inventoryNumber, title: r.book?.title ?? '' }))
  }
}
