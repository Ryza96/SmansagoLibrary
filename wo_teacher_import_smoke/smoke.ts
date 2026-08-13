import { getPrisma } from '../src/main/repositories/base/prisma'
import { MemberRepository } from '../src/main/repositories/member.repository'
import { NumberGeneratorService } from '../src/main/services/number-generator.service'
import { TeacherDuplicateChecker } from '../src/main/services/teacher-duplicate-checker.service'
import { TeacherImportService } from '../src/main/services/teacher-import.service'
import { teacherImportValidationService } from '../src/services/TeacherImportValidationService'
import { teacherPreviewService } from '../src/services/TeacherPreviewService'
import { TEACHER_DUPLICATE_NIP_IN_FILE_MESSAGE_KEY } from '../src/services/TeacherPreviewService'
import {
  TEACHER_REQUIRED_VALUE_MESSAGE_KEY,
  TEACHER_INVALID_GENDER_MESSAGE_KEY
} from '../src/services/TeacherImportValidationService'
import { TEACHER_DUPLICATE_NIP_IN_DB_MESSAGE_KEY } from '../src/main/services/teacher-duplicate-checker.service'
import type { ParsedTeacherRow } from '../src/services/TeacherExcelParserService'
import type { ImportCellValue } from '../src/types/import'
import type { TeacherImportRowInput } from '../src/shared/dto/teacher'

let pass = 0
let fail = 0

function check(name: string, ok: boolean, detail?: string): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`)
  if (ok) pass += 1
  else fail += 1
}

function expectEqual<T>(name: string, actual: T, expected: T): void {
  check(name, actual === expected, `expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`)
}

function parsedRow(
  rowNumber: number,
  nama: ImportCellValue,
  jenisKelamin: ImportCellValue,
  nip: ImportCellValue,
  tanggalLahir: ImportCellValue = null
): ParsedTeacherRow {
  return {
    rowNumber,
    nama,
    jenisKelamin,
    nip,
    tempatLahir: null,
    tanggalLahir,
    alamat: null,
    whatsapp: null,
    email: null
  }
}

function inputRow(
  rowNumber: number,
  fullName: string,
  gender: 'male' | 'female',
  nip?: string
): TeacherImportRowInput {
  return {
    rowNumber,
    fullName,
    gender,
    nip,
    birthPlace: undefined,
    birthDate: undefined,
    address: undefined,
    phone: undefined,
    email: undefined
  }
}

async function main(): Promise<void> {
  const prisma = getPrisma()
  const memberRepo = new MemberRepository()
  const duplicateChecker = new TeacherDuplicateChecker(memberRepo)
  const importService = new TeacherImportService(
    duplicateChecker,
    new NumberGeneratorService(memberRepo),
    memberRepo
  )

  console.log('--- STEP 0: seed member existing ber-NIP (fresh DB) ---')
  const existing = await prisma.member.create({
    data: {
      memberNumber: 'G-000001',
      memberType: 'teacher',
      fullName: 'Guru Existing',
      gender: 'female',
      nip: '1111111111',
      status: 'INACTIVE'
    }
  })
  check('seed member existing terbuat', existing.id !== '')

  console.log('--- STEP 1 (RENDERER): nama kosong -> teacherImport.requiredValue ---')
  const v1 = teacherImportValidationService.validate([parsedRow(2, '  ', 'L', '1001')])
  check('valid false', v1.valid === false)
  check('errorCount 1', v1.errorCount === 1)
  check('messageKey requiredValue', v1.rows[0]?.errors[0]?.messageKey === TEACHER_REQUIRED_VALUE_MESSAGE_KEY)
  check('label Nama', v1.rows[0]?.errors[0]?.label === 'Nama')

  console.log('--- STEP 2 (RENDERER): gender tidak valid -> teacherImport.invalidGender ---')
  const v2 = teacherImportValidationService.validate([parsedRow(2, 'Guru Satu', 'X', '1002')])
  check('gender valid false', v2.rows[0]?.valid === false)
  check('messageKey invalidGender', v2.rows[0]?.errors[0]?.messageKey === TEACHER_INVALID_GENDER_MESSAGE_KEY)
  const v2b = teacherImportValidationService.validate([parsedRow(2, 'Guru Dua', 'L', '1003'), parsedRow(3, 'Guru Tiga', 'perempuan', '1004')])
  check('L -> male', v2b.rows[0]?.gender === 'male')
  check('perempuan -> female', v2b.rows[1]?.gender === 'female')
  check('valid gender 0 error', v2b.errorCount === 0)

  console.log('--- STEP 3 (RENDERER): NIP duplikat DALAM FILE -> teacherImport.duplicateNipInFile ---')
  const p1 = teacherPreviewService.preview([parsedRow(2, 'Guru A', 'L', '2001'), parsedRow(3, 'Guru B', 'P', '2001')])
  check('duplicate rows 2', p1.rows.length === 2)
  check('row2 status DUPLICATE', p1.rows[0]?.status === 'DUPLICATE')
  check('row3 status DUPLICATE', p1.rows[1]?.status === 'DUPLICATE')
  check('issue duplicateNipInFile row2', p1.rows[0]?.issues[0]?.messageKey === TEACHER_DUPLICATE_NIP_IN_FILE_MESSAGE_KEY)
  check('duplicateNipRows row3 -> [2]', JSON.stringify(p1.rows[1]?.duplicateNipRows) === '[2]')
  check('canImport false (duplicate in-file)', p1.canImport === false)
  check('summary duplicate 2', p1.summary.duplicate === 2)

  console.log('--- STEP 4 (RENDERER): semua valid -> canImport true ---')
  const p2 = teacherPreviewService.preview([parsedRow(2, 'Guru A', 'L', '2002'), parsedRow(3, 'Guru B', 'P', '2003')])
  check('valid 2', p2.summary.valid === 2)
  check('canImport true', p2.canImport === true)

  console.log('--- STEP 5 (BACKEND): NIP duplikat vs DATABASE -> teacherImport.duplicateNipInDb ---')
  const d1 = await duplicateChecker.checkDatabase([inputRow(2, 'Guru Baru', 'male', '1111111111')])
  check('checkDatabase error 1', d1.errors.length === 1)
  check('messageKey duplicateNipInDb', d1.errors[0]?.messageKey === TEACHER_DUPLICATE_NIP_IN_DB_MESSAGE_KEY)
  check('field nip', d1.errors[0]?.field === 'nip')
  check('existingMemberNumber G-000001', d1.errors[0]?.existingMemberNumber === 'G-000001')
  check('existingMemberName Guru Existing', d1.errors[0]?.existingMemberName === 'Guru Existing')
  const d2 = await duplicateChecker.checkDatabase([inputRow(2, 'Guru Baru', 'male', '9999999999')])
  check('NIP bebas -> 0 error', d2.errors.length === 0)

  console.log('--- STEP 6 (BACKEND): previewCheck valid & duplikat ---')
  const pc1 = await importService.previewCheck([inputRow(2, 'Guru Baru', 'male', '9999999999')])
  check('previewCheck valid true', pc1.valid === true)
  check('previewCheck errorCount 0', pc1.errorCount === 0)
  const pc2 = await importService.previewCheck([inputRow(2, 'Guru Baru', 'male', '1111111111')])
  check('previewCheck duplikat valid false', pc2.valid === false)
  check('previewCheck error duplicateNipInDb', pc2.errors[0]?.messageKey === TEACHER_DUPLICATE_NIP_IN_DB_MESSAGE_KEY)

  console.log('--- STEP 7 (BACKEND): import sukses (NIP terisi, WhatsApp/email KOSONG) ---')
  const i1 = await importService.import([
    inputRow(2, 'Guru Baru A', 'male', '3001'),
    inputRow(3, 'Guru Baru B', 'female', '3002')
  ])
  check('import success true', i1.success === true)
  check('import created 2', i1.created === 2)
  check('import failed 0', i1.failed === 0)
  check('import errors empty', i1.errors.length === 0)
  const t1 = await prisma.member.findFirst({ where: { nip: '3001' } })
  check('guru A terbuat', t1 !== null)
  check('guru A memberType teacher', t1?.memberType === 'teacher')
  check('guru A memberNumber G-000002', t1?.memberNumber === 'G-000002')
  check('guru A status INACTIVE', t1?.status === 'INACTIVE')
  check('guru A nip 3001', t1?.nip === '3001')
  const t2 = await prisma.member.findFirst({ where: { nip: '3002' } })
  check('guru B terbuat', t2 !== null)
  check('guru B memberNumber G-000003', t2?.memberNumber === 'G-000003')
  check('guru B email null (kosong tidak ditulis)', t2?.email === null)
  check('guru B phone null (kosong tidak ditulis)', t2?.phone === null)

  console.log('--- STEP 8 (BACKEND): import dengan NIP duplikat DB -> BLOCKER, 0 created ---')
  const i2 = await importService.import([inputRow(2, 'Guru Duplikat', 'male', '1111111111')])
  check('import duplikat success false', i2.success === false)
  check('import duplikat created 0', i2.created === 0)
  check('import duplikat failed 1', i2.failed === 1)
  check('import duplikat error duplicateNipInDb', i2.errors[0]?.messageKey === TEACHER_DUPLICATE_NIP_IN_DB_MESSAGE_KEY)
  const dup = await prisma.member.findFirst({ where: { fullName: 'Guru Duplikat' } })
  check('baris duplikat TIDAK tersimpan', dup === null)

  await prisma.$disconnect()
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
