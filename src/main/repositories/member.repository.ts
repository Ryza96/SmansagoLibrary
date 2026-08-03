import { BaseRepository } from './base/base.repository'
import { getPaginationParams, toPaginatedResult } from './base/pagination'
import type { FindOptions } from './base/repository.types'
import type { Member, Prisma } from '@prisma/client'
import { IMPORT_CONFIG } from '../../config/import.config'

type CreateMemberData = Pick<Member, 'memberNumber' | 'fullName'> & {
  memberType?: string
  gender?: string
  nisn?: string
  nip?: string
  nuptk?: string
  nik?: string
  birthPlace?: string
  birthDate?: Date
  address?: string
  phone?: string
  email?: string
  classId?: string
  status?: string
}

type UpdateMemberData = Partial<CreateMemberData>

type MemberWithRelations = Prisma.MemberGetPayload<{
  include: {
    class: {
      include: {
        academicYear: true
        curriculum: true
      }
    }
  }
}>

const memberInclude = {
  class: {
    include: {
      academicYear: true,
      curriculum: true
    }
  }
} as const

export class MemberRepository extends BaseRepository {
  async create(data: CreateMemberData): Promise<Member> {
    return this.prisma.member.create({ data })
  }

  async update(id: string, data: UpdateMemberData): Promise<Member> {
    return this.prisma.member.update({ where: { id }, data })
  }

  async delete(id: string): Promise<void> {
    await this.prisma.member.delete({ where: { id } })
  }

  async findById(id: string): Promise<MemberWithRelations | null> {
    return this.prisma.member.findUnique({
      where: { id },
      include: memberInclude
    })
  }

  async findByMemberNumber(memberNumber: string): Promise<Member | null> {
    return this.prisma.member.findUnique({ where: { memberNumber } })
  }

  async findMany(options?: FindOptions) {
    const { skip, take } = getPaginationParams(options?.pagination)

    const where: Record<string, unknown> = {}

    if (options?.search) {
      where.OR = [
        { memberNumber: { contains: options.search } },
        { fullName: { contains: options.search } },
        { nisn: { contains: options.search } },
        { nip: { contains: options.search } },
        { nik: { contains: options.search } }
      ]
    }

    if (options?.memberType) {
      where.memberType = options.memberType
    }

    const [data, total] = await Promise.all([
      this.prisma.member.findMany({
        where,
        skip,
        take,
        orderBy: { memberNumber: 'asc' }
      }),
      this.prisma.member.count({ where })
    ])

    return toPaginatedResult(data, total, options?.pagination)
  }

  async existsByMemberNumber(memberNumber: string): Promise<boolean> {
    const count = await this.prisma.member.count({ where: { memberNumber } })
    return count > 0
  }

  async count(): Promise<number> {
    return this.prisma.member.count()
  }

  async findManyByNISNs(nisns: string[]): Promise<Member[]> {
    const unique = [...new Set(nisns)]
    const chunk = IMPORT_CONFIG.MEMBER_IMPORT_LOOKUP_CHUNK
    const found: Member[] = []
    for (let i = 0; i < unique.length; i += chunk) {
      const rows = await this.prisma.member.findMany({
        where: { nisn: { in: unique.slice(i, i + chunk) } }
      })
      found.push(...rows)
    }
    return found
  }

  async findManyByEmails(emails: string[]): Promise<Member[]> {
    const unique = [...new Set(emails)]
    const chunk = IMPORT_CONFIG.MEMBER_IMPORT_LOOKUP_CHUNK
    const found: Member[] = []
    for (let i = 0; i < unique.length; i += chunk) {
      const rows = await this.prisma.member.findMany({
        where: { email: { in: unique.slice(i, i + chunk) } }
      })
      found.push(...rows)
    }
    return found
  }

  async findLastMemberNumberByPrefix(prefix: string, tx?: Prisma.TransactionClient): Promise<string | null> {
    const client = tx ?? this.prisma
    const row = await client.member.findFirst({
      where: { memberNumber: { startsWith: `${prefix}-` } },
      select: { memberNumber: true },
      orderBy: { memberNumber: 'desc' }
    })
    return row?.memberNumber ?? null
  }

  async createManyWithTx(tx: Prisma.TransactionClient, rows: Prisma.MemberCreateManyInput[]): Promise<void> {
    const chunk = IMPORT_CONFIG.MEMBER_IMPORT_WRITE_CHUNK
    for (let i = 0; i < rows.length; i += chunk) {
      await tx.member.createMany({ data: rows.slice(i, i + chunk) })
    }
  }

  // WO P-2 — sinkronisasi Member.status (RFC §4.3) DI DALAM transaksi eksekusi
  // promosi: PROMOTED/REPEATED → ACTIVE; GRADUATED → INACTIVE (nilai dihitung
  // service via memberStatusForTerminalAcademic).
  async updateStatusWithTx(tx: Prisma.TransactionClient, memberId: string, status: 'ACTIVE' | 'INACTIVE'): Promise<void> {
    await tx.member.update({ where: { id: memberId }, data: { status } })
  }

  async countBorrows(memberId: string): Promise<number> {
    return this.prisma.borrow.count({ where: { memberId } })
  }

  async countByClass(classId: string): Promise<number> {
    return this.prisma.member.count({ where: { classId } })
  }

  async findByNISN(nisn: string): Promise<Member | null> {
    return this.prisma.member.findUnique({ where: { nisn } })
  }

  async findByNIP(nip: string): Promise<Member | null> {
    return this.prisma.member.findUnique({ where: { nip } })
  }

  async findByNUPTK(nuptk: string): Promise<Member | null> {
    return this.prisma.member.findUnique({ where: { nuptk } })
  }

  async findByNIK(nik: string): Promise<Member | null> {
    return this.prisma.member.findUnique({ where: { nik } })
  }
}
