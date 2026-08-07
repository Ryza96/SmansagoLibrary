// WO-2 REVISION 1 (ATOMIC SAVE FIX) — Smoke validasi invariant RFC §10
// "file lama aman" pada saveLogo. Fault-injection nyata (bukan dummy):
//   A. DB update gagal → logo lama masih ada + DB tetap menunjuk logo lama
//   B. rename (final move) gagal → logo lama tetap ada
//   C. write temp gagal → logo lama tetap ada
//   D. decode gagal → tidak ada perubahan
//   E. resize gagal → tidak ada perubahan
// Plus success path (ext sama / ext beda / tanpa logo / legacy ganda) dengan
// invariant global: tidak ada dangling, tidak ada orphan, tidak ada dua logo,
// tidak ada file .tmp-/.old- tersisa.
//
// Jalankan: fresh DB temp (prisma migrate deploy) + DATABASE_URL absolute +
// NODE_PATH=<repo>\node_modules. Compile: --module commonjs --moduleResolution node.

import fs from 'fs'
import fsp from 'fs/promises'
import os from 'os'
import path from 'path'
import sharp from 'sharp'
import { getPrisma } from '../src/main/repositories/base/prisma'
import { initDatabase, closeDatabase } from '../electron/main/database'
import { SettingService } from '../electron/main/services/setting.service'
import { SettingRepository } from '../electron/main/repositories/setting.repository'
import { LOGO_BASENAME } from '../src/main/infrastructure/asset/logo-config'

const realFs = require('fs') as typeof fs

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

async function makePng(w: number, h: number): Promise<Buffer> {
  return sharp({ create: { width: w, height: h, channels: 4, background: { r: 20, g: 90, b: 200, alpha: 1 } } })
    .png()
    .toBuffer()
}

function logoFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter((n) => n.startsWith(`${LOGO_BASENAME}.`))
}

function residueEntries(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter((n) => n.includes('.tmp-') || n.includes('.old-'))
}

// Invariant global pasca operasi: DB ↔ disk konsisten, tepat satu logo,
// tidak ada file transisi tersisa.
async function assertInvariant(label: string, dir: string, repo: SettingRepository): Promise<void> {
  const row = await repo.get()
  const files = logoFiles(dir)
  const residue = residueEntries(dir)
  let ok = residue.length === 0
  let detail = `residue=[${residue.join(',')}]`
  if (row?.logoPath) {
    const expectedBase = path.basename(row.logoPath)
    const exists = fs.existsSync(path.join(dir, expectedBase))
    ok = ok && files.length === 1 && files[0] === expectedBase && exists
    detail += `; files=[${files.join(',')}] db=${row.logoPath}`
  } else {
    ok = ok && files.length === 0
    detail += `; files=[${files.join(',')}] db=''`
  }
  check(label, ok, detail)
}

function failingRepo(): SettingRepository {
  const repo = new SettingRepository()
  ;(repo as unknown as { update: unknown }).update = async () => {
    throw new Error('db boom')
  }
  return repo
}

// Patch fs.renameSync + fs.copyFileSync agar operasi MOVE menuju `to` gagal
// (memicu jalur fallback copy juga, sehingga moveFilePreserving menyebarkan error).
async function withMoveFail(to: string, fn: () => Promise<void>): Promise<void> {
  const targetAbs = path.resolve(to)
  const origRename = realFs.renameSync
  const origCopy = realFs.copyFileSync
  realFs.renameSync = ((from: string, toPath: string) => {
    if (path.resolve(toPath) === targetAbs) throw new Error('rename boom')
    return origRename(from, toPath)
  }) as typeof realFs.renameSync
  realFs.copyFileSync = ((from: string, toPath: string) => {
    if (path.resolve(toPath) === targetAbs) throw new Error('copy boom')
    return origCopy(from, toPath)
  }) as typeof realFs.copyFileSync
  try {
    await fn()
  } finally {
    realFs.renameSync = origRename
    realFs.copyFileSync = origCopy
  }
}

// Patch fs.promises.writeFile agar tulis temp gagal (jalur writeFile DI DALAM try).
async function withWriteTempFail(fn: () => Promise<void>): Promise<void> {
  const origWrite = realFs.promises.writeFile
  realFs.promises.writeFile = (async (filePath: string, ...rest: unknown[]) => {
    if (typeof filePath === 'string' && filePath.includes('.tmp-')) throw new Error('write boom')
    return (origWrite as unknown as (...a: unknown[]) => Promise<void>)(filePath, ...rest)
  }) as typeof realFs.promises.writeFile
  try {
    await fn()
  } finally {
    realFs.promises.writeFile = origWrite
  }
}

async function main(): Promise<void> {
  const tmp = path.join(os.tmpdir(), `wo2-r1-logo-${Date.now()}`)
  const logoDir = path.join(tmp, 'assets', 'school-logo')
  await fsp.mkdir(logoDir, { recursive: true })

  const prisma = getPrisma()
  await initDatabase()
  const repo = new SettingRepository()
  const service = new SettingService(repo, logoDir)

  console.log('--- STEP 1: seed settings + fixtures ---')
  await prisma.setting.create({ data: { libraryName: 'Perpus Uji', logoPath: '' } })
  const fixtures = path.join(tmp, 'fixtures')
  await fsp.mkdir(fixtures, { recursive: true })
  const bigPng = path.join(fixtures, 'big.png')
  const bigWebp = path.join(fixtures, 'big.webp')
  const smallPng = path.join(fixtures, 'small.png')
  const garbagePng = path.join(fixtures, 'garbage.png')
  await fsp.writeFile(bigPng, await makePng(2000, 1000))
  await fsp.writeFile(bigWebp, await sharp({ create: { width: 800, height: 800, channels: 4, background: { r: 0, g: 128, b: 0, alpha: 1 } } }).webp().toBuffer())
  await fsp.writeFile(smallPng, await makePng(100, 200))
  await fsp.writeFile(garbagePng, Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]))
  const smallPngBytes = await fsp.readFile(smallPng)

  console.log('--- STEP 2: baseline (sukses) — logo .png (100x200, tidak di-upscale) ---')
  await service.saveLogo(smallPng)
  const row0 = await repo.get()
  expectEqual('baseline DB .png', row0?.logoPath, `assets/school-logo/${LOGO_BASENAME}.png`)
  expectEqual('baseline file = smallPng bytes asli', (await fsp.readFile(path.join(logoDir, `${LOGO_BASENAME}.png`))).equals(smallPngBytes), true)
  await assertInvariant('invariant pasca baseline', logoDir, repo)

  console.log('--- STEP 3 (A1): DB update gagal, ext BEDA (.png→.webp) ---')
  const badService = new SettingService(failingRepo(), logoDir)
  await expectRejected('A1 saveLogo(.webp) DB gagal → AppError', () => badService.saveLogo(bigWebp), 'Gagal menyimpan logo sekolah')
  expectEqual('A1 file lama .png masih ada', (await fsp.readFile(path.join(logoDir, `${LOGO_BASENAME}.png`))).equals(smallPngBytes), true)
  expectEqual('A1 tidak ada file baru .webp', logoFiles(logoDir).join(','), `${LOGO_BASENAME}.png`)
  const rowA1 = await repo.get()
  expectEqual('A1 DB tetap menunjuk .png', rowA1?.logoPath, `assets/school-logo/${LOGO_BASENAME}.png`)
  await assertInvariant('invariant pasca A1', logoDir, repo)

  console.log('--- STEP 4 (A2): DB update gagal, ext SAMA (.png→.png) ---')
  await expectRejected('A2 saveLogo(.png) DB gagal → AppError', () => badService.saveLogo(bigPng), 'Gagal menyimpan logo sekolah')
  expectEqual('A2 logo lama dipulihkan dari backup (bytes smallPng)', (await fsp.readFile(path.join(logoDir, `${LOGO_BASENAME}.png`))).equals(smallPngBytes), true)
  const rowA2 = await repo.get()
  expectEqual('A2 DB tetap menunjuk .png', rowA2?.logoPath, `assets/school-logo/${LOGO_BASENAME}.png`)
  await assertInvariant('invariant pasca A2', logoDir, repo)

  console.log('--- STEP 5 (A3): DB update gagal, TANPA logo lama ---')
  await service.clearLogo()
  await expectRejected('A3 saveLogo(.webp) DB gagal → AppError', () => badService.saveLogo(bigWebp), 'Gagal menyimpan logo sekolah')
  expectEqual('A3 folder tetap kosong', logoFiles(logoDir).length, 0)
  const rowA3 = await repo.get()
  expectEqual('A3 DB tetap kosong', rowA3?.logoPath, '')
  await assertInvariant('invariant pasca A3', logoDir, repo)
  await service.saveLogo(smallPng) // re-seed baseline

  console.log('--- STEP 6 (B1): rename/move gagal, ext BEDA ---')
  await withMoveFail(path.join(logoDir, `${LOGO_BASENAME}.webp`), async () => {
    await expectRejected('B1 saveLogo(.webp) move gagal → AppError', () => service.saveLogo(bigWebp), 'Gagal menyimpan logo sekolah')
  })
  expectEqual('B1 file lama .png masih ada', (await fsp.readFile(path.join(logoDir, `${LOGO_BASENAME}.png`))).equals(smallPngBytes), true)
  expectEqual('B1 tidak ada file baru .webp', logoFiles(logoDir).join(','), `${LOGO_BASENAME}.png`)
  const rowB1 = await repo.get()
  expectEqual('B1 DB tetap menunjuk .png', rowB1?.logoPath, `assets/school-logo/${LOGO_BASENAME}.png`)
  await assertInvariant('invariant pasca B1', logoDir, repo)

  console.log('--- STEP 7 (B2): rename/move gagal, ext SAMA (backup dipulihkan) ---')
  await withMoveFail(path.join(logoDir, `${LOGO_BASENAME}.png`), async () => {
    await expectRejected('B2 saveLogo(.png) move gagal → AppError', () => service.saveLogo(bigPng), 'Gagal menyimpan logo sekolah')
  })
  expectEqual('B2 logo lama dipulihkan dari backup (bytes smallPng)', (await fsp.readFile(path.join(logoDir, `${LOGO_BASENAME}.png`))).equals(smallPngBytes), true)
  const rowB2 = await repo.get()
  expectEqual('B2 DB tetap menunjuk .png', rowB2?.logoPath, `assets/school-logo/${LOGO_BASENAME}.png`)
  await assertInvariant('invariant pasca B2', logoDir, repo)

  console.log('--- STEP 8 (C): write temp gagal ---')
  await withWriteTempFail(async () => {
    await expectRejected('C saveLogo(.webp) write temp gagal → AppError', () => service.saveLogo(bigWebp), 'Gagal menyimpan logo sekolah')
  })
  expectEqual('C file lama .png masih ada', (await fsp.readFile(path.join(logoDir, `${LOGO_BASENAME}.png`))).equals(smallPngBytes), true)
  expectEqual('C tidak ada file baru .webp', logoFiles(logoDir).join(','), `${LOGO_BASENAME}.png`)
  const rowC = await repo.get()
  expectEqual('C DB tetap menunjuk .png', rowC?.logoPath, `assets/school-logo/${LOGO_BASENAME}.png`)
  await assertInvariant('invariant pasca C', logoDir, repo)

  console.log('--- STEP 9 (D): decode gagal (isi bukan gambar) ---')
  await expectRejected('D saveLogo(garbage) ditolak', () => service.saveLogo(garbagePng), 'tidak dapat diproses')
  expectEqual('D file lama .png masih ada', (await fsp.readFile(path.join(logoDir, `${LOGO_BASENAME}.png`))).equals(smallPngBytes), true)
  expectEqual('D hanya satu logo', logoFiles(logoDir).join(','), `${LOGO_BASENAME}.png`)
  const rowD = await repo.get()
  expectEqual('D DB tetap menunjuk .png', rowD?.logoPath, `assets/school-logo/${LOGO_BASENAME}.png`)
  await assertInvariant('invariant pasca D', logoDir, repo)

  console.log('--- STEP 10 (E): resize gagal ---')
  const proto = SettingService.prototype as unknown as { resizeWithError: () => Promise<Buffer> }
  const origResize = proto.resizeWithError
  proto.resizeWithError = async () => {
    throw new Error('resize boom')
  }
  try {
    await expectRejected('E saveLogo resize gagal → error', () => service.saveLogo(bigWebp), 'resize boom')
  } finally {
    proto.resizeWithError = origResize
  }
  expectEqual('E file lama .png masih ada', (await fsp.readFile(path.join(logoDir, `${LOGO_BASENAME}.png`))).equals(smallPngBytes), true)
  expectEqual('E hanya satu logo', logoFiles(logoDir).join(','), `${LOGO_BASENAME}.png`)
  const rowE = await repo.get()
  expectEqual('E DB tetap menunjuk .png', rowE?.logoPath, `assets/school-logo/${LOGO_BASENAME}.png`)
  await assertInvariant('invariant pasca E', logoDir, repo)

  console.log('--- STEP 11 (S): success path ---')
  await service.saveLogo(bigWebp)
  expectEqual('S1 diff-ext → hanya .webp', logoFiles(logoDir).join(','), `${LOGO_BASENAME}.webp`)
  const rowS1 = await repo.get()
  expectEqual('S1 DB → .webp', rowS1?.logoPath, `assets/school-logo/${LOGO_BASENAME}.webp`)
  await assertInvariant('invariant pasca S1', logoDir, repo)

  await service.saveLogo(bigPng)
  const s2Meta = await sharp(path.join(logoDir, `${LOGO_BASENAME}.png`)).metadata()
  expectEqual('S2 same-ext → hanya .png', logoFiles(logoDir).join(','), `${LOGO_BASENAME}.png`)
  check('S2 file = hasil resize baru (512x256)', s2Meta.width === 512 && s2Meta.height === 256, `w=${s2Meta.width} h=${s2Meta.height}`)
  const rowS2 = await repo.get()
  expectEqual('S2 DB → .png', rowS2?.logoPath, `assets/school-logo/${LOGO_BASENAME}.png`)
  await assertInvariant('invariant pasca S2', logoDir, repo)

  await service.clearLogo()
  await service.saveLogo(bigWebp)
  expectEqual('S3 tanpa-logo → hanya .webp', logoFiles(logoDir).join(','), `${LOGO_BASENAME}.webp`)
  const rowS3 = await repo.get()
  expectEqual('S3 DB → .webp', rowS3?.logoPath, `assets/school-logo/${LOGO_BASENAME}.webp`)
  await assertInvariant('invariant pasca S3', logoDir, repo)

  // Legacy ganda (state korup sengaja): .png + .jpg sisa, DB .webp → save .webp.
  await fsp.writeFile(path.join(logoDir, `${LOGO_BASENAME}.png`), smallPngBytes)
  await fsp.writeFile(path.join(logoDir, `${LOGO_BASENAME}.jpg`), smallPngBytes)
  await service.saveLogo(bigWebp)
  expectEqual('S4 legacy ganda → hanya .webp (png+jpg dibersihkan)', logoFiles(logoDir).join(','), `${LOGO_BASENAME}.webp`)
  const rowS4 = await repo.get()
  expectEqual('S4 DB → .webp', rowS4?.logoPath, `assets/school-logo/${LOGO_BASENAME}.webp`)
  await assertInvariant('invariant pasca S4', logoDir, repo)

  console.log('--- STEP 12: regresi clearLogo ---')
  await service.clearLogo()
  const rowClear = await repo.get()
  expectEqual('clearLogo → DB kosong', rowClear?.logoPath, '')
  expectEqual('clearLogo → folder kosong', logoFiles(logoDir).length, 0)
  await assertInvariant('invariant pasca clearLogo', logoDir, repo)

  await closeDatabase()
  try {
    await fsp.rm(tmp, { recursive: true, force: true })
  } catch {
    console.warn('(cleanup tmp diabaikan — file masih di-lock sharp)')
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
