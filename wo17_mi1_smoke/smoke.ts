import { MemberClassResolver } from '../src/main/services/member-class-resolver.service'
import { ClassRepository } from '../src/main/repositories/class.repository'
import { MemberRepository } from '../src/main/repositories/member.repository'
import { NumberGeneratorService } from '../src/main/services/number-generator.service'
import { MemberDuplicateChecker } from '../src/main/services/member-duplicate-checker.service'
import { MemberImportService } from '../src/main/services/member-import.service'
import { EnrollmentRepository } from '../src/main/repositories/enrollment.repository'
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
    fullName: `Siswa Uji ${rowNumber}`,
    className,
    gender: 'male',
    nisn,
    address: 'Jl. Uji',
    phone: '0812'
  }
}

async function main(): Promise<void> {
  const prisma = getPrisma()
  const classResolver = new MemberClassResolver(new ClassRepository())
  const memberRepo = new MemberRepository()
  const enrollmentRepo = new EnrollmentRepository()
  const memberImportService = new MemberImportService(
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
  check('seed: 2 kurikulum, 2 tahun, 4 kelas', k1.id !== '' && classD.id !== '')

  console.log('--- STEP 1: resolve skop eksplisit tahun aktif (RFC §12.1 step 4) ---')
  const r1 = await classResolver.resolve([row(1, 'X A', '1001'), row(2, 'X B', '1002')], yearA.id, k1.id)
  expectEqual('resolve count items', r1.items.length, 2)
  expectEqual('resolve errors 0', r1.errors.length, 0)
  expectEqual('X A -> classA', r1.items[0]?.classId, classA.id)
  expectEqual('X B -> classB', r1.items[1]?.classId, classB.id)

  console.log('--- STEP 2: curriculum berbeda -> kelas pada kurikulum pilihan ---')
  const r2 = await classResolver.resolve([row(3, 'X A', '1003')], yearA.id, k2.id)
  expectEqual('X A (k2) -> classC', r2.items[0]?.classId, classC.id)
  expectEqual('k2 errors 0', r2.errors.length, 0)

  console.log('--- STEP 3: academic year berbeda (nonaktif) -> skop tahun eksplisit ---')
  const r3 = await classResolver.resolve([row(4, 'X A', '1004')], yearB.id, k1.id)
  expectEqual('X A (yearB, k1) -> classD', r3.items[0]?.classId, classD.id)
  expectEqual('yearB errors 0', r3.errors.length, 0)

  console.log('--- STEP 4: classNotFound tetap BLOCKER ---')
  const r4 = await classResolver.resolve([row(5, 'XI A', '1005')], yearA.id, k1.id)
  expectEqual('XI A not found item classId null', r4.items[0]?.classId, null)
  expectEqual('XI A not found errors 1', r4.errors.length, 1)
  expectEqual('XI A messageKey classNotFound', r4.errors[0]?.messageKey, 'memberImport.classNotFound')
  expectEqual('XI A error berisi className', r4.errors[0]?.className, 'XI A')
  const r4b = await classResolver.resolve([row(6, 'x a', '1006')], yearA.id, k2.id)
  expectEqual('lowercase "x a" (k2) -> classC (case-insensitive)', r4b.items[0]?.classId, classC.id)
  const r4c = await classResolver.resolve([row(7, 'tanpa-paralel', '1007')], yearA.id, k1.id)
  expectEqual('className tak ter-parse -> notFound', r4c.errors[0]?.messageKey, 'memberImport.classNotFound')

  console.log('--- STEP 5: scope WAJIB (WO-20 MI-4) — tidak ada fallback; kurikulum eksplisit mempersempit ---')
  const r5 = await classResolver.resolve([row(8, 'X A', '1008')], yearA.id, k1.id)
  expectEqual('X A (yearA + k1) -> classA, TIDAK ambigu', r5.items[0]?.classId, classA.id)
  expectEqual('X A k1 errors 0', r5.errors.length, 0)
  const r5b = await classResolver.resolve([row(9, 'X A', '1009')], yearA.id, k2.id)
  expectEqual('X A (yearA + k2) -> classC, TIDAK ambigu', r5b.items[0]?.classId, classC.id)
  expectEqual('X A k2 errors 0', r5b.errors.length, 0)

  console.log('--- STEP 6: tahun dari scope WAJIB dihormati (tahun non-aktif) ---')
  const r6 = await classResolver.resolve([row(10, 'X A', '1010')], yearB.id, k1.id)
  expectEqual('X A (yearB + k1) -> classD, bukan fallback tahun aktif', r6.items[0]?.classId, classD.id)
  expectEqual('tahun scope yearB errors 0', r6.errors.length, 0)

  console.log('--- STEP 7: service previewCheck dengan scope ---')
  const p1 = await memberImportService.previewCheck([row(1, 'X A', '2001'), row(2, 'X B', '2002')], { academicYearId: yearA.id, curriculumId: k1.id })
  expectEqual('preview valid (scope k1)', p1.valid, true)
  expectEqual('preview errorCount 0', p1.errorCount, 0)
  const p2 = await memberImportService.previewCheck([row(3, 'XI A', '2003')], { academicYearId: yearA.id, curriculumId: k1.id })
  expectEqual('preview invalid (classNotFound)', p2.valid, false)
  expectEqual('preview error classNotFound', p2.errors[0]?.messageKey, 'memberImport.classNotFound')

  console.log('--- STEP 9: import dengan scope -> resolusi kelas (MI-2: via enrollment, Member.classId tidak ditulis) ---')
  const i1 = await memberImportService.import([row(1, 'X A', '2001')], { scope: { academicYearId: yearA.id, curriculumId: k1.id } })
  expectEqual('import k1 success', i1.success, true)
  expectEqual('import k1 created 1', i1.created, 1)
  const m1 = await prisma.member.findFirst({ where: { nisn: '2001' } })
  expectEqual('member.classId TIDAK ditulis (null)', m1?.classId, null)
  expectEqual('member.status INACTIVE', m1?.status, 'INACTIVE')
  expectEqual('member.memberNumber ter-generate', m1?.memberNumber, 'S-000001')
  const en1 = await enrollmentRepo.findActiveByMember(m1!.id)
  check('enrollment.classId == classA (resolusi skop k1)', en1?.classId === classA.id)
  check('enrollment academicYearId == yearA', en1?.academicYearId === yearA.id)

  console.log('--- STEP 10: import scope yearB (non-aktif) -> enrollment di yearB, BUKAN tahun aktif ---')
  const i2 = await memberImportService.import([row(5, 'X A', '2005')], { scope: { academicYearId: yearB.id, curriculumId: k1.id } })
  expectEqual('import scope yearB success', i2.success, true)
  const m2 = await prisma.member.findFirst({ where: { nisn: '2005' } })
  expectEqual('member.classId null (scope yearB)', m2?.classId, null)
  const en2 = await enrollmentRepo.findActiveByMember(m2!.id)
  check('scope yearB -> enrollment.classId == classD', en2?.classId === classD.id)
  check('enrollment2 academicYearId == yearB (scope, bukan tahun aktif)', en2?.academicYearId === yearB.id)

  console.log('--- STEP 11: import scope kurikulum lain -> enrollment kelas kurikulum itu ---')
  const i3 = await memberImportService.import([row(3, 'X A', '2003')], { scope: { academicYearId: yearA.id, curriculumId: k2.id } })
  expectEqual('import k2 success', i3.success, true)
  const m3 = await prisma.member.findFirst({ where: { nisn: '2003' } })
  expectEqual('member.classId null (scope k2)', m3?.classId, null)
  const en3 = await enrollmentRepo.findActiveByMember(m3!.id)
  check('scope k2 -> enrollment.classId == classC', en3?.classId === classC.id)

  console.log('--- STEP 12: import dengan classNotFound -> result success:false, 0 created ---')
  const i4 = await memberImportService.import([row(4, 'XI C', '2004')], { scope: { academicYearId: yearA.id, curriculumId: k1.id } })
  expectEqual('import classNotFound success false', i4.success, false)
  expectEqual('import classNotFound created 0', i4.created, 0)
  expectEqual('import classNotFound error classNotFound', i4.errors[0]?.messageKey, 'memberImport.classNotFound')
  const m4 = await prisma.member.findFirst({ where: { nisn: '2004' } })
  expectEqual('baris gagal TIDAK tersimpan', m4, null)

  await prisma.$disconnect()
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
