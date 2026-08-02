import Module from 'module'
import { getPrisma } from '../src/main/repositories/base/prisma'
import { AcademicYearRepository } from '../src/main/repositories/academic-year.repository'
import { CurriculumRepository } from '../src/main/repositories/curriculum.repository'
import { ClassRepository } from '../src/main/repositories/class.repository'
import { MemberRepository } from '../src/main/repositories/member.repository'
import { MemberDuplicateChecker } from '../src/main/services/member-duplicate-checker.service'
import { MemberClassResolver } from '../src/main/services/member-class-resolver.service'
import { NumberGeneratorService } from '../src/main/services/number-generator.service'
import { MemberImportService } from '../src/main/services/member-import.service'
import type { MemberImportPreviewDTO, MemberImportProgressEvent, MemberImportResultDTO, MemberImportRowInput, MemberImportStage } from '../src/shared/dto/member'

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

type PreviewHandler = (event: unknown, rows: MemberImportRowInput[]) => Promise<MemberImportPreviewDTO>
type ImportHandler = (event: unknown, rows: MemberImportRowInput[]) => Promise<MemberImportResultDTO>

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
  const cur = await curRepo.create({ name: 'Kurikulum Merdeka' })
  await classRepo.create({ academicYearId: ay.id, curriculumId: cur.id, educationLevel: 'XI', parallel: 'IPA 2' })
  await classRepo.create({ academicYearId: ay.id, curriculumId: cur.id, educationLevel: 'XII', parallel: 'TKJ 1' })

  const memberCount = async (): Promise<number> => prisma.member.count()

  // ================= IPC HARNESS =================
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  const fakeElectron = {
    ipcMain: {
      handle: (channel: string, fn: (...args: unknown[]) => unknown): void => {
        handlers.set(channel, fn)
      }
    },
    app: { isPackaged: false, getAppPath: () => process.cwd() },
    dialog: { showSaveDialog: async () => ({ canceled: true, filePath: undefined }) },
    BrowserWindow: { fromWebContents: () => null }
  }

  const nodeModule = Module as unknown as {
    _load: (request: string, parent: unknown, isMain: boolean) => unknown
  }
  const originalLoad = nodeModule._load
  nodeModule._load = function (request: string, parent: unknown, isMain: boolean): unknown {
    if (request === 'electron') return fakeElectron
    return originalLoad.call(this, request, parent, isMain)
  }

  type RegisterMemberHandlers = (memberService: unknown, memberImportService: MemberImportService) => void
  let registerMemberHandlers: RegisterMemberHandlers
  try {
    ;({ registerMemberHandlers } = require('../electron/ipc/member.ipc.js') as { registerMemberHandlers: RegisterMemberHandlers })
  } finally {
    nodeModule._load = originalLoad
  }

  // ================= T1 — handler terdaftar =================
  registerMemberHandlers({}, service)
  check('T1 previewCheck handler terdaftar', typeof handlers.get('members:previewCheck') === 'function')
  check('T1 import handler terdaftar', typeof handlers.get('members:import') === 'function')
  check('T1 downloadTemplate handler tetap ada', typeof handlers.get('members:downloadTemplate') === 'function')

  const previewHandler = handlers.get('members:previewCheck') as unknown as PreviewHandler
  const importHandler = handlers.get('members:import') as unknown as ImportHandler

  // ================= T2 — preview IPC (business error -> DTO, passthrough) =================
  const rowsA: MemberImportRowInput[] = [
    makeRow({ rowNumber: 1, className: 'XI IPA 2', nisn: '9100001' }),
    makeRow({ rowNumber: 2, className: 'XI Kelas Hantu', nisn: '9100002' })
  ]
  const progressEvents: Array<{ channel: string; payload: MemberImportProgressEvent }> = []
  const fakeEvent = { sender: { send: (channel: string, payload: unknown): void => { progressEvents.push({ channel, payload: payload as MemberImportProgressEvent }) } } }
  const previewViaIpc = await previewHandler(fakeEvent, rowsA)
  const previewDirect = await service.previewCheck(rowsA)
  check('T2 preview: valid false', previewViaIpc.valid === false)
  check('T2 preview: errorCount 1', previewViaIpc.errorCount === 1, `errorCount=${previewViaIpc.errorCount}`)
  check('T2 preview: messageKey classNotFound', previewViaIpc.errors[0]?.messageKey === 'memberImport.classNotFound', previewViaIpc.errors[0]?.messageKey)
  check('T2 preview: DTO passthrough tanpa transformasi', JSON.stringify(previewViaIpc) === JSON.stringify(previewDirect))

  // ================= T3 — import IPC sukses + progress forwarding =================
  progressEvents.length = 0
  const rowsB: MemberImportRowInput[] = [
    makeRow({ rowNumber: 1, className: 'XI IPA 2', nisn: '9200001', gender: 'female', email: 'ipc1@test.id', birthDate: '2010-02-20' }),
    makeRow({ rowNumber: 2, className: 'XII TKJ 1', nisn: '9200002' })
  ]
  const resultViaIpc = await importHandler(fakeEvent, rowsB)
  check('T3 import: success true', resultViaIpc.success === true, `success=${resultViaIpc.success}`)
  check('T3 import: created 2', resultViaIpc.created === 2, `created=${resultViaIpc.created}`)
  check('T3 import: failed 0', resultViaIpc.failed === 0, `failed=${resultViaIpc.failed}`)
  check('T3 import: tulis ke DB (count 2)', (await memberCount()) === 2, `count=${await memberCount()}`)
  const ipcMembers = await prisma.member.findMany({ orderBy: { memberNumber: 'asc' } })
  check('T3 import: nomor berurutan S-000001..S-000002', ipcMembers.map((m) => m.memberNumber).join(',') === 'S-000001,S-000002')
  check('T3 import: field mapping tersimpan', ipcMembers[0]?.email === 'ipc1@test.id' && ipcMembers[0]?.gender === 'female')

  const channels = progressEvents.map((e) => e.channel)
  check('T3 progress: semua via channel members:importProgress', channels.length > 0 && channels.every((c) => c === 'members:importProgress'), channels.join(','))
  const stages = progressEvents.map((e) => e.payload.stage)
  const expectedStages: MemberImportStage[] = ['preparing', 'checking-duplicate', 'resolving-class', 'generating-number', 'completed']
  check('T3 progress: semua stage terkirim', expectedStages.every((s) => stages.includes(s)), stages.join(','))
  const lastEvent = progressEvents[progressEvents.length - 1]
  check('T3 progress: event terakhir completed', lastEvent?.payload.stage === 'completed', lastEvent?.payload.stage)
  check('T3 progress: current===total di completed', lastEvent?.payload.current === 2 && lastEvent?.payload.total === 2, `${lastEvent?.payload.current}/${lastEvent?.payload.total}`)

  const ref = await service.import([
    makeRow({ rowNumber: 1, className: 'XI IPA 2', nisn: '9300001' }),
    makeRow({ rowNumber: 2, className: 'XII TKJ 1', nisn: '9300002' })
  ])
  const strip = (r: MemberImportResultDTO): MemberImportResultDTO => ({ ...r, durationMs: 0 })
  check('T3 import: DTO passthrough tanpa transformasi', JSON.stringify(strip(resultViaIpc)) === JSON.stringify(strip(ref)))

  // ================= T4 — business error via IPC -> ResultDTO (bukan throw) =================
  progressEvents.length = 0
  const rowsC: MemberImportRowInput[] = [
    makeRow({ rowNumber: 1, className: 'XI IPA 2', nisn: '9200001' })
  ]
  let bizThrew = false
  let bizResult: MemberImportResultDTO | undefined
  try {
    bizResult = await importHandler(fakeEvent, rowsC)
  } catch {
    bizThrew = true
  }
  check('T4 business error: TIDAK throw', bizThrew === false)
  check('T4 business error: success false', bizResult?.success === false, `success=${bizResult?.success}`)
  check('T4 business error: duplicateNisnInDb', bizResult?.errors[0]?.messageKey === 'memberImport.duplicateNisnInDb', bizResult?.errors[0]?.messageKey)
  check('T4 business error: created 0', bizResult?.created === 0, `created=${bizResult?.created}`)

  // ================= T5 — system error via IPC -> THROW (bukan ResultDTO) =================
  const brokenRepo = {
    createManyWithTx: async (): Promise<number> => {
      throw new Error('database is down')
    }
  } as unknown as MemberRepository
  const brokenService = new MemberImportService(
    new MemberDuplicateChecker(memberRepo),
    new MemberClassResolver(ayRepo, classRepo),
    new NumberGeneratorService(memberRepo),
    brokenRepo
  )
  registerMemberHandlers({}, brokenService)
  const brokenImportHandler = handlers.get('members:import') as unknown as ImportHandler

  const rowsD: MemberImportRowInput[] = [
    makeRow({ rowNumber: 1, className: 'XI IPA 2', nisn: '9400001' })
  ]
  let systemThrew = false
  let systemErrorMessage = ''
  let systemResult: unknown = undefined
  try {
    systemResult = await brokenImportHandler(fakeEvent, rowsD)
  } catch (error) {
    systemThrew = true
    systemErrorMessage = error instanceof Error ? error.message : String(error)
  }
  check('T5 system error: THROW (bukan ResultDTO)', systemThrew && systemErrorMessage === 'database is down', systemErrorMessage)
  check('T5 system error: hasil tidak punya .success', (systemResult as { success?: unknown } | undefined)?.success === undefined)
  check('T5 system error: tidak ada baris tersisa (rollback)', (await prisma.member.count({ where: { nisn: '9400001' } })) === 0)

  // ================= VERIFIKASI =================
  console.log('FINAL_MEMBER_COUNT ' + (await memberCount()))

  await prisma.$disconnect()

  console.log(`P4D SMOKE RESULT: ${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
