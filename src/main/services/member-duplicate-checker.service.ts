import { MemberRepository } from '../repositories/member.repository'
import type { MemberImportRowInput } from '../../shared/dto/member'

/*
 * Deteksi duplikat terhadap DATABASE (Tahap 2 — RFC v2 §5.2).
 *
 * Scope WO-5 P2: HANYA Database Duplicate Detection.
 *   - Duplikat dalam file (Tahap 1) TIDAK disentuh — ditangani lapisan lain
 *     (MemberPreviewService di renderer) dan tetap seperti sekarang.
 *   - NISN  -> sudah ada di DB        -> BLOCKER.
 *   - Email -> bila terisi, sudah ada -> BLOCKER; bila kosong -> dilewati.
 *
 * Aturan performa (keputusan PO):
 *   - DILARANG query per baris. Semua nilai unik dikumpulkan dulu, lalu
 *     batch lookup `WHERE nisn IN (...)` dan `WHERE email IN (...)` ter-chunk
 *     (`IMPORT_CONFIG.MEMBER_IMPORT_LOOKUP_CHUNK`), kemudian dicocokkan
 *     di memori.
 *   - Seluruh query read-only; tidak ada tulis.
 *
 * API publik ini dipakai oleh P4 (MemberImportService / preflight) —
 * P4 belum dikerjakan.
 */

export const MEMBER_DUPLICATE_NISN_IN_DB_MESSAGE_KEY = 'memberImport.duplicateNisnInDb'
export const MEMBER_DUPLICATE_EMAIL_IN_DB_MESSAGE_KEY = 'memberImport.duplicateEmailInDb'

export type MemberDuplicateField = 'nisn' | 'email'

export interface MemberDuplicateDatabaseIssue {
  rowNumber: number
  field: MemberDuplicateField
  existingMemberNumber: string
  existingMemberName: string
  messageKey: string
}

export interface MemberDuplicateDatabaseResult {
  errors: MemberDuplicateDatabaseIssue[]
}

function normalizeNisn(value: string | undefined): string {
  return (value ?? '').trim()
}

function normalizeEmail(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

export class MemberDuplicateChecker {
  constructor(private memberRepository: MemberRepository) {}

  async checkDatabase(rows: readonly MemberImportRowInput[]): Promise<MemberDuplicateDatabaseResult> {
    const nisnSet = new Set<string>()
    const emailSet = new Set<string>()

    for (const row of rows) {
      const nisn = normalizeNisn(row.nisn)
      if (nisn !== '') nisnSet.add(nisn)

      const email = normalizeEmail(row.email)
      if (email !== '') emailSet.add(email)
    }

    const [nisnMembers, emailMembers] = await Promise.all([
      this.memberRepository.findManyByNISNs([...nisnSet]),
      this.memberRepository.findManyByEmails([...emailSet])
    ])

    const nisnToMember = new Map(nisnMembers.map((m) => [m.nisn, m] as const))
    const emailToMember = new Map(emailMembers.map((m) => [m.email, m] as const))

    const errors: MemberDuplicateDatabaseIssue[] = []

    for (const row of rows) {
      const nisn = normalizeNisn(row.nisn)
      if (nisn !== '') {
        const existing = nisnToMember.get(nisn)
        if (existing) {
          errors.push({
            rowNumber: row.rowNumber,
            field: 'nisn',
            existingMemberNumber: existing.memberNumber,
            existingMemberName: existing.fullName,
            messageKey: MEMBER_DUPLICATE_NISN_IN_DB_MESSAGE_KEY
          })
        }
      }

      const email = normalizeEmail(row.email)
      if (email !== '') {
        const existing = emailToMember.get(email)
        if (existing) {
          errors.push({
            rowNumber: row.rowNumber,
            field: 'email',
            existingMemberNumber: existing.memberNumber,
            existingMemberName: existing.fullName,
            messageKey: MEMBER_DUPLICATE_EMAIL_IN_DB_MESSAGE_KEY
          })
        }
      }
    }

    return { errors }
  }
}
