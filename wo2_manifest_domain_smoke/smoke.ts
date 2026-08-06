// WO-2 — Smoke / Domain Test untuk Manifest Domain (murni, tanpa DB/Electron).
// Menguji 7 komponen: Manifest Model, Manifest Metadata, Manifest Entry,
// Manifest Summary, Manifest Validator, Schema Version VO, Checksum VO.
// Compile: npx tsc --module commonjs --moduleResolution node --target es2022
//   --esModuleInterop --skipLibCheck --rootDir . --outDir <tmp>\out wo2_manifest_domain_smoke/smoke.ts
// Run: node <tmp>\out\wo2_manifest_domain_smoke\smoke.js

import {
  SchemaVersion,
  isSchemaVersion,
  SCHEMA_VERSION_MAX_LENGTH,
} from '../src/main/domain/manifest/schema-version'
import { Checksum, isChecksum, SHA256_HEX_LENGTH } from '../src/main/domain/manifest/checksum'
import {
  ManifestMetadata,
  isNonEmptyString,
  isPositiveInteger,
  MANIFEST_BACKUP_VERSION,
  MANIFEST_BACKUP_TYPE_FULL,
} from '../src/main/domain/manifest/metadata'
import {
  ManifestEntry,
  MANIFEST_ENTRY_KINDS,
  isManifestEntryKind,
  isRelativeManifestPath,
  isNonNegativeInteger,
} from '../src/main/domain/manifest/entry'
import { ManifestSummary } from '../src/main/domain/manifest/summary'
import { Manifest, MANIFEST_FORMAT, isManifestJSON } from '../src/main/domain/manifest/manifest'
import { ManifestValidator } from '../src/main/domain/manifest/validator'
import { ManifestDomainError } from '../src/main/domain/manifest/domain-error'

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

function expectThrows(name: string, fn: () => unknown, messagePart?: string): void {
  try {
    fn()
    check(name, false)
  } catch (error) {
    const isDomain = error instanceof ManifestDomainError
    const msgOk = messagePart === undefined || (error instanceof Error && error.message.includes(messagePart))
    check(`${name} (domain-error${messagePart !== undefined ? `: ${messagePart}` : ''})`, isDomain && msgOk)
  }
}

const DB_SHA = 'a'.repeat(64)
const ASSET_SHA = 'c'.repeat(64)
const MANIFEST_SHA = 'b'.repeat(64)

function validManifestJson(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    format: MANIFEST_FORMAT,
    meta: {
      backupVersion: MANIFEST_BACKUP_VERSION,
      appVersion: '1.0.0',
      schemaVersion: '20260731_adr002_initial',
      createdAt: '2026-08-05T00:00:00.000Z',
      appName: 'APLibrary',
      type: MANIFEST_BACKUP_TYPE_FULL,
    },
    files: [
      { path: 'aplibrary.db', sizeBytes: 4096, sha256: DB_SHA, kind: MANIFEST_ENTRY_KINDS.DATABASE },
      { path: 'assets/school-logo.png', sizeBytes: 1024, sha256: ASSET_SHA, kind: MANIFEST_ENTRY_KINDS.ASSET },
    ],
    summary: { files: 2, totalBytes: 5120, tables: 11, members: 395 },
    checksums: { manifestSha256: MANIFEST_SHA },
    ...overrides,
  }
}

function metaOverride(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const base = validManifestJson()
  return { ...(base.meta as Record<string, unknown>), ...overrides }
}

// =====================================================================
// 1. SchemaVersion Value Object
// =====================================================================
check('SchemaVersion.of valid: nilai dipertahankan', SchemaVersion.of('20260731_adr002_initial').value === '20260731_adr002_initial')
check('SchemaVersion.of valid: identitas migration', SchemaVersion.of('20260803_wo2_f2a_master_data_akademik').value.includes('wo2_f2a'))
expectThrows('SchemaVersion.of kosong ditolak', () => SchemaVersion.of(''))
expectThrows('SchemaVersion.of spasi ditolak', () => SchemaVersion.of('   '))
expectThrows('SchemaVersion.of karakter kontrol ditolak', () => SchemaVersion.of('a\u0000b'))
expectThrows('SchemaVersion.of > maks ditolak', () => SchemaVersion.of('x'.repeat(SCHEMA_VERSION_MAX_LENGTH + 1)))
check('SchemaVersion.of trim: nilai kanonik', SchemaVersion.of('  20260731  ').value === '20260731')
check('SchemaVersion.isValid menerima string valid', isSchemaVersion('v1'))
check('SchemaVersion.isValid menolak undefined/object/number', !isSchemaVersion(undefined) && !isSchemaVersion({}) && !isSchemaVersion(5))
check('SchemaVersion.equals: sama', SchemaVersion.of('a').equals(SchemaVersion.of('a')))
check('SchemaVersion.equals: beda', !SchemaVersion.of('a').equals(SchemaVersion.of('b')))
check('SchemaVersion.equals: spasi dinormalisasi', SchemaVersion.of(' a ').equals(SchemaVersion.of('a')))
check('SchemaVersion.of panjang maks diterima', SchemaVersion.of('x'.repeat(SCHEMA_VERSION_MAX_LENGTH)).value.length === SCHEMA_VERSION_MAX_LENGTH)

// =====================================================================
// 2. Checksum Value Object
// =====================================================================
check('Checksum.of valid 64-hex', Checksum.of(DB_SHA).value === DB_SHA)
check('Checksum.of uppercase dinormalisasi lowercase', Checksum.of(DB_SHA.toUpperCase()).value === DB_SHA)
check('Checksum.of spasi di-trim', Checksum.of(`  ${DB_SHA}  `).value === DB_SHA)
expectThrows('Checksum.of 63 hex ditolak', () => Checksum.of('a'.repeat(SHA256_HEX_LENGTH - 1)))
expectThrows('Checksum.of 65 hex ditolak', () => Checksum.of('a'.repeat(SHA256_HEX_LENGTH + 1)))
expectThrows('Checksum.of non-hex ditolak', () => Checksum.of('g'.repeat(64)))
expectThrows('Checksum.of kosong ditolak', () => Checksum.of(''))
expectThrows('Checksum.of campuran hex+nonhex ditolak', () => Checksum.of('a'.repeat(63) + 'z'))
check('Checksum.isValid format', isChecksum(DB_SHA) && isChecksum(DB_SHA.toUpperCase()))
check('Checksum.isValid menolak salah panjang', !isChecksum('abc'))
check('Checksum.equals: sama', Checksum.of(DB_SHA).equals(Checksum.of(DB_SHA)))
check('Checksum.equals: uppercase == lowercase', Checksum.of(DB_SHA).equals(Checksum.of(DB_SHA.toUpperCase())))

// =====================================================================
// 3. ManifestMetadata Value Object
// =====================================================================
{
  const meta = ManifestMetadata.of({
    backupVersion: MANIFEST_BACKUP_VERSION,
    appVersion: '1.0.0',
    schemaVersion: SchemaVersion.of('20260731_adr002_initial'),
    createdAt: new Date('2026-08-05T00:00:00.000Z'),
    appName: 'APLibrary',
    type: MANIFEST_BACKUP_TYPE_FULL,
  })
  check('ManifestMetadata.of valid: getter', meta.backupVersion === 1 && meta.appVersion === '1.0.0' && meta.type === 'full')
  check('ManifestMetadata.of valid: schemaVersion getter', meta.schemaVersion.value === '20260731_adr002_initial')
  check('ManifestMetadata.of valid: createdAt getter', meta.createdAt.toISOString() === '2026-08-05T00:00:00.000Z')
  check('ManifestMetadata.toJSON: field wajib + ISO', meta.toJSON().createdAt === '2026-08-05T00:00:00.000Z' && meta.toJSON().schemaVersion === '20260731_adr002_initial')
  const json = meta.toJSON()
  check('ManifestMetadata.toJSON: engine/integrity opsional tidak muncul', !('engine' in json) && !('integrity' in json))
  const metaFull = ManifestMetadata.of({
    backupVersion: 1,
    appVersion: '1.0.0',
    schemaVersion: SchemaVersion.of('s'),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    appName: 'APLibrary',
    type: 'full',
    engine: 'aplibrary-backup@1',
    integrity: 'sha256',
  })
  check('ManifestMetadata.toJSON: engine/integrity opsional tampil', metaFull.toJSON().engine === 'aplibrary-backup@1' && metaFull.toJSON().integrity === 'sha256')
}
expectThrows('ManifestMetadata.of backupVersion 0 ditolak', () => ManifestMetadata.of({ backupVersion: 0, appVersion: '1', schemaVersion: SchemaVersion.of('s'), createdAt: new Date(), appName: 'A', type: 'full' }))
expectThrows('ManifestMetadata.of backupVersion negatif ditolak', () => ManifestMetadata.of({ backupVersion: -1, appVersion: '1', schemaVersion: SchemaVersion.of('s'), createdAt: new Date(), appName: 'A', type: 'full' }))
expectThrows('ManifestMetadata.of backupVersion pecahan ditolak', () => ManifestMetadata.of({ backupVersion: 1.5, appVersion: '1', schemaVersion: SchemaVersion.of('s'), createdAt: new Date(), appName: 'A', type: 'full' }))
expectThrows('ManifestMetadata.of appVersion kosong ditolak', () => ManifestMetadata.of({ backupVersion: 1, appVersion: '  ', schemaVersion: SchemaVersion.of('s'), createdAt: new Date(), appName: 'A', type: 'full' }))
expectThrows('ManifestMetadata.of appName kosong ditolak', () => ManifestMetadata.of({ backupVersion: 1, appVersion: '1', schemaVersion: SchemaVersion.of('s'), createdAt: new Date(), appName: '', type: 'full' }))
expectThrows('ManifestMetadata.of type kosong ditolak', () => ManifestMetadata.of({ backupVersion: 1, appVersion: '1', schemaVersion: SchemaVersion.of('s'), createdAt: new Date(), appName: 'A', type: '' }))
expectThrows('ManifestMetadata.of schemaVersion string ditolak', () => ManifestMetadata.of({ backupVersion: 1, appVersion: '1', schemaVersion: SchemaVersion.of('s').value as never, createdAt: new Date(), appName: 'A', type: 'full' }))
expectThrows('ManifestMetadata.of createdAt invalid ditolak', () => ManifestMetadata.of({ backupVersion: 1, appVersion: '1', schemaVersion: SchemaVersion.of('s'), createdAt: new Date('nonsense'), appName: 'A', type: 'full' }))
check('isPositiveInteger helpers', isPositiveInteger(1) && !isPositiveInteger(0) && !isPositiveInteger(1.5) && !isPositiveInteger('1'))
check('isNonEmptyString helper', isNonEmptyString('x') && !isNonEmptyString('') && !isNonEmptyString('  ') && !isNonEmptyString(5))

// =====================================================================
// 4. ManifestEntry Value Object + aturan path relatif
// =====================================================================
{
  const entry = ManifestEntry.of({ path: 'aplibrary.db', sizeBytes: 4096, sha256: Checksum.of(DB_SHA), kind: MANIFEST_ENTRY_KINDS.DATABASE })
  check('ManifestEntry.of valid: getter', entry.path === 'aplibrary.db' && entry.sizeBytes === 4096 && entry.kind === 'database')
  check('ManifestEntry.of valid: sha256 getter', entry.sha256.value === DB_SHA)
  const json = entry.toJSON()
  check('ManifestEntry.toJSON: struktur', json.path === 'aplibrary.db' && json.sha256 === DB_SHA && json.kind === 'database' && json.sizeBytes === 4096)
}
expectThrows('ManifestEntry.of sizeBytes negatif ditolak', () => ManifestEntry.of({ path: 'a.db', sizeBytes: -1, sha256: Checksum.of(DB_SHA), kind: MANIFEST_ENTRY_KINDS.DATABASE }))
expectThrows('ManifestEntry.of sizeBytes pecahan ditolak', () => ManifestEntry.of({ path: 'a.db', sizeBytes: 1.5, sha256: Checksum.of(DB_SHA), kind: MANIFEST_ENTRY_KINDS.DATABASE }))
expectThrows('ManifestEntry.of kind tidak dikenal ditolak', () => ManifestEntry.of({ path: 'a.db', sizeBytes: 1, sha256: Checksum.of(DB_SHA), kind: 'backup' as never }))
expectThrows('ManifestEntry.of kind uppercase ditolak', () => ManifestEntry.of({ path: 'a.db', sizeBytes: 1, sha256: Checksum.of(DB_SHA), kind: 'DATABASE' as never }))
expectThrows('ManifestEntry.of sha256 bukan Checksum ditolak', () => ManifestEntry.of({ path: 'a.db', sizeBytes: 1, sha256: DB_SHA as never, kind: MANIFEST_ENTRY_KINDS.DATABASE }))
expectThrows('ManifestEntry.of path absolut ditolak', () => ManifestEntry.of({ path: '/etc/a.db', sizeBytes: 1, sha256: Checksum.of(DB_SHA), kind: MANIFEST_ENTRY_KINDS.DATABASE }))

check('isManifestEntryKind: database/asset/log', isManifestEntryKind('database') && isManifestEntryKind('asset') && isManifestEntryKind('log'))
check('isManifestEntryKind: menolak lainnya', !isManifestEntryKind('backup') && !isManifestEntryKind('DATABASE') && !isManifestEntryKind(undefined))
check('isRelativeManifestPath: file root', isRelativeManifestPath('aplibrary.db'))
check('isRelativeManifestPath: nested', isRelativeManifestPath('assets/school-logo.png'))
check('isRelativeManifestPath: deep', isRelativeManifestPath('backup/manual/2026/file.txt'))
check('isRelativeManifestPath: spasi dalam nama', isRelativeManifestPath('assets/my file.png'))
check('isRelativeManifestPath: kosong ditolak', !isRelativeManifestPath(''))
check('isRelativeManifestPath: "." ditolak', !isRelativeManifestPath('.'))
check('isRelativeManifestPath: ".." ditolak', !isRelativeManifestPath('..'))
check('isRelativeManifestPath: leading slash ditolak', !isRelativeManifestPath('/etc/passwd'))
check('isRelativeManifestPath: leading backslash ditolak', !isRelativeManifestPath('\\foo'))
check('isRelativeManifestPath: backslash di tengah ditolak', !isRelativeManifestPath('foo\\bar'))
check('isRelativeManifestPath: traversal ditolak', !isRelativeManifestPath('foo/../bar'))
check('isRelativeManifestPath: leading ../ ditolak', !isRelativeManifestPath('../secret'))
check('isRelativeManifestPath: double slash ditolak', !isRelativeManifestPath('foo//bar'))
check('isRelativeManifestPath: ./ segment ditolak', !isRelativeManifestPath('foo/./bar'))
check('isRelativeManifestPath: trailing slash ditolak', !isRelativeManifestPath('foo/'))
check('isRelativeManifestPath: drive letter ditolak', !isRelativeManifestPath('C:/x') && !isRelativeManifestPath('C:x'))
check('isRelativeManifestPath: UNC ditolak', !isRelativeManifestPath('//server/share'))
check('isRelativeManifestPath: URI scheme ditolak', !isRelativeManifestPath('http://x/y'))
check('isRelativeManifestPath: kontrol ditolak', !isRelativeManifestPath('a\u0000b'))
check('isRelativeManifestPath: non-string ditolak', !isRelativeManifestPath(5) && !isRelativeManifestPath(undefined) && !isRelativeManifestPath(['a']))
check('isNonNegativeInteger helper', isNonNegativeInteger(0) && isNonNegativeInteger(4096) && !isNonNegativeInteger(-1) && !isNonNegativeInteger(1.5) && !isNonNegativeInteger('5'))

// =====================================================================
// 5. ManifestSummary Value Object
// =====================================================================
{
  const summary = ManifestSummary.of({ files: 2, totalBytes: 5120, tables: 11, members: 395 })
  check('ManifestSummary.of valid: getter', summary.files === 2 && summary.totalBytes === 5120 && summary.tables === 11 && summary.members === 395)
  const json = summary.toJSON()
  check('ManifestSummary.toJSON: semua field', json.files === 2 && json.totalBytes === 5120 && json.tables === 11 && json.members === 395)
  const minimal = ManifestSummary.of({ files: 0, totalBytes: 0 })
  check('ManifestSummary.of tanpa tables/members', minimal.tables === undefined && minimal.members === undefined)
  check('ManifestSummary.toJSON tanpa opsional', !('tables' in minimal.toJSON()) && !('members' in minimal.toJSON()))
}
expectThrows('ManifestSummary.of files negatif ditolak', () => ManifestSummary.of({ files: -1, totalBytes: 0 }))
expectThrows('ManifestSummary.of totalBytes negatif ditolak', () => ManifestSummary.of({ files: 0, totalBytes: -1 }))
expectThrows('ManifestSummary.of tables negatif ditolak', () => ManifestSummary.of({ files: 0, totalBytes: 0, tables: -1 }))
expectThrows('ManifestSummary.of members negatif ditolak', () => ManifestSummary.of({ files: 0, totalBytes: 0, members: -1 }))
expectThrows('ManifestSummary.of files pecahan ditolak', () => ManifestSummary.of({ files: 1.5, totalBytes: 0 }))

// =====================================================================
// 6. Manifest Model (create + toJSON)
// =====================================================================
{
  const manifest = Manifest.create({
    format: MANIFEST_FORMAT,
    meta: ManifestMetadata.of({
      backupVersion: 1,
      appVersion: '1.0.0',
      schemaVersion: SchemaVersion.of('20260731_adr002_initial'),
      createdAt: new Date('2026-08-05T00:00:00.000Z'),
      appName: 'APLibrary',
      type: 'full',
    }),
    files: [
      ManifestEntry.of({ path: 'aplibrary.db', sizeBytes: 4096, sha256: Checksum.of(DB_SHA), kind: MANIFEST_ENTRY_KINDS.DATABASE }),
    ],
    summary: ManifestSummary.of({ files: 1, totalBytes: 4096 }),
    checksums: { manifestSha256: Checksum.of(MANIFEST_SHA) },
  })
  check('Manifest.create valid: getter format', manifest.format === MANIFEST_FORMAT)
  check('Manifest.create valid: files len', manifest.files.length === 1)
  const json = manifest.toJSON()
  check('Manifest.toJSON: format', json.format === 'aplibrary-backup')
  check('Manifest.toJSON: meta.schemaVersion string', json.meta.schemaVersion === '20260731_adr002_initial')
  check('Manifest.toJSON: files[0] sha256', json.files[0].sha256 === DB_SHA)
  check('Manifest.toJSON: summary', json.summary.files === 1 && json.summary.totalBytes === 4096)
  check('Manifest.toJSON: checksums.manifestSha256', json.checksums.manifestSha256 === MANIFEST_SHA)
  check('Manifest.toJSON: createdAt ISO', json.meta.createdAt === '2026-08-05T00:00:00.000Z')
}
expectThrows('Manifest.create format salah ditolak', () => Manifest.create({ format: 'other', meta: null as never, files: [], summary: null as never, checksums: { manifestSha256: null as never } }))
expectThrows('Manifest.create meta bukan Metadata ditolak', () => Manifest.create({ format: MANIFEST_FORMAT, meta: null as never, files: [], summary: null as never, checksums: { manifestSha256: null as never } }))
expectThrows('Manifest.create files bukan array ditolak', () => Manifest.create({ format: MANIFEST_FORMAT, meta: ManifestMetadata.of({ backupVersion: 1, appVersion: '1', schemaVersion: SchemaVersion.of('s'), createdAt: new Date(), appName: 'A', type: 'full' }), files: null as never, summary: null as never, checksums: { manifestSha256: null as never } }))
expectThrows('Manifest.create files berisi non-entry ditolak', () => Manifest.create({ format: MANIFEST_FORMAT, meta: ManifestMetadata.of({ backupVersion: 1, appVersion: '1', schemaVersion: SchemaVersion.of('s'), createdAt: new Date(), appName: 'A', type: 'full' }), files: [null as never], summary: null as never, checksums: { manifestSha256: null as never } }))
expectThrows('Manifest.create checksums manifestSha256 bukan Checksum ditolak', () => Manifest.create({ format: MANIFEST_FORMAT, meta: ManifestMetadata.of({ backupVersion: 1, appVersion: '1', schemaVersion: SchemaVersion.of('s'), createdAt: new Date(), appName: 'A', type: 'full' }), files: [], summary: ManifestSummary.of({ files: 0, totalBytes: 0 }), checksums: { manifestSha256: MANIFEST_SHA as never } }))
check('isManifestJSON: objek valid', isManifestJSON(validManifestJson()))
check('isManifestJSON: format salah', !isManifestJSON({ ...validManifestJson(), format: 'x' }))
check('isManifestJSON: null/array', !isManifestJSON(null) && !isManifestJSON([]))
check('isManifestJSON: files bukan array', !isManifestJSON({ ...validManifestJson(), files: 'x' }))

// =====================================================================
// 7. Manifest Validator — kasus valid + additive-only
// =====================================================================
{
  const validator = new ManifestValidator()
  const result = validator.validate(validManifestJson())
  check('Validator valid: ok true', result.ok === true)
  if (result.ok === true) {
    check('Validator valid: manifest tipe Manifest', result.manifest instanceof Manifest)
    check('Validator valid: meta.schemaVersion ter-bind', result.manifest.meta.schemaVersion.value === '20260731_adr002_initial')
    check('Validator valid: files dipertahankan', result.manifest.files.length === 2 && result.manifest.files[1].path === 'assets/school-logo.png')
    check('Validator valid: summary dipertahankan', result.manifest.summary.tables === 11 && result.manifest.summary.members === 395)
    check('Validator valid: checksum dipertahankan', result.manifest.checksums.manifestSha256.value === MANIFEST_SHA)
    const roundTrip = JSON.stringify(result.manifest.toJSON())
    const original = JSON.stringify(validManifestJson())
    check('Validator valid: toJSON round-trip identik', roundTrip === original)
  }
  const additive = validator.validate({
    ...validManifestJson(),
    extraTop: { anything: true },
    meta: { ...(validManifestJson().meta as Record<string, unknown>), extraMeta: 'x', engine: 'backup@1', integrity: 'sha256' },
    files: [{ path: 'aplibrary.db', sizeBytes: 4096, sha256: DB_SHA, kind: 'database', extraEntry: 42 }],
    summary: { ...(validManifestJson().summary as Record<string, unknown>), extraSummary: true },
    checksums: { manifestSha256: MANIFEST_SHA, extraChecksum: 1 },
  })
  check('Validator additive-only: field tak dikenal diabaikan', additive.ok === true)
  if (additive.ok === true) {
    check('Validator additive-only: engine/integrity dipertahankan', additive.manifest.meta.engine === 'backup@1' && additive.manifest.meta.integrity === 'sha256')
  }
}

// =====================================================================
// 8. Manifest Validator — field wajib (struktur + tipe)
// =====================================================================
{
  const validator = new ManifestValidator()
  const fail = (name: string, raw: unknown, messagePart?: string): void => {
    const r = validator.validate(raw)
    if (r.ok === true) {
      check(name, false)
    } else {
      const ok = messagePart === undefined || r.errors.some((e) => e.includes(messagePart as string))
      check(`${name}${messagePart !== undefined ? ` (${messagePart})` : ''}`, ok)
    }
  }
  fail('Validator: null bukan objek', null)
  fail('Validator: string bukan objek', 'abc')
  fail('Validator: array bukan objek', [])
  fail('Validator: format hilang', (() => { const m = validManifestJson(); delete m.format; return m })())
  fail('Validator: format salah', { ...validManifestJson(), format: 'not-aplibrary' }, 'format')
  fail('Validator: meta hilang', (() => { const m = validManifestJson(); delete m.meta; return m })())
  fail('Validator: meta bukan objek', { ...validManifestJson(), meta: 'x' })
  fail('Validator: meta.backupVersion hilang', { ...validManifestJson(), meta: metaOverride({ backupVersion: undefined }) })
  fail('Validator: meta.backupVersion string', { ...validManifestJson(), meta: metaOverride({ backupVersion: '1' }) }, 'backupVersion')
  fail('Validator: meta.appVersion hilang', { ...validManifestJson(), meta: metaOverride({ appVersion: undefined }) })
  fail('Validator: meta.appName hilang', { ...validManifestJson(), meta: metaOverride({ appName: undefined }) })
  fail('Validator: meta.type hilang', { ...validManifestJson(), meta: metaOverride({ type: undefined }) })
  fail('Validator: meta.schemaVersion hilang', { ...validManifestJson(), meta: metaOverride({ schemaVersion: undefined }) }, 'schemaVersion')
  fail('Validator: meta.createdAt hilang', { ...validManifestJson(), meta: metaOverride({ createdAt: undefined }) })
  fail('Validator: meta.createdAt invalid', { ...validManifestJson(), meta: metaOverride({ createdAt: 'not-a-date' }) }, 'createdAt')
  fail('Validator: files hilang', (() => { const m = validManifestJson(); delete m.files; return m })())
  fail('Validator: files bukan array', { ...validManifestJson(), files: 'x' })
  fail('Validator: files kosong', { ...validManifestJson(), files: [] }, 'minimal satu entri')
  fail('Validator: entry path hilang', { ...validManifestJson(), files: [{ sizeBytes: 1, sha256: DB_SHA, kind: 'database' }] })
  fail('Validator: entry sizeBytes hilang', { ...validManifestJson(), files: [{ path: 'a.db', sha256: DB_SHA, kind: 'database' }] })
  fail('Validator: entry sha256 hilang', { ...validManifestJson(), files: [{ path: 'a.db', sizeBytes: 1, kind: 'database' }] })
  fail('Validator: entry kind hilang', { ...validManifestJson(), files: [{ path: 'a.db', sizeBytes: 1, sha256: DB_SHA }] })
  fail('Validator: summary hilang', (() => { const m = validManifestJson(); delete m.summary; return m })())
  fail('Validator: summary.files hilang', { ...validManifestJson(), summary: { totalBytes: 0 } }, 'summary.files')
  fail('Validator: summary.totalBytes hilang', { ...validManifestJson(), summary: { files: 0 } }, 'totalBytes')
  fail('Validator: checksums hilang', (() => { const m = validManifestJson(); delete m.checksums; return m })())
  fail('Validator: checksums.manifestSha256 hilang', { ...validManifestJson(), checksums: {} }, 'manifestSha256')
}

// =====================================================================
// 9. Manifest Validator — schema version
// =====================================================================
{
  const validator = new ManifestValidator()
  const checkSchema = (name: string, value: unknown, expectOk: boolean): void => {
    const r = validator.validate({ ...validManifestJson(), meta: metaOverride({ schemaVersion: value }) })
    check(`${name}`, expectOk ? r.ok : !r.ok)
  }
  checkSchema('Validator schemaVersion: valid string diterima', '20260731_adr002_initial', true)
  checkSchema('Validator schemaVersion: kosong ditolak', '', false)
  checkSchema('Validator schemaVersion: spasi ditolak', '   ', false)
  checkSchema('Validator schemaVersion: karakter kontrol ditolak', 'a\u0000b', false)
  checkSchema('Validator schemaVersion: objek ditolak', { a: 1 }, false)
  checkSchema('Validator schemaVersion: angka ditolak', 5, false)
}

// =====================================================================
// 10. Manifest Validator — duplicate entry
// =====================================================================
{
  const validator = new ManifestValidator()
  const dup = { ...validManifestJson(), files: [
    { path: 'aplibrary.db', sizeBytes: 1, sha256: DB_SHA, kind: 'database' },
    { path: 'aplibrary.db', sizeBytes: 2, sha256: ASSET_SHA, kind: 'database' },
  ] }
  const r1 = validator.validate(dup)
  check('Validator duplicate: dua path sama ditolak', r1.ok === false)
  if (r1.ok === false) check('Validator duplicate: pesan path duplikat', r1.errors.some((e) => e.includes('duplikat') && e.includes('aplibrary.db')))
  const dupKind = { ...validManifestJson(), files: [
    { path: 'x.db', sizeBytes: 1, sha256: DB_SHA, kind: 'database' },
    { path: 'x.db', sizeBytes: 2, sha256: ASSET_SHA, kind: 'asset' },
  ] }
  check('Validator duplicate: path sama kind beda tetap duplikat', !validator.validate(dupKind).ok)
  const triple = { ...validManifestJson(), files: [
    { path: 'a', sizeBytes: 1, sha256: DB_SHA, kind: 'database' },
    { path: 'b', sizeBytes: 1, sha256: ASSET_SHA, kind: 'asset' },
    { path: 'a', sizeBytes: 1, sha256: MANIFEST_SHA, kind: 'log' },
  ] }
  check('Validator duplicate: 3 entri 1 duplikat ditolak', !validator.validate(triple).ok)
  const unique = { ...validManifestJson(), files: [
    { path: 'a', sizeBytes: 1, sha256: DB_SHA, kind: 'database' },
    { path: 'b', sizeBytes: 1, sha256: ASSET_SHA, kind: 'asset' },
  ] }
  check('Validator duplicate: path unik diterima', validator.validate(unique).ok)
}

// =====================================================================
// 11. Manifest Validator — relative path
// =====================================================================
{
  const validator = new ManifestValidator()
  const withPath = (path: unknown): ReturnType<ManifestValidator['validate']> =>
    validator.validate({ ...validManifestJson(), files: [{ path, sizeBytes: 1, sha256: DB_SHA, kind: 'database' }] })
  check('Validator path: leading slash ditolak', !withPath('/etc/a.db').ok)
  check('Validator path: backslash ditolak', !withPath('foo\\bar.db').ok)
  check('Validator path: traversal ditolak', !withPath('../secret').ok)
  check('Validator path: drive letter ditolak', !withPath('C:/x.db').ok)
  check('Validator path: URI ditolak', !withPath('http://x/y').ok)
  check('Validator path: trailing slash ditolak', !withPath('dir/').ok)
  check('Validator path: kosong ditolak', !withPath('').ok)
  check('Validator path: double slash ditolak', !withPath('a//b').ok)
  check('Validator path: "./" segment ditolak', !withPath('a/./b').ok)
  check('Validator path: "." ditolak', !withPath('.').ok)
  check('Validator path: kontrol ditolak', !withPath('a\u0000b').ok)
  check('Validator path: nested valid diterima', withPath('assets/templates/card.png').ok)
}

// =====================================================================
// 12. Manifest Validator — checksum format
// =====================================================================
{
  const validator = new ManifestValidator()
  const entryWithSha = (sha: unknown): ReturnType<ManifestValidator['validate']> =>
    validator.validate({ ...validManifestJson(), files: [{ path: 'a.db', sizeBytes: 1, sha256: sha, kind: 'database' }] })
  check('Validator checksum: entry sha pendek ditolak', !entryWithSha('abc').ok)
  check('Validator checksum: entry sha non-hex ditolak', !entryWithSha('g'.repeat(64)).ok)
  check('Validator checksum: entry sha kosong ditolak', !entryWithSha('').ok)
  check('Validator checksum: entry sha valid diterima', entryWithSha(DB_SHA).ok)
  check('Validator checksum: entry sha uppercase diterima', entryWithSha(DB_SHA.toUpperCase()).ok)
  const manifestWithSha = (sha: unknown): ReturnType<ManifestValidator['validate']> =>
    validator.validate({ ...validManifestJson(), checksums: { manifestSha256: sha } })
  check('Validator checksum: manifestSha pendek ditolak', !manifestWithSha('abc').ok)
  check('Validator checksum: manifestSha non-hex ditolak', !manifestWithSha('z'.repeat(64)).ok)
  check('Validator checksum: manifestSha valid diterima', manifestWithSha(MANIFEST_SHA).ok)
  check('Validator checksum: manifestSha uppercase diterima', manifestWithSha(MANIFEST_SHA.toUpperCase()).ok)
}

// =====================================================================
// Ringkasan
// =====================================================================
console.log(`\nWO-2 Manifest Domain smoke: ${passed} PASS, ${failed} FAIL`)
if (failed > 0) process.exit(1)
