import { getPrisma } from '../src/main/repositories/base/prisma'
import { MemberRepository } from '../src/main/repositories/member.repository'
import { MemberDuplicateChecker } from '../src/main/services/member-duplicate-checker.service'
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
    className: 'X MIPA 1',
    gender: 'male',
    nisn: '0000',
    address: 'Jl. Test 1',
    phone: '0812345',
    ...overrides
  }
}

async function main(): Promise<void> {
  const prisma = getPrisma()
  const repo = new MemberRepository()
  const checker = new MemberDuplicateChecker(repo)

  // ================= SEED =================
  await repo.create({ memberNumber: 'S-000001', fullName: 'Ayu Lestari', memberType: 'student', nisn: '1001', email: 'ayu@school.sch.id' })
  await repo.create({ memberNumber: 'S-000002', fullName: 'Budi Santoso', memberType: 'student', nisn: '1002' })

  // ================= S1 — tidak ada duplicate =================
  const s1 = await checker.checkDatabase([
    makeRow({ rowNumber: 10, nisn: '2001', email: 'candra@test.id' })
  ])
  check('S1 tidak ada duplicate: errors kosong', s1.errors.length === 0, `len=${s1.errors.length}`)

  // ================= S2 — duplicate NISN =================
  const s2 = await checker.checkDatabase([
    makeRow({ rowNumber: 11, nisn: '1001', email: 'new@test.id' })
  ])
  check('S2 dup NISN: 1 error', s2.errors.length === 1, `len=${s2.errors.length}`)
  const e2 = s2.errors[0]
  check('S2 dup NISN: rowNumber', e2?.rowNumber === 11, `${e2?.rowNumber}`)
  check('S2 dup NISN: field nisn', e2?.field === 'nisn', e2?.field)
  check('S2 dup NISN: existing member number S-000001', e2?.existingMemberNumber === 'S-000001', e2?.existingMemberNumber)
  check('S2 dup NISN: existing member name Ayu Lestari', e2?.existingMemberName === 'Ayu Lestari', e2?.existingMemberName)
  check('S2 dup NISN: message key', e2?.messageKey === 'memberImport.duplicateNisnInDb', e2?.messageKey)

  // ================= S3 — duplicate Email =================
  const s3 = await checker.checkDatabase([
    makeRow({ rowNumber: 12, nisn: '2002', email: 'ayu@school.sch.id' })
  ])
  check('S3 dup Email: 1 error', s3.errors.length === 1, `len=${s3.errors.length}`)
  const e3 = s3.errors[0]
  check('S3 dup Email: rowNumber', e3?.rowNumber === 12, `${e3?.rowNumber}`)
  check('S3 dup Email: field email', e3?.field === 'email', e3?.field)
  check('S3 dup Email: existing member number S-000001', e3?.existingMemberNumber === 'S-000001', e3?.existingMemberNumber)
  check('S3 dup Email: existing member name Ayu Lestari', e3?.existingMemberName === 'Ayu Lestari', e3?.existingMemberName)
  check('S3 dup Email: message key', e3?.messageKey === 'memberImport.duplicateEmailInDb', e3?.messageKey)

  // ================= S4 — email kosong / tidak terisi =================
  const s4a = await checker.checkDatabase([
    makeRow({ rowNumber: 13, nisn: '2003', email: '' })
  ])
  check('S4a email kosong "": tidak ada error', s4a.errors.length === 0, `len=${s4a.errors.length}`)

  const s4b = await checker.checkDatabase([
    makeRow({ rowNumber: 14, nisn: '2004' })
  ])
  check('S4b email undefined: tidak ada error', s4b.errors.length === 0, `len=${s4b.errors.length}`)

  // ================= S5 — NISN + Email di baris sama =================
  const s5 = await checker.checkDatabase([
    makeRow({ rowNumber: 15, nisn: '1001', email: 'ayu@school.sch.id' })
  ])
  check('S5 NISN+Email satu baris: 2 error', s5.errors.length === 2, `len=${s5.errors.length}`)
  const s5Fields = s5.errors.map((e) => e.field).sort().join(',')
  check('S5 NISN+Email satu baris: field nisn,email', s5Fields === 'email,nisn', s5Fields)

  // ================= S5b — email sama di 2 baris → per baris dapat issue =================
  const s5b = await checker.checkDatabase([
    makeRow({ rowNumber: 16, nisn: '2005', email: 'ayu@school.sch.id' }),
    makeRow({ rowNumber: 17, nisn: '2006', email: 'ayu@school.sch.id' })
  ])
  check('S5b email dup di 2 baris: 2 error', s5b.errors.length === 2, `len=${s5b.errors.length}`)
  const s5bRows = s5b.errors.map((e) => e.rowNumber).sort((a, b) => a - b).join(',')
  check('S5b email dup di 2 baris: rowNumber 16,17', s5bRows === '16,17', s5bRows)

  // ================= S6 — 1000 rows + chunk boundary =================
  for (let k = 1; k <= 50; k += 1) {
    const n = 1500 + k
    await repo.create({
      memberNumber: `S-${String(n).padStart(6, '0')}`,
      fullName: `Seed ${n}`,
      memberType: 'student',
      nisn: String(n),
      email: `m${n}@test.sch.id`
    })
  }
  await repo.create({ memberNumber: 'S-001999', fullName: 'Seed 1999', memberType: 'student', nisn: '1999', email: 'seed1999@x.id' })
  await repo.create({ memberNumber: 'S-009000', fullName: 'Seed 2000', memberType: 'student', nisn: '9000', email: 'm2000@test.sch.id' })

  const rows1000: MemberImportRowInput[] = Array.from({ length: 1000 }, (_, i) => {
    const n = 1001 + i
    return makeRow({ rowNumber: i + 1, nisn: String(n), email: `m${n}@test.sch.id` })
  })
  const r1000 = await checker.checkDatabase(rows1000)
  check('S6 1000 rows: total error 104', r1000.errors.length === 104, `len=${r1000.errors.length}`)
  const nisnCount = r1000.errors.filter((e) => e.field === 'nisn').length
  const emailCount = r1000.errors.filter((e) => e.field === 'email').length
  check('S6 1000 rows: error nisn 53 (1001,1002,1501..1550,1999)', nisnCount === 53, `nisn=${nisnCount}`)
  check('S6 1000 rows: error email 51', emailCount === 51, `email=${emailCount}`)

  const issueRow501 = r1000.errors.find((e) => e.rowNumber === 501 && e.field === 'nisn')
  check('S6 chunk1: row 501 dup nisn -> S-001501/Seed 1501', issueRow501?.existingMemberNumber === 'S-001501' && issueRow501?.existingMemberName === 'Seed 1501', `${issueRow501?.existingMemberNumber}/${issueRow501?.existingMemberName}`)
  const issueRow999 = r1000.errors.find((e) => e.rowNumber === 999 && e.field === 'nisn')
  check('S6 chunk2: row 999 dup nisn -> S-001999/Seed 1999', issueRow999?.existingMemberNumber === 'S-001999' && issueRow999?.existingMemberName === 'Seed 1999', `${issueRow999?.existingMemberNumber}/${issueRow999?.existingMemberName}`)
  const issueRow1000 = r1000.errors.find((e) => e.rowNumber === 1000 && e.field === 'email')
  check('S6 chunk2: row 1000 dup email -> S-009000/Seed 2000', issueRow1000?.existingMemberNumber === 'S-009000' && issueRow1000?.existingMemberName === 'Seed 2000', `${issueRow1000?.existingMemberNumber}/${issueRow1000?.existingMemberName}`)

  const distinctNisnRows = new Set(r1000.errors.filter((e) => e.field === 'nisn').map((e) => e.rowNumber)).size
  check('S6 semua baris dup NISN mendapat issue (53 baris)', distinctNisnRows === 53, `rows=${distinctNisnRows}`)

  console.log('FINAL_MEMBER_COUNT ' + (await prisma.member.count()))

  await prisma.$disconnect()

  console.log(`P2 SMOKE RESULT: ${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
