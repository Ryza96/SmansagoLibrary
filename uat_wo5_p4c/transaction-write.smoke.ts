import { getPrisma } from '../src/main/repositories/base/prisma'
import { AcademicYearRepository } from '../src/main/repositories/academic-year.repository'
import { CurriculumRepository } from '../src/main/repositories/curriculum.repository'
import { ClassRepository } from '../src/main/repositories/class.repository'
import { MemberRepository } from '../src/main/repositories/member.repository'
import { MemberDuplicateChecker } from '../src/main/services/member-duplicate-checker.service'
import { MemberClassResolver } from '../src/main/services/member-class-resolver.service'
import { NumberGeneratorService } from '../src/main/services/number-generator.service'
import { MemberImportService } from '../src/main/services/member-import.service'
import type { MemberImportRowInput } from '../src/shared/dto/member'

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
  const classIPA2 = await classRepo.create({ academicYearId: ay.id, curriculumId: curA.id, educationLevel: 'XI', parallel: 'IPA 2' })
  const classTKJ1 = await classRepo.create({ academicYearId: ay.id, curriculumId: curA.id, educationLevel: 'XII', parallel: 'TKJ 1' })
  const classMIPA1 = await classRepo.create({ academicYearId: ay.id, curriculumId: curA.id, educationLevel: 'X', parallel: 'MIPA 1' })
  const memberCount = async (): Promise<number> => prisma.member.count()
  const latestNumber = async (): Promise<string | null> => {
    const row = await prisma.member.findFirst({ orderBy: { memberNumber: 'desc' } })
    return row?.memberNumber ?? null
  }

  // ================= S1 — preflight blocker (regresi P4B) =================
  const s1 = await service.import([makeRow({ rowNumber: 1, className: 'XI Tidak Ada 9', nisn: '4000001' })])
  check('S1 blocker class: success false', s1.success === false, `success=${s1.success}`)
  check('S1 blocker class: classNotFound', s1.errors[0]?.messageKey === 'memberImport.classNotFound', s1.errors[0]?.messageKey)
  check('S1 blocker class: created 0', s1.created === 0, `created=${s1.created}`)
  check('S1 blocker class: tidak ada tulis', (await memberCount()) === 0)

  // ================= S2 — import berhasil + mapping field =================
  const s2 = await service.import([
    makeRow({ rowNumber: 1, className: 'XI IPA 2', nisn: '4000001', gender: 'female', email: 'a1@test.id', birthDate: '2010-01-15', birthPlace: 'Bandung' }),
    makeRow({ rowNumber: 2, className: 'XII TKJ 1', nisn: '4000002', gender: 'male' })
  ])
  check('S2 import berhasil: success true', s2.success === true, `success=${s2.success}`)
  check('S2 import berhasil: totalRows 2', s2.totalRows === 2, `totalRows=${s2.totalRows}`)
  check('S2 import berhasil: created 2', s2.created === 2, `created=${s2.created}`)
  check('S2 import berhasil: failed 0', s2.failed === 0, `failed=${s2.failed}`)
  check('S2 import berhasil: errors kosong', s2.errors.length === 0, `errors=${s2.errors.length}`)
  check('S2 import berhasil: count 2', (await memberCount()) === 2, `count=${await memberCount()}`)
  const s2Members = await prisma.member.findMany({ orderBy: { memberNumber: 'asc' } })
  const s2Numbers = s2Members.map((m) => m.memberNumber).join(',')
  check('S2 nomor berurutan S-000001..S-000002', s2Numbers === 'S-000001,S-000002', s2Numbers)
  const m1 = s2Members[0]
  const m2 = s2Members[1]
  check('S2 field: status INACTIVE', m1?.status === 'INACTIVE' && m2?.status === 'INACTIVE', `${m1?.status}/${m2?.status}`)
  check('S2 field: memberType student', m1?.memberType === 'student' && m2?.memberType === 'student', `${m1?.memberType}/${m2?.memberType}`)
  check('S2 field: classId row1 = XI IPA 2', m1?.classId === classIPA2.id, m1?.classId)
  check('S2 field: classId row2 = XII TKJ 1', m2?.classId === classTKJ1.id, m2?.classId)
  check('S2 field: nisn tersimpan', m1?.nisn === '4000001' && m2?.nisn === '4000002')
  check('S2 field: email + birthPlace tersimpan', m1?.email === 'a1@test.id' && m1?.birthPlace === 'Bandung', `${m1?.email}/${m1?.birthPlace}`)
  check('S2 field: birthDate ter-parse', m1?.birthDate?.toISOString().startsWith('2010-01-15'), `${m1?.birthDate}`)

  // ================= S3 — lanjutan nomor berurutan =================
  const s3 = await service.import([makeRow({ rowNumber: 1, className: 'X MIPA 1', nisn: '4000003' })])
  check('S3 lanjutan: success true', s3.success === true)
  check('S3 lanjutan: created 1', s3.created === 1, `created=${s3.created}`)
  check('S3 lanjutan: count 3', (await memberCount()) === 3)
  check('S3 lanjutan: nomor S-000003', (await latestNumber()) === 'S-000003', `${await latestNumber()}`)
  const m3 = await prisma.member.findUnique({ where: { nisn: '4000003' } })
  check('S3 lanjutan: classId X MIPA 1', m3?.classId === classMIPA1.id, m3?.classId)

  // ================= S4 — duplicate commit -> ROLLBACK =================
  const s4 = await service.import([
    makeRow({ rowNumber: 1, className: 'XI IPA 2', nisn: '6000001' }),
    makeRow({ rowNumber: 2, className: 'XII TKJ 1', nisn: '6000001' })
  ])
  check('S4 duplicate commit: success false', s4.success === false, `success=${s4.success}`)
  check('S4 duplicate commit: createFailed', s4.errors[0]?.messageKey === 'memberImport.createFailed', s4.errors[0]?.messageKey)
  check('S4 duplicate commit: created 0', s4.created === 0, `created=${s4.created}`)
  check('S4 duplicate commit: failed 2', s4.failed === 2, `failed=${s4.failed}`)
  check('S4 duplicate commit: rollback, count tetap 3', (await memberCount()) === 3, `count=${await memberCount()}`)

  // ================= S5 — nomor tidak hilang setelah rollback =================
  const s5 = await service.import([makeRow({ rowNumber: 1, className: 'XI IPA 2', nisn: '4000004' })])
  check('S5 setelah rollback: success true', s5.success === true)
  check('S5 setelah rollback: nomor S-000004 (bukan loncat)', (await latestNumber()) === 'S-000004', `${await latestNumber()}`)
  check('S5 setelah rollback: count 4', (await memberCount()) === 4)

  // ================= S6 — single-flight (regresi P4B) =================
  const guardRows = Array.from({ length: 100 }, (_, i) =>
    makeRow({ rowNumber: i + 1, className: 'XI Tidak Ada 9', nisn: `500000${String(i + 1).padStart(3, '0')}` })
  )
  const p1 = service.import(guardRows)
  check('S6 single-flight: running saat berjalan', service.isImportRunning() === true)
  const r2 = await service.import(guardRows)
  check('S6 single-flight: import kedua ditolak', r2.success === false && r2.errors[0]?.messageKey === 'memberImport.importFailed', r2.errors[0]?.messageKey)
  const r1 = await p1
  check('S6 single-flight: import pertama classNotFound', r1.errors[0]?.messageKey === 'memberImport.classNotFound', r1.errors[0]?.messageKey)
  check('S6 single-flight: selesai tidak running', service.isImportRunning() === false)
  check('S6 single-flight: tidak ada tulis', (await memberCount()) === 4)

  // ================= S7 — batch campuran all-or-nothing =================
  const s7 = await service.import([
    makeRow({ rowNumber: 1, className: 'XI IPA 2', nisn: '4000005' }),
    makeRow({ rowNumber: 2, className: 'XII TKJ 1', nisn: '7000001' }),
    makeRow({ rowNumber: 3, className: 'XII TKJ 1', nisn: '7000001' })
  ])
  check('S7 batch campuran: success false', s7.success === false)
  check('S7 batch campuran: createFailed', s7.errors[0]?.messageKey === 'memberImport.createFailed', s7.errors[0]?.messageKey)
  check('S7 batch campuran: created 0 (tanpa partial commit)', s7.created === 0, `created=${s7.created}`)
  check('S7 batch campuran: count tetap 4', (await memberCount()) === 4, `count=${await memberCount()}`)
  check('S7 batch campuran: baris bersih tidak tersisa', (await prisma.member.count({ where: { nisn: '4000005' } })) === 0)

  // ================= S8 — duplikat NISN vs DB (preflight, regresi) =================
  const s8 = await service.import([makeRow({ rowNumber: 1, className: 'XI IPA 2', nisn: '4000001' })])
  check('S8 dup DB preflight: success false', s8.success === false)
  check('S8 dup DB preflight: duplicateNisnInDb', s8.errors[0]?.messageKey === 'memberImport.duplicateNisnInDb', s8.errors[0]?.messageKey)
  check('S8 dup DB preflight: tidak ada tulis', (await memberCount()) === 4)

  // ================= S9 — chunk write (505 rows -> 2 createMany) =================
  const rows505: MemberImportRowInput[] = Array.from({ length: 505 }, (_, i) =>
    makeRow({ rowNumber: i + 1, className: 'XI IPA 2', nisn: `600010${String(i + 1).padStart(3, '0')}` })
  )
  const s9 = await service.import(rows505)
  check('S9 chunk 505: success true', s9.success === true, `success=${s9.success}`)
  check('S9 chunk 505: created 505', s9.created === 505, `created=${s9.created}`)
  check('S9 chunk 505: count 509', (await memberCount()) === 509, `count=${await memberCount()}`)
  check('S9 chunk 505: nomor berurutan berlanjut', (await latestNumber()) === 'S-000509', `${await latestNumber()}`)

  // ================= VERIFIKASI =================
  console.log('FINAL_MEMBER_COUNT ' + (await memberCount()))

  await prisma.$disconnect()

  console.log(`P4C SMOKE RESULT: ${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
