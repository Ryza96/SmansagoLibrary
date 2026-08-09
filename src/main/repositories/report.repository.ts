import { BaseRepository } from './base/base.repository'
import { getPaginationParams, toPaginatedResult } from './base/pagination'
import { Prisma } from '@prisma/client'
import { ACADEMIC_STATUS } from '../../shared/config/academic-status'
import { BOOK_COPY_STATUS } from '../../shared/config/book-copy-status'
import { BookCopyCondition } from '../../../electron/main/shared/book-copy-condition'

// Report Module (R-1) — query AGREGAT khusus laporan, terpisah dari repository
// domain. Repository domain existing TIDAK diubah. Wajib memakai getPrisma()
// (stack baru, satu PrismaClient) via BaseRepository.
// KEPUTUSAN PO: laporan v1.0 tanpa kolom Petugas (K1) dan tanpa denda (K2).

export type BorrowReportStatusFilter = 'ACTIVE' | 'COMPLETED' | 'OVERDUE'

export interface BorrowReportQuery {
  from: Date
  to: Date
  status?: BorrowReportStatusFilter
  search?: string
  page?: number
  limit?: number
}

export interface ReturnReportQuery {
  from: Date
  to: Date
  search?: string
  page?: number
  limit?: number
  // Override slice untuk pagination gabungan (Laporan Keterlambatan R-4).
  skip?: number
  take?: number
}

export interface MemberReportQuery {
  memberType?: string
  academicYearId?: string
  classId?: string
  search?: string
  // R-5: Status Keanggotaan. Source of Truth = kolom Member.status (MEMBER_STATUS
  // ALIGNMENT): ACTIVE = status 'ACTIVE', INACTIVE = selain 'ACTIVE'. MemberEnrollment
  // BUKAN sumber membershipStatus (hanya untuk Kelas).
  status?: 'ACTIVE' | 'INACTIVE'
  page?: number
  limit?: number
}

// Kueri Laporan Keterlambatan — bagian MASIH TERLAMBAT (borrow belum kembali,
// dueDate < asOf). 1 baris = 1 buku (BorrowDetail), search snapshot R-4.
export interface OverdueActiveQuery {
  asOf: Date
  search?: string
  page?: number
  limit?: number
  // Override slice untuk pagination gabungan (Laporan Keterlambatan R-4).
  skip?: number
  take?: number
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
// Include HANYA untuk turunan Kelas (className). Status Keanggotaan (membershipStatus)
// TIDAK diturunkan dari sini — Source of Truth = kolom Member.status (MEMBER_STATUS
// ALIGNMENT). Konsekuensinya: enrollment di-scan dengan filter ACTIVE, dan _count
// enrollment tidak lagi dibutuhkan oleh Laporan Anggota R-5.
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

// R-6: copyCount = eksemplar NON-REMOVED saja (keputusan PO G-4). _count difilter
// status != REMOVED sehingga `copyCount` row konsisten dengan totalCopies summary.
const bookReportInclude = {
  author: true,
  publisher: true,
  category: true,
  _count: {
    select: {
      bookCopies: { where: { status: { not: BOOK_COPY_STATUS.REMOVED } } }
    }
  }
} as const

type BookReportRow = Prisma.BookGetPayload<{ include: typeof bookReportInclude }>

// R-6: breakdown per-judul — per dimensi (status vs condition), boleh overlap
// (keputusan PO G-5). available+borrowed+lost = copyCount; damagedCount terpisah.
export interface BookReportRowWithCounts extends BookReportRow {
  availableCount: number
  borrowedCount: number
  lostCount: number
  damagedCount: number
}

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
  if (query.search) {
    const s = query.search
    where.OR = [
      { borrowNumber: { contains: s } },
      {
        member: {
          OR: [
            { memberNumber: { contains: s } },
            { fullName: { contains: s } }
          ]
        }
      },
      { details: { some: { bookCopy: { book: { title: { contains: s } } } } } }
    ]
  }
  return where
}

// Where untuk Laporan Pengembalian (1 baris = 1 BorrowDetail yang sudah dikembalikan).
// Search R-3 (server-side) memakai snapshot pada Borrow (borrowNumber/memberNumber/
// memberName) + snapshot bookTitle — persis nilai yang ditampilkan kolom tabel.
function buildReturnReportWhere(query: ReturnReportQuery): Prisma.BorrowDetailWhereInput {
  const where: Prisma.BorrowDetailWhereInput = {
    returnedAt: { gte: query.from, lte: query.to }
  }
  if (query.search) {
    const s = query.search
    where.OR = [
      { borrow: { borrowNumber: { contains: s } } },
      { borrow: { memberNumber: { contains: s } } },
      { borrow: { memberName: { contains: s } } },
      { bookTitle: { contains: s } }
    ]
  }
  return where
}

// Where untuk Laporan Keterlambatan — bagian MASIH TERLAMBAT (1 baris = 1 buku):
// detail belum dikembalikan dari borrow yang returnDate null + dueDate < asOf.
// Search R-4 memakai SNAPSHOT — seluruh term OR berada di LEVEL DETAIL
// (relation field filter `borrow: { ... }`), bukan bercabang di level borrow,
// agar `(borrowNumber | memberNumber | memberName | bookTitle)` adalah satu
// kelompok OR yang sama (pola buildReturnReportWhere).
function buildActiveOverdueWhere(asOf: Date, search?: string): Prisma.BorrowDetailWhereInput {
  const where: Prisma.BorrowDetailWhereInput = {
    returnedAt: null,
    borrow: { returnDate: null, dueDate: { lt: asOf } }
  }
  // Normalisasi sama dengan buildReturnedLateSearchSql (trim + truthy) agar search
  // dengan spasi leading/trailing berperilaku IDENTIK antara ACTIVE dan RETURNED
  // ("Search harus bekerja ... Baik ACTIVE maupun RETURNED" — kontrak R-4).
  const s = search?.trim()
  if (s) {
    where.OR = [
      { bookTitle: { contains: s } },
      { borrow: { borrowNumber: { contains: s } } },
      { borrow: { memberNumber: { contains: s } } },
      { borrow: { memberName: { contains: s } } }
    ]
  }
  return where
}

// SQL AND-clause untuk search SUDAH DIKEMBALIKAN TERLAMBAT (raw SQL join).
// Dipakai oleh findReturnedLateBetween (row + count) dan countReturnedLate —
// satu sumber agar filter konsisten. Empty bila search kosong.
function buildReturnedLateSearchSql(search?: string): Prisma.Sql {
  const s = search?.trim()
  return s
    ? Prisma.sql`AND (
        b.borrowNumber LIKE ${'%' + s + '%'}
        OR b.memberNumber LIKE ${'%' + s + '%'}
        OR b.memberName LIKE ${'%' + s + '%'}
        OR bd.bookTitle LIKE ${'%' + s + '%'}
      )`
    : Prisma.empty
}

// Where untuk Laporan Anggota (R-1 + R-5). Search cocok di nomor anggota & nama
// (server-side). Kelas filter memakai SSOT MemberEnrollment ACTIVE. Status Keanggotaan
// (R-5): ACTIVE = pernah memiliki MemberEnrollment (some {}), INACTIVE = tidak pernah
// (none {}). Kombinasi `some` + `none` di relation filter di-AND Prisma — untuk
// status INACTIVE + kelas, hasilnya kosong (anggota berkelas pasti pernah enrollment).
function buildMemberReportWhere(query: MemberReportQuery): Prisma.MemberWhereInput {
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

  // R-5 (MEMBER_STATUS_ALIGNMENT): Filter Status Keanggotaan berdasar kolom
  // Member.status — ACTIVE = 'ACTIVE', INACTIVE = selain 'ACTIVE'. BUKAN berdasar
  // keberadaan MemberEnrollment (enrollment hanya dipakai filter kelas/tahun di atas).
  if (query.status === 'ACTIVE') {
    where.status = 'ACTIVE'
  } else if (query.status === 'INACTIVE') {
    where.status = { not: 'ACTIVE' }
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

  async countBorrowStatusSummary(from: Date, to: Date, search?: string) {
    const base = buildBorrowReportWhere({ from, to, search })
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
    const where = buildReturnReportWhere(query)

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

  async countReturnedConditionSummary(from: Date, to: Date, search?: string) {
    const base = buildReturnReportWhere({ from, to, search })
    const [returnedGood, returnedDamaged, returnedLost] = await Promise.all([
      this.prisma.borrowDetail.count({ where: { ...base, conditionBack: 'BAIK' } }),
      this.prisma.borrowDetail.count({ where: { ...base, conditionBack: 'RUSAK' } }),
      this.prisma.borrowDetail.count({ where: { ...base, conditionBack: 'HILANG' } })
    ])
    return { returnedGood, returnedDamaged, returnedLost }
  }

  // Ringkasan waktu pengembalian (R-3): total detail dikembalikan + jumlah TERLAMBAT
  // (returnedAt > dueDate). onTime dihitung Service = total - late. Perbandingan dua
  // kolom tak bisa jadi Prisma relation filter → late pakai SQL join (pola R-1).
  async countReturnedTimingSummary(from: Date, to: Date, search?: string) {
    const [total, late] = await Promise.all([
      this.prisma.borrowDetail.count({ where: buildReturnReportWhere({ from, to, search }) }),
      this.countReturnedLate(from, to, search)
    ])
    return { total, late }
  }

  private async countReturnedLate(from: Date, to: Date, search?: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ c: number | bigint }>>(Prisma.sql`
      SELECT COUNT(*) AS c
      FROM BorrowDetail bd
      JOIN Borrow b ON b.id = bd.borrowId
      WHERE bd.returnedAt IS NOT NULL
        AND bd.returnedAt >= ${from}
        AND bd.returnedAt <= ${to}
        AND bd.returnedAt > b.dueDate
        ${buildReturnedLateSearchSql(search)}
    `)
    return Number(rows[0]?.c ?? 0)
  }

  // Count SUDAH DIKEMBALIKAN TERLAMBAT (R-4) — untuk pagination gabungan
  // Service; filter identik findReturnedLateBetween.
  async countReturnedLateBetween(from: Date, to: Date, search?: string): Promise<number> {
    return this.countReturnedLate(from, to, search)
  }

  // -------------------------------------------------------------------------
  // Laporan Keterlambatan
  // -------------------------------------------------------------------------

  // Masih terlambat: belum dikembalikan DAN dueDate < asOf.
  // (per-Borrow, legacy R-1 — dipakai regression smoke; Service memakai
  // findActiveOverdueDetails untuk 1 baris = 1 buku)
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

  // Masih terlambat, 1 baris = 1 buku (R-4): detail dari borrow yang returnDate
  // null + dueDate < asOf. Search R-4 memakai snapshot borrowNumber/memberNumber/
  // memberName pada Borrow + bookTitle pada detail (pola R-3, satu grup OR).
  async findActiveOverdueDetails(query: OverdueActiveQuery) {
    const { skip, take } =
      query.skip != null && query.take != null
        ? { skip: query.skip, take: query.take }
        : getPaginationParams({ page: query.page, limit: query.limit })
    const where = buildActiveOverdueWhere(query.asOf, query.search)

    const [data, total] = await Promise.all([
      this.prisma.borrowDetail.findMany({
        where,
        skip,
        take,
        orderBy: { borrow: { dueDate: 'asc' } },
        include: { borrow: true }
      }),
      this.prisma.borrowDetail.count({ where })
    ])

    return toPaginatedResult(data, total, { page: query.page, limit: query.limit })
  }

  // Count MASIH TERLAMBAT (R-4) — untuk pagination gabungan Service; filter
  // identik findActiveOverdueDetails (buildActiveOverdueWhere).
  async countActiveOverdueDetails(query: OverdueActiveQuery): Promise<number> {
    return this.prisma.borrowDetail.count({ where: buildActiveOverdueWhere(query.asOf, query.search) })
  }

  // Pernah terlambat: sudah dikembalikan DAN returnedAt > dueDate.
  // Perbandingan dua kolom (bd.returnedAt vs b.dueDate) TIDAK bisa diekspresikan
  // sebagai Prisma relation filter → pakai SQL join eksplisit (indexed filter range).
  // Search R-4 (server-side) memakai snapshot, filter sama di row query & count.
  async findReturnedLateBetween(query: ReturnReportQuery) {
    const { skip, take } =
      query.skip != null && query.take != null
        ? { skip: query.skip, take: query.take }
        : getPaginationParams({ page: query.page, limit: query.limit })
    const searchSql = buildReturnedLateSearchSql(query.search)

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
        ${searchSql}
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
        ${searchSql}
    `)

    const total = Number(countRows[0]?.c ?? 0)
    return toPaginatedResult<ReturnedLateRawRow>(rows, total, { page: query.page, limit: query.limit })
  }

  // -------------------------------------------------------------------------
  // Laporan Anggota
  // -------------------------------------------------------------------------

  async findMembersReport(query: MemberReportQuery) {
    const { skip, take } = getPaginationParams({ page: query.page, limit: query.limit })
    const where = buildMemberReportWhere(query)

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

  // Ringkasan jumlah per tipe anggota (R-1) — kini mengikuti filter (search/kelas/
  // status) sehingga konsisten dengan ringkasan lain (R-5: "statistik ikut filter").
  async countMembersByType(query?: MemberReportQuery) {
    const where = query ? buildMemberReportWhere(query) : {}
    const grouped = await this.prisma.member.groupBy({ by: ['memberType'], where, _count: { _all: true } })
    return grouped.map((g) => ({ memberType: g.memberType, count: g._count._all }))
  }

  // Ringkasan Status Keanggotaan (R-5, MEMBER_STATUS_ALIGNMENT): ACTIVE = kolom
  // Member.status 'ACTIVE', NONAKTIF = selain 'ACTIVE'. MemberEnrollment BUKAN sumber.
  // `base` (buildMemberReportWhere) sudah memuat filter search/kelas/tahun/status;
  // partisi ACTIVE/nonActive di-AND di atas base (bukan menimpa) sehingga ringkasan
  // SELALU mengikuti filter — active + nonActive === total konsisten dengan pagination.
  async countMemberMembershipSummary(query: MemberReportQuery) {
    const base = buildMemberReportWhere(query)
    const [active, nonActive] = await Promise.all([
      this.prisma.member.count({ where: { ...base, AND: [{ status: 'ACTIVE' }] } }),
      this.prisma.member.count({ where: { ...base, AND: [{ status: { not: 'ACTIVE' } }] } })
    ])
    return { active, nonActive }
  }

  // -------------------------------------------------------------------------
  // Laporan Koleksi Buku
  // -------------------------------------------------------------------------

  async findBookReportRows(query: BookReportQuery) {
    const { skip, take } = getPaginationParams({ page: query.page, limit: query.limit })

    const where = buildBookReportWhere(query)

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

    // R-6: breakdown status/condition per-judul via groupBy pada halaman ini
    // (bukan fetch-all — anti-pola B1). available+borrowed+lost = copyCount.
    const ids = data.map((b) => b.id)
    const [statusGroups, damagedGroups] = ids.length
      ? await Promise.all([
          this.prisma.bookCopy.groupBy({
            by: ['bookId', 'status'],
            where: { bookId: { in: ids }, status: { not: BOOK_COPY_STATUS.REMOVED } },
            _count: { _all: true }
          }),
          this.prisma.bookCopy.groupBy({
            by: ['bookId'],
            where: {
              bookId: { in: ids },
              status: { not: BOOK_COPY_STATUS.REMOVED },
              condition: { in: [BookCopyCondition.LIGHT_DAMAGE, BookCopyCondition.HEAVY_DAMAGE] }
            },
            _count: { _all: true }
          })
        ])
      : [[], []]

    const statusMap = new Map<string, Map<string, number>>()
    for (const g of statusGroups) {
      const byBook = statusMap.get(g.bookId) ?? new Map<string, number>()
      byBook.set(g.status, g._count._all)
      statusMap.set(g.bookId, byBook)
    }
    const damagedMap = new Map<string, number>()
    for (const g of damagedGroups) damagedMap.set(g.bookId, g._count._all)

    const rows: BookReportRowWithCounts[] = data.map((b) => {
      const byStatus = statusMap.get(b.id) ?? new Map<string, number>()
      return {
        ...b,
        availableCount: byStatus.get(BOOK_COPY_STATUS.AVAILABLE) ?? 0,
        borrowedCount: byStatus.get(BOOK_COPY_STATUS.BORROWED) ?? 0,
        lostCount: byStatus.get(BOOK_COPY_STATUS.LOST) ?? 0,
        damagedCount: damagedMap.get(b.id) ?? 0
      }
    })

    return toPaginatedResult<BookReportRowWithCounts>(rows, total, { page: query.page, limit: query.limit })
  }

  // R-6: getCollectionSummary kini menerima search (opsional) & mengeksklusi REMOVED
  // dari totalCopies/byStatus/byCondition (keputusan PO G-4). Ringkasan mengikuti
  // filter sehingga konsisten dengan rows (pola R-2..R-5).
  async getCollectionSummary(categoryId?: string, search?: string) {
    const bookWhere = buildBookReportWhere({ categoryId, search })
    const copyWhere: Prisma.BookCopyWhereInput = {
      status: { not: BOOK_COPY_STATUS.REMOVED },
      book: bookWhere
    }

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

// R-6 (G-6): search laporan koleksi = OR atas title, isbn, author.name, publisher.name
// (bukan hanya title contains). Dipakai findBookReportRows + getCollectionSummary agar
// ringkasan konsisten dengan rows.
function buildBookReportWhere(query: Pick<BookReportQuery, 'categoryId' | 'search'>): Prisma.BookWhereInput {
  const where: Prisma.BookWhereInput = {}
  if (query.categoryId) where.categoryId = query.categoryId
  if (query.search) {
    const s = query.search
    where.OR = [
      { title: { contains: s } },
      { isbn: { contains: s } },
      { author: { name: { contains: s } } },
      { publisher: { name: { contains: s } } }
    ]
  }
  return where
}
