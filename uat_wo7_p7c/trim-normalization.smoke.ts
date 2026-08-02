import { getPrisma } from '../src/main/repositories/base/prisma'
import { AcademicYearRepository } from '../src/main/repositories/academic-year.repository'
import { CurriculumRepository } from '../src/main/repositories/curriculum.repository'
import { ClassRepository } from '../src/main/repositories/class.repository'
import { MemberRepository } from '../src/main/repositories/member.repository'
import { MemberDuplicateChecker } from '../src/main/services/member-duplicate-checker.service'
import { MemberClassResolver } from '../src/main/services/member-class-resolver.service'
import { NumberGeneratorService } from '../src/main/services/number-generator.service'
import { MemberImportService } from '../src/main/services/member-import.service'
import { normalizeMemberImportRow } from '../src/shared/utils/member-import-normalization'
import { memberPreviewService } from '../src/services/MemberPreviewService'
import type { MemberImportRowInput, MemberImportPreviewDTO } from '../src/shared/dto/member'
import type { ParsedMemberRow } from '../src/services/MemberExcelParserService'

let pass = 0
let fail = 0

function check(name: string, ok: boolean, detail?: string): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`)
  if (ok) pass += 1
  else fail += 1
}

function makeRow(overrides: Partial<MemberImportRowInput>): MemberImportRowInput {
  return {
    rowNumber: 1,
    fullName: 'Test Person',
    className: 'XI IPA 2',
    gender: 'male',
    nisn: '0000',
    address: 'Jl. Test 1',
    phone: '0812345',
    ...overrides
  }
}

const EMPTY_PREVIEW: MemberImportPreviewDTO = { valid: true, errorCount: 0, warningCount: 0, errors: [], warnings: [] }

async function main(): Promise<void> {
  const prisma = getPrisma()
  const ayRepo = new AcademicYearRepository()
  const curRepo = new CurriculumRepository()
  const classRepo = new ClassRepository()
  const memberRepo = new MemberRepository()

  const duplicateChecker = new MemberDuplicateChecker(memberRepo)
  const classResolver = new MemberClassResolver(ayRepo, classRepo)
  const numberGenerator = new NumberGeneratorService(memberRepo)
  const service = new MemberImportService(duplicateChecker, classResolver, numberGenerator, memberRepo)

  // ================= UNIT — normalizeMemberImportRow (F-3 inti) =================
  const normalized = normalizeMemberImportRow({
    rowNumber: 1,
    fullName: '  Test Person  ',
    className: ' XI IPA 2 ',
    gender: 'male',
    nisn: ' 1234567890 ',
    address: 'Jl. A 1',
    phone: '0812345',
    email: '  USER@MAIL.COM  '
  })
  check('U1 trim Nama', normalized.fullName === 'Test Person', `"${normalized.fullName}"`)
  check('U1 trim NISN', normalized.nisn === '1234567890', `"${normalized.nisn}"`)
  check('U1 trim + lowercase Email', normalized.email === 'user@mail.com', `"${normalized.email}"`)
  const withoutEmail = normalizeMemberImportRow(makeRow({ email: undefined }))
  check('U2 email undefined tetap undefined', withoutEmail.email === undefined, `${withoutEmail.email}`)
  const emptyNisn = normalizeMemberImportRow(makeRow({ nisn: '' }))
  check('U2 nisn kosong tetap kosong', emptyNisn.nisn === '', `"${emptyNisn.nisn}"`)

  // ================= SEED =================
  const ay = await ayRepo.create({ name: '2025/2026', startDate: new Date('2025-07-01'), endDate: new Date('2026-06-30'), isActive: true })
  const curA = await curRepo.create({ name: 'Kurikulum Merdeka' })
  await classRepo.create({ academicYearId: ay.id, curriculumId: curA.id, educationLevel: 'XI', parallel: 'IPA 2' })
  const memberCount = async (): Promise<number> => prisma.member.count()

  // ================= S3 — nilai tersimpan ternormalisasi =================
  const s3 = await service.import([
    makeRow({ rowNumber: 1, className: 'XI IPA 2', nisn: ' 4000001 ', fullName: '  Test Person  ', email: '  USER@MAIL.COM  ' })
  ])
  check('S3 import berhasil: success true', s3.success === true, `success=${s3.success}`)
  check('S3 import berhasil: created 1', s3.created === 1, `created=${s3.created}`)
  const m3 = await prisma.member.findUnique({ where: { nisn: '4000001' } })
  check('S3 tersimpan: NISN ter-trim', m3?.nisn === '4000001', `"${m3?.nisn}"`)
  check('S3 tersimpan: Nama ter-trim', m3?.fullName === 'Test Person', `"${m3?.fullName}"`)
  check('S3 tersimpan: Email ter-trim + lowercase', m3?.email === 'user@mail.com', `"${m3?.email}"`)

  // ================= S4 — duplikat NISN setelah normalisasi =================
  const s4 = await service.import([makeRow({ rowNumber: 1, className: 'XI IPA 2', nisn: '4000001', email: 'new1@mail.com' })])
  check('S4 "4000001" = " 4000001 " (duplikat DB): success false', s4.success === false, `success=${s4.success}`)
  check('S4 flagged duplicateNisnInDb', s4.errors[0]?.messageKey === 'memberImport.duplicateNisnInDb', s4.errors[0]?.messageKey)
  check('S4 created 0', s4.created === 0, `created=${s4.created}`)
  check('S4 count tetap 1', (await memberCount()) === 1, `count=${await memberCount()}`)

  // ================= S5 — duplikat Email (case + trim) setelah normalisasi =================
  const s5 = await service.import([makeRow({ rowNumber: 1, className: 'XI IPA 2', nisn: '4000002', email: 'user@mail.com' })])
  check('S5 "user@mail.com" = "USER@MAIL.COM " (duplikat DB): success false', s5.success === false, `success=${s5.success}`)
  check('S5 flagged duplicateEmailInDb', s5.errors[0]?.messageKey === 'memberImport.duplicateEmailInDb', s5.errors[0]?.messageKey)
  check('S5 created 0', s5.created === 0, `created=${s5.created}`)
  check('S5 count tetap 1', (await memberCount()) === 1, `count=${await memberCount()}`)

  // ================= S6 — baris bersih tetap berhasil import =================
  const s6 = await service.import([makeRow({ rowNumber: 1, className: 'XI IPA 2', nisn: '4000003', email: 'user3@mail.com' })])
  check('S6 baris unik: success true', s6.success === true, `success=${s6.success}`)
  check('S6 baris unik: created 1', s6.created === 1, `created=${s6.created}`)
  check('S6 count 2', (await memberCount()) === 2, `count=${await memberCount()}`)

  // ================= S7 — duplikat dalam file (renderer) setelah normalisasi =================
  const fileRows: ParsedMemberRow[] = [
    { rowNumber: 2, nama: 'User Satu', kelas: 'XI IPA 2', jenisKelamin: 'L', nisn: ' 1234567890 ', tempatLahir: 'Bandung', tanggalLahir: '2010-01-01', alamat: 'Jl. A 1', whatsapp: '0811111111', email: 'USER@MAIL.COM ' },
    { rowNumber: 3, nama: 'User Dua', kelas: 'XI IPA 2', jenisKelamin: 'P', nisn: '1234567890', tempatLahir: 'Jakarta', tanggalLahir: '2010-02-02', alamat: 'Jl. B 2', whatsapp: '0822222222', email: 'user@mail.com' }
  ]
  const preview = memberPreviewService.buildPreview(fileRows, EMPTY_PREVIEW)
  check('S7 NISN dalam file dianggap sama', preview.rows[0]?.duplicateNisnRows.includes(3) === true, `${preview.rows[0]?.duplicateNisnRows}`)
  check('S7 Email dalam file dianggap sama (case+trim)', preview.rows[0]?.duplicateEmailRows.includes(3) === true, `${preview.rows[0]?.duplicateEmailRows}`)
  check('S7 status DUPLICATE kedua baris', preview.rows[0]?.status === 'DUPLICATE' && preview.rows[1]?.status === 'DUPLICATE', `${preview.rows[0]?.status}/${preview.rows[1]?.status}`)
  check('S7 summary.duplicate 2', preview.summary.duplicate === 2, `duplicate=${preview.summary.duplicate}`)
  check('S7 canImport false', preview.canImport === false, `canImport=${preview.canImport}`)

  // ================= VERIFIKASI =================
  console.log('FINAL_MEMBER_COUNT ' + (await memberCount()))

  await prisma.$disconnect()

  console.log(`P7C SMOKE RESULT: ${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
