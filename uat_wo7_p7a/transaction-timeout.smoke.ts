import { getPrisma } from '../src/main/repositories/base/prisma'
import { runTransaction } from '../src/main/repositories/base/transaction'
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
  await classRepo.create({ academicYearId: ay.id, curriculumId: curA.id, educationLevel: 'XI', parallel: 'IPA 2' })
  const memberCount = async (): Promise<number> => prisma.member.count()
  const latestNumber = async (): Promise<string | null> => {
    const row = await prisma.member.findFirst({ orderBy: { memberNumber: 'desc' } })
    return row?.memberNumber ?? null
  }

  // ================= S1 — opsi timeout diteruskan ke $transaction (inti fix F-1) =================
  const timedOut = await runTransaction(
    prisma,
    async (tx) => {
      await tx.member.count()
      await new Promise((resolve) => setTimeout(resolve, 500))
      await tx.member.count()
      return true
    },
    { maxWait: 1_000, timeout: 100 }
  ).then(
    () => false,
    () => true
  )
  check('S1 timeout option dihormati (reject P2028 setelah timeout)', timedOut === true, `timedOut=${timedOut}`)
  check('S1 tx timeout: rollback, count tetap 0', (await memberCount()) === 0, `count=${await memberCount()}`)

  // ================= S2 — default runTransaction tetap sukses: 100 baris =================
  const rows100: MemberImportRowInput[] = Array.from({ length: 100 }, (_, i) =>
    makeRow({ rowNumber: i + 1, className: 'XI IPA 2', nisn: `100000${String(i + 1).padStart(3, '0')}` })
  )
  const t100 = Date.now()
  const s2 = await service.import(rows100)
  const d100 = Date.now() - t100
  check('S2 100 baris: success true', s2.success === true, `success=${s2.success}`)
  check('S2 100 baris: created 100', s2.created === 100, `created=${s2.created}`)
  check('S2 100 baris: failed 0', s2.failed === 0, `failed=${s2.failed}`)
  check('S2 100 baris: count 100', (await memberCount()) === 100, `count=${await memberCount()}`)
  check('S2 100 baris: nomor S-000100', (await latestNumber()) === 'S-000100', `${await latestNumber()}`)
  console.log(`S2 100 baris selesai dalam ${d100} ms`)

  // ================= S3 — 500 baris (1 chunk createMany) =================
  const rows500: MemberImportRowInput[] = Array.from({ length: 500 }, (_, i) =>
    makeRow({ rowNumber: i + 1, className: 'XI IPA 2', nisn: `200000${String(i + 1).padStart(3, '0')}` })
  )
  const t500 = Date.now()
  const s3 = await service.import(rows500)
  const d500 = Date.now() - t500
  check('S3 500 baris: success true', s3.success === true, `success=${s3.success}`)
  check('S3 500 baris: created 500', s3.created === 500, `created=${s3.created}`)
  check('S3 500 baris: count 600', (await memberCount()) === 600, `count=${await memberCount()}`)
  check('S3 500 baris: nomor S-000600', (await latestNumber()) === 'S-000600', `${await latestNumber()}`)
  console.log(`S3 500 baris selesai dalam ${d500} ms`)

  // ================= S4 — 1000 baris (2 chunk createMany, lintas batas 500) =================
  const rows1000: MemberImportRowInput[] = Array.from({ length: 1000 }, (_, i) =>
    makeRow({ rowNumber: i + 1, className: 'XI IPA 2', nisn: `300000${String(i + 1).padStart(3, '0')}` })
  )
  const t1000 = Date.now()
  const s4 = await service.import(rows1000)
  const d1000 = Date.now() - t1000
  check('S4 1000 baris: success true', s4.success === true, `success=${s4.success}`)
  check('S4 1000 baris: created 1000', s4.created === 1000, `created=${s4.created}`)
  check('S4 1000 baris: failed 0', s4.failed === 0, `failed=${s4.failed}`)
  check('S4 1000 baris: count 1600', (await memberCount()) === 1600, `count=${await memberCount()}`)
  check('S4 1000 baris: nomor S-001600', (await latestNumber()) === 'S-001600', `${await latestNumber()}`)
  const first1000 = await prisma.member.findUnique({ where: { nisn: '300000001' } })
  const last1000 = await prisma.member.findUnique({ where: { nisn: '3000001000' } })
  check('S4 1000 baris: baris pertama S-000601', first1000?.memberNumber === 'S-000601', `${first1000?.memberNumber}`)
  check('S4 1000 baris: baris terakhir S-001600', last1000?.memberNumber === 'S-001600', `${last1000?.memberNumber}`)
  console.log(`S4 1000 baris selesai dalam ${d1000} ms`)

  // ================= VERIFIKASI =================
  console.log('FINAL_MEMBER_COUNT ' + (await memberCount()))

  await prisma.$disconnect()

  console.log(`P7A SMOKE RESULT: ${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
