import { BaseRepository } from './base/base.repository'
import { getPaginationParams, toPaginatedResult } from './base/pagination'
import type { FindOptions } from './base/repository.types'
import type { Member, Prisma } from '@prisma/client'

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
