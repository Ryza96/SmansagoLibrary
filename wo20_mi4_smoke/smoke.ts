import { MemberImportService } from '../src/main/services/member-import.service'
import { MemberClassResolver } from '../src/main/services/member-class-resolver.service'
import { MemberDuplicateChecker } from '../src/main/services/member-duplicate-checker.service'
import { MemberRepository } from '../src/main/repositories/member.repository'
import { EnrollmentRepository } from '../src/main/repositories/enrollment.repository'
import { ClassRepository } from '../src/main/repositories/class.repository'
import { AcademicYearRepository } from '../src/main/repositories/academic-year.repository'
import { CurriculumRepository } from '../src/main/repositories/curriculum.repository'
import { NumberGeneratorService } from '../src/main/services/number-generator.service'
import { getPrisma } from '../src/main/repositories/base/prisma'
import type { MemberImportRowInput } from '../src/shared/dto/member'

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

function row(rowNumber: number, className: string, nisn: string): MemberImportRowInput {
  return {
    rowNumber,
    fullName: `Siswa MI4 ${rowNumber}`,
    className,
    gender: 'male',
    nisn,
    address: 'Jl. Uji',
    phone: '0812'
  }
}

async function main(): Promise<void> {
  const prisma = getPrisma()
  const memberRepo = new MemberRepository()
  const enrollmentRepo = new EnrollmentRepository()
  const classResolver = new MemberClassResolver(new ClassRepository())
  const ayRepo = new AcademicYearRepository()
  const curRepo = new CurriculumRepository()
  const service = new MemberImportService(
    new MemberDuplicateChecker(memberRepo),
    classResolver,
    new NumberGeneratorService(memberRepo),
    memberRepo,
    enrollmentRepo
  )

  console.log('--- STEP 0: seed master (fresh DB) ---')
  const k1 = await prisma.curriculum.create({ data: { name: 'MERDEKA' } })
  const k2 = await prisma.curriculum.create({ data: { name: 'KTSP' } })
  const yearA = await prisma.academicYear.create({
    data: { name: '2025/2026', startDate: new Date('2025-07-01'), endDate: new Date('2026-06-30'), isActive: true }
  })
  const yearB = await prisma.academicYear.create({
    data: { name: '2026/2027', startDate: new Date('2026-07-01'), endDate: new Date('2027-06-30'), isActive: false }
  })
  const yearC = await prisma.academicYear.create({
    data: { name: '2027/2028', startDate: new Date('2027-07-01'), endDate: new Date('2028-06-30'), isActive: false }
  })
  const classA = await prisma.class.create({
    data: { academicYearId: yearA.id, curriculumId: k1.id, educationLevel: 'X', parallel: 'A', homeroomTeacher: null, isActive: true }
  })
  const classB = await prisma.class.create({
    data: { academicYearId: yearA.id, curriculumId: k1.id, educationLevel: 'X', parallel: 'B', homeroomTeacher: null, isActive: true }
  })
  const classC = await prisma.class.create({
    data: { academicYearId: yearA.id, curriculumId: k2.id, educationLevel: 'X', parallel: 'A', homeroomTeacher: null, isActive: true }
  })
  const classD = await prisma.class.create({
    data: { academicYearId: yearB.id, curriculumId: k1.id, educationLevel: 'X', parallel: 'A', homeroomTeacher: null, isActive: true }
  })
  check('seed: 2 kurikulum, 3 tahun, 4 kelas', k1.id !== '' && classD.id !== '')

  console.log('--- STEP 1: kontrak dialog — academicYears.findMany() memberi default tahun aktif ---')
  const ayResult = await ayRepo.findMany()
  const activeId = ayResult.data.find((y) => y.isActive)?.id
  check('findMany.total == 3', ayResult.total === 3)
  check('default dialog (tahun aktif) == yearA', activeId === yearA.id)

  console.log('--- STEP 2: kontrak dialog — curricula.findMany() memberi daftar kurikulum (picker) ---')
  const curResult = await curRepo.findMany()
  const curNames = curResult.data.map((c) => c.name).sort()
  check('picker berisi MERDEKA & KTSP', curNames[0] === 'KTSP' && curNames[1] === 'MERDEKA')

  console.log('--- STEP 3: default aktif (simulasi pilihan dialog) -> previewCheck(scope {yearA, k1}) VALID ---')
  const p1 = await service.previewCheck(
    [row(1, 'X A', '6001'), row(2, 'X B', '6002')],
    { academicYearId: yearA.id, curriculumId: k1.id }
  )
  expectEqual('preview valid', p1.valid, true)
  expectEqual('preview errorCount 0', p1.errorCount, 0)

  console.log('--- STEP 4: pilih kurikulum -> preview di-scope oleh kurikulum ---')
  const p2 = await service.previewCheck([row(3, 'X B', '6003')], { academicYearId: yearA.id, curriculumId: k2.id })
  expectEqual('X B di scope k2 -> classNotFound (kelas bukan milik k2)', p2.valid, false)
  expectEqual('p2 messageKey classNotFound', p2.errors[0]?.messageKey, 'memberImport.classNotFound')
  const p3 = await service.previewCheck([row(4, 'X B', '6004')], { academicYearId: yearA.id, curriculumId: k1.id })
  expectEqual('X B di scope k1 -> valid', p3.valid, true)

  console.log('--- STEP 5: preview pakai scope (tahun) — tahun non-aktif dihormati, TIDAK fallback ---')
  const p4 = await service.previewCheck([row(5, 'X A', '6005')], { academicYearId: yearB.id, curriculumId: k1.id })
  expectEqual('X A di yearB (non-aktif) -> valid (classD)', p4.valid, true)
  const p5 = await service.previewCheck([row(6, 'X A', '6006')], { academicYearId: yearC.id, curriculumId: k1.id })
  expectEqual('X A di yearC (tanpa kelas) -> classNotFound, BUKAN fallback ke yearA', p5.valid, false)
  expectEqual('p5 messageKey classNotFound', p5.errors[0]?.messageKey, 'memberImport.classNotFound')

  console.log('--- STEP 6: import pakai scope (tahun non-aktif) -> enrollment di yearB + classD ---')
  const i1 = await service.import([row(7, 'X A', '6101')], { scope: { academicYearId: yearB.id, curriculumId: k1.id } })
  expectEqual('import scope yearB success', i1.success, true)
  expectEqual('import created 1', i1.created, 1)
  const m1 = await prisma.member.findFirst({ where: { nisn: '6101' } })
  expectEqual('member.classId null', m1?.classId, null)
  const en1 = await enrollmentRepo.findManyByMember(m1!.id)
  expectEqual('enrollment 1 baris', en1.length, 1)
  check('enrollment academicYearId == yearB (scope, bukan tahun aktif)', en1[0]?.academicYearId === yearB.id)
  check('enrollment classId == classD', en1[0]?.classId === classD.id)

  console.log('--- STEP 7: import scope kurikulum -> enrollment kelas kurikulum itu ---')
  const i2 = await service.import([row(8, 'X A', '6102')], { scope: { academicYearId: yearA.id, curriculumId: k2.id } })
  expectEqual('import scope k2 success', i2.success, true)
  const m2 = await prisma.member.findFirst({ where: { nisn: '6102' } })
  const en2 = await enrollmentRepo.findManyByMember(m2!.id)
  check('scope k2 -> enrollment classId == classC', en2[0]?.classId === classC.id)
  const i3 = await service.import([row(9, 'X A', '6103')], { scope: { academicYearId: yearA.id, curriculumId: k1.id } })
  expectEqual('import scope k1 success', i3.success, true)
  const m3 = await prisma.member.findFirst({ where: { nisn: '6103' } })
  const en3 = await enrollmentRepo.findManyByMember(m3!.id)
  check('scope k1 -> enrollment classId == classA', en3[0]?.classId === classA.id)
  check('kelas sama "X A" diselesaikan per kurikulum scope', en2[0]?.classId !== en3[0]?.classId)

  console.log('--- STEP 8: invariant satu-ACTIVE per (member, tahun) ---')
  const all = await prisma.memberEnrollment.findMany()
  const activePerYear = new Map<string, number>()
  for (const e of all) {
    if (e.status === 'ACTIVE' && e.leftAt === null) {
      const key = `${e.memberId}|${e.academicYearId}`
      activePerYear.set(key, (activePerYear.get(key) ?? 0) + 1)
    }
  }
  let invariantOk = true
  for (const [key, count] of activePerYear) {
    if (count > 1) {
      invariantOk = false
      console.log(`  invariant melanggar: ${key} = ${count}`)
    }
  }
  check('tidak ada 2 ACTIVE untuk (member, tahun)', invariantOk)

  await prisma.$disconnect()
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
