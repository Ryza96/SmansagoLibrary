import { BaseRepository } from './base/base.repository'
import { getPaginationParams, toPaginatedResult } from './base/pagination'
import { Prisma } from '@prisma/client'
import { ACADEMIC_STATUS } from '../../shared/config/academic-status'

// Report Module (R-1) — query AGREGAT khusus laporan, terpisah dari repository
// domain. Repository domain existing TIDAK diubah. Wajib memakai getPrisma()
// (stack baru, satu PrismaClient) via BaseRepository.
// KEPUTUSAN PO: laporan v1.0 tanpa kolom Petugas (K1) dan tanpa denda (K2).

export type BorrowReportStatusFilter = 'ACTIVE' | 'COMPLETED' | 'OVERDUE'

export interface BorrowReportQuery {
  from: Date
  to: Date
  status?: BorrowReportStatusFilter
  page?: number
  limit?: number
}

export interface ReturnReportQuery {
  from: Date
  to: Date
  page?: number
  limit?: number
}

export interface MemberReportQuery {
  memberType?: string
  academicYearId?: string
  classId?: string
  search?: string
  page?: number
  limit?: number
}

export interface BookReportQuery {
  categoryId?: string
  search?: string
  page?: number
  limit?: number
}

const borrowReportInclude = {
  details: {
    include: {
      bookCopy: {
        include: { book: true }
      }
    }
  },
  member: true
} as const

type BorrowReportRow = Prisma.BorrowGetPayload<{ include: typeof borrowReportInclude }>

// SSOT penempatan kelas = MemberEnrollment ACTIVE (pola member.repository.findMany).
const memberReportInclude = {
  memberEnrollments: {
    where: { status: ACADEMIC_STATUS.active, leftAt: null },
    include: {
      class: { include: { curriculum: true } },
      academicYear: true
    },
    orderBy: { enrolledAt: 'desc' }
  }
} as const

type MemberReportRow = Prisma.MemberGetPayload<{ include: typeof memberReportInclude }>

const bookReportInclude = {
  author: true,
  publisher: true,
  category: true,
  _count: { select: { bookCopies: true } }
} as const

type BookReportRow = Prisma.BookGetPayload<{ include: typeof bookReportInclude }>

export interface ReturnedLateRawRow {
  detailId: string
  borrowId: string
  borrowNumber: string
  borrowDate: Date
  dueDate: Date
  returnedAt: Date
  memberNumber: string
  memberName: string
  className: string | null
  bookTitle: string
  conditionBack: string | null
}

function buildBorrowReportWhere(query: BorrowReportQuery): Prisma.BorrowWhereInput {
  const where: Prisma.BorrowWhereInput = {
    borrowDate: { gte: query.from, lte: query.to }
  }
  if (query.status === 'ACTIVE') where.returnDate = null
  if (query.status === 'COMPLETED') where.returnDate = { not: null }
  if (query.status === 'OVERDUE') {
    where.returnDate = null
    where.dueDate = { lt: new Date() }
  }
  return where
}

export class ReportRepository extends BaseRepository {
  // -------------------------------------------------------------------------
  // Laporan Peminjaman
  // -------------------------------------------------------------------------

  async findBorrowingsBetween(query: BorrowReportQuery) {
    const { skip, take } = getPaginationParams({ page: query.page, limit: query.limit })
    const where = buildBorrowReportWhere(query)

    const [data, total] = await Promise.all([
      this.prisma.borrow.findMany({
        where,
        skip,
        take,
        orderBy: { borrowDate: 'asc' },
        include: borrowReportInclude
      }),
      this.prisma.borrow.count({ where })
    ])

    return toPaginatedResult<BorrowReportRow>(data, total, { page: query.page, limit: query.limit })
  }

  async countBorrowStatusSummary(from: Date, to: Date) {
    const base: Prisma.BorrowWhereInput = { borrowDate: { gte: from, lte: to } }
    const [active, completed, overdue] = await Promise.all([
      this.prisma.borrow.count({ where: { ...base, returnDate: null } }),
      this.prisma.borrow.count({ where: { ...base, returnDate: { not: null } } }),
      this.prisma.borrow.count({ where: { ...base, returnDate: null, dueDate: { lt: new Date() } } })
    ])
    return { active, completed, overdue }
  }

  // -------------------------------------------------------------------------
  // Laporan Pengembalian (1 baris = 1 BorrowDetail yang sudah dikembalikan)
  // -------------------------------------------------------------------------

  async findReturnedDetailsBetween(query: ReturnReportQuery) {
    const { skip, take } = getPaginationParams({ page: query.page, limit: query.limit })
    const where: Prisma.BorrowDetailWhereInput = {
      returnedAt: { gte: query.from, lte: query.to }
    }

    const [data, total] = await Promise.all([
      this.prisma.borrowDetail.findMany({
        where,
        skip,
        take,
        orderBy: { returnedAt: 'asc' },
        include: {
          borrow: { include: { member: true } },
          bookCopy: { include: { book: true } }
        }
      }),
      this.prisma.borrowDetail.count({ where })
    ])

    return toPaginatedResult(data, total, { page: query.page, limit: query.limit })
  }

  async countReturnedConditionSummary(from: Date, to: Date) {
    const where: Prisma.BorrowDetailWhereInput = { returnedAt: { gte: from, lte: to } }
    const [returnedGood, returnedDamaged, returnedLost] = await Promise.all([
      this.prisma.borrowDetail.count({ where: { ...where, conditionBack: 'BAIK' } }),
      this.prisma.borrowDetail.count({ where: { ...where, conditionBack: 'RUSAK' } }),
      this.prisma.borrowDetail.count({ where: { ...where, conditionBack: 'HILANG' } })
    ])
    return { returnedGood, returnedDamaged, returnedLost }
  }

  // -------------------------------------------------------------------------
  // Laporan Keterlambatan
  // -------------------------------------------------------------------------

  // Masih terlambat: belum dikembalikan DAN dueDate < asOf.
  async findActiveOverdue(asOf: Date, page?: number, limit?: number) {
    const { skip, take } = getPaginationParams({ page, limit })
    const where: Prisma.BorrowWhereInput = { returnDate: null, dueDate: { lt: asOf } }

    const [data, total] = await Promise.all([
      this.prisma.borrow.findMany({
        where,
        skip,
        take,
        orderBy: { dueDate: 'asc' },
        include: borrowReportInclude
      }),
      this.prisma.borrow.count({ where })
    ])

    return toPaginatedResult<BorrowReportRow>(data, total, { page, limit })
  }

  // Pernah terlambat: sudah dikembalikan DAN returnedAt > dueDate.
  // Perbandingan dua kolom (bd.returnedAt vs b.dueDate) TIDAK bisa diekspresikan
  // sebagai Prisma relation filter → pakai SQL join eksplisit (indexed filter range).
  async findReturnedLateBetween(query: ReturnReportQuery) {
    const { skip, take } = getPaginationParams({ page: query.page, limit: query.limit })

    const rows = await this.prisma.$queryRaw<ReturnedLateRawRow[]>(Prisma.sql`
      SELECT
        bd.id AS detailId,
        bd.borrowId,
        bd.bookTitle,
        bd.conditionBack,
        bd.returnedAt,
        b.borrowNumber,
        b.borrowDate,
        b.dueDate,
        b.memberNumber,
        b.memberName,
        b.className
      FROM BorrowDetail bd
      JOIN Borrow b ON b.id = bd.borrowId
      WHERE bd.returnedAt IS NOT NULL
        AND bd.returnedAt >= ${query.from}
        AND bd.returnedAt <= ${query.to}
        AND bd.returnedAt > b.dueDate
      ORDER BY bd.returnedAt ASC
      LIMIT ${take} OFFSET ${skip}
    `)

    const countRows = await this.prisma.$queryRaw<Array<{ c: number | bigint }>>(Prisma.sql`
      SELECT COUNT(*) AS c
      FROM BorrowDetail bd
      JOIN Borrow b ON b.id = bd.borrowId
      WHERE bd.returnedAt IS NOT NULL
        AND bd.returnedAt >= ${query.from}
        AND bd.returnedAt <= ${query.to}
        AND bd.returnedAt > b.dueDate
    `)

    const total = Number(countRows[0]?.c ?? 0)
    return toPaginatedResult<ReturnedLateRawRow>(rows, total, { page: query.page, limit: query.limit })
  }

  // -------------------------------------------------------------------------
  // Laporan Anggota
  // -------------------------------------------------------------------------

  async findMembersReport(query: MemberReportQuery) {
    const { skip, take } = getPaginationParams({ page: query.page, limit: query.limit })

    const where: Prisma.MemberWhereInput = {}
    if (query.search) {
      where.OR = [
        { memberNumber: { contains: query.search } },
        { fullName: { contains: query.search } }
      ]
    }
    if (query.memberType) where.memberType = query.memberType

    const enrollmentFilter: Prisma.MemberEnrollmentWhereInput = {
      status: ACADEMIC_STATUS.active,
      leftAt: null
    }
    if (query.classId) enrollmentFilter.classId = query.classId
    if (query.academicYearId) enrollmentFilter.academicYearId = query.academicYearId
    if (query.classId || query.academicYearId) {
      where.memberEnrollments = { some: enrollmentFilter }
    }

    const [data, total] = await Promise.all([
      this.prisma.member.findMany({
        where,
        skip,
        take,
        orderBy: { memberNumber: 'asc' },
        include: memberReportInclude
      }),
      this.prisma.member.count({ where })
    ])

    return toPaginatedResult<MemberReportRow>(data, total, { page: query.page, limit: query.limit })
  }

  async countMembersByType() {
    const grouped = await this.prisma.member.groupBy({ by: ['memberType'], _count: { _all: true } })
    return grouped.map((g) => ({ memberType: g.memberType, count: g._count._all }))
  }

  // -------------------------------------------------------------------------
  // Laporan Koleksi Buku
  // -------------------------------------------------------------------------

  async findBookReportRows(query: BookReportQuery) {
    const { skip, take } = getPaginationParams({ page: query.page, limit: query.limit })

    const where: Prisma.BookWhereInput = {}
    if (query.categoryId) where.categoryId = query.categoryId
    if (query.search) where.title = { contains: query.search }

    const [data, total] = await Promise.all([
      this.prisma.book.findMany({
        where,
        skip,
        take,
        orderBy: { title: 'asc' },
        include: bookReportInclude
      }),
      this.prisma.book.count({ where })
    ])

    return toPaginatedResult<BookReportRow>(data, total, { page: query.page, limit: query.limit })
  }

  async getCollectionSummary(categoryId?: string) {
    const bookWhere: Prisma.BookWhereInput = categoryId ? { categoryId } : {}
    const copyWhere: Prisma.BookCopyWhereInput = categoryId ? { book: { categoryId } } : {}

    const [totalTitles, totalCopies, assetAgg, byStatus, byCondition] = await Promise.all([
      this.prisma.book.count({ where: bookWhere }),
      this.prisma.bookCopy.count({ where: copyWhere }),
      this.prisma.bookCopy.aggregate({ _sum: { acquisitionCost: true }, where: copyWhere }),
      this.prisma.bookCopy.groupBy({ by: ['status'], _count: { _all: true }, where: copyWhere }),
      this.prisma.bookCopy.groupBy({ by: ['condition'], _count: { _all: true }, where: copyWhere })
    ])

    return {
      totalTitles,
      totalCopies,
      totalAssetValue: assetAgg._sum.acquisitionCost ?? 0,
      byStatus: byStatus.map((g) => ({ status: g.status, count: g._count._all })),
      byCondition: byCondition.map((g) => ({ condition: g.condition, count: g._count._all }))
    }
  }
}
