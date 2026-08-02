import { getPrisma } from '../src/main/repositories/base/prisma'
import { AcademicYearRepository } from '../src/main/repositories/academic-year.repository'
import { CurriculumRepository } from '../src/main/repositories/curriculum.repository'
import { ClassRepository } from '../src/main/repositories/class.repository'
import { MemberClassResolver } from '../src/main/services/member-class-resolver.service'
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
  const resolver = new MemberClassResolver(ayRepo, classRepo)

  // ================= SEED =================
  const ay = await ayRepo.create({ name: '2025/2026', startDate: new Date('2025-07-01'), endDate: new Date('2026-06-30'), isActive: true })
  const curA = await curRepo.create({ name: 'Kurikulum Merdeka' })
  const curB = await curRepo.create({ name: 'Kurikulum 2013' })
  const classA1 = await classRepo.create({ academicYearId: ay.id, curriculumId: curA.id, educationLevel: 'X', parallel: 'MIPA 1' })
  const classA2 = await classRepo.create({ academicYearId: ay.id, curriculumId: curB.id, educationLevel: 'X', parallel: 'MIPA 1' })
  const classB = await classRepo.create({ academicYearId: ay.id, curriculumId: curA.id, educationLevel: 'XI', parallel: 'IPA 2' })
  const classC = await classRepo.create({ academicYearId: ay.id, curriculumId: curA.id, educationLevel: 'XII', parallel: 'TKJ 1' })

  // ================= S1 — class ditemukan =================
  const s1 = await resolver.resolve([makeRow({ rowNumber: 1, className: 'XI IPA 2' })])
  check('S1 ditemukan: errors kosong', s1.errors.length === 0, `errors=${s1.errors.length}`)
  check('S1 ditemukan: classId == classB', s1.items[0]?.classId === classB.id, s1.items[0]?.classId)

  // ================= S2 — class tidak ditemukan =================
  const s2 = await resolver.resolve([makeRow({ rowNumber: 18, className: 'XI Merdeka 1' })])
  check('S2 tidak ditemukan: 1 error', s2.errors.length === 1, `errors=${s2.errors.length}`)
  const e2 = s2.errors[0]
  check('S2 tidak ditemukan: rowNumber 18', e2?.rowNumber === 18, `${e2?.rowNumber}`)
  check('S2 tidak ditemukan: className XI Merdeka 1', e2?.className === 'XI Merdeka 1', e2?.className)
  check('S2 tidak ditemukan: message key classNotFound', e2?.messageKey === 'memberImport.classNotFound', e2?.messageKey)
  check('S2 tidak ditemukan: classId null', s2.items[0]?.classId === null)

  // ================= S3 — class ambigu =================
  const s3 = await resolver.resolve([makeRow({ rowNumber: 5, className: 'X MIPA 1' })])
  check('S3 ambigu: 1 error', s3.errors.length === 1, `errors=${s3.errors.length}`)
  const e3 = s3.errors[0]
  check('S3 ambigu: rowNumber 5', e3?.rowNumber === 5, `${e3?.rowNumber}`)
  check('S3 ambigu: className X MIPA 1', e3?.className === 'X MIPA 1', e3?.className)
  check('S3 ambigu: message key classAmbiguous', e3?.messageKey === 'memberImport.classAmbiguous', e3?.messageKey)
  check('S3 ambigu: classId null', s3.items[0]?.classId === null)

  // ================= S4 — campuran =================
  const s4 = await resolver.resolve([
    makeRow({ rowNumber: 1, className: 'XI IPA 2' }),
    makeRow({ rowNumber: 2, className: 'X MIPA 1' }),
    makeRow({ rowNumber: 3, className: 'XI Merdeka 1' })
  ])
  const s4Resolved = s4.items.filter((i) => i.classId !== null).length
  const s4Failed = s4.items.filter((i) => i.classId === null).length
  check('S4 campuran: 1 resolved + 2 gagal', s4Resolved === 1 && s4Failed === 2, `resolved=${s4Resolved} failed=${s4Failed}`)
  check('S4 campuran: 2 error', s4.errors.length === 2, `errors=${s4.errors.length}`)
  const s4Keys = s4.errors.map((e) => e.messageKey).sort().join(',')
  check('S4 campuran: classNotFound,classAmbiguous', s4Keys === 'memberImport.classAmbiguous,memberImport.classNotFound', s4Keys)

  // ================= S5 — format tidak valid (bukan X/XI/XII) =================
  const s5a = await resolver.resolve([makeRow({ rowNumber: 9, className: 'MIPA 1' })])
  check('S5a "MIPA 1" tanpa level: classNotFound', s5a.errors[0]?.messageKey === 'memberImport.classNotFound', s5a.errors[0]?.messageKey)
  const s5b = await resolver.resolve([makeRow({ rowNumber: 10, className: 'XIIIPA 1' })])
  check('S5b "XIIIPA 1" level tidak valid: classNotFound', s5b.errors[0]?.messageKey === 'memberImport.classNotFound', s5b.errors[0]?.messageKey)

  // ================= S6 — tidak ada tahun ajaran aktif =================
  await ayRepo.update(ay.id, { isActive: false })
  const s6 = await resolver.resolve([
    makeRow({ rowNumber: 21, className: 'XI IPA 2' }),
    makeRow({ rowNumber: 22, className: 'XII TKJ 1' })
  ])
  check('S6 tanpa AY aktif: 2 error classNotFound', s6.errors.length === 2 && s6.errors.every((e) => e.messageKey === 'memberImport.classNotFound'), `errors=${s6.errors.length}`)
  await ayRepo.update(ay.id, { isActive: true })

  // ================= S7 — 1000 rows (batch) =================
  const names = ['XI IPA 2', 'X MIPA 1', 'XI Merdeka 1'] as const
  const rows1000: MemberImportRowInput[] = Array.from({ length: 1000 }, (_, i) =>
    makeRow({ rowNumber: i + 1, className: names[i % 3] })
  )
  const r1000 = await resolver.resolve(rows1000)
  const found = r1000.items.filter((i) => i.classId !== null).length
  const failed = r1000.items.filter((i) => i.classId === null).length
  check('S7 1000 rows: resolved 334', found === 334, `found=${found}`)
  check('S7 1000 rows: gagal 666', failed === 666, `failed=${failed}`)
  const ambiguous = r1000.errors.filter((e) => e.messageKey === 'memberImport.classAmbiguous').length
  const notFound = r1000.errors.filter((e) => e.messageKey === 'memberImport.classNotFound').length
  check('S7 1000 rows: ambigu 333', ambiguous === 333, `ambigu=${ambiguous}`)
  check('S7 1000 rows: notFound 333', notFound === 333, `notFound=${notFound}`)
  const row1000 = r1000.items[999]
  check('S7 1000 rows: baris 1000 -> XI IPA 2 resolved', row1000?.rowNumber === 1000 && row1000.classId === classB.id, `${row1000?.rowNumber}/${row1000?.classId === classB.id}`)
  const row2 = r1000.items[1]
  check('S7 1000 rows: baris 2 -> X MIPA 1 ambigu', row2?.classId === null && r1000.errors.some((e) => e.rowNumber === 2 && e.messageKey === 'memberImport.classAmbiguous'))

  console.log('FINAL_CLASS_COUNT ' + (await prisma.class.count()))

  await prisma.$disconnect()

  console.log(`P3 SMOKE RESULT: ${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
