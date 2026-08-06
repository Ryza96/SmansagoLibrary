// WO-3 â€” Smoke / Domain Test untuk Provider Framework (backup side) +
// Restore Handler kontrak + Pre-flight decision + DatabaseProvider (DB-backed).
// Bagian murni domain: tanpa DB/Electron. Bagian DatabaseProvider: fresh DB temp.
// Compile: npx tsc --module commonjs --moduleResolution node --target es2022
//   --esModuleInterop --skipLibCheck --rootDir . --outDir <tmp>\out wo3_provider_smoke/smoke.ts
// Run: node <tmp>\out\wo3_provider_smoke\smoke.js   (dengan DATABASE_URL absolute fresh DB)

import fs from 'fs'
import os from 'os'
import path from 'path'
import { createHash } from 'crypto'
import {
  PROVIDER_KINDS,
  isProviderKind,
  ProviderKind,
} from '../src/main/domain/provider/provider-kind'
import {
  ProviderId,
  isProviderIdJSON,
  PROVIDER_ID_MAX_NAME,
  PROVIDER_ID_MAX_VERSION,
} from '../src/main/domain/provider/provider-id'
import {
  PROVIDER_REQUIREMENTS,
  isProviderRequirement,
  PROVIDER_REQUIREMENT_LABEL,
  BackupProvider,
  ProviderCollectResult,
  ProviderVerifyResult,
  ProviderRequirement,
  collectResultOf,
  verifyResultOf,
} from '../src/main/domain/provider/provider'
import {
  RestoreHandler,
  RestoreVerifyResult,
  restoreVerifyResultOf,
} from '../src/main/domain/provider/restore-handler'
import { ProviderRegistry, RestoreHandlerRegistry } from '../src/main/domain/provider/provider-registry'
import {
  PREFLIGHT_STATUS,
  PreflightItem,
  PreflightReport,
  ProviderPreflightState,
  PreflightStatus,
  decideProviderPreflight,
} from '../src/main/domain/provider/preflight'
import { ProviderDomainError } from '../src/main/domain/provider/domain-error'
import { ManifestEntry } from '../src/main/domain/manifest/entry'
import { Checksum } from '../src/main/domain/manifest/checksum'
import { DatabaseProvider, DATABASE_SNAPSHOT_FILENAME } from '../src/main/infrastructure/providers/database.provider'

let passed = 0
let failed = 0

function check(name: string, condition: boolean): void {
  if (condition) {
    passed++
    console.log(`PASS: ${name}`)
  } else {
    failed++
    console.error(`FAIL: ${name}`)
  }
}

function expectThrows(
  name: string,
  fn: () => unknown,
  errorClass: new (...args: never[]) => Error,
  messagePart?: string
): void {
  try {
    fn()
    check(name, false)
  } catch (error) {
    const isDomain = error instanceof errorClass
    const msgOk = messagePart === undefined || (error instanceof Error && error.message.includes(messagePart))
    check(
      `${name} (${errorClass.name}${messagePart !== undefined ? `: ${messagePart}` : ''})`,
      isDomain && msgOk
    )
  }
}

class StubProvider implements BackupProvider {
  constructor(
    public readonly id: ProviderId,
    public readonly kind: ProviderKind,
    public readonly requirement: ProviderRequirement
  ) {}

  async collect(): Promise<ProviderCollectResult> {
    return collectResultOf({ kind: this.kind, relativePath: 'stub.bin', sizeBytes: 1 })
  }

  async verify(): Promise<ProviderVerifyResult> {
    return verifyResultOf(true)
  }

  async cleanup(): Promise<void> {
    return undefined
  }
}

class StubHandler implements RestoreHandler {
  constructor(
    public readonly id: ProviderId,
    public readonly kind: ProviderKind,
    public readonly requirement: ProviderRequirement
  ) {}

  matches(): boolean {
    return false
  }

  async stage(): Promise<void> {
    return undefined
  }

  async verifyStaged(): Promise<RestoreVerifyResult> {
    return restoreVerifyResultOf(true)
  }

  async swapToLive(): Promise<void> {
    return undefined
  }

  async rollbackFrom(): Promise<void> {
    return undefined
  }

  async cleanup(): Promise<void> {
    return undefined
  }
}

const DB_ID = ProviderId.of({ name: 'database', version: '1.0.0' })
const ASSET_ID = ProviderId.of({ name: 'assets', version: '1.0.0' })

// â”€â”€ 1. ProviderKind â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
check('PROVIDER_KINDS.DATABASE === "database"', PROVIDER_KINDS.DATABASE === 'database')
check('PROVIDER_KINDS.ASSET === "asset"', PROVIDER_KINDS.ASSET === 'asset')
check('PROVIDER_KINDS.CONFIGURATION === "configuration"', PROVIDER_KINDS.CONFIGURATION === 'configuration')
check('PROVIDER_KINDS.LOG === "log"', PROVIDER_KINDS.LOG === 'log')
check('PROVIDER_KINDS memiliki 4 nilai', Object.values(PROVIDER_KINDS).length === 4)
check('isProviderKind("database")', isProviderKind('database'))
check('isProviderKind("asset")', isProviderKind('asset'))
check('isProviderKind("configuration")', isProviderKind('configuration'))
check('isProviderKind("log")', isProviderKind('log'))
check('isProviderKind("other") = false', !isProviderKind('other'))
check('isProviderKind("") = false', !isProviderKind(''))
check('isProviderKind(null) = false', !isProviderKind(null))
check('isProviderKind(undefined) = false', !isProviderKind(undefined))
check('isProviderKind(42) = false', !isProviderKind(42))

// â”€â”€ 2. ProviderId â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
check('ProviderId.of valid â†’ name/version/fullName', (() => {
  const id = DB_ID
  return id.name === 'database' && id.version === '1.0.0' && id.fullName === 'database@1.0.0'
})())
check('ProviderId.of trim nama & versi', (() => {
  const id = ProviderId.of({ name: '  database  ', version: ' 1.0.0 ' })
  return id.name === 'database' && id.version === '1.0.0'
})())
check('ProviderId.equals sama â†’ true', DB_ID.equals(ProviderId.of({ name: 'database', version: '1.0.0' })))
check('ProviderId.equals beda nama â†’ false', !DB_ID.equals(ASSET_ID))
check('ProviderId.equals beda versi â†’ false', !DB_ID.equals(ProviderId.of({ name: 'database', version: '2.0.0' })))
check('ProviderId.toJSON', JSON.stringify(DB_ID.toJSON()) === JSON.stringify({ name: 'database', version: '1.0.0' }))
expectThrows('ProviderId nama kosong', () => ProviderId.of({ name: '  ', version: '1' }), ProviderDomainError, 'non-kosong')
expectThrows('ProviderId versi kosong', () => ProviderId.of({ name: 'db', version: ' ' }), ProviderDomainError, 'non-kosong')
expectThrows('ProviderId nama > 64', () => ProviderId.of({ name: 'x'.repeat(PROVIDER_ID_MAX_NAME + 1), version: '1' }), ProviderDomainError, 'maks')
expectThrows('ProviderId versi > 32', () => ProviderId.of({ name: 'db', version: 'y'.repeat(PROVIDER_ID_MAX_VERSION + 1) }), ProviderDomainError, 'maks')
check('isProviderIdJSON valid', isProviderIdJSON({ name: 'database', version: '1.0.0' }))
check('isProviderIdJSON invalid (kosong)', !isProviderIdJSON({ name: '', version: '1' }))
check('isProviderIdJSON invalid (bukan objek)', !isProviderIdJSON('database'))

// â”€â”€ 3. ProviderRequirement â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
check('PROVIDER_REQUIREMENTS.REQUIRED === "required"', PROVIDER_REQUIREMENTS.REQUIRED === 'required')
check('PROVIDER_REQUIREMENTS.OPTIONAL === "optional"', PROVIDER_REQUIREMENTS.OPTIONAL === 'optional')
check('isProviderRequirement("required")', isProviderRequirement('required'))
check('isProviderRequirement("optional")', isProviderRequirement('optional'))
check('isProviderRequirement("mandatory") = false', !isProviderRequirement('mandatory'))
check('label required = WAJIB', PROVIDER_REQUIREMENT_LABEL.required === 'WAJIB')
check('label optional = OPSIONAL', PROVIDER_REQUIREMENT_LABEL.optional === 'OPSIONAL')

// â”€â”€ 4. collectResultOf / verifyResultOf â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
check('collectResultOf valid', (() => {
  const r = collectResultOf({ kind: 'database', relativePath: 'aplibrary.db', sizeBytes: 100 })
  return r.kind === 'database' && r.relativePath === 'aplibrary.db' && r.sizeBytes === 100
})())
expectThrows('collectResultOf kind invalid', () => collectResultOf({ kind: 'meta' as ProviderKind, relativePath: 'x', sizeBytes: 1 }), ProviderDomainError, 'kind')
expectThrows('collectResultOf path kosong', () => collectResultOf({ kind: 'database', relativePath: '', sizeBytes: 1 }), ProviderDomainError, 'relativePath')
expectThrows('collectResultOf size negatif', () => collectResultOf({ kind: 'database', relativePath: 'x', sizeBytes: -1 }), ProviderDomainError, 'sizeBytes')
expectThrows('collectResultOf size non-integer', () => collectResultOf({ kind: 'database', relativePath: 'x', sizeBytes: 1.5 }), ProviderDomainError, 'sizeBytes')

check('verifyResultOf valid', (() => {
  const r = verifyResultOf(true)
  return r.ok === true && Array.isArray(r.messages) && r.messages.length === 0
})())
check('verifyResultOf immutability (copy messages)', (() => {
  const messages = ['a']
  const r = verifyResultOf(false, messages)
  messages.push('b')
  return r.messages.length === 1 && r.messages[0] === 'a'
})())
expectThrows('verifyResultOf ok non-boolean', () => verifyResultOf('yes' as unknown as boolean), ProviderDomainError, 'ok')
expectThrows('verifyResultOf messages non-array', () => verifyResultOf(true, 'x' as unknown as string[]), ProviderDomainError, 'messages')

// â”€â”€ 5. ProviderRegistry â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const registry = new ProviderRegistry()
check('registry kosong â†’ count 0', registry.count() === 0)
check('registry.discover kosong â†’ []', registry.discover().length === 0)
registry.register(new StubProvider(DB_ID, 'database', 'required'))
check('registry count = 1', registry.count() === 1)
check('registry.discover = [provider]', registry.discover().length === 1 && registry.discover()[0].id.equals(DB_ID))
check('registry.discover = copy (mutasi tidak memengaruhi)', (() => {
  const discovered = registry.discover()
  discovered.length = 0
  return registry.count() === 1
})())
expectThrows('registry register duplikat â†’ throw', () => registry.register(new StubProvider(DB_ID, 'database', 'required')), ProviderDomainError, 'sudah terdaftar')
check('registry.findById match', registry.findById(DB_ID)?.id.equals(DB_ID) === true)
check('registry.findById miss â†’ undefined', registry.findById(ASSET_ID) === undefined)
check('registry.findByKind database â†’ 1', registry.findByKind('database').length === 1)
check('registry.findByKind asset â†’ 0', registry.findByKind('asset').length === 0)
registry.register(new StubProvider(ASSET_ID, 'asset', 'optional'))
check('registry requiredProviders â†’ hanya database', (() => {
  const required = registry.requiredProviders()
  return required.length === 1 && required[0].id.name === 'database'
})())
check('registry optionalProviders â†’ hanya assets', (() => {
  const optional = registry.optionalProviders()
  return optional.length === 1 && optional[0].id.name === 'assets'
})())

// â”€â”€ 6. RestoreHandlerRegistry â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const handlerRegistry = new RestoreHandlerRegistry()
check('handlerRegistry kosong â†’ count 0', handlerRegistry.count() === 0)
handlerRegistry.register(new StubHandler(DB_ID, 'database', 'required'))
check('handlerRegistry count = 1', handlerRegistry.count() === 1)
check('handlerRegistry.findByKind database â†’ 1', handlerRegistry.findByKind('database').length === 1)
check('handlerRegistry.findByKind log â†’ 0', handlerRegistry.findByKind('log').length === 0)
check('handlerRegistry.findById match', handlerRegistry.findById(DB_ID)?.id.name === 'database')
check('handlerRegistry.findById miss â†’ undefined', handlerRegistry.findById(ASSET_ID) === undefined)
expectThrows('handlerRegistry register duplikat â†’ throw', () => handlerRegistry.register(new StubHandler(DB_ID, 'database', 'required')), ProviderDomainError, 'sudah terdaftar')
handlerRegistry.register(new StubHandler(ASSET_ID, 'asset', 'optional'))
check('handlerRegistry requiredHandlers â†’ hanya database', handlerRegistry.requiredHandlers().length === 1)
check('handlerRegistry optionalHandlers â†’ hanya assets', handlerRegistry.optionalHandlers().length === 1)
check('restoreVerifyResultOf valid', (() => {
  const r = restoreVerifyResultOf(true)
  return r.ok === true && r.messages.length === 0
})())
check('restoreVerifyResultOf immutability', (() => {
  const messages = ['x']
  const r = restoreVerifyResultOf(false, messages)
  messages.push('y')
  return r.messages.length === 1
})())
expectThrows('restoreVerifyResultOf ok non-boolean', () => restoreVerifyResultOf('n' as unknown as boolean), ProviderDomainError, 'ok')

// â”€â”€ 7. PreflightItem / PreflightReport â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
check('PreflightItem.of valid', (() => {
  const item = PreflightItem.of({ name: 'db-ada', status: 'pass', message: 'ok' })
  return item.name === 'db-ada' && item.status === 'pass' && item.message === 'ok'
})())
check('PREFLIGHT_STATUS.PASS === "pass"', PREFLIGHT_STATUS.PASS === 'pass')
check('PREFLIGHT_STATUS.FAIL === "fail"', PREFLIGHT_STATUS.FAIL === 'fail')
check('PREFLIGHT_STATUS.WARNING === "warning"', PREFLIGHT_STATUS.WARNING === 'warning')
expectThrows('PreflightItem name kosong', () => PreflightItem.of({ name: '  ', status: 'pass', message: 'x' }), ProviderDomainError, 'non-kosong')
expectThrows('PreflightItem status invalid', () => PreflightItem.of({ name: 'a', status: 'unknown' as PreflightStatus, message: 'x' }), ProviderDomainError, 'status')
expectThrows('PreflightItem message non-string', () => PreflightItem.of({ name: 'a', status: 'pass', message: 1 as unknown as string }), ProviderDomainError, 'message')

const PASS_ITEM = PreflightItem.of({ name: 'db-ada', status: 'pass', message: 'ok' })
const FAIL_ITEM = PreflightItem.of({ name: 'db-tidak-ada', status: 'fail', message: 'tidak ditemukan' })
const WARN_ITEM = PreflightItem.of({ name: 'aset-lewat', status: 'warning', message: 'di-skip' })

check('PreflightReport kosong â†’ ok', PreflightReport.of([]).ok === true)
check('PreflightReport kosong â†’ tanpa warning', PreflightReport.of([]).hasWarning === false)
check('PreflightReport pass â†’ ok', PreflightReport.of([PASS_ITEM]).ok === true)
check('PreflightReport fail â†’ !ok', PreflightReport.of([FAIL_ITEM]).ok === false)
check('PreflightReport warning â†’ ok + hasWarning', (() => {
  const report = PreflightReport.of([WARN_ITEM])
  return report.ok === true && report.hasWarning === true
})())
check('PreflightReport fail + warning â†’ !ok + hasWarning', (() => {
  const report = PreflightReport.of([FAIL_ITEM, WARN_ITEM])
  return report.ok === false && report.hasWarning === true
})())
check('PreflightReport.failedItems hanya fail', (() => {
  const report = PreflightReport.of([PASS_ITEM, FAIL_ITEM, WARN_ITEM])
  return report.failedItems.length === 1 && report.failedItems[0].name === 'db-tidak-ada'
})())
check('PreflightReport.warningItems hanya warning', (() => {
  const report = PreflightReport.of([PASS_ITEM, FAIL_ITEM, WARN_ITEM])
  return report.warningItems.length === 1 && report.warningItems[0].name === 'aset-lewat'
})())
expectThrows('PreflightReport non-array', () => PreflightReport.of('x' as unknown as PreflightItem[]), ProviderDomainError, 'array')
expectThrows('PreflightReport elemen non-item', () => PreflightReport.of([{} as unknown as PreflightItem]), ProviderDomainError, 'PreflightItem')
check('PreflightReport.items = copy (mutasi tidak memengaruhi)', (() => {
  const report = PreflightReport.of([PASS_ITEM])
  const items = report.items
  items.length = 0
  return report.items.length === 1
})())

// â”€â”€ 8. decideProviderPreflight â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
check('decide: semua pass â†’ proceed', (() => {
  const d = decideProviderPreflight([
    { providerId: DB_ID, requirement: 'required', status: 'pass', message: 'ok' },
  ] as ProviderPreflightState[])
  return d.proceed === true && d.abortedBecause.length === 0 && d.skippedProviders.length === 0 && d.warnings.length === 0
})())
check('decide: WAJIB fail â†’ abort', (() => {
  const d = decideProviderPreflight([
    { providerId: DB_ID, requirement: 'required', status: 'fail', message: 'tidak ditemukan' },
  ] as ProviderPreflightState[])
  return d.proceed === false && d.abortedBecause.length === 1 && d.abortedBecause[0].includes('database@1.0.0')
})())
check('decide: OPSIONAL fail â†’ proceed + skipped + warning', (() => {
  const d = decideProviderPreflight([
    { providerId: ASSET_ID, requirement: 'optional', status: 'fail', message: 'gagal' },
  ] as ProviderPreflightState[])
  return d.proceed === true && d.skippedProviders.length === 1 && d.skippedProviders[0] === 'assets@1.0.0' && d.warnings.length === 1
})())
check('decide: campuran WAJIB fail + OPSIONAL fail â†’ abort keduanya tercatat', (() => {
  const d = decideProviderPreflight([
    { providerId: DB_ID, requirement: 'required', status: 'fail', message: 'x' },
    { providerId: ASSET_ID, requirement: 'optional', status: 'fail', message: 'y' },
  ] as ProviderPreflightState[])
  return d.proceed === false && d.abortedBecause.length === 1 && d.skippedProviders.length === 1 && d.warnings.length === 1
})())
check('decide: OPSIONAL warning â†’ proceed + warning tanpa skip', (() => {
  const d = decideProviderPreflight([
    { providerId: ASSET_ID, requirement: 'optional', status: 'warning', message: 'soft' },
  ] as ProviderPreflightState[])
  return d.proceed === true && d.skippedProviders.length === 0 && d.warnings.length === 1
})())
check('decide: WAJIB warning â†’ proceed + warning tanpa abort', (() => {
  const d = decideProviderPreflight([
    { providerId: DB_ID, requirement: 'required', status: 'warning', message: 'soft' },
  ] as ProviderPreflightState[])
  return d.proceed === true && d.abortedBecause.length === 0 && d.warnings.length === 1
})())
check('decide: hasil murni (tanpa mutasi input)', (() => {
  const states: ProviderPreflightState[] = [
    { providerId: ASSET_ID, requirement: 'optional', status: 'fail', message: 'y' },
  ]
  const d = decideProviderPreflight(states)
  states.push({ providerId: DB_ID, requirement: 'required', status: 'fail', message: 'x' })
  return d.proceed === true && d.skippedProviders.length === 1
})())

// â”€â”€ 9. DatabaseProvider (DB-backed, fresh DB) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function databaseProviderSection(): Promise<void> {
  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wo3-provider-staging-'))
  try {
    const provider = new DatabaseProvider({ stagingDir })
    check('DatabaseProvider.id.name === "database"', provider.id.name === 'database')
    check('DatabaseProvider.kind === "database"', provider.kind === 'database')
    check('DatabaseProvider.requirement === "required"', provider.requirement === 'required')
    check('DatabaseProvider.engine vacuum-into (via id.version)', provider.id.version === '1.0.0')

    const result = await provider.collect()
    check('collect â†’ kind database', result.kind === 'database')
    check('collect â†’ relativePath aplibrary.db', result.relativePath === DATABASE_SNAPSHOT_FILENAME)
    check('collect â†’ sizeBytes > 0', result.sizeBytes > 0)
    check('collect â†’ file snapshot ada di staging', fs.existsSync(provider.snapshotPath))
    check('collect â†’ ukuran file == sizeBytes', fs.statSync(provider.snapshotPath).size === result.sizeBytes)

    const sha256Hex = createHash('sha256').update(fs.readFileSync(provider.snapshotPath)).digest('hex')
    const entry = ManifestEntry.of({
      path: DATABASE_SNAPSHOT_FILENAME,
      sizeBytes: result.sizeBytes,
      sha256: Checksum.of(sha256Hex),
      kind: 'database',
    })
    check('ManifestEntry valid dari hasil collect', entry.path === DATABASE_SNAPSHOT_FILENAME)

    const verifyOk = await provider.verify(entry)
    check('verify(snapshot asli) â†’ ok', verifyOk.ok === true)
    check('verify(snapshot asli) â†’ tanpa pesan', verifyOk.messages.length === 0)

    const wrongEntry = ManifestEntry.of({
      path: DATABASE_SNAPSHOT_FILENAME,
      sizeBytes: result.sizeBytes,
      sha256: Checksum.of('b'.repeat(64)),
      kind: 'database',
    })
    const verifyWrong = await provider.verify(wrongEntry)
    check('verify(checksum salah) â†’ !ok', verifyWrong.ok === false)
    check('verify(checksum salah) â†’ pesan sha256', verifyWrong.messages.some((m) => m.includes('sha256')))

    const badSizeEntry = ManifestEntry.of({
      path: DATABASE_SNAPSHOT_FILENAME,
      sizeBytes: result.sizeBytes + 1,
      sha256: Checksum.of(sha256Hex),
      kind: 'database',
    })
    const verifyBadSize = await provider.verify(badSizeEntry)
    check('verify(ukuran salah) â†’ !ok', verifyBadSize.ok === false)

    await provider.cleanup()
    check('cleanup â†’ file snapshot dihapus', !fs.existsSync(provider.snapshotPath))

    const verifyMissing = await provider.verify(entry)
    check('verify(file tidak ada) â†’ !ok', verifyMissing.ok === false)

    const result2 = await provider.collect()
    check('collect ulang (idempoten, unlink dulu) â†’ sukses', result2.sizeBytes > 0)
    const sha256Hex2 = createHash('sha256').update(fs.readFileSync(provider.snapshotPath)).digest('hex')
    const entry2 = ManifestEntry.of({
      path: DATABASE_SNAPSHOT_FILENAME,
      sizeBytes: result2.sizeBytes,
      sha256: Checksum.of(sha256Hex2),
      kind: 'database',
    })
    const verify2 = await provider.verify(entry2)
    check('verify(collect ulang) â†’ ok', verify2.ok === true)
  } finally {
    try {
      fs.rmSync(stagingDir, { recursive: true, force: true })
    } catch {
      // ignore cleanup failure
    }
  }
}

async function main(): Promise<void> {
  await databaseProviderSection()

  console.log(`\nRESULT ${passed} passed, ${failed} failed`)
  if (failed > 0) {
    process.exit(1)
  }
}

main().catch((error) => {
  console.error('FATAL', error)
  process.exit(1)
})

