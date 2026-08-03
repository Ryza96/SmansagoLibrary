import { BaseRepository } from './base/base.repository'
import type { Prisma } from '@prisma/client'
import { ACADEMIC_STATUS } from '../../shared/config/academic-status'
import { IMPORT_CONFIG } from '../../config/import.config'

type CreateEnrollmentData = Pick<import('@prisma/client').MemberEnrollment, 'memberId' | 'classId' | 'academicYearId'> & {
  status: string
  note?: string
}

const enrollmentInclude = {
  member: true,
  class: {
    include: {
      curriculum: true
    }
  },
  academicYear: true
} as const

type EnrollmentWithRelations = Prisma.MemberEnrollmentGetPayload<{
  include: typeof enrollmentInclude
}>

export class EnrollmentRepository extends BaseRepository {
  async create(data: CreateEnrollmentData): Promise<EnrollmentWithRelations> {
    return this.prisma.memberEnrollment.create({ data, include: enrollmentInclude })
  }

  async findById(id: string): Promise<EnrollmentWithRelations | null> {
    return this.prisma.memberEnrollment.findUnique({ where: { id }, include: enrollmentInclude })
  }

  async findActiveByMember(memberId: string): Promise<EnrollmentWithRelations | null> {
    return this.prisma.memberEnrollment.findFirst({
      where: { memberId, status: ACADEMIC_STATUS.active, leftAt: null },
      include: enrollmentInclude,
      orderBy: { enrolledAt: 'desc' }
    })
  }

  async countActiveByMember(memberId: string): Promise<number> {
    return this.prisma.memberEnrollment.count({
      where: { memberId, status: ACADEMIC_STATUS.active, leftAt: null }
    })
  }

  // WO-16 E-4 — riwayat enrollment per member, terbaru terlebih dahulu.
  // "Label historis tak berubah walau rename tahun lain": setiap baris men-join
  // academicYear miliknya sendiri (bukan tahun aktif), sehingga rename tahun lain
  // tidak mengubah label baris mana pun.
  async findManyByMember(memberId: string): Promise<EnrollmentWithRelations[]> {
    return this.prisma.memberEnrollment.findMany({
      where: { memberId },
      include: enrollmentInclude,
      orderBy: [{ enrolledAt: 'desc' }, { createdAt: 'desc' }]
    })
  }

  async countByClass(classId: string): Promise<number> {
    return this.prisma.memberEnrollment.count({
      where: { classId, status: ACADEMIC_STATUS.active, leftAt: null }
    })
  }

  // WO-18 MI-2 — tulis batch enrollment DI DALAM transaksi yang sama dengan
  // createMany Member (import). Chunked sama seperti MemberRepository. Satu
  // commit di akhir oleh prisma.$transaction — exception apa pun = rollback
  // penuh (tidak ada Member tanpa Enrollment, dan sebaliknya).
  async createManyWithTx(tx: Prisma.TransactionClient, rows: Prisma.MemberEnrollmentCreateManyInput[]): Promise<void> {
    const chunk = IMPORT_CONFIG.MEMBER_IMPORT_WRITE_CHUNK
    for (let i = 0; i < rows.length; i += chunk) {
      await tx.memberEnrollment.createMany({ data: rows.slice(i, i + chunk) })
    }
  }
}
