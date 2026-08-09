// WO P-4 — Smoke PROMOTION OPERATOR UI (fresh DB).
// Membuktikan kontrak yang dipakai halaman operator (renderer) — renderer hanya
// menampilkan hasil service; smoke ini membuktikan alur yang sama dijalankan
// backend dengan payload PERSIS yang dikirim UI (PromotionPage):
//   1) pilih tahun sumber/tujuan (opsional kelas sumber) → Preview
//      (`promotions:preview` → PromotionPreviewService.preview → decide());
//   2) lihat hasil Preview (counts + items);
//   3) Execute (`promotions:execute` → PromotionExecuteService.executeAutomatic)
//      — Preview == Execute (engine keputusan tunggal decide());
//   4) otomatis menuju Detail Promotion Run (promotions:findById + findMany).
// Guard (tahun sama / tidak ada / kelas bukan milik tahun sumber) → AppError
// (UI menampilkan err.message). TIDAK ada business rule di renderer — seluruh
// keputusan tetap dari decide() via service (dibuktikan preview==execute).
import { PromotionExecuteService } from '../src/main/services/promotion-execute.service'
import { PromotionRunService } from '../src/main/services/promotion-run.service'
import { PromotionPreviewService } from '../src/main/services/promotion-preview.service'
import { AcademicYearRepository } from '../src/main/repositories/academic-year.repository'
import { ClassRepository } from '../src/main/repositories/class.repository'
import { EnrollmentRepository } from '../src/main/repositories/enrollment.repository'
import { PromotionRepository } from '../src/main/repositories/promotion.repository'
import { getPrisma } from '../src/main/repositories/base/prisma'
import { ACADEMIC_STATUS } from '../src/shared/config/academic-status'
import { AppError } from '../electron/main/errorHandler'

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

async function expectRejected(name: string, fn: () => Promise<unknown>, messagePart: string): Promise<void> {
  try {
    await fn()
    check(name, false, 'seharusnya ditolak, tetapi berhasil')
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    check(name, msg.includes(messagePart), `message="${msg}"`)
  }
}

async function main(): Promise<void> {
  const prisma = getPrisma()
  const enrollmentRepo = new EnrollmentRepository()
  const classRepo = new ClassRepository()
  const academicYearRepo = new AcademicYearRepository()
  const promotionRepo = new PromotionRepository()
  const runService = new PromotionRunService(promotionRepo)
  const previewService = new PromotionPreviewService(academicYearRepo, classRepo, enrollmentRepo)
  const executeService = new PromotionExecuteService(academicYearRepo, classRepo, enrollmentRepo, promotionRepo, runService)

  console.log('--- STEP 0: seed master data (mirror halaman operator) ---')
  const curriculum = await prisma.curriculum.create({ data: { name: 'MERDEKA' } })
  const yearFrom = await prisma.academicYear.create({
    data: { name: '2025/2026', startDate: new Date('2025-07-01'), endDate: new Date('2026-06-30'), isActive: true }
  })
  const yearTo = await prisma.academicYear.create({
    data: { name: '2026/2027', startDate: new Date('2026-07-01'), endDate: new Date('2027-06-30'), isActive: false }
  })

  const srcX = await prisma.class.create({ data: { academicYearId: yearFrom.id, curriculumId: curriculum.id, educationLevel: 'X', parallel: 'MERDEKA 1', isActive: true } })
  const srcXI = await prisma.class.create({ data: { academicYearId: yearFrom.id, curriculumId: curriculum.id, educationLevel: 'XI', parallel: 'MERDEKA 1', isActive: true } })
  const srcXII = await prisma.class.create({ data: { academicYearId: yearFrom.id, curriculumId: curriculum.id, educationLevel: 'XII', parallel: 'MERDEKA 1', isActive: true } })
  const srcX9 = await prisma.class.create({ data: { academicYearId: yearFrom.id, curriculumId: curriculum.id, educationLevel: 'X', parallel: 'MERDEKA 9', isActive: true } })

  const tgtXI = await prisma.class.create({ data: { academicYearId: yearTo.id, curriculumId: curriculum.id, educationLevel: 'XI', parallel: 'MERDEKA 1', isActive: true } })
  const tgtXII = await prisma.class.create({ data: { academicYearId: yearTo.id, curriculumId: curriculum.id, educationLevel: 'XII', parallel: 'MERDEKA 1', isActive: true } })

  const sX = await prisma.member.create({ data: { memberNumber: 'S-000001', fullName: 'Andi Kelas X', memberType: 'student', status: 'ACTIVE' } })
  const sXI = await prisma.member.create({ data: { memberNumber: 'S-000002', fullName: 'Budi Kelas XI', memberType: 'student', status: 'ACTIVE' } })
  const sXIIa = await prisma.member.create({ data: { memberNumber: 'S-000003', fullName: 'Citra Kelas XII', memberType: 'student', status: 'ACTIVE' } })
  const sNoTarget = await prisma.member.create({ data: { memberNumber: 'S-000004', fullName: 'Dedi Tanpa Target', memberType: 'student', status: 'ACTIVE' } })

  await prisma.memberEnrollment.create({ data: { memberId: sX.id, classId: srcX.id, academicYearId: yearFrom.id, status: ACADEMIC_STATUS.active } })
  await prisma.memberEnrollment.create({ data: { memberId: sXI.id, classId: srcXI.id, academicYearId: yearFrom.id, status: ACADEMIC_STATUS.active } })
  await prisma.memberEnrollment.create({ data: { memberId: sXIIa.id, classId: srcXII.id, academicYearId: yearFrom.id, status: ACADEMIC_STATUS.active } })
  await prisma.memberEnrollment.create({ data: { memberId: sNoTarget.id, classId: srcX9.id, academicYearId: yearFrom.id, status: ACADEMIC_STATUS.active } })

  console.log('--- STEP 1: Preview SEMUA kelas tahun sumber (payload tanpa fromClassId) ---')
  const previewAll = await previewService.preview({ mode: 'AUTOMATIC', fromYearId: yearFrom.id, toYearId: yearTo.id })
  expectEqual('preview.mode', previewAll.mode, 'AUTOMATIC')
  expectEqual('preview.fromClassId null (semua kelas)', previewAll.fromClassId, null)
  expectEqual('preview.items 4', previewAll.items.length, 4)
  expectEqual('preview.counts.promoted 2', previewAll.counts.promoted, 2)
  expectEqual('preview.counts.graduated 1', previewAll.counts.graduated, 1)
  expectEqual('preview.counts.noTarget 1', previewAll.counts.noTarget, 1)
  expectEqual('preview.counts.error 0', previewAll.counts.error, 0)
  const itemSX = previewAll.items.find((i) => i.memberId === sX.id)
  check('preview item sX PROMOTED → tgtXI', itemSX?.outcome === 'PROMOTED' && itemSX?.targetClassId === tgtXI.id)

  console.log('--- STEP 2: Preview SATU kelas sumber (payload dengan fromClassId) ---')
  const previewX = await previewService.preview({ mode: 'AUTOMATIC', fromYearId: yearFrom.id, toYearId: yearTo.id, fromClassId: srcX.id })
  expectEqual('previewX.items 1 (hanya kelas X)', previewX.items.length, 1)
  expectEqual('previewX.counts.promoted 1', previewX.counts.promoted, 1)
  expectEqual('previewX.item sourceLabel', previewX.items[0]?.sourceLabel, 'X MERDEKA 1')

  console.log('--- STEP 3: Execute (payload PERSIS preview) — Preview == Execute ---')
  const run = await executeService.executeAutomatic({ mode: 'AUTOMATIC', fromYearId: yearFrom.id, toYearId: yearTo.id })
  expectEqual('run.status SUCCESS', run.status, 'SUCCESS')
  expectEqual('run.items 4 == preview', run.items.length, previewAll.items.length)
  for (const p of previewAll.items) {
    const r = run.items.find((i) => i.memberId === p.memberId)
    check(`item ${p.memberId} outcome == preview`, r?.outcome === p.outcome, `preview=${p.outcome} run=${r?.outcome}`)
    check(`item ${p.memberId} target == preview`, r?.targetClassId === p.targetClassId)
  }
  check('run.summary == preview.counts', JSON.stringify(run.summary) === JSON.stringify(previewAll.counts))

  console.log('--- STEP 4: Detail Promotion Run (redirect target halaman operator) ---')
  const detail = await runService.findById(run.id)
  expectEqual('detail.id == run.id', detail.id, run.id)
  expectEqual('detail.items.length', detail.items.length, run.items.length)
  expectEqual('detail.counts.promoted', detail.counts.promoted, 2)
  expectEqual('detail.counts.graduated', detail.counts.graduated, 1)
  expectEqual('detail.counts.noTarget', detail.counts.noTarget, 1)
  const list = await runService.findMany()
  check('run muncul di riwayat (halaman detail dapat diakses)', list.data.some((r) => r.id === run.id))
  check('detail item sX memberName (label relasi)', detail.items.find((i) => i.memberId === sX.id)?.memberName === 'Andi Kelas X')

  console.log('--- STEP 5: guard — error ditampilkan UI sebagai err.message ---')
  await expectRejected('tahun sumber & target sama → 400', () => previewService.preview({ mode: 'AUTOMATIC', fromYearId: yearFrom.id, toYearId: yearFrom.id }), 'tidak boleh sama')
  await expectRejected('tahun sumber tidak ada → 404', () => executeService.executeAutomatic({ mode: 'AUTOMATIC', fromYearId: 'year-nope', toYearId: yearTo.id }), 'tidak ditemukan')
  await expectRejected('kelas bukan milik tahun sumber → 400', () => previewService.preview({ mode: 'AUTOMATIC', fromYearId: yearFrom.id, toYearId: yearTo.id, fromClassId: tgtXI.id }), 'bukan milik tahun ajaran sumber')
  const err = await executeService.executeAutomatic({ mode: 'AUTOMATIC', fromYearId: 'year-nope', toYearId: yearTo.id }).then(() => null, (e) => e)
  check('guard berupa AppError (statusCode ada utk UI)', err instanceof AppError, `type=${err instanceof AppError ? err.type : 'n/a'}`)

  console.log('--- STEP 6: execute ulang — state-based (hanya ACTIVE tersisa) ---')
  const run2 = await executeService.executeAutomatic({ mode: 'AUTOMATIC', fromYearId: yearFrom.id, toYearId: yearTo.id })
  // Masih ACTIVE di tahun sumber: sNoTarget (NO_TARGET, tanpa mutasi) = 1.
  expectEqual('run2 items 1 (sNoTarget)', run2.items.length, 1)
  expectEqual('run2 outcome NO_TARGET', run2.items[0]?.outcome, 'NO_TARGET')
  expectEqual('run2 status SUCCESS', run2.status, 'SUCCESS')
  const detail2 = await runService.findById(run2.id)
  expectEqual('detail2.items.length 1', detail2.items.length, 1)

  console.log(`\n===== RESULT: ${pass} PASS, ${fail} FAIL =====`)
  if (fail > 0) process.exitCode = 1
}

main()
