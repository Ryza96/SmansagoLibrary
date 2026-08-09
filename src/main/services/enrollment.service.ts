import { EnrollmentRepository } from '../repositories/enrollment.repository'
import { MemberRepository } from '../repositories/member.repository'
import { ClassRepository } from '../repositories/class.repository'
import type { EnrollmentDTO, CreateEnrollmentDTO, CloseEnrollmentDTO, RepointEnrollmentDTO } from '../../shared/dto/enrollment'
import { ACADEMIC_STATUS, isTerminalAcademicStatus } from '../../shared/config/academic-status'
import { getMemberType } from '../../shared/config/member-type'
import { getPrisma } from '../repositories/base/prisma'
import { runTransaction } from '../repositories/base/transaction'
import { AppError } from '../../../electron/main/errorHandler'

function toDTO(record: NonNullable<Awaited<ReturnType<EnrollmentRepository['findById']>>>): EnrollmentDTO {
  return {
    id: record.id,
    memberId: record.memberId,
    memberNumber: record.member.memberNumber,
    memberName: record.member.fullName,
    classId: record.classId,
    className: `${record.class.educationLevel} ${record.class.parallel}`,
    curriculumName: record.class.curriculum?.name ?? null,
    academicYearId: record.academicYearId,
    academicYearName: record.academicYear.name,
    status: record.status,
    enrolledAt: record.enrolledAt.toISOString(),
    leftAt: record.leftAt?.toISOString() ?? null,
    note: record.note,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  }
}

export class EnrollmentService {
  constructor(
    private repository: EnrollmentRepository,
    private memberRepository: MemberRepository,
    private classRepository: ClassRepository
  ) {}

  // RFC §6.2 — enroll(memberId, classId, academicYearId).
  // Validasi: member ada & punya rekor akademik (hanya siswa);
  // class ada & milik tahun ajaran yang sama; tidak ada enrollment ACTIVE lain (satu-ACTIVE).
  async enroll(input: CreateEnrollmentDTO): Promise<EnrollmentDTO> {
    const member = await this.memberRepository.findById(input.memberId)
    if (!member) {
      throw new AppError(404, 'Not Found', `Member ${input.memberId} tidak ditemukan`)
    }

    const memberType = getMemberType(member.memberType)
    if (!memberType?.hasAcademicRecord) {
      throw new AppError(400, 'Conflict', `Member ${member.memberNumber} tidak memiliki rekor akademik (hanya siswa yang dapat di-enroll)`)
    }

    const cls = await this.classRepository.findById(input.classId)
    if (!cls) {
      throw new AppError(404, 'Not Found', `Kelas ${input.classId} tidak ditemukan`)
    }
    if (cls.academicYearId !== input.academicYearId) {
      throw new AppError(400, 'Conflict', `Kelas ${cls.educationLevel} ${cls.parallel} bukan milik tahun ajaran ${input.academicYearId}`)
    }

    const activeCount = await this.repository.countActiveByMember(input.memberId)
    if (activeCount > 0) {
      throw new AppError(400, 'Conflict', `Member ${member.memberNumber} masih memiliki enrollment aktif — tutup terlebih dahulu atau gunakan repoint`)
    }

    const record = await this.repository.create({
      memberId: input.memberId,
      classId: input.classId,
      academicYearId: input.academicYearId,
      status: ACADEMIC_STATUS.active,
      note: input.note
    })

    return toDTO(record)
  }

  // RFC §6.2 — close(enrollmentId, status, note).
  // Hanya untuk enrollment ACTIVE; status harus terminal; tidak pernah DELETE.
  // MEMBER_STATUS_ALIGNMENT (Fase 1) — close TIDAK lagi menulis Member.status:
  // Member.status (membership) terpisah dari MemberEnrollment.status (akademik),
  // jadi penutupan enrollment murni menutup baris enrollment.
  async close(enrollmentId: string, input: CloseEnrollmentDTO): Promise<EnrollmentDTO> {
    const existing = await this.repository.findById(enrollmentId)
    if (!existing) {
      throw new AppError(404, 'Not Found', `Enrollment ${enrollmentId} tidak ditemukan`)
    }
    if (existing.status !== ACADEMIC_STATUS.active) {
      throw new AppError(400, 'Conflict', `Enrollment ${enrollmentId} tidak aktif (status=${existing.status})`)
    }
    if (!isTerminalAcademicStatus(input.status)) {
      throw new AppError(
        400,
        'Conflict',
        `Status penutupan ${input.status} tidak valid — harus status terminal (PROMOTED/REPEATED/REDISTRIBUTED/TRANSFERRED/DROPPED/GRADUATED)`
      )
    }

    const record = await this.repository.close(enrollmentId, input.status, input.note)
    return toDTO(record)
  }

  // RFC §4.1 REPOINT (mutasi tengah tahun) — close(REDISTRIBUTED) + enroll di kelas target,
  // dalam SATU transaksi. Tahun ajaran baru = tahun ajaran enrollment lama.
  async repoint(enrollmentId: string, input: RepointEnrollmentDTO): Promise<EnrollmentDTO> {
    const existing = await this.repository.findById(enrollmentId)
    if (!existing) {
      throw new AppError(404, 'Not Found', `Enrollment ${enrollmentId} tidak ditemukan`)
    }
    if (existing.status !== ACADEMIC_STATUS.active) {
      throw new AppError(400, 'Conflict', `Enrollment ${enrollmentId} tidak aktif (status=${existing.status})`)
    }

    const target = await this.classRepository.findById(input.targetClassId)
    if (!target) {
      throw new AppError(404, 'Not Found', `Kelas target ${input.targetClassId} tidak ditemukan`)
    }
    if (target.academicYearId !== existing.academicYearId) {
      throw new AppError(400, 'Conflict', `Kelas target ${target.educationLevel} ${target.parallel} bukan milik tahun ajaran yang sama`)
    }
    if (target.id === existing.classId) {
      throw new AppError(400, 'Conflict', 'Kelas target tidak boleh sama dengan kelas saat ini')
    }

    const created = await runTransaction(getPrisma(), async (tx) => {
      await tx.memberEnrollment.update({
        where: { id: enrollmentId },
        data: { status: ACADEMIC_STATUS.redistributed, leftAt: new Date(), note: input.note }
      })
      return tx.memberEnrollment.create({
        data: {
          memberId: existing.memberId,
          classId: input.targetClassId,
          academicYearId: existing.academicYearId,
          status: ACADEMIC_STATUS.active,
          note: input.note
        }
      })
    })

    const full = await this.repository.findById(created.id)
    if (!full) {
      throw new AppError(500, 'Internal', `Enrollment ${created.id} tidak ditemukan setelah repoint`)
    }
    return toDTO(full)
  }

  // RFC §1.3 / §4.1 — konsumsi "kelas sekarang" dari enrollment aktif (status=ACTIVE, leftAt=null).
  async findActiveByMember(memberId: string): Promise<EnrollmentDTO | null> {
    const record = await this.repository.findActiveByMember(memberId)
    return record ? toDTO(record) : null
  }

  // WO-16 E-4 — riwayat enrollment per member, terbaru terlebih dahulu (read-only).
  // Business rule (status, invariant, ordering) tetap di backend; UI hanya consumer.
  async historyByMember(memberId: string): Promise<EnrollmentDTO[]> {
    const member = await this.memberRepository.findById(memberId)
    if (!member) {
      throw new AppError(404, 'Not Found', `Member ${memberId} tidak ditemukan`)
    }
    const records = await this.repository.findManyByMember(memberId)
    return records.map(toDTO)
  }
}
