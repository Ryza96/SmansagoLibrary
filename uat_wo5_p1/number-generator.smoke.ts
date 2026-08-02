import { getPrisma } from '../src/main/repositories/base/prisma'
import { MemberRepository } from '../src/main/repositories/member.repository'
import { NumberGeneratorService, resolveMemberNumberPrefix, parseMemberNumberSuffix, formatMemberNumber, maxSuffixFrom } from '../src/main/services/number-generator.service'
import { runTransaction } from '../src/main/repositories/base/transaction'

let pass = 0
let fail = 0

function check(name: string, ok: boolean, detail?: string): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`)
  if (ok) pass += 1
  else fail += 1
}

function deepEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  return a.every((v, i) => v === b[i])
}

async function main(): Promise<void> {
  const prisma = getPrisma()
  const repo = new MemberRepository()
  const svc = new NumberGeneratorService(repo)

  // ================= UNIT — prefix =================
  check('unit prefix: student -> S', resolveMemberNumberPrefix('student') === 'S', resolveMemberNumberPrefix('student'))
  check('unit prefix: teacher -> G', resolveMemberNumberPrefix('teacher') === 'G', resolveMemberNumberPrefix('teacher'))
  check('unit prefix: general -> U', resolveMemberNumberPrefix('general') === 'U', resolveMemberNumberPrefix('general'))
  check('unit prefix: undefined -> S (default)', resolveMemberNumberPrefix(undefined) === 'S')
  check('unit prefix: unknown type -> S (default)', resolveMemberNumberPrefix('STAFF') === 'S', resolveMemberNumberPrefix('STAFF'))

  // ================= UNIT — padding =================
  check('unit padding: seq 1 -> 000001', formatMemberNumber('S', 1) === 'S-000001', formatMemberNumber('S', 1))
  check('unit padding: seq 12 -> 000012', formatMemberNumber('G', 12) === 'G-000012', formatMemberNumber('G', 12))
  check('unit padding: seq > 999999 tidak terpotong', formatMemberNumber('U', 1000007) === 'U-1000007', formatMemberNumber('U', 1000007))

  // ================= UNIT — suffix =================
  check('unit suffix: S-000042 -> 42', parseMemberNumberSuffix('S-000042', 'S') === 42)
  check('unit suffix: prefix salah -> -1', parseMemberNumberSuffix('G-000042', 'S') === -1)
  check('unit suffix: non numerik -> -1', parseMemberNumberSuffix('S-abc', 'S') === -1)
  check('unit suffix: no prefix -> -1', parseMemberNumberSuffix('BUKAN-NOMOR', 'S') === -1)

  // ================= UNIT — allocation (max suffix) =================
  const samples = ['S-000003', 'S-000001', 'S-000042', 'S-abc', 'G-000099', 'S-000042'] as const
  check('unit maxSuffix: max numerik dengan prefix, abaikan invalid/prefix lain', maxSuffixFrom(samples, 'S') === 42, `max=${maxSuffixFrom(samples, 'S')}`)
  check('unit maxSuffix: list kosong -> 0', maxSuffixFrom([], 'S') === 0)

  // ================= DB — create student =================
  const s1 = await svc.generateMemberNumber('student')
  check('db create student: nomor pertama S-000001', s1 === 'S-000001', s1)
  await repo.create({ memberNumber: s1, fullName: 'Student One', memberType: 'student' })

  // ================= DB — create teacher =================
  const g1 = await svc.generateMemberNumber('teacher')
  check('db create teacher: prefix G-', g1 === 'G-000001', g1)
  await repo.create({ memberNumber: g1, fullName: 'Teacher One', memberType: 'teacher' })

  // ================= DB — create general =================
  const u1 = await svc.generateMemberNumber('general')
  check('db create general: prefix U-', u1 === 'U-000001', u1)
  await repo.create({ memberNumber: u1, fullName: 'General One', memberType: 'general' })

  // ================= DB — create student ke-2 =================
  const s2 = await svc.generateMemberNumber('student')
  check('db create student: lanjut ke S-000002 (max suffix)', s2 === 'S-000002', s2)
  await repo.create({ memberNumber: s2, fullName: 'Student Two', memberType: 'student' })

  // ================= DB — allocate 1 =================
  const a1 = await runTransaction(prisma, async (tx) => {
    const numbers = await svc.allocateMemberNumbers(tx, 1, 'student')
    await tx.member.createMany({ data: numbers.map((n, i) => ({ memberNumber: n, fullName: `Alloc1-${i}` })) })
    return numbers
  })
  check('db allocate 1: tepat satu nomor', a1.length === 1, `len=${a1.length}`)
  check('db allocate 1: S-000003', deepEqual(a1, ['S-000003']), a1.join(','))

  // ================= DB — allocate 10 =================
  const a10 = await runTransaction(prisma, async (tx) => {
    const numbers = await svc.allocateMemberNumbers(tx, 10, 'student')
    await tx.member.createMany({ data: numbers.map((n, i) => ({ memberNumber: n, fullName: `Alloc10-${i}` })) })
    return numbers
  })
  const expected10 = Array.from({ length: 10 }, (_, i) => `S-${String(4 + i).padStart(6, '0')}`)
  check('db allocate 10: berurutan S-000004..S-000013', deepEqual(a10, expected10), a10.join(','))

  // ================= DB — allocate 100 =================
  const a100 = await runTransaction(prisma, async (tx) => {
    const numbers = await svc.allocateMemberNumbers(tx, 100, 'student')
    await tx.member.createMany({ data: numbers.map((n, i) => ({ memberNumber: n, fullName: `Alloc100-${i}` })) })
    return numbers
  })
  check('db allocate 100: 100 nomor', a100.length === 100, `len=${a100.length}`)
  check('db allocate 100: pertama S-000014', a100[0] === 'S-000014', a100[0])
  check('db allocate 100: terakhir S-000113', a100[99] === 'S-000113', a100[99])
  check('db allocate 100: semua unik', new Set(a100).size === 100)

  // ================= DB — rollback scenario (keputusan PO #12) =================
  let allocatedInRollback: string[] = []
  try {
    await runTransaction(prisma, async (tx) => {
      allocatedInRollback = await svc.allocateMemberNumbers(tx, 100, 'student')
      throw new Error('FORCED_ROLLBACK_P1')
    })
    check('db rollback: transaksi seharusnya gagal', false, 'tidak throw')
  } catch {
    check('db rollback: transaksi melempar error (rollback terjadi)', true)
  }
  check('db rollback: alokasi di dalam tx berjalan (S-000114..S-000213)', allocatedInRollback.length === 100 && allocatedInRollback[0] === 'S-000114' && allocatedInRollback[99] === 'S-000213', `${allocatedInRollback[0]}..${allocatedInRollback[99]}`)
  const studentRowsAfterRollback = await prisma.member.count({ where: { memberNumber: { startsWith: 'S-' } } })
  check('db rollback: tidak ada baris tersimpan dari tx gagal', studentRowsAfterRollback === 113, `studentRows=${studentRowsAfterRollback}`)

  const reallocated = await runTransaction(prisma, async (tx) => {
    return svc.allocateMemberNumbers(tx, 100, 'student')
  })
  const expectedReallocated = Array.from({ length: 100 }, (_, i) => `S-${String(114 + i).padStart(6, '0')}`)
  check('db rollback: alokasi ulang mulai dari S-000114 (nomor batal TIDAK terpakai)', deepEqual(reallocated, expectedReallocated), `${reallocated[0]}..${reallocated[99]}`)

  // ================= DB — delete tengah + max suffix (bukan count()+1) =================
  const mid = await repo.findByMemberNumber('S-000013')
  check('db delete: S-000013 ada', Boolean(mid))
  if (mid) {
    await repo.delete(mid.id)
  }
  const afterDelete = await svc.generateMemberNumber('student')
  check('db delete: nomor berikutnya S-000114 (max suffix, BUKAN count+1 yang tabrakan)', afterDelete === 'S-000114', afterDelete)
  const existing = await repo.findByMemberNumber(afterDelete)
  check('db delete: nomor tidak bertabrakan dengan yang tersimpan', existing === null)
  await repo.create({ memberNumber: afterDelete, fullName: 'After Delete', memberType: 'student' })

  // ================= DB — independensi prefix =================
  const g2 = await svc.generateMemberNumber('teacher')
  check('db prefix: teacher lanjut G-000002 (independen dari S/U)', g2 === 'G-000002', g2)
  const u2 = await svc.generateMemberNumber('general')
  check('db prefix: general lanjut U-000002 (independen dari S/G)', u2 === 'U-000002', u2)

  console.log('FINAL_DB ' + JSON.stringify(await prisma.member.findMany({ orderBy: { memberNumber: 'asc' } })))

  await prisma.$disconnect()

  console.log(`P1 SMOKE RESULT: ${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
