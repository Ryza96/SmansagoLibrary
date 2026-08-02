import type { MemberImportRowInput } from '../dto/member'

/*
 * Normalisasi baris import anggota (WO-7 P7C — Fix F-3).
 *
 * Diterapkan SEBELUM validasi & pengecekan duplikat, dan sebelum data
 * disimpan, sehingga:
 *   - NISN  " 1234567890 " dan "1234567890" dianggap sama.
 *   - Email "USER@MAIL.COM " dan "user@mail.com" dianggap sama.
 *
 * Scope minimal sesuai WO: trim fullName (Nama), trim NISN, trim Email,
 * lowercase Email. Field lain dibiarkan apa adanya.
 */

export function normalizeMemberImportRow(row: MemberImportRowInput): MemberImportRowInput {
  return {
    ...row,
    fullName: row.fullName.trim(),
    nisn: row.nisn.trim(),
    email: row.email === undefined ? undefined : row.email.trim().toLowerCase()
  }
}

export function normalizeMemberImportRows(rows: MemberImportRowInput[]): MemberImportRowInput[] {
  return rows.map(normalizeMemberImportRow)
}
