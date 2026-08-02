import { getPrisma } from '../src/main/repositories/base/prisma'
import { AcademicYearRepository } from '../src/main/repositories/academic-year.repository'
import { CurriculumRepository } from '../src/main/repositories/curriculum.repository'
import { ClassRepository } from '../src/main/repositories/class.repository'
import { MemberRepository } from '../src/main/repositories/member.repository'
import { MemberDuplicateChecker } from '../src/main/services/member-duplicate-checker.service'
import { MemberClassResolver } from '../src/main/services/member-class-resolver.service'
import { NumberGeneratorService } from '../src/main/services/number-generator.service'
import { MemberImportService } from '../src/main/services/member-import.service'
import type {
  MemberImportProgressEvent,
  MemberImportRowInput
} from '../src/shared/dto/member'

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

  // ================= SEED =================
  const ay = await ayRepo.create({ name: '2025/2026', startDate: new Date('2025-07-01'), endDate: new Date('2026-06-30'), isActive: true })
  const curA = await curRepo.create({ name: 'Kurikulum Merdeka' })
  const curB = await curRepo.create({ name: 'Kurikulum 2013' })
  await classRepo.create({ academicYearId: ay.id, curriculumId: curA.id, educationLevel: 'XI', parallel: 'IPA 2' })
  await classRepo.create({ academicYearId: ay.id, curriculumId: curA.id, educationLevel: 'XII', parallel: 'TKJ 1' })
  await classRepo.create({ academicYearId: ay.id, curriculumId: curA.id, educationLevel: 'X', parallel: 'MIPA 1' })
  await classRepo.create({ academicYearId: ay.id, curriculumId: curB.id, educationLevel: 'X', parallel: 'MIPA 1' })
  await memberRepo.create({
    memberNumber: 'S-000001',
    fullName: 'Existing Person',
    memberType: 'student',
    nisn: '1000001',
    email: 'exist@test.id',
    status: 'INACTIVE'
  })
  const baseMemberCount = await prisma.member.count()

  // ================= S1 — previewCheck bersih =================
  const s1 = await service.previewCheck([
    makeRow({ rowNumber: 1, className: 'XI IPA 2', nisn: '2000001' }),
    makeRow({ rowNumber: 2, className: 'XII TKJ 1', nisn: '2000002' })
  ])
  check('S1 preview bersih: valid true', s1.valid === true, `valid=${s1.valid}`)
  check('S1 preview bersih: errorCount 0', s1.errorCount === 0, `errorCount=${s1.errorCount}`)
  check('S1 preview bersih: warningCount 0', s1.warningCount === 0, `warningCount=${s1.warningCount}`)
  check('S1 preview bersih: tidak ada tulis', (await prisma.member.count()) === baseMemberCount)

  // ================= S2 — previewCheck class tidak ditemukan =================
  const s2 = await service.previewCheck([makeRow({ rowNumber: 18, className: 'XI Merdeka 1', nisn: '2000003' })])
  check('S2 class not found: valid false', s2.valid === false)
  check('S2 class not found: errorCount 1', s2.errorCount === 1, `errorCount=${s2.errorCount}`)
  check('S2 class not found: messageKey', s2.errors[0]?.messageKey === 'memberImport.classNotFound', s2.errors[0]?.messageKey)
  check('S2 class not found: rowNumber 18', s2.errors[0]?.rowNumber === 18, `${s2.errors[0]?.rowNumber}`)
  check('S2 class not found: className', s2.errors[0]?.className === 'XI Merdeka 1', s2.errors[0]?.className)

  // ================= S3 — previewCheck class ambigu =================
  const s3 = await service.previewCheck([makeRow({ rowNumber: 5, className: 'X MIPA 1', nisn: '2000004' })])
  check('S3 class ambigu: valid false', s3.valid === false)
  check('S3 class ambigu: messageKey', s3.errors[0]?.messageKey === 'memberImport.classAmbiguous', s3.errors[0]?.messageKey)
  check('S3 class ambigu: className', s3.errors[0]?.className === 'X MIPA 1', s3.errors[0]?.className)

  // ================= S4 — previewCheck duplicate NISN di DB =================
  const s4 = await service.previewCheck([makeRow({ rowNumber: 7, nisn: '1000001', className: 'XI IPA 2' })])
  check('S4 dup NISN DB: valid false', s4.valid === false)
  const s4e = s4.errors[0]
  check('S4 dup NISN DB: messageKey', s4e?.messageKey === 'memberImport.duplicateNisnInDb', s4e?.messageKey)
  check('S4 dup NISN DB: field nisn', s4e?.field === 'nisn', s4e?.field)
  check('S4 dup NISN DB: existingMemberNumber', s4e?.existingMemberNumber === 'S-000001', s4e?.existingMemberNumber)
  check('S4 dup NISN DB: existingMemberName', s4e?.existingMemberName === 'Existing Person', s4e?.existingMemberName)

  // ================= S4b — previewCheck duplicate email di DB =================
  const s4b = await service.previewCheck([makeRow({ rowNumber: 8, nisn: '2000005', className: 'XI IPA 2', email: 'exist@test.id' })])
  check('S4b dup email DB: valid false', s4b.valid === false)
  const s4be = s4b.errors[0]
  check('S4b dup email DB: messageKey', s4be?.messageKey === 'memberImport.duplicateEmailInDb', s4be?.messageKey)
  check('S4b dup email DB: field email', s4be?.field === 'email', s4be?.field)

  // ================= S5 — previewCheck gabungan blocker =================
  const s5 = await service.previewCheck([
    makeRow({ rowNumber: 7, nisn: '1000001', className: 'XI IPA 2' }),
    makeRow({ rowNumber: 18, nisn: '2000006', className: 'XI Merdeka 1' })
  ])
  check('S5 gabungan: errorCount 2', s5.errorCount === 2, `errorCount=${s5.errorCount}`)
  const s5Keys = s5.errors.map((e) => e.messageKey).sort().join(',')
  check('S5 gabungan: dupNisnInDb,classNotFound', s5Keys === 'memberImport.classNotFound,memberImport.duplicateNisnInDb', s5Keys)

  // ================= S6 — import() preflight gagal -> success:false, tanpa tulis =================
  const blockedRows = [
    makeRow({ rowNumber: 7, nisn: '1000001', className: 'XI IPA 2' }),
    makeRow({ rowNumber: 18, nisn: '2000007', className: 'XI Merdeka 1' })
  ]
  const s6 = await service.import(blockedRows)
  check('S6 import blocker: success false', s6.success === false, `success=${s6.success}`)
  check('S6 import blocker: totalRows 2', s6.totalRows === 2, `totalRows=${s6.totalRows}`)
  check('S6 import blocker: created 0', s6.created === 0, `created=${s6.created}`)
  check('S6 import blocker: failed 2', s6.failed === 2, `failed=${s6.failed}`)
  check('S6 import blocker: errors 2', s6.errors.length === 2, `errors=${s6.errors.length}`)
  check('S6 import blocker: tanpa tulis', (await prisma.member.count()) === baseMemberCount)

  // ================= S7 — import() preflight bersih (P4B belum ada tulis) =================
  const events: MemberImportProgressEvent[] = []
  const s7 = await service.import(
    [
      makeRow({ rowNumber: 1, className: 'XI IPA 2', nisn: '2000008' }),
      makeRow({ rowNumber: 2, className: 'XII TKJ 1', nisn: '2000009' })
    ],
    { onProgress: (event) => events.push(event) }
  )
  check('S7 import bersih (P4B): success false', s7.success === false, `success=${s7.success}`)
  check('S7 import bersih (P4B): created 0', s7.created === 0, `created=${s7.created}`)
  check('S7 import bersih (P4B): failed == totalRows', s7.failed === s7.totalRows, `failed=${s7.failed}`)
  check('S7 import bersih (P4B): importFailed', s7.errors[0]?.messageKey === 'memberImport.importFailed', s7.errors[0]?.messageKey)
  check('S7 import bersih (P4B): tanpa tulis', (await prisma.member.count()) === baseMemberCount)
  const stages = events.map((e) => e.stage)
  check('S7 progress: preparing', stages.includes('preparing'), stages.join(','))
  check('S7 progress: checking-duplicate', stages.includes('checking-duplicate'))
  check('S7 progress: resolving-class', stages.includes('resolving-class'))
  check('S7 progress: generating-number', stages.includes('generating-number'))
  check('S7 progress: completed tidak terkirim', !stages.includes('completed'))

  // ================= S8 — single-flight guard =================
  const guardRows = Array.from({ length: 100 }, (_, i) =>
    makeRow({ rowNumber: i + 1, className: 'XI Tidak Ada 9', nisn: `300000${String(i + 1).padStart(3, '0')}` })
  )
  const p1 = service.import(guardRows)
  check('S8 single-flight: isImportRunning true saat berjalan', service.isImportRunning() === true)
  const r2 = await service.import(guardRows)
  check('S8 single-flight: import kedua ditolak (success false)', r2.success === false)
  check('S8 single-flight: import kedua importFailed', r2.errors[0]?.messageKey === 'memberImport.importFailed', r2.errors[0]?.messageKey)
  check('S8 single-flight: import kedua tanpa tulis', (await prisma.member.count()) === baseMemberCount)
  const r1 = await p1
  check('S8 single-flight: import pertama classNotFound', r1.errors[0]?.messageKey === 'memberImport.classNotFound', r1.errors[0]?.messageKey)
  check('S8 single-flight: setelah selesai tidak running', service.isImportRunning() === false)

  // ================= VERIFIKASI TANPA TULIS =================
  check('TANPA TULIS total: count tetap ' + baseMemberCount, (await prisma.member.count()) === baseMemberCount)

  console.log('FINAL_MEMBER_COUNT ' + (await prisma.member.count()))

  await prisma.$disconnect()

  console.log(`P4B SMOKE RESULT: ${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
