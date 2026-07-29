import { AppError } from '../errorHandler'
import { MemberRepository } from '../repositories/member.repository'
import type { MemberDTO } from '../../shared/dto/member'

function toDTO(member: NonNullable<Awaited<ReturnType<MemberRepository['findById']>>>): MemberDTO {
  return {
    id: member.id,
    number: member.number,
    fullName: member.fullName,
    gender: member.gender,
    birthplace: member.birthplace,
    birthDate: member.birthDate?.toISOString() ?? null,
    phone: member.phone,
    email: member.email,
    memberType: member.memberType,
    joinDate: member.joinDate?.toISOString() ?? null,
    validUntil: member.validUntil?.toISOString() ?? null,
    status: member.status,
    address: member.address,
    district: member.district,
    village: member.village,
    city: member.city,
    postalCode: member.postalCode,
    notes: member.notes,
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
