// WO P-1 — Smoke PromotionPreviewService (READ-ONLY, fresh DB).
// Memverifikasi preview Mode A (RFC §7.1 step 1, RFC §8): counts + items,
// read-only (tanpa tulis apa pun), dan guard validasi input.
import { PromotionPreviewService } from '../src/main/services/promotion-preview.service'
import { AcademicYearRepository } from '../src/main/repositories/academic-year.repository'
import { ClassRepository } from '../src/main/repositories/class.repository'
import { EnrollmentRepository } from '../src/main/repositories/enrollment.repository'
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
  const service = new PromotionPreviewService(new AcademicYearRepository(), new ClassRepository(), new EnrollmentRepository())

  console.log('--- STEP 0: seed master data (fresh DB) ---')
  const curriculum = await prisma.curriculum.create({ data: { name: 'MERDEKA' } })
  const yearFrom = await prisma.academicYear.create({
    data: { name: '2025/2026', startDate: new Date('2025-07-01'), endDate: new Date('2026-06-30'), isActive: true }
  })
  const yearTo = await prisma.academicYear.create({
    data: { name: '2026/2027', startDate: new Date('2026-07-01'), endDate: new Date('2027-06-30'), isActive: false }
  })

  // Kelas sumber (tahun From): X MERDEKA 1, XI MERDEKA 1, XII MERDEKA 1
  const srcX = await prisma.class.create({
    data: { academicYearId: yearFrom.id, curriculumId: curriculum.id, educationLevel: 'X', parallel: 'MERDEKA 1', homeroomTeacher: null, isActive: true }
  })
  const srcXI = await prisma.class.create({
    data: { academicYearId: yearFrom.id, curriculumId: curriculum.id, educationLevel: 'XI', parallel: 'MERDEKA 1', homeroomTeacher: null, isActive: true }
  })
  const srcXII = await prisma.class.create({
    data: { academicYearId: yearFrom.id, curriculumId: curriculum.id, educationLevel: 'XII', parallel: 'MERDEKA 1', homeroomTeacher: null, isActive: true }
  })

  // Kelas target (tahun To): XI MERDEKA 1, XII MERDEKA 1 — TANPA X MERDEKA 1 (repeat tidak mungkin)
  const tgtXI = await prisma.class.create({
    data: { academicYearId: yearTo.id, curriculumId: curriculum.id, educationLevel: 'XI', parallel: 'MERDEKA 1', homeroomTeacher: null, isActive: true }
  })
  const tgtXII = await prisma.class.create({
    data: { academicYearId: yearTo.id, curriculumId: curriculum.id, educationLevel: 'XII', parallel: 'MERDEKA 1', homeroomTeacher: null, isActive: true }
  })

  // Siswa: 1 di X, 1 di XI, 2 di XII
  const sX = await prisma.member.create({ data: { memberNumber: 'S-000001', fullName: 'Andi Kelas X', memberType: 'student', status: 'ACTIVE' } })
  const sXI = await prisma.member.create({ data: { memberNumber: 'S-000002', fullName: 'Budi Kelas XI', memberType: 'student', status: 'ACTIVE' } })
  const sXIIa = await prisma.member.create({ data: { memberNumber: 'S-000003', fullName: 'Citra Kelas XII', memberType: 'student', status: 'ACTIVE' } })
  const sXIIb = await prisma.member.create({ data: { memberNumber: 'S-000004', fullName: 'Dedi Kelas XII', memberType: 'student', status: 'ACTIVE' } })

  await prisma.memberEnrollment.create({ data: { memberId: sX.id, classId: srcX.id, academicYearId: yearFrom.id, status: ACADEMIC_STATUS.active } })
  await prisma.memberEnrollment.create({ data: { memberId: sXI.id, classId: srcXI.id, academicYearId: yearFrom.id, status: ACADEMIC_STATUS.active } })
  await prisma.memberEnrollment.create({ data: { memberId: sXIIa.id, classId: srcXII.id, academicYearId: yearFrom.id, status: ACADEMIC_STATUS.active } })
  await prisma.memberEnrollment.create({ data: { memberId: sXIIb.id, classId: srcXII.id, academicYearId: yearFrom.id, status: ACADEMIC_STATUS.active } })

  const beforeEnrollmentCount = await prisma.memberEnrollment.count()
  const beforeRunCount = await prisma.promotionRun.count()
  const beforeItemCount = await prisma.promotionRunItem.count()
  check('seed lengkap (4 enrollment)', beforeEnrollmentCount === 4)

  console.log('--- STEP 1: preview semua kelas sumber (Mode A) ---')
  const previewAll = await service.preview({ mode: 'AUTOMATIC', fromYearId: yearFrom.id, toYearId: yearTo.id })
  expectEqual('counts.promoted', previewAll.counts.promoted, 2) // sX -> XI, sXI -> XII
  expectEqual('counts.graduated', previewAll.counts.graduated, 2) // sXIIa + sXIIb
  expectEqual('counts.repeated', previewAll.counts.repeated, 0)
  expectEqual('counts.redistributed', previewAll.counts.redistributed, 0)
  expectEqual('counts.noTarget', previewAll.counts.noTarget, 0)
  expectEqual('counts.error', previewAll.counts.error, 0)
  expectEqual('items.length', previewAll.items.length, 4)

  const itemX = previewAll.items.find((i) => i.memberId === sX.id)
  expectEqual('X -> outcome PROMOTED', itemX?.outcome, 'PROMOTED')
  expectEqual('X -> targetClassId tgtXI', itemX?.targetClassId, tgtXI.id)
  expectEqual('X -> targetLabel', itemX?.targetLabel, 'XI MERDEKA 1')
  expectEqual('X -> sourceLabel', itemX?.sourceLabel, 'X MERDEKA 1')
  expectEqual('X -> memberName', itemX?.memberName, 'Andi Kelas X')

  const itemXI = previewAll.items.find((i) => i.memberId === sXI.id)
  expectEqual('XI -> outcome PROMOTED', itemXI?.outcome, 'PROMOTED')
  expectEqual('XI -> targetClassId tgtXII', itemXI?.targetClassId, tgtXII.id)

  const itemXII = previewAll.items.find((i) => i.memberId === sXIIa.id)
  expectEqual('XII -> outcome GRADUATED', itemXII?.outcome, 'GRADUATED')
  expectEqual('XII -> targetClassId null', itemXII?.targetClassId, null)

  console.log('--- STEP 2: preview per kelas (fromClassId) ---')
  const previewX = await service.preview({ mode: 'AUTOMATIC', fromYearId: yearFrom.id, toYearId: yearTo.id, fromClassId: srcX.id })
  expectEqual('only X -> promoted 1', previewX.counts.promoted, 1)
  expectEqual('only X -> graduated 0', previewX.counts.graduated, 0)
  expectEqual('only X -> items.length 1', previewX.items.length, 1)
  expectEqual('fromClassId tercatat', previewX.fromClassId, srcX.id)

  console.log('--- STEP 3: preview read-only (tidak menulis apa pun) ---')
  const afterEnrollmentCount = await prisma.memberEnrollment.count()
  const afterRunCount = await prisma.promotionRun.count()
  const afterItemCount = await prisma.promotionRunItem.count()
  const afterMemberStatus = await prisma.member.count({ where: { status: 'ACTIVE' } })
  expectEqual('enrollment count tidak berubah', afterEnrollmentCount, beforeEnrollmentCount)
  expectEqual('promotionRun count 0', afterRunCount, beforeRunCount)
  expectEqual('promotionRunItem count 0', afterItemCount, beforeItemCount)
  expectEqual('member status tidak berubah (4 ACTIVE)', afterMemberStatus, 4)

  console.log('--- STEP 4: guard validasi input ---')
  await expectRejected('fromYear tidak ada', () => service.preview({ mode: 'AUTOMATIC', fromYearId: 'year-nope', toYearId: yearTo.id }), 'tidak ditemukan')
  await expectRejected('toYear tidak ada', () => service.preview({ mode: 'AUTOMATIC', fromYearId: yearFrom.id, toYearId: 'year-nope' }), 'tidak ditemukan')
  await expectRejected('tahun sama ditolak', () => service.preview({ mode: 'AUTOMATIC', fromYearId: yearFrom.id, toYearId: yearFrom.id }), 'tidak boleh sama')
  await expectRejected(
    'mode MAPPING belum didukung',
    () =>
      // @ts-expect-error — kontrak P-1 hanya AUTOMATIC; MAPPING/BULK_EDIT dibangun P-3/P-5
      service.preview({ mode: 'MAPPING', fromYearId: yearFrom.id, toYearId: yearTo.id }),
    'belum didukung'
  )

  console.log('--- STEP 5: fromClassId milik tahun lain ditolak ---')
  const srcXIOtherYear = await prisma.class.create({
    data: { academicYearId: yearTo.id, curriculumId: curriculum.id, educationLevel: 'XI', parallel: 'MERDEKA 9', homeroomTeacher: null, isActive: true }
  })
  await expectRejected(
    'fromClassId kelas tahun target ditolak',
    () => service.preview({ mode: 'AUTOMATIC', fromYearId: yearFrom.id, toYearId: yearTo.id, fromClassId: srcXIOtherYear.id }),
    'bukan milik tahun ajaran sumber'
  )

  console.log('--- STEP 6: preview deterministik (2x panggil hasil sama) ---')
  const previewAllAgain = await service.preview({ mode: 'AUTOMATIC', fromYearId: yearFrom.id, toYearId: yearTo.id })
  expectEqual('counts.promoted sama', previewAllAgain.counts.promoted, previewAll.counts.promoted)
  expectEqual('counts.graduated sama', previewAllAgain.counts.graduated, previewAll.counts.graduated)
  expectEqual('item target pertama sama', previewAllAgain.items[0].targetClassId, previewAll.items[0].targetClassId)

  console.log(`\n===== RESULT: ${pass} PASS, ${fail} FAIL =====`)
  if (fail > 0) process.exitCode = 1
}

main()
