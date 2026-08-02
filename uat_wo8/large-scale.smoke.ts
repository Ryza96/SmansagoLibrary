import { getPrisma } from '../src/main/repositories/base/prisma'
import { AcademicYearRepository } from '../src/main/repositories/academic-year.repository'
import { CurriculumRepository } from '../src/main/repositories/curriculum.repository'
import { ClassRepository } from '../src/main/repositories/class.repository'
import { MemberRepository } from '../src/main/repositories/member.repository'
import { MemberDuplicateChecker } from '../src/main/services/member-duplicate-checker.service'
import { MemberClassResolver } from '../src/main/services/member-class-resolver.service'
import { NumberGeneratorService } from '../src/main/services/number-generator.service'
import { MemberImportService } from '../src/main/services/member-import.service'
import { memberPreviewService } from '../src/services/MemberPreviewService'
import { validateImportFile } from '../src/utils/bookImport'
import { IMPORT_CONFIG } from '../src/config/import.config'
import type {
  MemberImportRowInput,
  MemberImportPreviewDTO,
  MemberImportProgressEvent,
  MemberImportResultDTO
} from '../src/shared/dto/member'
import type { ParsedMemberRow } from '../src/services/MemberExcelParserService'

let pass = 0
let fail = 0

function check(name: string, ok: boolean, detail?: string): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`)
  if (ok) pass += 1
  else fail += 1
}

interface ScenarioMetric {
  label: string
  rows: number
  previewMs: number
  importMs: number
  countAfter: number
}

const metrics: ScenarioMetric[] = []

function mem(): NodeJS.MemoryUsage {
  return process.memoryUsage()
}

function makeRow(index: number, nisn: string, className = 'XI IPA 2'): MemberImportRowInput {
  return {
    rowNumber: index + 1,
    fullName: `Anggota ${index + 1}`,
    className,
    gender: index % 2 === 0 ? 'male' : 'female',
    nisn,
    address: `Jl. Test ${index + 1}`,
    phone: `0812${String(index).padStart(5, '0')}`,
    email: `m${nisn}@test.id`
  }
}

function makeRows(count: number, nisnStart: number, className = 'XI IPA 2'): MemberImportRowInput[] {
  return Array.from({ length: count }, (_, i) => makeRow(i, String(nisnStart + i), className))
}

function toParsedRows(rows: MemberImportRowInput[]): ParsedMemberRow[] {
  return rows.map((row) => ({
    rowNumber: row.rowNumber,
    nama: row.fullName,
    kelas: row.className,
    jenisKelamin: row.gender === 'female' ? 'P' : 'L',
    nisn: row.nisn,
    tempatLahir: row.birthPlace ?? null,
    tanggalLahir: row.birthDate ?? null,
    alamat: row.address,
    whatsapp: row.phone,
    email: row.email ?? null
  }))
}

function validateProgress(events: MemberImportProgressEvent[], n: number): boolean {
  if (events.length === 0) return false
  if (events[0]?.stage !== 'preparing') return false
  const stages = new Set(events.map((e) => e.stage))
  for (const stage of ['preparing', 'checking-duplicate', 'resolving-class', 'generating-number', 'completed'] as const) {
    if (!stages.has(stage)) return false
  }
  const completed = events.filter((e) => e.stage === 'completed')
  if (completed.length !== 1) return false
  const last = events[events.length - 1]
  return last?.stage === 'completed' && last.current === n && last.total === n
}

function validateFailedProgress(events: MemberImportProgressEvent[], n: number): boolean {
  if (events.length === 0) return false
  if (events[0]?.stage !== 'preparing') return false
  const stages = new Set(events.map((e) => e.stage))
  if (!stages.has('checking-duplicate') || !stages.has('resolving-class')) return false
  if (stages.has('completed')) return false
  const last = events[events.length - 1]
  return last?.stage === 'resolving-class' && last.current === n && last.total === n
}

async function runValidScenario(
  label: string,
  rows: MemberImportRowInput[],
  expectedCountAfter: number,
  expectedLatest: string,
  service: MemberImportService,
  prisma: ReturnType<typeof getPrisma>
): Promise<void> {
  const n = rows.length

  const p0 = Date.now()
  const previewDto: MemberImportPreviewDTO = await service.previewCheck(rows)
  const previewMs = Date.now() - p0
  check(`[${label}] Preview: valid true`, previewDto.valid === true, `valid=${previewDto.valid}`)
  check(`[${label}] Preview: errorCount 0`, previewDto.errorCount === 0, `errorCount=${previewDto.errorCount}`)
  check(`[${label}] Preview: warningCount 0`, previewDto.warningCount === 0, `warningCount=${previewDto.warningCount}`)

  const pv = memberPreviewService.buildPreview(toParsedRows(rows), previewDto)
  check(`[${label}] Preview (renderer): canImport true`, pv.canImport === true, `canImport=${pv.canImport}`)
  check(`[${label}] Preview (renderer): summary.total ${n}`, pv.summary.total === n, `total=${pv.summary.total}`)

  const events: MemberImportProgressEvent[] = []
  const i0 = Date.now()
  const result: MemberImportResultDTO = await service.import(rows, { onProgress: (e) => events.push(e) })
  const importMs = Date.now() - i0

  check(`[${label}] ResultDTO: success true`, result.success === true, `success=${result.success}`)
  check(`[${label}] ResultDTO: totalRows ${n}`, result.totalRows === n, `totalRows=${result.totalRows}`)
  check(`[${label}] ResultDTO: created ${n}`, result.created === n, `created=${result.created}`)
  check(`[${label}] ResultDTO: failed 0`, result.failed === 0, `failed=${result.failed}`)
  check(`[${label}] ResultDTO: errors kosong`, result.errors.length === 0, `errors=${result.errors.length}`)
  check(`[${label}] ResultDTO: durationMs >= 0`, result.durationMs >= 0, `durationMs=${result.durationMs}`)

  const count = await prisma.member.count()
  check(`[${label}] Transaction: count ${expectedCountAfter}`, count === expectedCountAfter, `count=${count}`)

  const latest = await prisma.member.findFirst({ orderBy: { memberNumber: 'desc' } })
  check(`[${label}] Number Generator: nomor ${expectedLatest}`, latest?.memberNumber === expectedLatest, `${latest?.memberNumber}`)

  check(`[${label}] Progress: semua stage + completed(${n})`, validateProgress(events, n), `events=${events.length}`)
  check(`[${label}] Performance: import < 60s (headroom F-1)`, importMs < 60_000, `importMs=${importMs}`)

  metrics.push({ label, rows: n, previewMs, importMs, countAfter: count })
}

async function main(): Promise<void> {
  const startMem = mem()
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
  const classIPA2 = await classRepo.create({ academicYearId: ay.id, curriculumId: curA.id, educationLevel: 'XI', parallel: 'IPA 2' })
  await classRepo.create({ academicYearId: ay.id, curriculumId: curA.id, educationLevel: 'XII', parallel: 'TKJ 1' })
  await classRepo.create({ academicYearId: ay.id, curriculumId: curA.id, educationLevel: 'X', parallel: 'MIPA 1' })

  const memberCount = async (): Promise<number> => prisma.member.count()
  const latestNumber = async (): Promise<string | null> =>
    (await prisma.member.findFirst({ orderBy: { memberNumber: 'desc' } }))?.memberNumber ?? null

  // ================= A. Baseline 10 =================
  await runValidScenario('A10', makeRows(10, 1_000_001), 10, 'S-000010', service, prisma)

  // ================= B. 100 =================
  await runValidScenario('B100', makeRows(100, 2_000_001), 110, 'S-000110', service, prisma)

  // ================= C. 500 =================
  await runValidScenario('C500', makeRows(500, 3_000_001), 610, 'S-000610', service, prisma)

  // ================= D. 1000 =================
  await runValidScenario('D1000', makeRows(1000, 4_000_001), 1610, 'S-001610', service, prisma)

  // ================= E. 5000 (volume maksimum) =================
  await runValidScenario('E5000', makeRows(5000, 5_000_001), 6610, 'S-006610', service, prisma)

  // ================= STRESS A. Duplicate acak (scattered) =================
  const dupNisns: string[] = Array.from({ length: 50 }, (_, j) => String(5_000_001 + ((j * 97 + 13) % 5000)))
  const stressARows: MemberImportRowInput[] = []
  let freshSeq = 0
  for (let i = 0; i < 500; i++) {
    if (i % 10 === 5) {
      const dup = dupNisns[Math.floor(i / 10)] ?? '5000001'
      const row = makeRow(i, dup)
      ;(row as { email?: string }).email = undefined
      stressARows.push(row)
    } else {
      stressARows.push(makeRow(i, String(7_000_001 + freshSeq)))
      freshSeq += 1
    }
  }
  const a0 = Date.now()
  const stressAPreview = await service.previewCheck(stressARows)
  const stressAPreviewMs = Date.now() - a0
  check('[Stress A] Duplicate acak: Preview valid false', stressAPreview.valid === false, `valid=${stressAPreview.valid}`)
  check('[Stress A] Duplicate acak: errorCount 50', stressAPreview.errorCount === 50, `errorCount=${stressAPreview.errorCount}`)
  const stressAPv = memberPreviewService.buildPreview(toParsedRows(stressARows), stressAPreview)
  check('[Stress A] Duplicate acak: canImport false', stressAPv.canImport === false, `canImport=${stressAPv.canImport}`)
  const stressAEvents: MemberImportProgressEvent[] = []
  const a1 = Date.now()
  const stressAResult = await service.import(stressARows, { onProgress: (e) => stressAEvents.push(e) })
  const stressAImportMs = Date.now() - a1
  check('[Stress A] Duplicate acak: success false', stressAResult.success === false, `success=${stressAResult.success}`)
  check('[Stress A] Duplicate acak: created 0', stressAResult.created === 0, `created=${stressAResult.created}`)
  check('[Stress A] Duplicate acak: failed 500', stressAResult.failed === 500, `failed=${stressAResult.failed}`)
  check('[Stress A] Duplicate acak: errors 50 dupNisnInDb', stressAResult.errors.length === 50 && stressAResult.errors.every((e) => e.messageKey === 'memberImport.duplicateNisnInDb'), `errors=${stressAResult.errors.length}`)
  check('[Stress A] Duplicate acak: count tetap 6610', (await memberCount()) === 6610, `count=${await memberCount()}`)
  check('[Stress A] Duplicate acak: progress berhenti di stage terakhir (F-4 TD)', validateFailedProgress(stressAEvents, 500), `events=${stressAEvents.length}`)
  metrics.push({ label: 'A-dup-acak', rows: 500, previewMs: stressAPreviewMs, importMs: stressAImportMs, countAfter: 6610 })

  // ================= STRESS B. Kelas tidak ditemukan =================
  const stressBRows: MemberImportRowInput[] = []
  for (let i = 0; i < 1000; i++) {
    stressBRows.push(makeRow(i, String(8_000_001 + i), i < 100 ? 'XI Tidak Ada' : 'XI IPA 2'))
  }
  const b0 = Date.now()
  const stressBPreview = await service.previewCheck(stressBRows)
  const stressBPreviewMs = Date.now() - b0
  check('[Stress B] Kelas tdk ada: Preview valid false', stressBPreview.valid === false)
  check('[Stress B] Kelas tdk ada: errorCount 100', stressBPreview.errorCount === 100, `errorCount=${stressBPreview.errorCount}`)
  const b1 = Date.now()
  const stressBResult = await service.import(stressBRows)
  const stressBImportMs = Date.now() - b1
  check('[Stress B] Kelas tdk ada: success false', stressBResult.success === false, `success=${stressBResult.success}`)
  check('[Stress B] Kelas tdk ada: created 0', stressBResult.created === 0, `created=${stressBResult.created}`)
  check('[Stress B] Kelas tdk ada: errors 100 classNotFound', stressBResult.errors.length === 100 && stressBResult.errors.every((e) => e.messageKey === 'memberImport.classNotFound'), `errors=${stressBResult.errors.length}`)
  check('[Stress B] Kelas tdk ada: className terisi', stressBResult.errors[0]?.className === 'XI Tidak Ada', `${stressBResult.errors[0]?.className}`)
  check('[Stress B] Kelas tdk ada: count tetap 6610', (await memberCount()) === 6610, `count=${await memberCount()}`)
  metrics.push({ label: 'B-kelas-tdk-ada', rows: 1000, previewMs: stressBPreviewMs, importMs: stressBImportMs, countAfter: 6610 })

  // ================= STRESS C. File maksimum (batas ukuran) =================
  const exactFile = new File([new Uint8Array(IMPORT_CONFIG.maxFileSize)], 'anggota.xlsx')
  const overFile = new File([new Uint8Array(IMPORT_CONFIG.maxFileSize + 1)], 'anggota.xlsx')
  check('[Stress C] File maksimum: ukuran = maxFileSize lolos', validateImportFile(exactFile) === null)
  check('[Stress C] File maksimum: ukuran > maxFileSize ditolak', validateImportFile(overFile) === 'IMP-003')
  metrics.push({ label: 'C-file-maks', rows: 0, previewMs: 0, importMs: 0, countAfter: 6610 })

  // ================= STRESS D. Rollback (P2002 di dalam tx, skala 1000) =================
  const stressDRows = makeRows(1000, 9_000_001)
  const dLast = stressDRows[stressDRows.length - 1]
  if (dLast && stressDRows[500]) dLast.nisn = stressDRows[500].nisn
  const d0 = Date.now()
  const stressDPreview = await service.previewCheck(stressDRows)
  const stressDPreviewMs = Date.now() - d0
  check('[Stress D] Rollback: preview lolos (duplikat hanya dalam file)', stressDPreview.valid === true, `valid=${stressDPreview.valid}`)
  const d1 = Date.now()
  const stressDResult = await service.import(stressDRows)
  const stressDImportMs = Date.now() - d1
  check('[Stress D] Rollback: success false', stressDResult.success === false, `success=${stressDResult.success}`)
  check('[Stress D] Rollback: created 0 (all-or-nothing)', stressDResult.created === 0, `created=${stressDResult.created}`)
  check('[Stress D] Rollback: failed 1000', stressDResult.failed === 1000, `failed=${stressDResult.failed}`)
  check('[Stress D] Rollback: createFailed', stressDResult.errors[0]?.messageKey === 'memberImport.createFailed', `${stressDResult.errors[0]?.messageKey}`)
  check('[Stress D] Rollback: count tetap 6610', (await memberCount()) === 6610, `count=${await memberCount()}`)
  check('[Stress D] Rollback: tidak ada baris partial (nisn 9000...)', (await prisma.member.count({ where: { nisn: { startsWith: '9000' } } })) === 0)
  check('[Stress D] Rollback: nomor tidak terpakai (S-006610)', (await latestNumber()) === 'S-006610', `${await latestNumber()}`)
  metrics.push({ label: 'D-rollback', rows: 1000, previewMs: stressDPreviewMs, importMs: stressDImportMs, countAfter: 6610 })

  // ================= STRESS E. Import ulang =================
  const eReimport = makeRows(5000, 5_000_001)
  const e0 = Date.now()
  const eReimportResult = await service.import(eReimport)
  const eReimportMs = Date.now() - e0
  check('[Stress E] Import ulang: success false', eReimportResult.success === false, `success=${eReimportResult.success}`)
  check('[Stress E] Import ulang: created 0', eReimportResult.created === 0, `created=${eReimportResult.created}`)
  const reimportNisn = eReimportResult.errors.filter((e) => e.messageKey === 'memberImport.duplicateNisnInDb').length
  const reimportEmail = eReimportResult.errors.filter((e) => e.messageKey === 'memberImport.duplicateEmailInDb').length
  check('[Stress E] Import ulang: errors 5000 nisn + 5000 email', eReimportResult.errors.length === 10000 && reimportNisn === 5000 && reimportEmail === 5000, `total=${eReimportResult.errors.length} nisn=${reimportNisn} email=${reimportEmail}`)
  check('[Stress E] Import ulang: count tetap 6610', (await memberCount()) === 6610, `count=${await memberCount()}`)
  const eFresh = makeRows(100, 6_000_001)
  const e2 = Date.now()
  const eFreshResult = await service.import(eFresh)
  const eFreshMs = Date.now() - e2
  check('[Stress E] Batch baru setelah re-import: success true', eFreshResult.success === true, `success=${eFreshResult.success}`)
  check('[Stress E] Batch baru setelah re-import: created 100', eFreshResult.created === 100, `created=${eFreshResult.created}`)
  check('[Stress E] Batch baru setelah re-import: count 6710', (await memberCount()) === 6710, `count=${await memberCount()}`)
  check('[Stress E] Batch baru setelah re-import: nomor S-006710', (await latestNumber()) === 'S-006710', `${await latestNumber()}`)
  metrics.push({ label: 'E-reimport', rows: 5100, previewMs: 0, importMs: eReimportMs + eFreshMs, countAfter: 6710 })

  // ================= VERIFIKASI AKHIR =================
  const endMem = mem()
  check('Stabilitas: total member 6710', (await memberCount()) === 6710, `count=${await memberCount()}`)
  check('Stabilitas: nomor terakhir S-006710', (await latestNumber()) === 'S-006710', `${await latestNumber()}`)
  check('Stabilitas: Class Resolver (classId XI IPA 2 terpasang)', (await prisma.member.count({ where: { classId: classIPA2.id } })) > 0)
  const totalImported = 10 + 100 + 500 + 1000 + 5000 + 100
  check('Stabilitas: total member == total import valid', (await memberCount()) === totalImported, `${await memberCount()} == ${totalImported}`)

  // ================= LAPORAN METRIK =================
  console.log('\n=== METRIC TABLE ===')
  console.log('label | rows | previewMs | importMs | rows/sec(import) | countAfter')
  for (const m of metrics) {
    const rate = m.importMs > 0 ? Math.round(m.rows / (m.importMs / 1000)) : 0
    console.log(`${m.label} | ${m.rows} | ${m.previewMs} | ${m.importMs} | ${rate} | ${m.countAfter}`)
  }
  console.log('\n=== MEMORY (MiB) ===')
  console.log(`heapUsed  start=${(startMem.heapUsed / 1048576).toFixed(1)} end=${(endMem.heapUsed / 1048576).toFixed(1)} delta=${((endMem.heapUsed - startMem.heapUsed) / 1048576).toFixed(1)}`)
  console.log(`rss       start=${(startMem.rss / 1048576).toFixed(1)} end=${(endMem.rss / 1048576).toFixed(1)} delta=${((endMem.rss - startMem.rss) / 1048576).toFixed(1)}`)
  console.log(`external  start=${(startMem.external / 1048576).toFixed(1)} end=${(endMem.external / 1048576).toFixed(1)} delta=${((endMem.external - startMem.external) / 1048576).toFixed(1)}`)
  check('Memory: rss end < 1 GB', endMem.rss < 1024 * 1024 * 1024, `${(endMem.rss / 1048576).toFixed(1)} MiB`)
  check('Memory: heapUsed end < 800 MB', endMem.heapUsed < 800 * 1024 * 1024, `${(endMem.heapUsed / 1048576).toFixed(1)} MiB`)

  await prisma.$disconnect()

  console.log(`\nWO8 SMOKE RESULT: ${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
