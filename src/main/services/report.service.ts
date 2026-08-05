import type { ReportRepository } from '../repositories/report.repository'
import type {
  BorrowReportFilter,
  BorrowReportStatus,
  BorrowingReportDTO,
  BorrowingReportRowDTO,
  CollectionReportDTO,
  CollectionReportFilter,
  CollectionReportRowDTO,
  MemberReportDTO,
  MemberReportFilter,
  MemberReportRowDTO,
  OverdueReportDTO,
  OverdueReportFilter,
  OverdueReportRowDTO,
  ReportPagination,
  ReturnReportDTO,
  ReturnReportFilter,
  ReturnReportRowDTO
} from '../../shared/dto/report'
import { MEMBER_TYPES } from '../../shared/config/member-type'

// Report Module (R-1) — Service mapping repository → DTO.
// KEPUTUSAN PO: laporan v1.0 tanpa kolom Petugas (K1) dan tanpa nominal denda (K2).
// Seluruh komputasi business (status turunan, lateDays, ringkasan) di Service;
// renderer TIDAK menurunkan angka. Laporan Promosi memakai PromotionRunService
// existing (P-3/P-4) — tidak diduplikasi di sini.

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function endOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

function parseRange(from?: string, to?: string): { from: Date; to: Date } {
  const now = new Date()
  return {
    from: startOfDay(from ? new Date(from) : now),
    to: endOfDay(to ? new Date(to) : now)
  }
}

function iso(d: Date): string {
  return d.toISOString()
}

function diffDays(later: Date, earlier: Date): number {
  const ms = startOfDay(later).getTime() - startOfDay(earlier).getTime()
  return Math.floor(ms / 86_400_000)
}

// Status turunan (bukan kolom): ACTIVE/COMPLETED/OVERDUE dari returnDate + dueDate.
function deriveBorrowStatus(returnDate: Date | null, dueDate: Date, now: number): BorrowReportStatus {
  if (returnDate) return 'COMPLETED'
  return dueDate.getTime() < now ? 'OVERDUE' : 'ACTIVE'
}

function toReportPagination(p: { page: number; limit: number; total: number; totalPages: number }): ReportPagination {
  return { page: p.page, limit: p.limit, total: p.total, totalPages: p.totalPages }
}

export class ReportService {
  constructor(private readonly reportRepository: ReportRepository) {}

  // -------------------------------------------------------------------------
  // Laporan Peminjaman
  // -------------------------------------------------------------------------

  async getBorrowingReport(filter: BorrowReportFilter): Promise<BorrowingReportDTO> {
    const { from, to } = parseRange(filter.from, filter.to)
    const now = Date.now()

    const [result, summary] = await Promise.all([
      this.reportRepository.findBorrowingsBetween({ from, to, status: filter.status, search: filter.search, page: filter.page, limit: filter.limit }),
      this.reportRepository.countBorrowStatusSummary(from, to, filter.search)
    ])

    const rows: BorrowingReportRowDTO[] = []
    for (const b of result.data) {
      const status = deriveBorrowStatus(b.returnDate, b.dueDate, now)
      for (const d of b.details) {
        rows.push({
          borrowNumber: b.borrowNumber,
          borrowDate: iso(b.borrowDate),
          memberNumber: b.memberNumber,
          memberName: b.memberName,
          className: b.className,
          bookTitle: d.bookTitle,
          dueDate: iso(b.dueDate),
          returnDate: b.returnDate ? iso(b.returnDate) : null,
          status
        })
      }
    }

    return {
      rows,
      pagination: toReportPagination(result),
      summary: {
        total: result.total,
        active: summary.active,
        completed: summary.completed,
        overdue: summary.overdue
      }
    }
  }

  // -------------------------------------------------------------------------
  // Laporan Pengembalian (1 baris = 1 buku kembali)
  // -------------------------------------------------------------------------

  async getReturnReport(filter: ReturnReportFilter): Promise<ReturnReportDTO> {
    const { from, to } = parseRange(filter.from, filter.to)

    const [result, cond] = await Promise.all([
      this.reportRepository.findReturnedDetailsBetween({ from, to, page: filter.page, limit: filter.limit }),
      this.reportRepository.countReturnedConditionSummary(from, to)
    ])

    const rows: ReturnReportRowDTO[] = result.data.map((d) => {
      const returnedAt = d.returnedAt
      return {
        borrowNumber: d.borrow.borrowNumber,
        borrowDate: iso(d.borrow.borrowDate),
        returnedAt: iso(returnedAt ?? new Date()),
        memberNumber: d.borrow.memberNumber,
        memberName: d.borrow.memberName,
        className: d.borrow.className,
        bookTitle: d.bookTitle,
        conditionBack: d.conditionBack,
        dueDate: iso(d.borrow.dueDate),
        lateDays: returnedAt && returnedAt.getTime() > d.borrow.dueDate.getTime() ? diffDays(returnedAt, d.borrow.dueDate) : null
      }
    })

    return {
      rows,
      pagination: toReportPagination(result),
      summary: {
        total: result.total,
        returnedGood: cond.returnedGood,
        returnedDamaged: cond.returnedDamaged,
        returnedLost: cond.returnedLost
      }
    }
  }

  // -------------------------------------------------------------------------
  // Laporan Keterlambatan (tanpa nominal denda — K2)
  // -------------------------------------------------------------------------

  async getOverdueReport(filter: OverdueReportFilter): Promise<OverdueReportDTO> {
    const { from, to } = parseRange(filter.from, filter.to)
    const now = new Date()

    const [active, returned] = await Promise.all([
      this.reportRepository.findActiveOverdue(now, filter.page, filter.limit),
      this.reportRepository.findReturnedLateBetween({ from, to, page: filter.page, limit: filter.limit })
    ])

    const activeRows: OverdueReportRowDTO[] = active.data.map((b) => ({
      category: 'ACTIVE',
      borrowNumber: b.borrowNumber,
      borrowDate: iso(b.borrowDate),
      memberNumber: b.memberNumber,
      memberName: b.memberName,
      className: b.className,
      bookTitle: b.details.map((d) => d.bookTitle).join(', '),
      dueDate: iso(b.dueDate),
      returnDate: null,
      lateDays: diffDays(now, b.dueDate)
    }))

    const returnedRows: OverdueReportRowDTO[] = returned.data.map((r) => ({
      category: 'RETURNED',
      borrowNumber: r.borrowNumber,
      borrowDate: iso(r.borrowDate),
      memberNumber: r.memberNumber,
      memberName: r.memberName,
      className: r.className,
      bookTitle: r.bookTitle,
      dueDate: iso(r.dueDate),
      returnDate: iso(r.returnedAt),
      lateDays: diffDays(r.returnedAt, r.dueDate)
    }))

    return {
      rows: [...activeRows, ...returnedRows],
      pagination: {
        page: filter.page ?? 1,
        limit: filter.limit ?? 10,
        total: active.total + returned.total,
        totalPages: Math.max(active.totalPages, returned.totalPages)
      },
      summary: { active: active.total, returned: returned.total }
    }
  }

  // -------------------------------------------------------------------------
  // Laporan Anggota
  // -------------------------------------------------------------------------

  async getMemberReport(filter: MemberReportFilter): Promise<MemberReportDTO> {
    const [result, typeCounts] = await Promise.all([
      this.reportRepository.findMembersReport(filter),
      this.reportRepository.countMembersByType()
    ])

    const rows: MemberReportRowDTO[] = result.data.map((m) => {
      const enrollment = m.memberEnrollments[0]
      return {
        memberNumber: m.memberNumber,
        fullName: m.fullName,
        memberType: m.memberType,
        gender: m.gender,
        phone: m.phone,
        email: m.email,
        className: enrollment ? `${enrollment.class.educationLevel} ${enrollment.class.parallel}` : null,
        status: m.status
      }
    })

    const countByType = new Map(typeCounts.map((t) => [t.memberType, t.count]))

    return {
      rows,
      pagination: toReportPagination(result),
      summary: {
        total: result.total,
        students: countByType.get(MEMBER_TYPES.student.code) ?? 0,
        teachers: countByType.get(MEMBER_TYPES.teacher.code) ?? 0,
        general: countByType.get(MEMBER_TYPES.general.code) ?? 0
      }
    }
  }

  // -------------------------------------------------------------------------
  // Laporan Koleksi Buku
  // -------------------------------------------------------------------------

  async getCollectionReport(filter: CollectionReportFilter): Promise<CollectionReportDTO> {
    const [result, summary] = await Promise.all([
      this.reportRepository.findBookReportRows(filter),
      this.reportRepository.getCollectionSummary(filter.categoryId)
    ])

    const rows: CollectionReportRowDTO[] = result.data.map((b) => ({
      isbn: b.isbn,
      title: b.title,
      authorName: b.author?.name ?? null,
      publisherName: b.publisher?.name ?? null,
      categoryName: b.category?.name ?? null,
      publicationYear: b.publicationYear,
      copyCount: b._count.bookCopies
    }))

    return {
      rows,
      pagination: toReportPagination(result),
      summary
    }
  }
}
