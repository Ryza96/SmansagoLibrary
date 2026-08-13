import type {
  TeacherImportRowInput,
  TeacherImportPreviewIssue
} from '../../shared/dto/teacher'
import type { MemberRepository } from '../repositories/member.repository'

export const TEACHER_DUPLICATE_NIP_IN_DB_MESSAGE_KEY = 'teacherImport.duplicateNipInDb'

export class TeacherDuplicateChecker {
  constructor(private readonly memberRepository: MemberRepository) {}

  async checkDatabase(rows: TeacherImportRowInput[]): Promise<{
    errors: TeacherImportPreviewIssue[]
  }> {
    const nips = [...new Set(rows.map((row) => (row.nip ?? '').trim()).filter(Boolean))]
    if (nips.length === 0) return { errors: [] }

    const existing = await this.memberRepository.findManyByNIPs(nips)
    const existingByNip = new Map(
      existing.map((member) => [String(member.nip).trim(), member])
    )

    const errors: TeacherImportPreviewIssue[] = []
    for (const row of rows) {
      const nip = (row.nip ?? '').trim()
      if (nip === '') continue
      const member = existingByNip.get(nip)
      if (member) {
        errors.push({
          rowNumber: row.rowNumber,
          messageKey: TEACHER_DUPLICATE_NIP_IN_DB_MESSAGE_KEY,
          field: 'nip',
          existingMemberNumber: member.memberNumber,
          existingMemberName: member.fullName
        })
      }
    }
    return { errors }
  }
}
