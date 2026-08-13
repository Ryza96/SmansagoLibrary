// WO SAM — Smoke / Engine Test untuk fitur Sampul Buku.
// Cakupan:
//   1) Fungsional (legacy stack) — BookService.saveCover/removeCover/getCoverDataUri/
//      pickCoverPreview + validasi format/ukuran + resize downscale-only.
//   2) Backup penuh (WO-4 BackupService + DatabaseProvider + AssetBackupProvider)
//      → manifest berisi 2 entri (database + assets/book-covers.zip).
//   3) Restore round-trip (WO-5 RestoreService + DatabaseRestoreHandler +
//      AssetRestoreHandler) → file aset dipulihkan ke liveDir.
//   4) SwapToLive asset: junk di liveDir hilang setelah restore.
//   5) Regresi pra-fitur: wadah DB-only (tanpa entri aset) di-restore →
//      SUCCESS, liveDir TIDAK tersentuh (AssetRestoreHandler tidak di-invoke).
// Compile: npx tsc --module commonjs --moduleResolution node --target es2022
//   --esModuleInterop --skipLibCheck --rootDir . --outDir <tmp>\out wo_book_cover_smoke/smoke.ts
// Run: node <tmp>\out\wo_book_cover_smoke\smoke.js  (dengan DATABASE_URL absolute
//   fresh DB yang sudah `prisma migrate deploy` dari workdir prisma/ — smoke TIDAK
//   menyiapkan DB; NODE_PATH=<repo>\node_modules bila sharp tidak ter-resolve).

import fs from 'fs'
import os from 'os'
import path from 'path'
import AdmZip from 'adm-zip'
import sharp from 'sharp'
import { ManifestBuilder } from '../src/main/infrastructure/backup/manifest-builder'
import { BackupPackager } from '../src/main/infrastructure/backup/packager'
import { BackupVerifier } from '../src/main/infrastructure/backup/verifier'
import { BackupService } from '../src/main/infrastructure/backup/backup.service'
import { DatabaseProvider, DATABASE_SNAPSHOT_FILENAME } from '../src/main/infrastructure/providers/database.provider'
import {
  AssetBackupProvider,
  ASSET_BOOK_COVERS_ARCHIVE_FILENAME,
  ASSET_BOOK_COVERS_ARCHIVE_RELATIVE_PATH,
} from '../src/main/infrastructure/providers/asset.provider'
import { AssetRestoreHandler } from '../src/main/infrastructure/restore/asset-restore.handler'
import { DatabaseRestoreHandler } from '../src/main/infrastructure/restore/database-restore.handler'
import { RestoreService, createRestoreDirs } from '../src/main/infrastructure/restore/restore.service'
import { ProviderRegistry, RestoreHandlerRegistry } from '../src/main/domain/provider/provider-registry'
import { PROVIDER_KINDS } from '../src/main/domain/provider/provider-kind'
import { SchemaVersion } from '../src/main/domain/manifest/schema-version'
import { RESTORE_STATUS } from '../src/main/domain/restore/restore-status'
import { createAppPaths } from '../src/main/infrastructure/paths'
import { SchemaVersionReader } from '../src/main/infrastructure/backup/schema-version.reader'
import { resolveLiveDatabaseFile } from '../src/main/infrastructure/database-path'
import { getPrisma, connectPrisma, disconnectPrisma } from '../src/main/repositories/base/prisma'
import { resizeBookCoverImage } from '../src/main/infrastructure/asset/book-cover-resize'
import { initDatabase, closeDatabase } from '../electron/main/database'
import { BookRepository } from '../electron/main/repositories/book.repository'
import { BookService } from '../electron/main/services/book.service'
import { AppError } from '../electron/main/errorHandler'

const EXPECTED_SCHEMA_VERSION = '20260810_wo_book_cover'
const PROBE_TABLE = 'smoke_probe'
const COVERS_DIRNAME = 'book-covers'

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

async function expectRejected(
  name: string,
  fn: () => Promise<unknown>,
  errorClass: new (...args: never[]) => Error,
  messagePart?: string
): Promise<void> {
  try {
    await fn()
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

// Daftar file nyata di direktori sampul (tanpa artefak temp/backup ber-awalan dot).
function coverFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter((name) => !name.startsWith('.'))
}

async function writePng(filePath: string, width: number, height: number, color: string): Promise<void> {
  await sharp({ create: { width, height, channels: 3, background: color } })
    .png()
    .toFile(filePath)
}

async function writeJpg(filePath: string, width: number, height: number, color: string): Promise<void> {
  await sharp({ create: { width, height, channels: 3, background: color } })
    .jpeg()
    .toFile(filePath)
}

async function makeFixtureImages(dir: string): Promise<Record<string, string>> {
  fs.mkdirSync(dir, { recursive: true })
  const cover1 = path.join(dir, 'cover1.png')
  const cover2 = path.join(dir, 'cover2.png')
  const cover3 = path.join(dir, 'cover3.jpg')
  const big = path.join(dir, 'big.png')
  const invalidGif = path.join(dir, 'invalid.gif')
  const emptyPng = path.join(dir, 'empty.png')
  const hugePng = path.join(dir, 'huge.png')
  const textPng = path.join(dir, 'text.png')
  await writePng(cover1, 60, 80, '#ff0000')
  await writePng(cover2, 90, 120, '#0000ff')
  await writeJpg(cover3, 30, 30, '#00ff00')
  await writePng(big, 800, 600, '#800080')
  fs.writeFileSync(invalidGif, Buffer.from('GIF'))
  fs.writeFileSync(emptyPng, Buffer.alloc(0))
  fs.writeFileSync(hugePng, Buffer.alloc(2 * 1024 * 1024 + 1, 7))
  fs.writeFileSync(textPng, Buffer.from('not an image'))
  return { cover1, cover2, cover3, big, invalidGif, emptyPng, hugePng, textPng }
}

// ============================================================================
// Probe "live" — dibaca VIA getPrisma() (koneksi lazy) setelah functional
// section menutup koneksi legacy (closeDatabase), sehingga selaras dengan
// alur BackupService (wo5). getPrisma() auto-connect saat query pertama.
// ============================================================================

async function liveMarkers(): Promise<string[]> {
  const rows = (await getPrisma().$queryRawUnsafe(
    `SELECT marker FROM ${PROBE_TABLE} ORDER BY marker ASC`
  )) as unknown as { marker: string }[]
  return rows.map((row) => row.marker)
}

async function liveIntegrityOk(): Promise<boolean> {
  const rows = (await getPrisma().$queryRawUnsafe('PRAGMA integrity_check')) as unknown as { integrity_check: string }[]
  return rows.length === 1 && rows[0].integrity_check === 'ok'
}

async function liveBookCount(): Promise<number> {
  const rows = (await getPrisma().$queryRawUnsafe('SELECT COUNT(*) AS c FROM "Book"')) as unknown as { c: number | bigint }[]
  return Number(rows[0]?.c ?? 0)
}

// ============================================================================
// 1) Fungsional — legacy stack (BookRepository + BookService) dengan
//    BookService(repo, coversDir). Proses menyeluruh: create (tanpa & dengan
//    sampul) → saveCover (ekstensi sama & ganti ekstensi) → removeCover →
//    updateBook (ganti sampul + resize) → 4 kasus error validasi + pickCover.
// ============================================================================

async function testFunctionalCovers(coversDir: string, fixtures: Record<string, string>): Promise<string> {
  console.log('\n=== 1) Fungsional BookService (saveCover/removeCover/getCoverDataUri/pickCoverPreview) ===')
  const bookRepository = new BookRepository()
  const bookService = new BookService(bookRepository, coversDir)

  // Baca path sampul terkini langsung dari repository (DB adalah sumber kebenaran).
  const coverPathOf = async (bookId: string): Promise<string | null> => {
    const row = await bookRepository.findById(bookId)
    return row ? (row as { coverImagePath: string | null }).coverImagePath : null
  }

  // Seed buku tanpa sampul — untuk mengambil ids (category/publisher/author) dan
  // membuktikan create tanpa coverUpload tidak menyentuh filesystem.
  const seed = await bookService.createBook({
    title: 'Buku Polos',
    isbn: '978-000-000-000-1',
    authorIds: [],
  })
  const seedId = (seed as { id: string }).id
  check(`seed tanpa sampul → coverImage null`, (seed as { coverImage: string | null }).coverImage === null)
  check(`coversDir masih kosong setelah create tanpa sampul`, coverFiles(coversDir).length === 0)
  check(`getCoverDataUri seed → null`, (await bookService.getCoverDataUri(seedId)) === null)

  const bookA = await bookService.createBook({
    title: 'Buku A',
    isbn: '978-111-222-333-4',
    categoryId: seed.category?.id,
    publisherId: seed.publisher?.id,
    authorIds: seed.authors.map((author) => author.id),
    publicationYear: 2024,
    description: 'Dasar buku A',
  })
  const bookAId = (bookA as { id: string }).id
  check(`bookA dibuat tanpa sampul → coverImage null`, (bookA as { coverImage: string | null }).coverImage === null)
  check(`coversDir masih kosong setelah create tanpa sampul`, coverFiles(coversDir).length === 0)
  check(
    `getCoverDataUri tanpa sampul → null`,
    (await bookService.getCoverDataUri(bookAId)) === null
  )

  // saveCover: ekstensi sama (png → png)
  await bookService.saveCover(bookAId, fixtures.cover1)
  const target1 = `book-cover-${bookAId}.png`
  const relative1 = `assets/${COVERS_DIRNAME}/${target1}`
  check(`saveCover png → DB coverImagePath relatif '${relative1}'`, (await coverPathOf(bookAId)) === relative1)
  const files1 = coverFiles(coversDir)
  check(`1 file sampul di coversDir`, files1.length === 1 && files1[0] === target1)
  const uri1 = (await bookService.getCoverDataUri(bookAId)) as string
  check(`getCoverDataUri → data:image/png;base64,`, uri1.startsWith('data:image/png;base64,'))

  // saveCover: ganti isi ekstensi sama (png → png) — file diganti, byte sama dengan hasil resize
  await bookService.saveCover(bookAId, fixtures.cover2)
  const expectedBytes2 = await resizeBookCoverImage(fixtures.cover2)
  const onDisk2 = fs.readFileSync(path.join(coversDir, target1))
  check(
    `saveCover ganti isi png → bytes di disk == resizeBookCoverImage(cover2)`,
    Buffer.compare(expectedBytes2, onDisk2) === 0
  )
  check(`saveCover ganti isi → tetap tepat 1 file`, coverFiles(coversDir).length === 1)

  // saveCover: ganti ekstensi (png → jpg)
  await bookService.saveCover(bookAId, fixtures.cover3)
  check(
    `saveCover png→jpg → DB coverImagePath '.jpg'`,
    (await coverPathOf(bookAId)) === `assets/${COVERS_DIRNAME}/book-cover-${bookAId}.jpg`
  )
  const files3 = coverFiles(coversDir)
  check(
    `saveCover png→jpg → file lama (${target1}) hilang, tepat 1 file .jpg`,
    files3.length === 1 && files3[0] === `book-cover-${bookAId}.jpg`
  )
  const uri3 = (await bookService.getCoverDataUri(bookAId)) as string
  check(`getCoverDataUri setelah jpg → data:image/jpeg;base64,`, uri3.startsWith('data:image/jpeg;base64,'))

  // removeCover → DB null + 0 file
  await bookService.removeCover(bookAId)
  check(`removeCover → DB coverImagePath null`, (await coverPathOf(bookAId)) === null)
  check(`removeCover → 0 file tersisa`, coverFiles(coversDir).length === 0)
  check(`getCoverDataUri setelah remove → null`, (await bookService.getCoverDataUri(bookAId)) === null)

  // updateBook dengan coverUpload + title baru → ganti sampul + resize downscale
  const updated = await bookService.updateBook(bookAId, {
    title: 'Buku A (edisi 2)',
    coverUpload: fixtures.big,
  })
  check(
    `updateBook coverUpload big.png → DTO coverImage relatif .png`,
    updated !== null && updated.coverImage === `assets/${COVERS_DIRNAME}/book-cover-${bookAId}.png`
  )
  const files5 = coverFiles(coversDir)
  check(`updateBook → tepat 1 file (yang lama ter-remove)`, files5.length === 1)
  const bigBytes = await resizeBookCoverImage(fixtures.big)
  const onDiskBig = fs.readFileSync(path.join(coversDir, `book-cover-${bookAId}.png`))
  check(`updateBook → bytes == resizeBookCoverImage(big)`, Buffer.compare(bigBytes, onDiskBig) === 0)
  const meta = await sharp(path.join(coversDir, `book-cover-${bookAId}.png`)).metadata()
  check(`updateBook resize 800x600 → 512x384`, meta.width === 512 && meta.height === 384)

  // Kasus error validasi (pesan persis book.service.ts)
  await expectRejected('invalid.gif → Format tidak didukung', () => bookService.saveCover(bookAId, fixtures.invalidGif), AppError, 'Format file tidak didukung. Gunakan PNG, JPG, JPEG, atau WEBP.')
  await expectRejected('empty.png → File sampul kosong.', () => bookService.saveCover(bookAId, fixtures.emptyPng), AppError, 'File sampul kosong.')
  await expectRejected('huge.png → melebihi 2 MB', () => bookService.saveCover(bookAId, fixtures.hugePng), AppError, 'Ukuran file sampul melebihi 2 MB.')
  await expectRejected('text.png → tidak dapat diproses sebagai gambar', () => bookService.saveCover(bookAId, fixtures.textPng), AppError, 'tidak dapat diproses sebagai gambar')
  check(`setelah 4 error → file sampul tidak berubah (tetap 1 file)`, coverFiles(coversDir).length === 1)

  // pickCoverPreview (valid + ekstensi tidak didukung)
  const preview = await bookService.pickCoverPreview(fixtures.cover1)
  check(
    `pickCoverPreview valid → { filePath, sizeBytes, previewUri }`,
    preview.filePath === fixtures.cover1 &&
      preview.sizeBytes > 0 &&
      preview.previewUri.startsWith('data:image/png;base64,')
  )
  await expectRejected('pickCoverPreview invalid.gif → ditolak', () => bookService.pickCoverPreview(fixtures.invalidGif), AppError, 'Format file tidak didukung')
  await expectRejected('pickCoverPreview huge.png → ditolak', () => bookService.pickCoverPreview(fixtures.hugePng), AppError, 'Ukuran file sampul melebihi 2 MB')

  return bookAId
}

// ============================================================================
// 2–5) dbBackedSection — alur BACKUP + RESTORE end-to-end memakai engine ASLI
//      (BackupService, RestoreService, DatabaseProvider, AssetBackupProvider,
//      DatabaseRestoreHandler, AssetRestoreHandler). Posisi urutan:
//        2) Backup penuh (database + assets/book-covers.zip)
//        3) Restore round-trip → file aset dipulihkan
//        4) Junk di liveDir hilang setelah restore (swapToLive asset)
//        5) Wadah DB-only (pra-fitur) → SUCCESS tanpa menyentuh liveDir
//
// Catatan: setelah functional section, koneksi legacy di-close agar tidak
// konflik handle file dengan swapToLive. Backup & query "live" memakai
// getPrisma() (lazy, auto-connect).
// ============================================================================

async function dbBackedSection(tempRoot: string, coversDir: string, bookAId: string): Promise<void> {
  console.log('\n=== 2–5) Backup & Restore round-trip (asset provider + restore handler) ===')
  const paths = createAppPaths(tempRoot)
  const stagingRoot = paths.tempDir
  fs.mkdirSync(stagingRoot, { recursive: true })
  const liveDatabaseFile = resolveLiveDatabaseFile(process.env.DATABASE_URL || '', process.cwd())
  check('live DB file ada (sudah migrate deploy)', fs.existsSync(liveDatabaseFile))

  // Probe smoke di DB live (via getPrisma — lazy auto-connect)
  await getPrisma().$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS ${PROBE_TABLE} (marker TEXT NOT NULL)`
  )
  await getPrisma().$executeRawUnsafe(`DELETE FROM ${PROBE_TABLE}`)
  await getPrisma().$executeRawUnsafe(`INSERT INTO ${PROBE_TABLE} (marker) VALUES ('A')`)
  check('probe A tertulis di live DB', (await liveMarkers()).join(',') === 'A')

  // --- BackupService (WO-4) ---
  const snapProvider = new DatabaseProvider({ stagingDir: stagingRoot })
  const assetProvider = new AssetBackupProvider({ assetDir: coversDir, stagingDir: stagingRoot })
  const providerRegistry = new ProviderRegistry()
  providerRegistry.register(snapProvider)
  providerRegistry.register(assetProvider)

  const backupService = new BackupService({
    providerRegistry,
    schemaVersionReader: new SchemaVersionReader(),
    manifestBuilder: new ManifestBuilder(),
    packager: new BackupPackager(),
    verifier: new BackupVerifier({ tempDir: stagingRoot }),
    paths,
    providerStagingDirs: new Map([
      [snapProvider.id.fullName, stagingRoot],
      [assetProvider.id.fullName, stagingRoot],
    ]),
  })
  const backupRun = await backupService.run({ appVersion: '0.1.0', appName: 'APLibrary' })
  if (backupRun.status !== 'SUCCESS') {
    console.log(`[DEBUG] backup status=${backupRun.status} errors=${JSON.stringify(backupRun.errors)} warnings=${JSON.stringify(backupRun.warnings)}`)
  }
  check('backup penuh → status SUCCESS', backupRun.status === 'SUCCESS')
  check('backup penuh → filePath ada', backupRun.filePath !== null && fs.existsSync(backupRun.filePath as string))
  check('backup penuh → manifest.files.length === 2 (database + aset)', backupRun.manifest?.files.length === 2)
  const backupPath = backupRun.filePath as string

  const verifyFull = await new BackupVerifier({ tempDir: stagingRoot }).verify(backupPath)
  check('verifier → ok (backup penuh)', verifyFull.ok)
  const zipEntry = verifyFull.manifest?.files.find(
    (entry) => entry.path === ASSET_BOOK_COVERS_ARCHIVE_RELATIVE_PATH
  )
  check(
    `manifest berisi entri '${ASSET_BOOK_COVERS_ARCHIVE_RELATIVE_PATH}' (kind asset)`,
    zipEntry !== undefined && zipEntry.kind === 'asset'
  )

  const zipBytes = fs.readFileSync(backupPath)
  const zip = new AdmZip(zipBytes)
  const innerAssetZip = zip.getEntry(ASSET_BOOK_COVERS_ARCHIVE_RELATIVE_PATH)
  check(`wadah berisi '${ASSET_BOOK_COVERS_ARCHIVE_RELATIVE_PATH}'`, innerAssetZip !== null)
  const innerZip = new AdmZip(innerAssetZip!.getData())
  const innerNames = innerZip.getEntries().map((entry) => entry.entryName)
  check(
    `zip aset berisi tepat 1 entri (cover bookA)`,
    innerNames.length === 1 && innerNames[0] === `book-cover-${bookAId}.png`
  )

  // --- RestoreService (WO-5) ---
  const restoreDirs = createRestoreDirs(stagingRoot)
  const restoreWiring = {
    liveDatabaseFile,
    disconnectLiveClients: async (): Promise<void> => {
      await disconnectPrisma().catch(() => undefined)
    },
    reconnectLiveClients: async (): Promise<void> => {
      await connectPrisma()
    },
  }
  const restoreHandlerRegistry = new RestoreHandlerRegistry()
  restoreHandlerRegistry.register(
    new DatabaseRestoreHandler({
      liveDatabaseFile,
      extractDir: restoreDirs.extractDir,
      stagingDir: restoreDirs.stagingDir,
      archiveDir: restoreDirs.archiveDir,
      snapshotDir: restoreDirs.snapshotDir,
      disconnectLiveClients: restoreWiring.disconnectLiveClients,
      reconnectLiveClients: restoreWiring.reconnectLiveClients,
    })
  )
  restoreHandlerRegistry.register(
    new AssetRestoreHandler({
      extractDir: restoreDirs.extractDir,
      stagingDir: restoreDirs.stagingDir,
      archiveDir: restoreDirs.archiveDir,
      liveDir: coversDir,
    })
  )

  const restoreService = new RestoreService({
    verifier: new BackupVerifier({ tempDir: stagingRoot }),
    schemaVersionReader: new SchemaVersionReader(),
    handlerRegistry: restoreHandlerRegistry,
    paths,
    liveDatabaseFile,
  })

  const liveCountBefore = await liveBookCount()
  check('live book count > 0 (seed functional)', liveCountBefore >= 2)

  // 3) Round-trip restore (backup penuh)
  const restoreRun = await restoreService.run({ backupFilePath: backupPath })
  check(`round-trip restore → status ${restoreRun.status}`, restoreRun.status === RESTORE_STATUS.SUCCESS)
  check('round-trip restore → files === 2', restoreRun.files === 2)
  check('round-trip restore → schemaVersionBefore == F2a', restoreRun.schemaVersionBefore === EXPECTED_SCHEMA_VERSION)
  check('round-trip restore → schemaVersionRestored == F2a', restoreRun.schemaVersionRestored === EXPECTED_SCHEMA_VERSION)
  check('round-trip restore → needsRestart true', restoreRun.needsRestart === true)
  check('round-trip restore → errors kosong', restoreRun.errors.length === 0)
  check('round-trip restore → probe A dipertahankan', (await liveMarkers()).join(',') === 'A')
  check('round-trip restore → book count dipertahankan', (await liveBookCount()) === liveCountBefore)
  check('round-trip restore → integrity_check ok', await liveIntegrityOk())
  check('round-trip restore → coversDir berisi 1 file (cover bookA)', coverFiles(coversDir).length === 1)
  check(
    'round-trip restore → isi cover bookA == cover asli (round-trip bytes)',
    fs.existsSync(path.join(coversDir, `book-cover-${bookAId}.png`))
  )

  // 4) Junk di liveDir → hilang setelah restore (swapToLive asset meniru coversDir)
  const junkPath = path.join(coversDir, 'junk.bin')
  fs.writeFileSync(junkPath, Buffer.from('junk'))
  check('pre-junk → coversDir 2 file', coverFiles(coversDir).length === 2)
  const restoreRunJunk = await restoreService.run({ backupFilePath: backupPath })
  check(`junk-restore → status ${restoreRunJunk.status}`, restoreRunJunk.status === RESTORE_STATUS.SUCCESS)
  check('junk-restore → errors kosong', restoreRunJunk.errors.length === 0)
  const afterJunk = coverFiles(coversDir)
  check('junk-restore → junk hilang, tepat 1 file tersisa', afterJunk.length === 1 && !afterJunk.includes('junk.bin'))
  check('junk-restore → probe A masih ada', (await liveMarkers()).join(',') === 'A')

  // 5) Wadah DB-only (pra-fitur: tanpa entri aset) — restore SUCCESS, liveDir TIDAK tersentuh
  await snapProvider.collect()
  const snapPath = snapProvider.snapshotPath
  check('snapshot DB dibuat (VACUUM INTO)', fs.existsSync(snapPath))
  const dbOnlyZipPath = path.join(stagingRoot, 'db-only.apbackup')
  const dbOnlyEntries = [
    { relativePath: DATABASE_SNAPSHOT_FILENAME, stagingPath: snapPath, kind: PROVIDER_KINDS.DATABASE },
  ]
  const dbOnlyManifest = await new ManifestBuilder().build({
    appVersion: '0.1.0',
    appName: 'APLibrary',
    schemaVersion: SchemaVersion.of(EXPECTED_SCHEMA_VERSION),
    createdAt: new Date(),
    engine: 'vacuum-into',
    entries: dbOnlyEntries,
  })
  await new BackupPackager().package({
    entries: dbOnlyEntries,
    manifestJson: JSON.stringify(dbOnlyManifest.toJSON()),
    outputPath: dbOnlyZipPath,
  })
  check('wadah DB-only → files === 2 (aplibrary.db + manifest.json)', new AdmZip(dbOnlyZipPath).getEntries().length === 2)

  const dbOnlyVerify = await new BackupVerifier({ tempDir: stagingRoot }).verify(dbOnlyZipPath)
  check('wadah DB-only → verifier ok', dbOnlyVerify.ok)

  const junkPath2 = path.join(coversDir, 'junk2.bin')
  fs.writeFileSync(junkPath2, Buffer.from('junk2'))
  check('pre-db-only → coversDir 2 file', coverFiles(coversDir).length === 2)

  const dbOnlyRestore = await restoreService.run({ backupFilePath: dbOnlyZipPath })
  check(`db-only restore → status ${dbOnlyRestore.status}`, dbOnlyRestore.status === RESTORE_STATUS.SUCCESS)
  check('db-only restore → files === 1', dbOnlyRestore.files === 1)
  check('db-only restore → errors kosong', dbOnlyRestore.errors.length === 0)
  check('db-only restore → schemaVersionRestored == F2a', dbOnlyRestore.schemaVersionRestored === EXPECTED_SCHEMA_VERSION)
  const afterDbOnly = coverFiles(coversDir)
  check(
    'db-only restore → liveDir TIDAK tersentuh (2 file tetap ada)',
    afterDbOnly.length === 2 && afterDbOnly.includes('junk2.bin')
  )
  check('db-only restore → probe A dipertahankan', (await liveMarkers()).join(',') === 'A')

  // Cleanup
  await snapProvider.cleanup().catch(() => undefined)
  await assetProvider.cleanup().catch(() => undefined)
  await disconnectPrisma().catch(() => undefined)
}

// ============================================================================
// main — urutan eksekusi.
// ============================================================================

async function main(): Promise<void> {
  console.log('=== WO Book Cover Smoke (functional + backup/restore) ===')
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wo-book-cover-'))
  const paths = createAppPaths(tempRoot)
  const coversDir = path.join(paths.assetsDir, COVERS_DIRNAME)
  const fixtures = await makeFixtureImages(path.join(tempRoot, 'covers-src'))

  try {
    await initDatabase()
    const bookAId = await testFunctionalCovers(coversDir, fixtures)
    await closeDatabase()
    await dbBackedSection(tempRoot, coversDir, bookAId)
  } finally {
    await closeDatabase().catch(() => undefined)
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }

  console.log(`\nTotal: ${passed} PASS, ${failed} FAIL`)
  if (failed > 0) process.exit(1)
}

main().catch((error) => {
  console.error('UNCAUGHT:', error)
  process.exit(1)
})


