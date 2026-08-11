import { MemberRepository } from '../repositories/member.repository'
import { EnrollmentRepository } from '../repositories/enrollment.repository'
import { ClassRepository } from '../repositories/class.repository'
import { NumberGeneratorService } from './number-generator.service'
import { getPrisma } from '../repositories/base/prisma'
import { runTransaction } from '../repositories/base/transaction'
import { getMemberType } from '../../shared/config/member-type'
import type { MemberDTO, CreateMemberDTO, UpdateMemberDTO } from '../../shared/dto/member'
import { AppError } from '../../../electron/main/errorHandler'

function classInfoFrom(
  enrollment:
    | {
        classId: string
        class: {
          educationLevel: string
          parallel: string
          curriculum: { id: string; name: string } | null
        }
        academicYear: { id: string; name: string; isActive: boolean } | null
      }
    | null
    | undefined
): MemberDTO['classInfo'] {
  if (!enrollment) return null
  return {
    id: enrollment.classId,
    educationLevel: enrollment.class.educationLevel,
    parallel: enrollment.class.parallel,
    academicYear: enrollment.academicYear
      ? { id: enrollment.academicYear.id, name: enrollment.academicYear.name, isActive: enrollment.academicYear.isActive }
      : null,
    curriculum: enrollment.class.curriculum
      ? { id: enrollment.class.curriculum.id, name: enrollment.class.curriculum.name }
      : null
  }
}

function toDTO(
  member: NonNullable<Awaited<ReturnType<MemberRepository['findById']>>>,
  enrollment: Awaited<ReturnType<EnrollmentRepository['findActiveByMember']>>
): MemberDTO {
  return {
    id: member.id,
    memberNumber: member.memberNumber,
    fullName: member.fullName,
    memberType: member.memberType,
    gender: member.gender,
    nisn: member.nisn,
    nip: member.nip,
    nuptk: member.nuptk,
    nik: member.nik,
    birthPlace: member.birthPlace,
    birthDate: member.birthDate?.toISOString() ?? null,
    address: member.address,
    phone: member.phone,
    email: member.email,
    classId: member.classId,
    classInfo: classInfoFrom(enrollment),
    status: member.status,
    createdAt: member.createdAt.toISOString(),
    updatedAt: member.updatedAt.toISOString()
  }
}

export class MemberService {
  constructor(
    private memberRepository: MemberRepository,
    private numberGeneratorService: NumberGeneratorService,
    private enrollmentRepository: EnrollmentRepository,
    private classRepository: ClassRepository
  ) {}

  async findMany(search?: string, page?: number, limit?: number, memberType?: string) {
    const result = await this.memberRepository.findMany({ search, pagination: { page, limit }, memberType })
    return {
      ...result,
      data: result.data.map((m) => ({
        id: m.id,
        memberNumber: m.memberNumber,
        fullName: m.fullName,
        memberType: m.memberType,
        gender: m.gender,
        nisn: m.nisn,
        nip: m.nip,
        nuptk: m.nuptk,
        nik: m.nik,
        birthPlace: m.birthPlace,
        birthDate: m.birthDate?.toISOString() ?? null,
        address: m.address,
        phone: m.phone,
        email: m.email,
        classId: m.classId,
        classInfo: classInfoFrom(m.memberEnrollments?.[0]),
        status: m.status,
        createdAt: m.createdAt.toISOString(),
        updatedAt: m.updatedAt.toISOString()
      }))
    }
  }

  async findById(id: string): Promise<MemberDTO> {
    const member = await this.memberRepository.findById(id)
    if (!member) {
      throw new AppError(404, 'Not Found', `Member ${id} tidak ditemukan`)
    }
    const enrollment = await this.enrollmentRepository.findActiveByMember(id)
    return toDTO(member, enrollment)
  }

  async create(input: CreateMemberDTO): Promise<MemberDTO> {
    await this.validateUniqueness(input)

    const memberNumber = await this.numberGeneratorService.generateMemberNumber(input.memberType)

    // WO Manual Student Entry (Opsi A) — anggota siswa WAJIB membawa penempatan
    // kelas (academicYearId + classId). Saat disimpan, Member + MemberEnrollment
    // (ACTIVE) dibuat dalam SATU transaksi — mirror jalur import. Ini menutup
    // dead-end manual entry lama (member siswa tanpa enrollment aktif sehingga
    // tidak bisa meminjam, guard IT-1).
    if (getMemberType(input.memberType)?.hasAcademicRecord) {
      if (!input.classId || !input.academicYearId) {
        throw new AppError(400, 'Validation Error', 'Anggota siswa wajib memilih Tahun Ajaran dan Kelas')
      }
      const klass = await this.classRepository.findById(input.classId)
      if (!klass) {
        throw new AppError(400, 'Validation Error', `Kelas ${input.classId} tidak ditemukan`)
      }
      if (klass.academicYearId !== input.academicYearId) {
        throw new AppError(400, 'Validation Error', 'Kelas tidak termasuk Tahun Ajaran yang dipilih')
      }

      // Narrow `input.classId`/`input.academicYearId` ke local const agar TS
      // tidak kehilangan narrowing di dalam closure transaksi (properti
      // parameter tidak men-narrow melewati pemanggilan async/closure).
      const studentClassId: string = input.classId
      const studentAcademicYearId: string = input.academicYearId

      const created = await runTransaction(getPrisma(), async (tx) => {
        const member = await this.memberRepository.createWithTx(tx, {
          memberNumber,
          fullName: input.fullName,
          memberType: input.memberType,
          gender: input.gender,
          nisn: input.nisn,
          nip: input.nip,
          nuptk: input.nuptk,
          nik: input.nik,
          birthPlace: input.birthPlace,
          birthDate: input.birthDate ? new Date(input.birthDate) : undefined,
          address: input.address,
          phone: input.phone,
          email: input.email,
          status: 'INACTIVE'
        })
        await this.enrollmentRepository.createActiveWithTx(tx, {
          memberId: member.id,
          classId: studentClassId,
          academicYearId: studentAcademicYearId
        })
        return member
      })

      return this.findById(created.id)
    }

    const created = await this.memberRepository.create({
      memberNumber,
      fullName: input.fullName,
      memberType: input.memberType,
      gender: input.gender,
      nisn: input.nisn,
      nip: input.nip,
      nuptk: input.nuptk,
      nik: input.nik,
      birthPlace: input.birthPlace,
      birthDate: input.birthDate ? new Date(input.birthDate) : undefined,
      address: input.address,
      phone: input.phone,
      email: input.email,
      status: 'INACTIVE'
    })

    return this.findById(created.id)
  }

  async update(id: string, input: UpdateMemberDTO): Promise<MemberDTO> {
    const existing = await this.memberRepository.findById(id)
    if (!existing) {
      throw new AppError(404, 'Not Found', `Member ${id} tidak ditemukan`)
    }

    await this.validateUniqueness(input, id)

    await this.memberRepository.update(id, {
      fullName: input.fullName,
      memberType: input.memberType,
      gender: input.gender,
      nisn: input.nisn,
      nip: input.nip,
      nuptk: input.nuptk,
      nik: input.nik,
      birthPlace: input.birthPlace,
      birthDate: input.birthDate ? new Date(input.birthDate) : undefined,
      address: input.address,
      phone: input.phone,
      email: input.email,
      status: input.status
    })

    return this.findById(id)
  }

  async delete(id: string): Promise<void> {
    const existing = await this.memberRepository.findById(id)
    if (!existing) {
      throw new AppError(404, 'Not Found', `Member ${id} tidak ditemukan`)
    }

    const borrowCount = await this.memberRepository.countBorrows(id)
    if (borrowCount > 0) {
      throw new AppError(400, 'Conflict', `Member ${id} tidak dapat dihapus karena memiliki riwayat peminjaman`)
    }

    await this.memberRepository.delete(id)
  }

  private async validateUniqueness(
    input: CreateMemberDTO | UpdateMemberDTO,
    excludeId?: string
  ): Promise<void> {
    if (input.nisn) {
      const existing = await this.memberRepository.findByNISN(input.nisn)
      if (existing && existing.id !== excludeId) {
        throw new AppError(400, 'Conflict', `NISN ${input.nisn} sudah digunakan oleh member lain`)
      }
    }

    if (input.nip) {
      const existing = await this.memberRepository.findByNIP(input.nip)
      if (existing && existing.id !== excludeId) {
        throw new AppError(400, 'Conflict', `NIP ${input.nip} sudah digunakan oleh member lain`)
      }
    }

    if (input.nuptk) {
      const existing = await this.memberRepository.findByNUPTK(input.nuptk)
      if (existing && existing.id !== excludeId) {
        throw new AppError(400, 'Conflict', `NUPTK ${input.nuptk} sudah digunakan oleh member lain`)
      }
    }

    if (input.nik) {
      const existing = await this.memberRepository.findByNIK(input.nik)
      if (existing && existing.id !== excludeId) {
        throw new AppError(400, 'Conflict', `NIK ${input.nik} sudah digunakan oleh member lain`)
      }
    }
  }
}
