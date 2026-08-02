import { memberPreviewService } from '../src/services/MemberPreviewService'
import type { ParsedMemberRow } from '../src/services/MemberExcelParserService'
import type { MemberImportPreviewDTO, MemberImportPreviewIssue } from '../src/shared/dto/member'

let pass = 0
let fail = 0

function check(name: string, ok: boolean, detail?: string): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`)
  if (ok) pass += 1
  else fail += 1
}

function row(number: number, overrides: Partial<ParsedMemberRow>): ParsedMemberRow {
  return {
    rowNumber: number,
    nama: 'Andi',
    kelas: 'XI IPA 2',
    jenisKelamin: 'L',
    nisn: `100000${number}`,
    tempatLahir: 'Bandung',
    tanggalLahir: '2010-01-15',
    alamat: 'Jl. Test',
    whatsapp: '0812345',
    email: `a${number}@test.id`,
    ...overrides
  }
}

function issue(rowNumber: number, messageKey: string, extra?: Partial<MemberImportPreviewIssue>): MemberImportPreviewIssue {
  return { rowNumber, messageKey, ...extra }
}

const noIssues: MemberImportPreviewDTO = { valid: true, errorCount: 0, warningCount: 0, errors: [], warnings: [] }

// ================= T1 — preview berhasil =================
const t1 = memberPreviewService.buildPreview([row(1, {}), row(2, {})], noIssues)
check('T1 preview: total 2', t1.summary.total === 2)
check('T1 preview: valid 2', t1.summary.valid === 2, `valid=${t1.summary.valid}`)
check('T1 preview: error 0', t1.summary.error === 0)
check('T1 preview: duplicate 0', t1.summary.duplicate === 0)
check('T1 preview: semua status VALID', t1.rows.every((r) => r.status === 'VALID'))
check('T1 preview: canImport true', t1.canImport === true)

// ================= T2 — duplicate (hasil backend) tampil =================
const dupDto: MemberImportPreviewDTO = {
  valid: false,
  errorCount: 1,
  warningCount: 0,
  errors: [issue(2, 'memberImport.duplicateNisnInDb', { field: 'nisn', existingMemberName: 'Budi', existingMemberNumber: 'S-000001' })],
  warnings: []
}
const t2 = memberPreviewService.buildPreview([row(1, {}), row(2, {})], dupDto)
check('T2 duplicate: row1 VALID', t2.rows[0]?.status === 'VALID')
check('T2 duplicate: row2 DUPLICATE', t2.rows[1]?.status === 'DUPLICATE', t2.rows[1]?.status)
check('T2 duplicate: summary duplicate 1', t2.summary.duplicate === 1, `duplicate=${t2.summary.duplicate}`)
check('T2 duplicate: canImport false', t2.canImport === false)
check('T2 duplicate: issue terbawa ke row', t2.rows[1]?.issues[0]?.existingMemberName === 'Budi')

// ================= T3 — class tidak ditemukan tampil =================
const classDto: MemberImportPreviewDTO = {
  valid: false,
  errorCount: 1,
  warningCount: 0,
  errors: [issue(1, 'memberImport.classNotFound', { className: 'XI Kelas Hantu' })],
  warnings: []
}
const t3 = memberPreviewService.buildPreview([row(1, {}), row(2, {})], classDto)
check('T3 class: row1 ERROR', t3.rows[0]?.status === 'ERROR', t3.rows[0]?.status)
check('T3 class: row2 VALID', t3.rows[1]?.status === 'VALID')
check('T3 class: summary error 1', t3.summary.error === 1)
check('T3 class: canImport false', t3.canImport === false)

// ================= T4 — validasi renderer (field wajib) tetap =================
const t4 = memberPreviewService.buildPreview([row(1, { nama: '' }), row(2, {})], noIssues)
check('T4 renderer validation: row1 ERROR', t4.rows[0]?.status === 'ERROR', t4.rows[0]?.status)
check('T4 renderer validation: row2 VALID', t4.rows[1]?.status === 'VALID')
check('T4 renderer validation: summary error 1', t4.summary.error === 1)
check('T4 renderer validation: canImport false', t4.canImport === false)

// ================= T5 — gabungan validasi renderer + backend =================
const combinedDto: MemberImportPreviewDTO = {
  valid: false,
  errorCount: 1,
  warningCount: 0,
  errors: [issue(2, 'memberImport.duplicateEmailInDb', { field: 'email', existingMemberName: 'Citra', existingMemberNumber: 'S-000002' })],
  warnings: []
}
const t5 = memberPreviewService.buildPreview([row(1, { jenisKelamin: 'X' }), row(2, {})], combinedDto)
check('T5 gabungan: row1 ERROR (gender invalid)', t5.rows[0]?.status === 'ERROR', t5.rows[0]?.status)
check('T5 gabungan: row2 DUPLICATE (email DB)', t5.rows[1]?.status === 'DUPLICATE', t5.rows[1]?.status)
check('T5 gabungan: canImport false', t5.canImport === false)

// ================= T6 — duplicate NISN dalam file (renderer) =================
const t6 = memberPreviewService.buildPreview([row(1, { nisn: '7770001' }), row(2, { nisn: '7770001' })], noIssues)
check('T6 in-file NISN: keduanya DUPLICATE', t6.rows[0]?.status === 'DUPLICATE' && t6.rows[1]?.status === 'DUPLICATE', `${t6.rows[0]?.status}/${t6.rows[1]?.status}`)
check('T6 in-file NISN: duplicateNisnRows saling menunjuk', t6.rows[0]?.duplicateNisnRows.join(',') === '2' && t6.rows[1]?.duplicateNisnRows.join(',') === '1')
check('T6 in-file NISN: summary duplicate 2', t6.summary.duplicate === 2, `duplicate=${t6.summary.duplicate}`)
check('T6 in-file NISN: canImport false (muncul sebelum import)', t6.canImport === false)

// ================= T7 — preview kosong (0 baris) -> canImport false =================
const t7 = memberPreviewService.buildPreview([], noIssues)
check('T7 kosong: canImport false', t7.canImport === false, `canImport=${t7.canImport}`)
check('T7 kosong: total 0', t7.summary.total === 0)

// ================= T8 — duplicate Email dalam file (renderer) =================
const t8 = memberPreviewService.buildPreview(
  [row(1, { email: 'dup@same.id' }), row(2, { email: 'dup@same.id' })],
  noIssues
)
check('T8 in-file EMAIL: keduanya DUPLICATE', t8.rows[0]?.status === 'DUPLICATE' && t8.rows[1]?.status === 'DUPLICATE', `${t8.rows[0]?.status}/${t8.rows[1]?.status}`)
check('T8 in-file EMAIL: duplicateEmailRows saling menunjuk', t8.rows[0]?.duplicateEmailRows.join(',') === '2' && t8.rows[1]?.duplicateEmailRows.join(',') === '1')
check('T8 in-file EMAIL: canImport false', t8.canImport === false)

// ================= T9 — keduanya bersamaan: dup dalam file + dup database =================
const t9Rows = [row(1, { nisn: '9990001' }), row(2, { nisn: '9990001' }), row(3, {})]
const dto9: MemberImportPreviewDTO = {
  valid: false,
  errorCount: 1,
  warningCount: 0,
  errors: [issue(3, 'memberImport.duplicateEmailInDb', { field: 'email', existingMemberName: 'Dewi', existingMemberNumber: 'S-000009' })],
  warnings: []
}
const t9 = memberPreviewService.buildPreview(t9Rows, dto9)
check('T9 bersamaan: baris1/2 DUPLICATE (dalam file)', t9.rows[0]?.status === 'DUPLICATE' && t9.rows[1]?.status === 'DUPLICATE', `${t9.rows[0]?.status}/${t9.rows[1]?.status}`)
check('T9 bersamaan: baris3 DUPLICATE (backend)', t9.rows[2]?.status === 'DUPLICATE', t9.rows[2]?.status)
check('T9 bersamaan: summary duplicate 3', t9.summary.duplicate === 3, `duplicate=${t9.summary.duplicate}`)
check('T9 bersamaan: canImport false', t9.canImport === false)

// ================= T10 — SATU baris punya dup dalam file + dup database =================
const t10Rows = [row(1, { nisn: '8880001' }), row(2, { nisn: '8880001' })]
const dto10: MemberImportPreviewDTO = {
  valid: false,
  errorCount: 1,
  warningCount: 0,
  errors: [issue(1, 'memberImport.duplicateNisnInDb', { field: 'nisn', existingMemberName: 'Eka', existingMemberNumber: 'S-000010' })],
  warnings: []
}
const t10 = memberPreviewService.buildPreview(t10Rows, dto10)
check('T10 satu baris keduanya: baris1 DUPLICATE', t10.rows[0]?.status === 'DUPLICATE', t10.rows[0]?.status)
check('T10 satu baris keduanya: duplicateNisnRows [2] (dalam file)', t10.rows[0]?.duplicateNisnRows.join(',') === '2')
check('T10 satu baris keduanya: issues backend terbawa', t10.rows[0]?.issues[0]?.messageKey === 'memberImport.duplicateNisnInDb')
check('T10 satu baris keduanya: baris2 DUPLICATE (dalam file)', t10.rows[1]?.status === 'DUPLICATE', t10.rows[1]?.status)
check('T10 satu baris keduanya: canImport false', t10.canImport === false)

console.log(`P5A SMOKE RESULT: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
