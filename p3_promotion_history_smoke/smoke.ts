// WO P-3 — Smoke PROMOTION RUN HISTORY (fresh DB).
// Membuktikan (keputusan PO P-3 — history READ ONLY, audit, TANPA hitung ulang):
//   A. findMany (list) = data dari PromotionRun (bukan recompute) — nama tahun,
//      counts 8 kolom (promoted/graduated/repeated/redistributed/transferred/
//      dropped/noTarget/error), itemCount dari _count.items, status, urutan
//      startedAt desc;
//   B. transferred/dropped default 0 untuk run AUTOMATIC (P-2) — hanya tampil
//      bila mode lain menuliskannya ke summary;
//   C. findById (detail) = run + items lengkap dengan label display
//      memberName/sourceClassLabel/targetClassLabel yang BERASAL dari relasi
//      (member, class) — bukan hasil hitung ulang keputusan;
//   D. konsistensi audit: jumlah baris per outcome di PromotionRunItem == counts
//      yang dilaporkan history;
//   E. guard: findById run yang tidak ada → 404;
//   F. multiple run → daftar lengkap, urutan terbaru dulu.
import { PromotionExecuteService } from '../src/main/services/promotion-execute.service'
import { PromotionRunService } from '../src/main/services/promotion-run.service'
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
  const executeService = new PromotionExecuteService(academicYearRepo, classRepo, enrollmentRepo, promotionRepo, runService)

  console.log('--- STEP 0: seed master data + eksekusi 1 run (via executeService P-2) ---')
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

  await prisma.memberEnrollment.create({ data: { memberId: sX.id, classId: srcX.id, academicYearId: yearFrom.id, status: ACADEMIC_STATUS.active } })
  await prisma.memberEnrollment.create({ data: { memberId: sXI.id, classId: srcXI.id, academicYearId: yearFrom.id, status: ACADEMIC_STATUS.active } })
  await prisma.memberEnrollment.create({ data: { memberId: sXIIa.id, classId: srcXII.id, academicYearId: yearFrom.id, status: ACADEMIC_STATUS.active } })
  await prisma.memberEnrollment.create({ data: { memberId: sXIIb.id, classId: srcXII.id, academicYearId: yearFrom.id, status: ACADEMIC_STATUS.active } })
  await prisma.memberEnrollment.create({ data: { memberId: sNoTarget.id, classId: srcX9.id, academicYearId: yearFrom.id, status: ACADEMIC_STATUS.active } })

  const run1 = await executeService.executeAutomatic({ mode: 'AUTOMATIC', fromYearId: yearFrom.id, toYearId: yearTo.id, runBy: 'smoke-p3' })
  expectEqual('run1 dibuat (status SUCCESS)', run1.status, 'SUCCESS')
  expectEqual('run1 items 5', run1.items.length, 5)
  expectEqual('run1 counts promoted 2', run1.summary?.promoted, 2)
  expectEqual('run1 counts graduated 2', run1.summary?.graduated, 2)
  expectEqual('run1 counts noTarget 1', run1.summary?.noTarget, 1)

  console.log('--- STEP 1: findMany (list history) ---')
  const list = await runService.findMany()
  expectEqual('list.total 1', list.total, 1)
  const row1 = list.data[0]
  check('row1 ada', row1 !== undefined)
  if (row1) {
    expectEqual('row1.id == run1.id', row1.id, run1.id)
    expectEqual('row1.fromYearName', row1.fromYearName, '2025/2026')
    expectEqual('row1.toYearName', row1.toYearName, '2026/2027')
    expectEqual('row1.mode', row1.mode, 'AUTOMATIC')
    expectEqual('row1.runBy', row1.runBy, 'smoke-p3')
    expectEqual('row1.status', row1.status, 'SUCCESS')
    expectEqual('row1.itemCount', row1.itemCount, 5)
    expectEqual('row1.counts.promoted', row1.counts.promoted, 2)
    expectEqual('row1.counts.repeated', row1.counts.repeated, 0)
    expectEqual('row1.counts.redistributed', row1.counts.redistributed, 0)
    expectEqual('row1.counts.graduated', row1.counts.graduated, 2)
    expectEqual('row1.counts.transferred (default 0)', row1.counts.transferred, 0)
    expectEqual('row1.counts.dropped (default 0)', row1.counts.dropped, 0)
    expectEqual('row1.counts.noTarget', row1.counts.noTarget, 1)
    expectEqual('row1.counts.error', row1.counts.error, 0)
    check('row1.startedAt terisi', row1.startedAt !== '')
    check('row1.finishedAt terisi', row1.finishedAt !== null)
  }
  // Guard pagination/limit.
  const listLimit1 = await runService.findMany({ page: 1, limit: 1 })
  expectEqual('list limit 1 → total tetap 1', listLimit1.total, 1)
  expectEqual('list limit 1 → data 1', listLimit1.data.length, 1)

  console.log('--- STEP 2: findById (detail history) — label dari relasi, bukan recompute ---')
  const detail = await runService.findById(run1.id)
  expectEqual('detail.id', detail.id, run1.id)
  expectEqual('detail.fromYearName', detail.fromYearName, '2025/2026')
  expectEqual('detail.toYearName', detail.toYearName, '2026/2027')
  expectEqual('detail.mode', detail.mode, 'AUTOMATIC')
  expectEqual('detail.status', detail.status, 'SUCCESS')
  expectEqual('detail.runBy', detail.runBy, 'smoke-p3')
  expectEqual('detail.items.length 5', detail.items.length, 5)
  expectEqual('detail.counts.promoted', detail.counts.promoted, 2)
  expectEqual('detail.counts.graduated', detail.counts.graduated, 2)
  expectEqual('detail.counts.noTarget', detail.counts.noTarget, 1)
  check('detail.summary konsisten dgn counts', JSON.stringify(detail.summary) === JSON.stringify(run1.summary))

  const itemSX = detail.items.find((i) => i.memberId === sX.id)
  check('item sX ada', itemSX !== undefined)
  if (itemSX) {
    expectEqual('item sX memberName (relasi)', itemSX.memberName, 'Andi Kelas X')
    expectEqual('item sX sourceClassId', itemSX.sourceClassId, srcX.id)
    expectEqual('item sX sourceClassLabel', itemSX.sourceClassLabel, 'X MERDEKA 1')
    expectEqual('item sX targetClassId', itemSX.targetClassId, tgtXI.id)
    expectEqual('item sX targetClassLabel', itemSX.targetClassLabel, 'XI MERDEKA 1')
    expectEqual('item sX outcome', itemSX.outcome, 'PROMOTED')
  }
  const itemSXII = detail.items.find((i) => i.memberId === sXIIa.id)
  check('item sXIIa ada', itemSXII !== undefined)
  if (itemSXII) {
    expectEqual('item sXIIa outcome GRADUATED', itemSXII.outcome, 'GRADUATED')
    expectEqual('item sXIIa targetClassId null', itemSXII.targetClassId, null)
    expectEqual('item sXIIa targetClassLabel null', itemSXII.targetClassLabel, null)
  }
  const itemNoTarget = detail.items.find((i) => i.memberId === sNoTarget.id)
  check('item sNoTarget ada', itemNoTarget !== undefined)
  if (itemNoTarget) {
    expectEqual('item sNoTarget outcome NO_TARGET', itemNoTarget.outcome, 'NO_TARGET')
    expectEqual('item sNoTarget targetClassId null', itemNoTarget.targetClassId, null)
    expectEqual('item sNoTarget message terisi', itemNoTarget.message !== null, true)
  }
  check('setiap item punya memberName', detail.items.every((i) => i.memberName.length > 0))
  check('setiap item punya sourceClassLabel', detail.items.every((i) => i.sourceClassLabel !== null))

  console.log('--- STEP 3: konsistensi audit — baris outcome di DB == counts history ---')
  const rows = await prisma.promotionRunItem.groupBy({ by: ['outcome'], where: { promotionRunId: run1.id }, _count: { _all: true } })
  const dbCount = Object.fromEntries(rows.map((r) => [r.outcome, r._count._all]))
  expectEqual('DB outcome PROMOTED == counts.promoted', dbCount['PROMOTED'] ?? 0, detail.counts.promoted)
  expectEqual('DB outcome GRADUATED == counts.graduated', dbCount['GRADUATED'] ?? 0, detail.counts.graduated)
  expectEqual('DB outcome NO_TARGET == counts.noTarget', dbCount['NO_TARGET'] ?? 0, detail.counts.noTarget)
  expectEqual('DB outcome REPEATED == counts.repeated', dbCount['REPEATED'] ?? 0, detail.counts.repeated)
  expectEqual('DB outcome ERROR == counts.error', dbCount['ERROR'] ?? 0, detail.counts.error)
  expectEqual('DB total baris == itemCount', Object.values(dbCount).reduce((a, b) => a + (b as number), 0), detail.items.length)

  console.log('--- STEP 4: guard 404 ---')
  await expectRejected('findById run tak ada → 404', () => runService.findById('run-nope'), 'tidak ditemukan')
  const err = await runService.findById('run-nope').then(() => null, (e) => e)
  check('404 berstatus AppError 404', err instanceof AppError && (err as AppError).statusCode === 404, `statusCode=${err instanceof AppError ? err.statusCode : 'n/a'}`)

  console.log('--- STEP 5: run kedua — daftar urutan terbaru dulu ---')
  // Tambah 1 member ACTIVE tahun sumber agar run2 memproses 1 item.
  const sX3 = await prisma.member.create({ data: { memberNumber: 'S-000006', fullName: 'Gita Tambahan', memberType: 'student', status: 'ACTIVE' } })
  await prisma.memberEnrollment.create({ data: { memberId: sX3.id, classId: srcX.id, academicYearId: yearFrom.id, status: ACADEMIC_STATUS.active } })
  const run2 = await executeService.executeAutomatic({ mode: 'AUTOMATIC', fromYearId: yearFrom.id, toYearId: yearTo.id, runBy: 'smoke-p3-rerun' })
  // Masih ACTIVE di tahun sumber: sNoTarget (NO_TARGET) + sX3 (PROMOTED) = 2.
  expectEqual('run2 items 2 (sX3 + sNoTarget)', run2.items.length, 2)
  expectEqual('run2 counts.promoted 1', run2.summary?.promoted, 1)
  expectEqual('run2 counts.noTarget 1', run2.summary?.noTarget, 1)

  const list2 = await runService.findMany()
  expectEqual('list.total 2', list2.total, 2)
  check('list urutan terbaru dulu (run2 first)', list2.data[0]?.id === run2.id && list2.data[1]?.id === run1.id)
  const row2 = list2.data[0]
  check('row2 ada', row2 !== undefined)
  if (row2) {
    expectEqual('row2.id == run2.id', row2.id, run2.id)
    expectEqual('row2.itemCount 2', row2.itemCount, 2)
    expectEqual('row2.counts.promoted 1', row2.counts.promoted, 1)
    expectEqual('row2.counts.noTarget 1', row2.counts.noTarget, 1)
  }
  const row1Again = list2.data[1]
  check('row1Again ada', row1Again !== undefined)
  if (row1Again) {
    expectEqual('row1Again.itemCount tetap 5', row1Again.itemCount, 5)
    expectEqual('row1Again.counts.promoted tetap 2', row1Again.counts.promoted, 2)
  }

  console.log(`\n===== RESULT: ${pass} PASS, ${fail} FAIL =====`)
  if (fail > 0) process.exitCode = 1
}

main()
