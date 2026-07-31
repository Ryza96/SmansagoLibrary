import { AppError } from '../errorHandler'
import { MemberRepository } from '../repositories/member.repository'
import type { MemberDTO } from '../../../src/shared/dto/member'

function toDTO(member: NonNullable<Awaited<ReturnType<MemberRepository['findById']>>>): MemberDTO {
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
    classInfo: null,
    status: member.status,
    createdAt: member.createdAt.toISOString(),
    updatedAt: member.updatedAt.toISOString()
  }
}

export class MemberService {
  constructor(private memberRepository: MemberRepository) {}

  async getById(id: string): Promise<MemberDTO> {
    const member = await this.memberRepository.findById(id)
    if (!member) {
      throw new AppError(404, 'Not Found', `Member ${id} tidak ditemukan`)
    }
    return toDTO(member)
  }

  async search(query: string) {
    return this.memberRepository.search(query)
  }

}
