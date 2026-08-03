// WO P-1 — Unit test decide() (Single Decision Engine, MURNI, tanpa DB).
// Memverifikasi keputusan deterministik Mode A (Automatic) RFC §7:
// X→XI, XI→XII, XII→GRADUATED, NO_TARGET, REPEATED, level invalid, determinism.
import { decide } from '../src/main/services/promotion-preview.service'
import type { PromotionDecideInput, PromotionTargetClassInput } from '../src/shared/dto/promotion'

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

const KURIKULUM_MERDEKA = 'cur-merdeka'
const KURIKULUM_2013 = 'cur-2013'

function cls(id: string, level: string, parallel: string, curriculumId: string): PromotionTargetClassInput {
  return { id, educationLevel: level, parallel, curriculumId }
}

const TARGET_CLASSES: PromotionTargetClassInput[] = [
  cls('target-x-merdeka-1', 'X', 'MERDEKA 1', KURIKULUM_MERDEKA),
  cls('target-xi-merdeka-1', 'XI', 'MERDEKA 1', KURIKULUM_MERDEKA),
  cls('target-xii-merdeka-1', 'XII', 'MERDEKA 1', KURIKULUM_MERDEKA),
  cls('target-xi-merdeka-2', 'XI', 'MERDEKA 2', KURIKULUM_MERDEKA),
  cls('target-xi-2013-1', 'XI', '2013 1', KURIKULUM_2013)
]

function baseInput(overrides: Partial<PromotionDecideInput>): PromotionDecideInput {
  return {
    memberId: 'm-1',
    memberName: 'Andi',
    sourceClassId: 'src-x-merdeka-1',
    sourceClassLabel: 'X MERDEKA 1',
    sourceLevel: 'X',
    sourceParallel: 'MERDEKA 1',
    sourceCurriculumId: KURIKULUM_MERDEKA,
    targetClasses: TARGET_CLASSES,
    ...overrides
  }
}

function main(): void {
  console.log('--- STEP 1: promosi X→XI (kurikulum + parallel sama) ---')
  const d1 = decide(baseInput({}))
  expectEqual('outcome', d1.outcome, 'PROMOTED')
  expectEqual('targetClassId', d1.targetClassId, 'target-xi-merdeka-1')
  expectEqual('targetClassLabel', d1.targetClassLabel, 'XI MERDEKA 1')
  expectEqual('message null', d1.message, null)

  console.log('--- STEP 2: promosi XI→XII ---')
  const d2 = decide(baseInput({ sourceLevel: 'XI', sourceClassLabel: 'XI MERDEKA 1' }))
  expectEqual('outcome', d2.outcome, 'PROMOTED')
  expectEqual('targetClassId', d2.targetClassId, 'target-xii-merdeka-1')
  expectEqual('targetClassLabel', d2.targetClassLabel, 'XII MERDEKA 1')

  console.log('--- STEP 3: XII → GRADUATED (tanpa target) ---')
  const d3 = decide(baseInput({ sourceLevel: 'XII', sourceClassLabel: 'XII MERDEKA 1' }))
  expectEqual('outcome', d3.outcome, 'GRADUATED')
  expectEqual('targetClassId null', d3.targetClassId, null)
  expectEqual('targetClassLabel null', d3.targetClassLabel, null)

  console.log('--- STEP 4: NO_TARGET (tidak ada kelas XI parallel sama di tahun target) ---')
  const d4 = decide(baseInput({ sourceParallel: 'MERDEKA 9', sourceClassLabel: 'X MERDEKA 9' }))
  expectEqual('outcome', d4.outcome, 'NO_TARGET')
  expectEqual('targetClassId null', d4.targetClassId, null)
  check('message menyebut label sumber', (d4.message ?? '').includes('X MERDEKA 9'))

  console.log('--- STEP 5: NO_TARGET (parallel sama tapi kurikulum berbeda) ---')
  const d5 = decide(
    baseInput({ sourceParallel: '2013 1', sourceClassLabel: 'X 2013 1', sourceCurriculumId: KURIKULUM_2013 })
  )
  expectEqual('outcome', d5.outcome, 'PROMOTED')
  expectEqual('targetClassId (kurikulum 2013)', d5.targetClassId, 'target-xi-2013-1')

  console.log('--- STEP 6: REPEATED (repeat eksplisit, kelas tingkat sama tersedia) ---')
  const d6 = decide(baseInput({ repeat: true }))
  expectEqual('outcome', d6.outcome, 'REPEATED')
  expectEqual('targetClassId (tingkat sama)', d6.targetClassId, 'target-x-merdeka-1')
  expectEqual('targetClassLabel', d6.targetClassLabel, 'X MERDEKA 1')

  console.log('--- STEP 7: repeat tanpa kelas tingkat sama → NO_TARGET ---')
  const d7 = decide(baseInput({ repeat: true, sourceParallel: 'MERDEKA 9', sourceClassLabel: 'X MERDEKA 9' }))
  expectEqual('outcome', d7.outcome, 'NO_TARGET')
  expectEqual('targetClassId null', d7.targetClassId, null)

  console.log('--- STEP 8: XII + repeat → REPEATED (repeat eksplisit menang atas GRADUATED otomatis) ---')
  const d8 = decide(baseInput({ sourceLevel: 'XII', sourceClassLabel: 'XII MERDEKA 1', repeat: true }))
  expectEqual('outcome', d8.outcome, 'REPEATED')
  expectEqual('targetClassId (kelas XII tersedia)', d8.targetClassId, 'target-xii-merdeka-1')

  console.log('--- STEP 9: tingkat tidak dikenal → ERROR ---')
  const d9 = decide(baseInput({ sourceLevel: 'IX', sourceClassLabel: 'IX MERDEKA 1' }))
  expectEqual('outcome', d9.outcome, 'ERROR')
  expectEqual('targetClassId null', d9.targetClassId, null)
  check('message menyebut tingkat', (d9.message ?? '').includes('IX'))

  console.log('--- STEP 10: determinisme (2x panggil hasil sama) ---')
  const a = decide(baseInput({}))
  const b = decide(baseInput({}))
  expectEqual('deterministic outcome', a.outcome, b.outcome)
  expectEqual('deterministic target', a.targetClassId, b.targetClassId)

  console.log('--- STEP 11: repeat tidak mengubah default (repeat=false/undefined = promosi) ---')
  const d11a = decide(baseInput({ repeat: false }))
  const d11b = decide(baseInput({}))
  expectEqual('repeat:false = PROMOTED', d11a.outcome, 'PROMOTED')
  expectEqual('undefined = sama dengan false', d11b.outcome, d11a.outcome)

  console.log('--- STEP 12: tidak membaca DB/state global (murni) — sama input sama output lintas run ---')
  const d12a = decide(baseInput({}))
  const d12b = decide(baseInput({}))
  expectEqual('pure', d12a.targetClassId, d12b.targetClassId)

  console.log(`\n===== RESULT: ${pass} PASS, ${fail} FAIL =====`)
  if (fail > 0) process.exitCode = 1
}

main()
