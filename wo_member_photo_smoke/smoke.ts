// WO MEMBER PHOTO — Smoke / Engine Test untuk fitur Foto Anggota.
// Cakupan:
//   1) Fungsional (stack baru) — MemberService.savePhoto/removePhoto/
//      getPhotoDataUri/pickPhotoPreview + create/update dengan photoUpload +
//      validasi format/ukuran + resize downscale-only + create siswa (tx).
//   2) Backup penuh (WO-4 BackupService + DatabaseProvider +
//      MemberPhotosBackupProvider) → manifest berisi 2 entri
//      (database + assets/member-photos.zip).
//   3) Restore round-trip (WO-5 RestoreService + DatabaseRestoreHandler +
//      MemberPhotosRestoreHandler) → file foto dipulihkan ke liveDir.
//   4) SwapToLive asset: junk di liveDir hilang setelah restore.
//   5) Regresi pra-fitur: wadah DB-only (tanpa entri aset) di-restore →
//      SUCCESS, liveDir TIDAK tersentuh.
//   6) Provider OPTIONAL dengan direktori aset KOSONG → arsip zip kosong
//      tetap valid (idempoten) & restore round-trip SUCCESS → liveDir diganti
//      dengan isi arsip (kosong): swapToLive mengarsipkan liveDir lama, bukan
//      sekadar skip (semantik "restore = ganti state dgn isi arsip").
// Compile: npx tsc --module commonjs --moduleResolution node --target es2022
//   --esModuleInterop --skipLibCheck --rootDir . --outDir <tmp>\out wo_member_photo_smoke/smoke.ts
// Run: node <tmp>\out\wo_member_photo_smoke\smoke.js  (dengan DATABASE_URL absolute
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
  MemberPhotosBackupProvider,
  MEMBER_PHOTOS_ARCHIVE_RELATIVE_PATH,
} from '../src/main/infrastructure/providers/member-photos.provider'
import { MemberPhotosRestoreHandler } from '../src/main/infrastructure/restore/member-photos-restore.handler'
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
import { resizeMemberPhotoImage } from '../src/main/infrastructure/asset/member-photo-resize'
import { MemberService } from '../src/main/services/member.service'
import { MemberRepository } from '../src/main/repositories/member.repository'
import { EnrollmentRepository } from '../src/main/repositories/enrollment.repository'
import { ClassRepository } from '../src/main/repositories/class.repository'
import { NumberGeneratorService } from '../src/main/services/number-generator.service'
import { AppError } from '../electron/main/errorHandler'

const EXPECTED_SCHEMA_VERSION = '20260811_wo_member_photo'
const PROBE_TABLE = 'smoke_member_photo_probe'
const PHOTOS_DIRNAME = 'member-photos'

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

// Daftar file nyata di direktori foto (tanpa artefak temp/backup ber-awalan dot).
function photoFiles(dir: string): string[] {
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

async function writeWebp(filePath: string, width: number, height: number, color: string): Promise<void> {
  await sharp({ create: { width, height, channels: 3, background: color } })
    .webp()
    .toFile(filePath)
}

async function makeFixtureImages(dir: string): Promise<Record<string, string>> {
  fs.mkdirSync(dir, { recursive: true })
  const photo1 = path.join(dir, 'photo1.png')
  const photo2 = path.join(dir, 'photo2.png')
  const photo3 = path.join(dir, 'photo3.jpg')
  const photoWebp = path.join(dir, 'photo.webp')
  const big = path.join(dir, 'big.png')
  const invalidGif = path.join(dir, 'invalid.gif')
  const emptyPng = path.join(dir, 'empty.png')
  const hugePng = path.join(dir, 'huge.png')
  const textPng = path.join(dir, 'text.png')
  await writePng(photo1, 60, 80, '#ff0000')
  await writePng(photo2, 90, 120, '#0000ff')
  await writeJpg(photo3, 30, 30, '#00ff00')
  await writeWebp(photoWebp, 40, 40, '#ff00ff')
  await writePng(big, 800, 600, '#800080')
  fs.writeFileSync(invalidGif, Buffer.from('GIF'))
  fs.writeFileSync(emptyPng, Buffer.alloc(0))
  fs.writeFileSync(hugePng, Buffer.alloc(2 * 1024 * 1024 + 1, 7))
  fs.writeFileSync(textPng, Buffer.from('not an image'))
  return { photo1, photo2, photo3, photoWebp, big, invalidGif, emptyPng, hugePng, textPng }
}

// ============================================================================
// Probe "live" — dibaca VIA getPrisma() (koneksi lazy) sehingga selaras dengan
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

async function liveMemberCount(): Promise<number> {
  const rows = (await getPrisma().$queryRawUnsafe('SELECT COUNT(*) AS c FROM "Member"')) as unknown as {
    c: number | bigint
  }[]
  return Number(rows[0]?.c ?? 0)
}

// ============================================================================
// 1) Fungsional — stack baru (MemberService). Proses menyeluruh: create (tanpa
//    & dengan foto), savePhoto (ekstensi sama & ganti ekstensi), update photo,
//    removePhoto, create siswa (tx) dengan foto, getPhotoDataUri, validasi.
// ============================================================================

async function testFunctional(
  photosDir: string,
  fixtures: Record<string, string>
): Promise<{ studentId: string; generalId: string }> {
  console.log('\n=== 1) Fungsional MemberService (savePhoto/removePhoto/getPhotoDataUri/pickPhotoPreview) ===')
  const prisma = getPrisma()
  const memberRepo = new MemberRepository()
  const service = new MemberService(
    memberRepo,
    new NumberGeneratorService(memberRepo),
    new EnrollmentRepository(),
    new ClassRepository(),
    photosDir
  )

  // Baca path foto terkini langsung dari repository (DB adalah sumber kebenaran).
  const photoPathOf = async (memberId: string): Promise<string | null> => {
    const row = await memberRepo.findById(memberId)
    return row ? row.photoPath : null
  }

  // Seed tahun ajaran + kelas utk create siswa (jalur transaksi).
  const curriculum = await prisma.curriculum.create({ data: { name: 'MERDEKA' } })
  const year = await prisma.academicYear.create({
    data: { name: '2026/2027', startDate: new Date('2026-07-01'), endDate: new Date('2027-06-30'), isActive: true }
  })
  const clsX = await prisma.class.create({
    data: { academicYearId: year.id, curriculumId: curriculum.id, educationLevel: 'X', parallel: 'Merdeka 1', isActive: true }
  })

  // --- Guru: create tanpa foto → tidak menyentuh filesystem ---
  const teacher = await service.create({ fullName: 'Guru Polos', memberType: 'teacher' })
  check(`create guru tanpa foto → photoPath null`, teacher.photoPath === null)
  check(`photosDir masih kosong setelah create tanpa foto`, photoFiles(photosDir).length === 0)
  check(`getPhotoDataUri guru → null`, (await service.getPhotoDataUri(teacher.id)) === null)

  // --- savePhoto: ekstensi sama (png → png) ---
  await service.savePhoto(teacher.id, fixtures.photo1)
  const target1 = `member-photo-${teacher.id}.png`
  const relative1 = `assets/${PHOTOS_DIRNAME}/${target1}`
  check(`savePhoto png → DB photoPath relatif '${relative1}'`, (await photoPathOf(teacher.id)) === relative1)
  const files1 = photoFiles(photosDir)
  check(`1 file foto di photosDir`, files1.length === 1 && files1[0] === target1)
  const uri1 = (await service.getPhotoDataUri(teacher.id)) as string
  check(`getPhotoDataUri → data:image/png;base64,`, uri1.startsWith('data:image/png;base64,'))

  // --- savePhoto: ganti isi ekstensi sama (png → png) ---
  await service.savePhoto(teacher.id, fixtures.photo2)
  const expectedBytes2 = await resizeMemberPhotoImage(fixtures.photo2)
  const onDisk2 = fs.readFileSync(path.join(photosDir, target1))
  check(
    `savePhoto ganti isi png → bytes di disk == resizeMemberPhotoImage(photo2)`,
    Buffer.compare(expectedBytes2, onDisk2) === 0
  )
  check(`savePhoto ganti isi → tetap tepat 1 file`, photoFiles(photosDir).length === 1)

  // --- savePhoto: ganti ekstensi (png → jpg) ---
  await service.savePhoto(teacher.id, fixtures.photo3)
  check(
    `savePhoto png→jpg → DB photoPath '.jpg'`,
    (await photoPathOf(teacher.id)) === `assets/${PHOTOS_DIRNAME}/member-photo-${teacher.id}.jpg`
  )
  const files3 = photoFiles(photosDir)
  check(
    `savePhoto png→jpg → file lama (${target1}) hilang, tepat 1 file .jpg`,
    files3.length === 1 && files3[0] === `member-photo-${teacher.id}.jpg`
  )
  const uri3 = (await service.getPhotoDataUri(teacher.id)) as string
  check(`getPhotoDataUri setelah jpg → data:image/jpeg;base64,`, uri3.startsWith('data:image/jpeg;base64,'))

  // --- update dengan photoUpload (big) → ganti sampul + resize downscale ---
  const updated = await service.update(teacher.id, { fullName: 'Guru Polos (edisi 2)', photoUpload: fixtures.big })
  check(
    `update photoUpload big.png → DTO photoPath relatif .png`,
    updated.photoPath === `assets/${PHOTOS_DIRNAME}/member-photo-${teacher.id}.png`
  )
  const files5 = photoFiles(photosDir)
  check(`update → tepat 1 file (yang lama ter-remove)`, files5.length === 1)
  const meta = await sharp(path.join(photosDir, `member-photo-${teacher.id}.png`)).metadata()
  check(`update resize 800x600 → 512x384`, meta.width === 512 && meta.height === 384)

  // --- Kasus error validasi (pesan persis member.service.ts) ---
  await expectRejected('invalid.gif → Format tidak didukung', () => service.savePhoto(teacher.id, fixtures.invalidGif), AppError, 'Format file tidak didukung. Gunakan PNG, JPG, JPEG, atau WEBP.')
  await expectRejected('empty.png → File foto kosong.', () => service.savePhoto(teacher.id, fixtures.emptyPng), AppError, 'File foto kosong.')
  await expectRejected('huge.png → melebihi 2 MB', () => service.savePhoto(teacher.id, fixtures.hugePng), AppError, 'Ukuran file foto melebihi 2 MB.')
  await expectRejected('text.png → tidak dapat diproses sebagai gambar', () => service.savePhoto(teacher.id, fixtures.textPng), AppError, 'tidak dapat diproses sebagai gambar')
  check(`setelah 4 error → file foto tidak berubah (tetap 1 file)`, photoFiles(photosDir).length === 1)

  // --- pickPhotoPreview (valid + ekstensi tidak didukung) ---
  const preview = await service.pickPhotoPreview(fixtures.photo1)
  check(
    `pickPhotoPreview valid → { filePath, sizeBytes, previewUri }`,
    preview.filePath === fixtures.photo1 &&
      preview.sizeBytes > 0 &&
      preview.previewUri.startsWith('data:image/png;base64,')
  )
  await expectRejected('pickPhotoPreview invalid.gif → ditolak', () => service.pickPhotoPreview(fixtures.invalidGif), AppError, 'Format file tidak didukung')
  await expectRejected('pickPhotoPreview huge.png → ditolak', () => service.pickPhotoPreview(fixtures.hugePng), AppError, 'Ukuran file foto melebihi 2 MB')

  // --- removePhoto → DB null + 0 file; idempoten ---
  await service.removePhoto(teacher.id)
  check(`removePhoto → DB photoPath null`, (await photoPathOf(teacher.id)) === null)
  check(`removePhoto → 0 file tersisa`, photoFiles(photosDir).length === 0)
  check(`getPhotoDataUri setelah remove → null`, (await service.getPhotoDataUri(teacher.id)) === null)
  await service.removePhoto(teacher.id)
  check(`removePhoto kedua (idempoten) → no-op`, (await photoPathOf(teacher.id)) === null)

  // --- create siswa (jalur transaksi Member+Enrollment) DENGAN foto png ---
  const student = await service.create({
    fullName: 'Siswa Berfoto',
    memberType: 'student',
    academicYearId: year.id,
    classId: clsX.id,
    photoUpload: fixtures.photo1,
  })
  const studentTarget = `member-photo-${student.id}.png`
  check(
    `create siswa dgn foto → DTO photoPath relatif .png`,
    student.photoPath === `assets/${PHOTOS_DIRNAME}/${studentTarget}`
  )
  const activeEnrollment = await prisma.memberEnrollment.findFirst({
    where: { memberId: student.id, status: 'ACTIVE', leftAt: null },
  })
  check(`create siswa → enrollment ACTIVE dibuat`, activeEnrollment !== null)
  check(`create siswa → classId = clsX`, activeEnrollment?.classId === clsX.id)
  const filesStudent = photoFiles(photosDir)
  check(
    `create siswa → file foto '${studentTarget}' ada`,
    filesStudent.length === 1 && filesStudent[0] === studentTarget
  )

  // --- create umum (tanpa kelas) DENGAN foto webp ---
  const general = await service.create({
    fullName: 'Umum Berfoto',
    memberType: 'general',
    photoUpload: fixtures.photoWebp,
  })
  const generalTarget = `member-photo-${general.id}.webp`
  check(
    `create umum dgn foto webp → DTO photoPath '.webp'`,
    general.photoPath === `assets/${PHOTOS_DIRNAME}/${generalTarget}`
  )
  const uriGeneral = (await service.getPhotoDataUri(general.id)) as string
  check(`getPhotoDataUri webp → data:image/webp;base64,`, uriGeneral.startsWith('data:image/webp;base64,'))
  const filesGeneral = photoFiles(photosDir)
  check(
    `create umum → 2 file foto (siswa + umum)`,
    filesGeneral.length === 2 && filesGeneral.includes(studentTarget) && filesGeneral.includes(generalTarget)
  )

  return { studentId: student.id, generalId: general.id }
}

// ============================================================================
// 2–6) dbBackedSection — alur BACKUP + RESTORE end-to-end memakai engine ASLI
//      (BackupService, RestoreService, DatabaseProvider, MemberPhotosBackupProvider,
//      DatabaseRestoreHandler, MemberPhotosRestoreHandler). Posisi urutan:
//        2) Backup penuh (database + assets/member-photos.zip)
//        3) Restore round-trip → file foto dipulihkan
//        4) Junk di liveDir hilang setelah restore (swapToLive asset)
//        5) Wadah DB-only (pra-fitur) → SUCCESS tanpa menyentuh liveDir
//        6) Provider OPTIONAL dir kosong → zip kosong valid & restore SUCCESS
// ============================================================================

async function dbBackedSection(
  tempRoot: string,
  photosDir: string,
  memberIds: { studentId: string; generalId: string }
): Promise<void> {
  console.log('\n=== 2–6) Backup & Restore round-trip (member-photos provider + restore handler) ===')
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
  const photosProvider = new MemberPhotosBackupProvider({ assetDir: photosDir, stagingDir: stagingRoot })
  const providerRegistry = new ProviderRegistry()
  providerRegistry.register(snapProvider)
  providerRegistry.register(photosProvider)

  const backupService = new BackupService({
    providerRegistry,
    schemaVersionReader: new SchemaVersionReader(),
    manifestBuilder: new ManifestBuilder(),
    packager: new BackupPackager(),
    verifier: new BackupVerifier({ tempDir: stagingRoot }),
    paths,
    providerStagingDirs: new Map([
      [snapProvider.id.fullName, stagingRoot],
      [photosProvider.id.fullName, stagingRoot],
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
    (entry) => entry.path === MEMBER_PHOTOS_ARCHIVE_RELATIVE_PATH
  )
  check(
    `manifest berisi entri '${MEMBER_PHOTOS_ARCHIVE_RELATIVE_PATH}' (kind asset)`,
    zipEntry !== undefined && zipEntry.kind === 'asset'
  )

  const zipBytes = fs.readFileSync(backupPath)
  const zip = new AdmZip(zipBytes)
  const innerAssetZip = zip.getEntry(MEMBER_PHOTOS_ARCHIVE_RELATIVE_PATH)
  check(`wadah berisi '${MEMBER_PHOTOS_ARCHIVE_RELATIVE_PATH}'`, innerAssetZip !== null)
  const innerZip = new AdmZip(innerAssetZip!.getData())
  const innerNames = innerZip.getEntries().map((entry) => entry.entryName).sort()
  const expectedNames = [`member-photo-${memberIds.studentId}.png`, `member-photo-${memberIds.generalId}.webp`]
  const zipMatches =
    innerNames.length === 2 && expectedNames.every((name) => innerNames.includes(name))
  check(`zip aset berisi tepat 2 entri (siswa + umum)`, zipMatches)

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
    new MemberPhotosRestoreHandler({
      extractDir: restoreDirs.extractDir,
      stagingDir: restoreDirs.stagingDir,
      archiveDir: restoreDirs.archiveDir,
      liveDir: photosDir,
    })
  )

  const restoreService = new RestoreService({
    verifier: new BackupVerifier({ tempDir: stagingRoot }),
    schemaVersionReader: new SchemaVersionReader(),
    handlerRegistry: restoreHandlerRegistry,
    paths,
    liveDatabaseFile,
  })

  const liveCountBefore = await liveMemberCount()
  check('live member count > 0 (seed functional)', liveCountBefore >= 3)

  // 3) Round-trip restore (backup penuh)
  const restoreRun = await restoreService.run({ backupFilePath: backupPath })
  check(`round-trip restore → status ${restoreRun.status}`, restoreRun.status === RESTORE_STATUS.SUCCESS)
  check('round-trip restore → files === 2', restoreRun.files === 2)
  check('round-trip restore → schemaVersionBefore == wo_member_photo', restoreRun.schemaVersionBefore === EXPECTED_SCHEMA_VERSION)
  check('round-trip restore → schemaVersionRestored == wo_member_photo', restoreRun.schemaVersionRestored === EXPECTED_SCHEMA_VERSION)
  check('round-trip restore → needsRestart true', restoreRun.needsRestart === true)
  check('round-trip restore → errors kosong', restoreRun.errors.length === 0)
  check('round-trip restore → probe A dipertahankan', (await liveMarkers()).join(',') === 'A')
  check('round-trip restore → member count dipertahankan', (await liveMemberCount()) === liveCountBefore)
  check('round-trip restore → integrity_check ok', await liveIntegrityOk())
  const restoredFiles = photoFiles(photosDir)
  check(
    'round-trip restore → photosDir berisi 2 file (siswa + umum)',
    restoredFiles.length === 2 &&
      restoredFiles.includes(`member-photo-${memberIds.studentId}.png`) &&
      restoredFiles.includes(`member-photo-${memberIds.generalId}.webp`)
  )

  // 4) Junk di liveDir → hilang setelah restore (swapToLive asset)
  const junkPath = path.join(photosDir, 'junk.bin')
  fs.writeFileSync(junkPath, Buffer.from('junk'))
  check('pre-junk → photosDir 3 file', photoFiles(photosDir).length === 3)
  const restoreRunJunk = await restoreService.run({ backupFilePath: backupPath })
  check(`junk-restore → status ${restoreRunJunk.status}`, restoreRunJunk.status === RESTORE_STATUS.SUCCESS)
  check('junk-restore → errors kosong', restoreRunJunk.errors.length === 0)
  const afterJunk = photoFiles(photosDir)
  check('junk-restore → junk hilang, tepat 2 file tersisa', afterJunk.length === 2 && !afterJunk.includes('junk.bin'))
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

  const junkPath2 = path.join(photosDir, 'junk2.bin')
  fs.writeFileSync(junkPath2, Buffer.from('junk2'))
  check('pre-db-only → photosDir 3 file', photoFiles(photosDir).length === 3)

  const dbOnlyRestore = await restoreService.run({ backupFilePath: dbOnlyZipPath })
  check(`db-only restore → status ${dbOnlyRestore.status}`, dbOnlyRestore.status === RESTORE_STATUS.SUCCESS)
  check('db-only restore → files === 1', dbOnlyRestore.files === 1)
  check('db-only restore → errors kosong', dbOnlyRestore.errors.length === 0)
  check('db-only restore → schemaVersionRestored == wo_member_photo', dbOnlyRestore.schemaVersionRestored === EXPECTED_SCHEMA_VERSION)
  const afterDbOnly = photoFiles(photosDir)
  check(
    'db-only restore → liveDir TIDAK tersentuh (3 file tetap ada)',
    afterDbOnly.length === 3 && afterDbOnly.includes('junk2.bin')
  )
  check('db-only restore → probe A dipertahankan', (await liveMarkers()).join(',') === 'A')

  // 6) Provider OPTIONAL — direktori aset kosong → arsip zip kosong tetap valid
  const emptyPhotosDir = path.join(tempRoot, 'assets', 'empty-photos')
  const emptyProvider = new MemberPhotosBackupProvider({ assetDir: emptyPhotosDir, stagingDir: stagingRoot })
  const emptyRegistry = new ProviderRegistry()
  emptyRegistry.register(snapProvider)
  emptyRegistry.register(emptyProvider)
  const emptyBackupService = new BackupService({
    providerRegistry: emptyRegistry,
    schemaVersionReader: new SchemaVersionReader(),
    manifestBuilder: new ManifestBuilder(),
    packager: new BackupPackager(),
    verifier: new BackupVerifier({ tempDir: stagingRoot }),
    paths,
    providerStagingDirs: new Map([
      [snapProvider.id.fullName, stagingRoot],
      [emptyProvider.id.fullName, stagingRoot],
    ]),
  })
  const emptyBackup = await emptyBackupService.run({ appVersion: '0.1.0', appName: 'APLibrary' })
  check('backup dir aset kosong → status SUCCESS', emptyBackup.status === 'SUCCESS')
  const emptyVerify = await new BackupVerifier({ tempDir: stagingRoot }).verify(emptyBackup.filePath as string)
  check('backup dir kosong → verifier ok', emptyVerify.ok)
  const emptyEntry = emptyVerify.manifest?.files.find(
    (entry) => entry.path === MEMBER_PHOTOS_ARCHIVE_RELATIVE_PATH
  )
  check('backup dir kosong → entri member-photos.zip ada', emptyEntry !== undefined)
  const emptyContainerZip = new AdmZip(fs.readFileSync(emptyBackup.filePath as string))
  const emptyInnerEntry = emptyContainerZip.getEntry(MEMBER_PHOTOS_ARCHIVE_RELATIVE_PATH)
  check('backup dir kosong → wadah berisi member-photos.zip', emptyInnerEntry !== null)
  const emptyInnerNames = new AdmZip(emptyInnerEntry!.getData()).getEntries().map((entry) => entry.entryName)
  check('backup dir kosong → zip aset KOSONG (0 entri)', emptyInnerNames.length === 0)
  const emptyRestore = await restoreService.run({ backupFilePath: emptyBackup.filePath as string })
  check(`restore wadah dir kosong → status ${emptyRestore.status}`, emptyRestore.status === RESTORE_STATUS.SUCCESS)
  check('restore wadah dir kosong → files === 2', emptyRestore.files === 2)
  const afterEmptyRestore = photoFiles(photosDir)
  check(
    'restore wadah dir kosong → liveDir DIGANTI isi arsip (0 file, liveDir lama diarsipkan)',
    afterEmptyRestore.length === 0
  )

  // Cleanup
  await snapProvider.cleanup().catch(() => undefined)
  await photosProvider.cleanup().catch(() => undefined)
  await emptyProvider.cleanup().catch(() => undefined)
  await disconnectPrisma().catch(() => undefined)
}

// ============================================================================
// main — urutan eksekusi.
// ============================================================================

async function main(): Promise<void> {
  // Matikan cache file sharp (default menyimpan sampai 20 file DESKRIPTOR
  // terbuka di Windows) agar file fixture (mis. photo.webp) tidak terkunci
  // EBUSY saat cleanup rmSync temp root di akhir smoke.
  sharp.cache(false)
  console.log('=== WO Member Photo Smoke (functional + backup/restore) ===')
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wo-member-photo-'))
  const paths = createAppPaths(tempRoot)
  const photosDir = paths.assetMemberPhotosDir
  const fixtures = await makeFixtureImages(path.join(tempRoot, 'photos-src'))

  try {
    const memberIds = await testFunctional(photosDir, fixtures)
    await dbBackedSection(tempRoot, photosDir, memberIds)
  } finally {
    await disconnectPrisma().catch(() => undefined)
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }

  console.log(`\nTotal: ${passed} PASS, ${failed} FAIL`)
  if (failed > 0) process.exit(1)
}

main().catch((error) => {
  console.error('UNCAUGHT:', error)
  process.exit(1)
})
