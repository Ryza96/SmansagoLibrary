// WO P-2 — Smoke PROMOTION EXECUTE (fresh DB).
// Membuktikan (keputusan PO P-2):
//   A. Preview == Execute (counts & items identik) — engine keputusan tunggal decide() P-1;
//   B. hanya enrollment ACTIVE yang diproses (re-validate RFC §7.1/§8) — enrollment
//      terminal (DROPPED) tidak pernah masuk items;
//   C. mutasi benar: PROMOTED/REPEATED tutup+buka, GRADUATED tutup+INACTIVE,
//      NO_TARGET tanpa mutasi; Member.status sinkron (RFC §4.3);
//   D. invarian satu-ACTIVE per member;
//   E. rollback all-or-nothing: kegagalan di tengah transaksi membatalkan SEMUA tulis;
//   F. PromotionRun + PromotionRunItem konsisten (audit RFC §2.2/§9);
//   G. state-based eligibility (RFC §9): run ulang hanya memproses yang masih ACTIVE.
import { PromotionExecuteService } from '../src/main/services/promotion-execute.service'
import { PromotionRunService } from '../src/main/services/promotion-run.service'
import { PromotionPreviewService } from '../src/main/services/promotion-preview.service'
import { AcademicYearRepository } from '../src/main/repositories/academic-year.repository'
import { ClassRepository } from '../src/main/repositories/class.repository'
import { EnrollmentRepository } from '../src/main/repositories/enrollment.repository'
import { MemberRepository } from '../src/main/repositories/member.repository'
import { PromotionRepository } from '../src/main/repositories/promotion.repository'
import { getPrisma } from '../src/main/repositories/base/prisma'
import { ACADEMIC_STATUS } from '../src/shared/config/academic-status'

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
  const memberRepo = new MemberRepository()
  const academicYearRepo = new AcademicYearRepository()
  const promotionRepo = new PromotionRepository()
  const runService = new PromotionRunService(promotionRepo)
  const executeService = new PromotionExecuteService(academicYearRepo, classRepo, enrollmentRepo, memberRepo, promotionRepo, runService)
  const previewService = new PromotionPreviewService(academicYearRepo, classRepo, enrollmentRepo)

  console.log('--- STEP 0: seed master data (fresh DB) ---')
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
  const sXIIb = await prisma.member.create({ data: { memberNumber: 'S-000004', fullName: 'Dedi Kelas XII', memberType: 'student', status: 'ACTIVE' } })
  const sNoTarget = await prisma.member.create({ data: { memberNumber: 'S-000005', fullName: 'Eka Tanpa Target', memberType: 'student', status: 'ACTIVE' } })
  const sClosed = await prisma.member.create({ data: { memberNumber: 'S-000006', fullName: 'Fajar Sudah Keluar', memberType: 'student', status: 'INACTIVE' } })

  await prisma.memberEnrollment.create({ data: { memberId: sX.id, classId: srcX.id, academicYearId: yearFrom.id, status: ACADEMIC_STATUS.active } })
  await prisma.memberEnrollment.create({ data: { memberId: sXI.id, classId: srcXI.id, academicYearId: yearFrom.id, status: ACADEMIC_STATUS.active } })
  await prisma.memberEnrollment.create({ data: { memberId: sXIIa.id, classId: srcXII.id, academicYearId: yearFrom.id, status: ACADEMIC_STATUS.active } })
  await prisma.memberEnrollment.create({ data: { memberId: sXIIb.id, classId: srcXII.id, academicYearId: yearFrom.id, status: ACADEMIC_STATUS.active } })
  await prisma.memberEnrollment.create({ data: { memberId: sNoTarget.id, classId: srcX9.id, academicYearId: yearFrom.id, status: ACADEMIC_STATUS.active } })
  // Enrollment TERMINAL (DROPPED) — tidak boleh diproses (state-based eligibility).
  await prisma.memberEnrollment.create({
    data: { memberId: sClosed.id, classId: srcX.id, academicYearId: yearFrom.id, status: ACADEMIC_STATUS.dropped, leftAt: new Date('2025-09-01') }
  })

  expectEqual('seed enrollment total 6', await prisma.memberEnrollment.count(), 6)
  expectEqual('seed enrollment ACTIVE 5', await prisma.memberEnrollment.count({ where: { status: ACADEMIC_STATUS.active, leftAt: null } }), 5)

  console.log('--- STEP 1: Preview (Mode A) sebagai baseline ---')
  const preview = await previewService.preview({ mode: 'AUTOMATIC', fromYearId: yearFrom.id, toYearId: yearTo.id })
  expectEqual('preview counts.promoted', preview.counts.promoted, 2)
  expectEqual('preview counts.graduated', preview.counts.graduated, 2)
  expectEqual('preview counts.noTarget', preview.counts.noTarget, 1)
  expectEqual('preview counts.error', preview.counts.error, 0)
  expectEqual('preview items.length 5 (sClosed TIDAK masuk)', preview.items.length, 5)
  check('preview tidak memuat sClosed', !preview.items.some((i) => i.memberId === sClosed.id))

  console.log('--- STEP 2: Execute (Mode A) — Preview == Execute ---')
  const run = await executeService.executeAutomatic({ mode: 'AUTOMATIC', fromYearId: yearFrom.id, toYearId: yearTo.id, runBy: 'smoke-p2' })
  expectEqual('run.mode', run.mode, 'AUTOMATIC')
  expectEqual('run.status', run.status, 'SUCCESS')
  expectEqual('run.runBy', run.runBy, 'smoke-p2')
  expectEqual('run.finishedAt terisi', run.finishedAt !== null, true)
  expectEqual('run.items.length == preview.items.length', run.items.length, preview.items.length)
  for (const p of preview.items) {
    const r = run.items.find((i) => i.memberId === p.memberId)
    check(`item ${p.memberId} outcome == preview`, r?.outcome === p.outcome, `preview=${p.outcome} run=${r?.outcome}`)
    check(`item ${p.memberId} targetClassId == preview`, r?.targetClassId === p.targetClassId, `preview=${p.targetClassId} run=${r?.targetClassId}`)
  }
  check('run.summary == preview counts', JSON.stringify(run.summary) === JSON.stringify(preview.counts), JSON.stringify(run.summary))
  check('run tidak memuat sClosed', !run.items.some((i) => i.memberId === sClosed.id))

  console.log('--- STEP 3: mutasi enrollment ---')
  const enrOf = async (memberId: string, status: string) => prisma.memberEnrollment.findMany({ where: { memberId, status } })

  const sXHistory = await enrOf(sX.id, ACADEMIC_STATUS.promoted)
  expectEqual('sX sumber ditutup PROMOTED (1)', sXHistory.length, 1)
  check('sX leftAt terisi', sXHistory[0]?.leftAt !== null)
  const sXActive = await prisma.memberEnrollment.findMany({ where: { memberId: sX.id, status: ACADEMIC_STATUS.active, leftAt: null } })
  expectEqual('sX buka ACTIVE baru (1)', sXActive.length, 1)
  expectEqual('sX kelas baru = tgtXI', sXActive[0]?.classId, tgtXI.id)
  expectEqual('sX tahun baru = yearTo', sXActive[0]?.academicYearId, yearTo.id)

  const sXIActive = await prisma.memberEnrollment.findMany({ where: { memberId: sXI.id, status: ACADEMIC_STATUS.active, leftAt: null } })
  expectEqual('sXI kelas baru = tgtXII', sXIActive[0]?.classId, tgtXII.id)

  const sXIIaHistory = await enrOf(sXIIa.id, ACADEMIC_STATUS.graduated)
  expectEqual('sXIIa ditutup GRADUATED (1)', sXIIaHistory.length, 1)
  expectEqual('sXIIa tidak buka enrollment baru', await prisma.memberEnrollment.count({ where: { memberId: sXIIa.id, status: ACADEMIC_STATUS.active } }), 0)
  const sXIIbHistory = await enrOf(sXIIb.id, ACADEMIC_STATUS.graduated)
  expectEqual('sXIIb ditutup GRADUATED (1)', sXIIbHistory.length, 1)

  const sNoTargetEnr = await prisma.memberEnrollment.findMany({ where: { memberId: sNoTarget.id } })
  expectEqual('sNoTarget tetap 1 enrollment', sNoTargetEnr.length, 1)
  expectEqual('sNoTarget tetap ACTIVE', sNoTargetEnr[0]?.status, ACADEMIC_STATUS.active)
  expectEqual('sNoTarget leftAt kosong', sNoTargetEnr[0]?.leftAt ?? null, null)
  expectEqual('sNoTarget tidak buka enrollment baru', await prisma.memberEnrollment.count({ where: { memberId: sNoTarget.id, status: ACADEMIC_STATUS.active } }), 1)

  const sClosedEnr = await prisma.memberEnrollment.findMany({ where: { memberId: sClosed.id } })
  expectEqual('sClosed tidak disentuh (tetap DROPPED)', sClosedEnr[0]?.status, ACADEMIC_STATUS.dropped)
  // 6 seed (tidak dihapus — ditutup via update) + 2 ACTIVE baru (sX, sXI) = 8.
  expectEqual('total enrollment setelah run = 8', await prisma.memberEnrollment.count(), 8)

  console.log('--- STEP 4: sinkronisasi Member.status (RFC §4.3) ---')
  expectEqual('sX status ACTIVE', (await prisma.member.findUnique({ where: { id: sX.id } }))?.status, 'ACTIVE')
  expectEqual('sXI status ACTIVE', (await prisma.member.findUnique({ where: { id: sXI.id } }))?.status, 'ACTIVE')
  expectEqual('sXIIa status INACTIVE', (await prisma.member.findUnique({ where: { id: sXIIa.id } }))?.status, 'INACTIVE')
  expectEqual('sXIIb status INACTIVE', (await prisma.member.findUnique({ where: { id: sXIIb.id } }))?.status, 'INACTIVE')
  expectEqual('sNoTarget status ACTIVE', (await prisma.member.findUnique({ where: { id: sNoTarget.id } }))?.status, 'ACTIVE')
  expectEqual('sClosed status INACTIVE', (await prisma.member.findUnique({ where: { id: sClosed.id } }))?.status, 'INACTIVE')

  console.log('--- STEP 5: invarian satu-ACTIVE per member ---')
  for (const [name, id] of [['sX', sX.id], ['sXI', sXI.id], ['sNoTarget', sNoTarget.id]] as const) {
    expectEqual(`${name} ACTIVE count == 1`, await enrollmentRepo.countActiveByMember(id), 1)
  }
  for (const [name, id] of [['sXIIa', sXIIa.id], ['sXIIb', sXIIb.id]] as const) {
    expectEqual(`${name} ACTIVE count == 0`, await enrollmentRepo.countActiveByMember(id), 0)
  }

  console.log('--- STEP 6: konsistensi PromotionRun + PromotionRunItem (audit) ---')
  const runById = await runService.findById(run.id)
  expectEqual('runService.findById id sama', runById.id, run.id)
  expectEqual('runService items.length', runById.items.length, run.items.length)
  for (const item of runById.items) {
    expectEqual(`item ${item.memberId} promotionRunId konsisten`, item.promotionRunId, run.id)
    expectEqual(`item ${item.memberId} outcome valid`, ['PROMOTED', 'REPEATED', 'REDISTRIBUTED', 'GRADUATED', 'NO_TARGET', 'ERROR'].includes(item.outcome), true)
    if (item.outcome === 'NO_TARGET') {
      check(`item ${item.memberId} message terisi`, item.message !== null)
    }
  }
  const list = await runService.findMany()
  expectEqual('runService.findMany total 1', list.total, 1)
  expectEqual('runService.findMany itemCount 5', list.data[0]?.itemCount, 5)

  console.log('--- STEP 7: rollback all-or-nothing ---')
  const sX3 = await prisma.member.create({ data: { memberNumber: 'S-000007', fullName: 'Gita Tambahan', memberType: 'student', status: 'ACTIVE' } })
  await prisma.memberEnrollment.create({ data: { memberId: sX3.id, classId: srcX.id, academicYearId: yearFrom.id, status: ACADEMIC_STATUS.active } })

  const beforeRollback = {
    enrollment: await prisma.memberEnrollment.count(),
    run: await prisma.promotionRun.count(),
    item: await prisma.promotionRunItem.count(),
    sX3Active: await prisma.memberEnrollment.count({ where: { memberId: sX3.id, status: ACADEMIC_STATUS.active } })
  }
  const originalCreateRun = PromotionRepository.prototype.createRunWithTx
  PromotionRepository.prototype.createRunWithTx = async () => {
    throw new Error('injected failure (rollback test)')
  }
  try {
    await executeService.executeAutomatic({ mode: 'AUTOMATIC', fromYearId: yearFrom.id, toYearId: yearTo.id })
    check('rollback: execute seharusnya gagal', false)
  } catch (e) {
    check('rollback: execute gagal (injected)', e instanceof Error && (e as Error).message.includes('injected failure'))
  } finally {
    PromotionRepository.prototype.createRunWithTx = originalCreateRun
  }
  expectEqual('rollback: enrollment total tidak berubah', await prisma.memberEnrollment.count(), beforeRollback.enrollment)
  expectEqual('rollback: run tidak dibuat', await prisma.promotionRun.count(), beforeRollback.run)
  expectEqual('rollback: item tidak dibuat', await prisma.promotionRunItem.count(), beforeRollback.item)
  expectEqual('rollback: sX3 tetap ACTIVE (close rolled back)', await prisma.memberEnrollment.count({ where: { memberId: sX3.id, status: ACADEMIC_STATUS.active } }), beforeRollback.sX3Active)
  const sX3Enr = await prisma.memberEnrollment.findMany({ where: { memberId: sX3.id } })
  expectEqual('rollback: sX3 enrollment hanya 1', sX3Enr.length, 1)
  expectEqual('rollback: sX3 leftAt kosong', sX3Enr[0]?.leftAt ?? null, null)
  expectEqual('rollback: sX3 status member ACTIVE', (await prisma.member.findUnique({ where: { id: sX3.id } }))?.status, 'ACTIVE')

  console.log('--- STEP 8: guard validasi input ---')
  await expectRejected('fromYear tidak ada', () => executeService.executeAutomatic({ mode: 'AUTOMATIC', fromYearId: 'year-nope', toYearId: yearTo.id }), 'tidak ditemukan')
  await expectRejected('toYear tidak ada', () => executeService.executeAutomatic({ mode: 'AUTOMATIC', fromYearId: yearFrom.id, toYearId: 'year-nope' }), 'tidak ditemukan')
  await expectRejected('tahun sama ditolak', () => executeService.executeAutomatic({ mode: 'AUTOMATIC', fromYearId: yearFrom.id, toYearId: yearFrom.id }), 'tidak boleh sama')
  await expectRejected(
    'mode MAPPING belum didukung',
    () =>
      // @ts-expect-error — kontrak P-2 hanya AUTOMATIC; MAPPING/BULK_EDIT = P-3/P-5
      executeService.executeAutomatic({ mode: 'MAPPING', fromYearId: yearFrom.id, toYearId: yearTo.id }),
    'belum didukung'
  )
  const srcXIOtherYear = await prisma.class.create({
    data: { academicYearId: yearTo.id, curriculumId: curriculum.id, educationLevel: 'XI', parallel: 'MERDEKA 7', isActive: true }
  })
  await expectRejected(
    'fromClassId kelas tahun target ditolak',
    () => executeService.executeAutomatic({ mode: 'AUTOMATIC', fromYearId: yearFrom.id, toYearId: yearTo.id, fromClassId: srcXIOtherYear.id }),
    'bukan milik tahun ajaran sumber'
  )

  console.log('--- STEP 9: state-based eligibility (RFC §9) — run ulang ---')
  // Yang masih ACTIVE di tahun sumber: sNoTarget (NO_TARGET) + sX3 (PROMOTED).
  const run2 = await executeService.executeAutomatic({ mode: 'AUTOMATIC', fromYearId: yearFrom.id, toYearId: yearTo.id, runBy: 'smoke-p2-rerun' })
  expectEqual('run2 memproses sisa ACTIVE (2 item)', run2.items.length, 2)
  const run2sX3 = run2.items.find((i) => i.memberId === sX3.id)
  expectEqual('run2 sX3 outcome PROMOTED', run2sX3?.outcome, 'PROMOTED')
  const run2sNoTarget = run2.items.find((i) => i.memberId === sNoTarget.id)
  expectEqual('run2 sNoTarget outcome NO_TARGET', run2sNoTarget?.outcome, 'NO_TARGET')
  expectEqual('run2 counts.promoted', run2.summary?.promoted, 1)
  expectEqual('run2 counts.noTarget', run2.summary?.noTarget, 1)
  expectEqual('sX3 buka ACTIVE baru di tgtXI', (await prisma.memberEnrollment.findFirst({ where: { memberId: sX3.id, status: ACADEMIC_STATUS.active } }))?.classId, tgtXI.id)
  // ACTIVE lintas tahun: sX + sXI (baru, yearTo) + sNoTarget + sX3 = 4 — run2
  // TIDAK menduplikasi siapa pun (hanya memproses sX3 + sNoTarget).
  expectEqual('total ACTIVE = sX + sXI + sNoTarget + sX3 = 4', await prisma.memberEnrollment.count({ where: { status: ACADEMIC_STATUS.active, leftAt: null } }), 4)
  expectEqual('sNoTarget tidak diduplikasi', await prisma.memberEnrollment.count({ where: { memberId: sNoTarget.id, status: ACADEMIC_STATUS.active } }), 1)

  console.log(`\n===== RESULT: ${pass} PASS, ${fail} FAIL =====`)
  if (fail > 0) process.exitCode = 1
}

main()
