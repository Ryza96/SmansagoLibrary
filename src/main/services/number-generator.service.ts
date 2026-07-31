import { MemberRepository } from '../repositories/member.repository'

/*
 * TECHNICAL DEBT
 *
 * Current implementation uses:
 *   count() + 1
 *
 * This implementation is acceptable only for
 * single-user desktop environments.
 *
 * It is NOT safe for concurrent writes.
 *
 * If the application later supports
 * multi-user access or synchronization,
 * replace this implementation with a
 * persistent sequence/counter strategy.
 */

export class NumberGeneratorService {
  constructor(private memberRepository: MemberRepository) {}

  async generateMemberNumber(memberType?: string): Promise<string> {
    const prefix = memberType === 'GURU' ? 'G' : memberType === 'UMUM' ? 'U' : 'S'
    const count = await this.memberRepository.count()
    const seq = String(count + 1).padStart(6, '0')
    return `${prefix}-${seq}`
  }
}
