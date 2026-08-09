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

  // WO-19 MI-3 — batch lookup "sudah ACTIVE di tahun target" untuk BANYAK
  // member sekaligus (mengikuti aturan performa: dilarang query per baris).
  // Mengembalikan Set<memberId> yang sudah ACTIVE di tahun tsb.
  async findMemberIdsActiveInYear(memberIds: string[], academicYearId: string): Promise<Set<string>> {
    if (memberIds.length === 0) return new Set()
    const rows = await this.prisma.memberEnrollment.findMany({
      where: { memberId: { in: memberIds }, academicYearId, status: ACADEMIC_STATUS.active, leftAt: null },
      select: { memberId: true }
    })
    return new Set(rows.map((row) => row.memberId))
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

  // MEMBER_STATUS_ALIGNMENT (Fase 1) — close() service kini satu tulis tunggal
  // (tanpa sinkronisasi Member.status), sehingga cukup update tanpa transaksi.
  async close(enrollmentId: string, status: string, note?: string | null): Promise<EnrollmentWithRelations> {
    return this.prisma.memberEnrollment.update({
      where: { id: enrollmentId },
      data: { status, leftAt: new Date(), note },
      include: enrollmentInclude
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

  // WO P-1 — baca enrollment ACTIVE untuk BANYAK kelas di SATU tahun (preview
  // promosi, RFC §7.1 step 1). Read-only. Service TIDAK mengakses Prisma
  // langsung — seluruh akses data lewat repository (arsitektur project).
  // Mengembalikan enrollment + nama member + kelas sumber (level/parallel/kurikulum).
  async findActiveByClasses(
    classIds: string[],
    academicYearId: string
  ): Promise<
    Array<{
      id: string
      memberId: string
      classId: string
      member: { fullName: string }
      class: { id: string; educationLevel: string; parallel: string; curriculumId: string }
    }>
  > {
    return this.findActiveByClassesWithTx(this.prisma, classIds, academicYearId)
  }

  // WO P-2 — varian findActiveByClasses yang menerima TransactionClient untuk
  // re-validasi state TERBARU di dalam transaksi eksekusi (RFC §7.1/§8 re-validate:
  // hanya enrollment ACTIVE yang diproses; keputusan basi tidak pernah dieksekusi).
  async findActiveByClassesWithTx(
    tx: Prisma.TransactionClient,
    classIds: string[],
    academicYearId: string
  ): Promise<
    Array<{
      id: string
      memberId: string
      classId: string
      member: { fullName: string }
      class: { id: string; educationLevel: string; parallel: string; curriculumId: string }
    }>
  > {
    if (classIds.length === 0) return []
    return tx.memberEnrollment.findMany({
      where: {
        academicYearId,
        classId: { in: classIds },
        status: ACADEMIC_STATUS.active,
        leftAt: null
      },
      select: {
        id: true,
        memberId: true,
        classId: true,
        member: { select: { fullName: true } },
        class: { select: { id: true, educationLevel: true, parallel: true, curriculumId: true } }
      },
      orderBy: [{ class: { educationLevel: 'asc' } }, { class: { parallel: 'asc' } }, { member: { fullName: 'asc' } }]
    })
  }

  // WO P-2 — tutup enrollment (terminal status + leftAt) DI DALAM transaksi
  // eksekusi promosi. Tidak pernah DELETE (RFC §6.2).
  async closeWithTx(tx: Prisma.TransactionClient, enrollmentId: string, status: string, note: string): Promise<void> {
    await tx.memberEnrollment.update({
      where: { id: enrollmentId },
      data: { status, leftAt: new Date(), note }
    })
  }

  // WO P-2 — buka enrollment ACTIVE baru DI DALAM transaksi eksekusi promosi
  // (member pindah ke kelas target tahun target; invarian satu-ACTIVE dijaga
  // karena sumber ditutup pada transaksi yang sama).
  async createActiveWithTx(
    tx: Prisma.TransactionClient,
    data: { memberId: string; classId: string; academicYearId: string; note?: string }
  ): Promise<void> {
    await tx.memberEnrollment.create({
      data: {
        memberId: data.memberId,
        classId: data.classId,
        academicYearId: data.academicYearId,
        status: ACADEMIC_STATUS.active,
        note: data.note
      }
    })
  }
}
