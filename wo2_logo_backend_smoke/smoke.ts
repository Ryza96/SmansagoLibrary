// WO-2 (LOGO MANAGEMENT — BACKEND) — Smoke: resize (sharp) + pickLogoPreview +
// saveLogo (atomic) + clearLogo + update(logoUpload/logoClear) + rollback.
// Sumber: RFC_LOGO_MANAGEMENT_ARCHITECTURE.md (LOCKED REVISION 1) §7/§8/§9/§10/§15.1.
// Jalankan: fresh DB temp (prisma migrate deploy) + DATABASE_URL absolute +
// NODE_PATH=<repo>\node_modules. compile: --module commonjs --moduleResolution node.

import { getPrisma } from '../src/main/repositories/base/prisma'
import { initDatabase, closeDatabase } from '../electron/main/database'
import { SettingService } from '../electron/main/services/setting.service'
import { SettingRepository } from '../electron/main/repositories/setting.repository'
import {
  resizeLogoImage,
  LOGO_RESIZE_MAX_DIMENSION,
} from '../src/main/infrastructure/asset/logo-resize'
import sharp from 'sharp'
import os from 'os'
import path from 'path'
import fsp from 'fs/promises'
import fs from 'fs'
import { LOGO_BASENAME } from '../src/main/infrastructure/asset/logo-config'

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

async function main(): Promise<void> {
  const tmp = path.join(os.tmpdir(), `wo2-logo-smoke-${Date.now()}`)
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

  const smallPng = path.join(fixtures, 'small.png')
  const exactPng = path.join(fixtures, 'exact.png')
  const bigPng = path.join(fixtures, 'big.png')
  const bigJpg = path.join(fixtures, 'big.jpg')
  const bigWebp = path.join(fixtures, 'big.webp')
  await fsp.writeFile(smallPng, await makePng(100, 200))
  await fsp.writeFile(exactPng, await makePng(LOGO_RESIZE_MAX_DIMENSION, LOGO_RESIZE_MAX_DIMENSION))
  await fsp.writeFile(bigPng, await makePng(2000, 1000))
  await fsp.writeFile(bigJpg, await sharp({ create: { width: 1500, height: 500, channels: 3, background: '#333' } }).jpeg().toBuffer())
  await fsp.writeFile(bigWebp, await sharp({ create: { width: 800, height: 800, channels: 4, background: { r: 0, g: 128, b: 0, alpha: 1 } } }).webp().toBuffer())

  console.log('--- STEP 2: resizeLogoImage murni (RFC §9) ---')
  const smallBytes = await fsp.readFile(smallPng)
  const smallResized = await resizeLogoImage(smallPng)
  expectEqual('small (100x200) tidak di-upscale — byte identik', smallResized.equals(smallBytes), true)
  const exactResized = await resizeLogoImage(exactPng)
  const exactBytes = await fsp.readFile(exactPng)
  expectEqual('exact (512x512) tidak di-upscale — byte identik', exactResized.equals(exactBytes), true)

  const bigPngMeta = await sharp(await resizeLogoImage(bigPng)).metadata()
  check('big png (2000x1000) → width 512', bigPngMeta.width === LOGO_RESIZE_MAX_DIMENSION, `w=${bigPngMeta.width}`)
  check('big png aspect 2:1 dipertahankan → height 256', bigPngMeta.height === 256, `h=${bigPngMeta.height}`)

  const bigJpgMeta = await sharp(await resizeLogoImage(bigJpg)).metadata()
  check('big jpg (1500x500) → width 512', bigJpgMeta.width === LOGO_RESIZE_MAX_DIMENSION, `w=${bigJpgMeta.width}`)
  check(
    'big jpg aspect 3:1 dipertahankan → height ~171',
    bigJpgMeta.height !== undefined && Math.abs(bigJpgMeta.height - 170.67) < 1.5,
    `h=${bigJpgMeta.height}`
  )

  const bigWebpMeta = await sharp(await resizeLogoImage(bigWebp)).metadata()
  expectEqual('big webp (800x800) → 512x512', `${bigWebpMeta.width}x${bigWebpMeta.height}`, `${LOGO_RESIZE_MAX_DIMENSION}x${LOGO_RESIZE_MAX_DIMENSION}`)

  const fmtPng = await sharp(await resizeLogoImage(bigPng)).metadata()
  const fmtJpg = await sharp(await resizeLogoImage(bigJpg)).metadata()
  const fmtWebp = await sharp(await resizeLogoImage(bigWebp)).metadata()
  expectEqual('format output = png', fmtPng.format, 'png')
  expectEqual('format output = jpeg', fmtJpg.format, 'jpeg')
  expectEqual('format output = webp', fmtWebp.format, 'webp')

  console.log('--- STEP 3: pickLogoPreview (RFC §15.1) ---')
  const preview = await service.pickLogoPreview(smallPng)
  check('preview shape: filePath + sizeBytes + previewUri', preview.filePath.length > 0, '')
  check('preview.sizeBytes > 0', preview.sizeBytes > 0, `size=${preview.sizeBytes}`)
  check('preview.previewUri data:image/png;base64', preview.previewUri.startsWith('data:image/png;base64,'), preview.previewUri.slice(0, 30))
  const previewBuf = Buffer.from(preview.previewUri.slice('data:image/png;base64,'.length), 'base64')
  const previewMeta = await sharp(previewBuf).metadata()
  check('preview adalah hasil RESIZE (100x200 → tetap, tidak upscale)', previewMeta.width === 100 && previewMeta.height === 200, `w=${previewMeta.width} h=${previewMeta.height}`)

  const txt = path.join(fixtures, 'logo.txt')
  await fsp.writeFile(txt, 'bukan gambar')
  await expectRejected('pickLogo: ekstensi tidak didukung ditolak', () => service.pickLogoPreview(txt), 'Format file tidak didukung')

  const emptyPng = path.join(fixtures, 'empty.png')
  await fsp.writeFile(emptyPng, Buffer.alloc(0))
  await expectRejected('pickLogo: file kosong ditolak', () => service.pickLogoPreview(emptyPng), 'File logo kosong')

  const fatPng = path.join(fixtures, 'fat.png')
  await fsp.writeFile(fatPng, await makePng(10, 10))
  const fatBuf = await fsp.readFile(fatPng)
  const padding = Buffer.alloc(512 * 1024 + 100) // > 512 KB
  await fsp.writeFile(fatPng, Buffer.concat([fatBuf, padding]))
  await expectRejected('pickLogo: ukuran > 512 KB ditolak', () => service.pickLogoPreview(fatPng), 'melebihi 512 KB')

  const garbagePng = path.join(fixtures, 'garbage.png')
  await fsp.writeFile(garbagePng, Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]))
  await expectRejected('pickLogo: isi bukan gambar (decode gagal) ditolak', () => service.pickLogoPreview(garbagePng), 'tidak dapat diproses')

  console.log('--- STEP 4: saveLogo happy path (RFC §7/§9/§10) ---')
  await service.saveLogo(bigPng)
  const row1 = await repo.get()
  expectEqual('DB logoPath relatif forward-slash', row1?.logoPath, `assets/school-logo/${LOGO_BASENAME}.png`)
  expectEqual('file school-logo.png tersimpan', fs.existsSync(path.join(logoDir, `${LOGO_BASENAME}.png`)), true)
  const savedMeta = await sharp(path.join(logoDir, `${LOGO_BASENAME}.png`)).metadata()
  check('file tersimpan = hasil resize (512x256)', savedMeta.width === 512 && savedMeta.height === 256, `w=${savedMeta.width} h=${savedMeta.height}`)
  expectEqual('tepat satu school-logo.* di folder', logoFiles(logoDir).length, 1)

  console.log('--- STEP 5: replace (cleanupLegacyLogos) ---')
  await service.saveLogo(bigWebp)
  expectEqual('replace → hanya school-logo.webp', logoFiles(logoDir).join(','), `${LOGO_BASENAME}.webp`)
  const rowWebp = await repo.get()
  expectEqual('DB logoPath update ke webp', rowWebp?.logoPath, `assets/school-logo/${LOGO_BASENAME}.webp`)
  await service.saveLogo(bigPng)
  expectEqual('replace ulang → hanya school-logo.png', logoFiles(logoDir).join(','), `${LOGO_BASENAME}.png`)
  const rowPng2 = await repo.get()
  expectEqual('DB logoPath update ke png', rowPng2?.logoPath, `assets/school-logo/${LOGO_BASENAME}.png`)

  console.log('--- STEP 6: rollback saat update DB gagal (RFC §10) ---')
  const badRepo = new SettingRepository()
  ;(badRepo as unknown as { update: unknown }).update = async () => {
    throw new Error('db boom')
  }
  const badService = new SettingService(badRepo, logoDir)
  await expectRejected('saveLogo: update DB gagal → AppError', () => badService.saveLogo(smallPng), 'Gagal menyimpan logo sekolah')
  expectEqual('rollback → file lama aman (tepat satu logo lama tersisa)', logoFiles(logoDir).length, 1)
  const rowBad = await repo.get()
  expectEqual('rollback → DB tetap menunjuk logo lama (.png)', rowBad?.logoPath, `assets/school-logo/${LOGO_BASENAME}.png`)

  console.log('--- STEP 7: clearLogo (RFC §7) ---')
  await service.saveLogo(smallPng)
  expectEqual('seed sebelum clear: 1 file', logoFiles(logoDir).length, 1)
  await service.clearLogo()
  const rowClear = await repo.get()
  expectEqual('clearLogo → DB logoPath kosong', rowClear?.logoPath, '')
  expectEqual('clearLogo → folder bersih', logoFiles(logoDir).length, 0)

  console.log('--- STEP 8: update(logoUpload/logoClear) + field teks (RFC §7) ---')
  await service.update({ logoUpload: bigJpg, libraryName: 'Uji Update' })
  const rowUpd = await repo.get()
  expectEqual('update(logoUpload) → logoPath .jpg', rowUpd?.logoPath, `assets/school-logo/${LOGO_BASENAME}.jpg`)
  expectEqual('update(logoUpload) → field teks ikut tertulis', rowUpd?.libraryName, 'Uji Update')
  expectEqual('update(logoUpload) → file .jpg tersimpan', logoFiles(logoDir).join(','), `${LOGO_BASENAME}.jpg`)

  await service.update({ logoClear: true })
  const rowClear2 = await repo.get()
  expectEqual('update(logoClear) → logoPath kosong', rowClear2?.logoPath, '')
  expectEqual('update(logoClear) → folder bersih', logoFiles(logoDir).length, 0)

  await service.update({ libraryName: 'Perpus Teks' })
  const rowText = await repo.get()
  expectEqual('update teks-only → logoPath tetap kosong', rowText?.logoPath, '')
  expectEqual('update teks-only → libraryName berubah', rowText?.libraryName, 'Perpus Teks')

  console.log('--- STEP 9: update(logoUpload) invalid → gagal, field teks TIDAK ditulis ---')
  const badFile = path.join(fixtures, 'bad.webp')
  await fsp.writeFile(badFile, Buffer.from([9, 9, 9, 9]))
  await expectRejected('update: logoUpload isi tidak valid ditolak', () => service.update({ logoUpload: badFile, libraryName: 'JANGAN TERTULIS' }), 'tidak dapat diproses')
  const rowAfter = await repo.get()
  expectEqual('field teks tidak tertulis saat logo gagal', rowAfter?.libraryName, 'Perpus Teks')

  console.log('--- STEP 10: backward-compat get() + regresi repo ---')
  const viaGet = await service.get()
  expectEqual('get() mengembalikan settings row', viaGet?.libraryName, 'Perpus Teks')

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
