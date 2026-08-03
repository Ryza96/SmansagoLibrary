import { MemberRepository } from '../repositories/member.repository'
import type { MemberImportRowInput } from '../../shared/dto/member'

/*
 * Deteksi identitas terhadap DATABASE (Tahap 2 — RFC v2 §5.2; WO-19 MI-3).
 *
 * Scope WO-5 P2: HANYA Database Duplicate Detection.
 *   - Duplikat dalam file (Tahap 1) TIDAK disentuh — ditangani lapisan lain
 *     (MemberPreviewService di renderer) dan tetap seperti sekarang.
 *
 * WO-19 MI-3 (strategi member sudah ada — RFC §12.1 step 3, §12.2):
 *   - NISN  -> sudah ada di DB -> BUKAN error. Member dianggap "sudah ada"
 *     (routing ke jalur enrollment-only / skip di MemberImportService).
 *     Checker mengembalikan existingByRow agar service bisa memutuskan.
 *   - Email -> hanya BLOCKER untuk baris dengan NISN BARU (member baru):
 *     email sudah dipakai member lain -> error. Untuk baris NISN existing
 *     tidak ada member baru yang dibuat, jadi tidak ada konflik email.
 *
 * Aturan performa (keputusan PO):
 *   - DILARANG query per baris. Semua nilai unik dikumpulkan dulu, lalu
 *     batch lookup `WHERE nisn IN (...)` dan `WHERE email IN (...)`
 *     ter-chunk (`IMPORT_CONFIG.MEMBER_IMPORT_LOOKUP_CHUNK`).
 *   - Seluruh query read-only; tidak ada tulis.
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

export interface ExistingMemberInfo {
  id: string
  memberNumber: string
  fullName: string
}

export interface MemberDuplicateDatabaseResult {
  // Member yang SUDAH ADA per baris (ditemukan via NISN) — routing MI-3.
  existingByRow: Map<number, ExistingMemberInfo>
  // Hanya konflik email untuk baris member BARU (NISN tidak ada di DB).
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

    const existingByRow = new Map<number, ExistingMemberInfo>()
    const errors: MemberDuplicateDatabaseIssue[] = []

    for (const row of rows) {
      const nisn = normalizeNisn(row.nisn)
      const existing = nisn !== '' ? nisnToMember.get(nisn) : undefined

      if (existing) {
        // MI-3: NISN sudah ada -> routing "member sudah ada", bukan error.
        existingByRow.set(row.rowNumber, {
          id: existing.id,
          memberNumber: existing.memberNumber,
          fullName: existing.fullName
        })
        continue
      }

      // Baris member BARU: email yang sudah dipakai member lain = BLOCKER.
      const email = normalizeEmail(row.email)
      if (email !== '') {
        const emailOwner = emailToMember.get(email)
        if (emailOwner) {
          errors.push({
            rowNumber: row.rowNumber,
            field: 'email',
            existingMemberNumber: emailOwner.memberNumber,
            existingMemberName: emailOwner.fullName,
            messageKey: MEMBER_DUPLICATE_EMAIL_IN_DB_MESSAGE_KEY
          })
        }
      }
    }

    return { existingByRow, errors }
  }
}
