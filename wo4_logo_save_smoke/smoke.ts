// WO LOGO-4 (UI — Persistence) — Smoke: payload renderer `update({...form, logoUpload})`
// benar-benar mem-persist logoPath + file, save name-only TIDAK menghapus logo,
// get() fresh memuat logoPath (survive restart), dan Borrow Card merender logo
// (bukan fallback monogram). Sumber: RFC_LOGO_MANAGEMENT_ARCHITECTURE.md (LOCKED).
// Jalankan: fresh DB temp (prisma migrate deploy) + DATABASE_URL absolute +
// NODE_PATH=<repo>\node_modules. compile: --module node16 --moduleResolution node16
// (import transitif bwip-js via borrow-card.service -> barcode.service).

import { getPrisma } from '../src/main/repositories/base/prisma'
import { initDatabase, closeDatabase } from '../electron/main/database'
import { SettingService } from '../electron/main/services/setting.service'
import { SettingRepository } from '../electron/main/repositories/setting.repository'
import { BorrowRepository } from '../src/main/repositories/borrow.repository'
import { PrintService } from '../electron/main/services/print.service'
import { LOGO_BASENAME } from '../src/main/infrastructure/asset/logo-config'
import sharp from 'sharp'
import os from 'os'
import path from 'path'
import fsp from 'fs/promises'
import fs from 'fs'

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

async function makePng(w: number, h: number): Promise<Buffer> {
  return sharp({ create: { width: w, height: h, channels: 4, background: { r: 200, g: 40, b: 40, alpha: 1 } } })
    .png()
    .toBuffer()
}

function logoFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter((n) => n.startsWith(`${LOGO_BASENAME}.`))
}

async function main(): Promise<void> {
  const tmp = path.join(os.tmpdir(), `wo4-logo-save-smoke-${Date.now()}`)
  const logoDir = path.join(tmp, 'assets', 'school-logo')
  await fsp.mkdir(logoDir, { recursive: true })

  const prisma = getPrisma()
  await initDatabase()

  const settingService = new SettingService(new SettingRepository(), logoDir)
  const printService = new PrintService(new BorrowRepository(), settingService, tmp)

  console.log('--- STEP 1: seed settings + fixture logo ---')
  await prisma.setting.create({ data: { libraryName: 'Perpus Awal', schoolName: 'SMK Awal', librarianName: '', logoPath: '' } })
  const fixtures = path.join(tmp, 'fixtures')
  await fsp.mkdir(fixtures, { recursive: true })
  const logoPng = path.join(fixtures, 'logo.png')
  await fsp.writeFile(logoPng, await makePng(200, 200))
  check('fixture logo png dibuat', fs.existsSync(logoPng))

  console.log('--- STEP 2: seed peminjaman untuk cek kartu (logo KOSONG awal) ---')
  const m = await prisma.member.create({
    data: { memberNumber: 'U-000001', fullName: 'Anggota Umum', memberType: 'general', status: 'ACTIVE' }
  })
  const book = await prisma.book.create({ data: { title: 'Buku Logo' } })
  const copy = await prisma.bookCopy.create({
    data: { bookId: book.id, inventoryNumber: 'INV-000001', barcode: 'INV-000001', shelfLocation: 'R1', status: 'AVAILABLE' }
  })
  const borrow = await prisma.borrow.create({
    data: {
      borrowNumber: 'PJ-000001',
      memberId: m.id,
      borrowDate: new Date('2026-08-01'),
      dueDate: new Date('2026-08-08'),
      memberName: 'Anggota Umum',
      memberNumber: 'U-000001'
    }
  })
  await prisma.borrowDetail.create({
    data: { borrowId: borrow.id, bookCopyId: copy.id, bookTitle: 'Buku Logo' }
  })
  check('seed: peminjaman dibuat', !!borrow.id)

  const htmlNoLogo = await printService.getBorrowCardPreviewHtml(borrow.id)
  check('BEFORE save: kartu memakai fallback monogram (svg 64x64)', htmlNoLogo.includes('<svg viewBox="0 0 64 64"'))
  check('BEFORE save: tanpa <img class="logo-img">', !htmlNoLogo.includes('<img class="logo-img"'))

  console.log('--- STEP 3: payload renderer (LOGO-4) = { ...form, logoUpload: logoPreview.filePath } ---')
  const payload = {
    libraryName: 'Perpus Uji',
    schoolName: 'SMK Uji',
    librarianName: 'Bu Guru',
    logoUpload: logoPng
  }
  const result = await settingService.update(payload)
  expectEqual('DB logoPath terisi (relatif forward-slash)', result.logoPath, `assets/school-logo/${LOGO_BASENAME}.png`)
  check('file logo tersimpan di assets/school-logo', fs.existsSync(path.join(logoDir, `${LOGO_BASENAME}.png`)))
  expectEqual('tepat satu school-logo.* di folder', logoFiles(logoDir).length, 1)
  expectEqual('field teks ikut tertulis', result.libraryName, 'Perpus Uji')
  check('payload masih punya logoUpload saat renderer mengirim', payload.logoUpload === logoPng)

  console.log('--- STEP 4: name-only save TANPA logoUpload -> logo TIDAK dihapus ---')
  const nameOnly = { libraryName: 'Perpus Uji 2', schoolName: 'SMK Uji', librarianName: 'Bu Guru' }
  check('payload name-only TIDAK memuat kunci logoUpload', !('logoUpload' in nameOnly))
  const result2 = await settingService.update(nameOnly)
  expectEqual('logoPath tetap terisi (tidak dihapus)', result2.logoPath, `assets/school-logo/${LOGO_BASENAME}.png`)
  check('file logo tetap ada', fs.existsSync(path.join(logoDir, `${LOGO_BASENAME}.png`)))
  expectEqual('libraryName berubah', result2.libraryName, 'Perpus Uji 2')
  expectEqual('tepat satu school-logo.* tetap', logoFiles(logoDir).length, 1)

  console.log('--- STEP 5: get() fresh (survive restart) ---')
  const freshRepo = new SettingRepository()
  const freshService = new SettingService(freshRepo, logoDir)
  const viaGet = await freshService.get()
  expectEqual('get() fresh memuat logoPath persisten', viaGet.logoPath, `assets/school-logo/${LOGO_BASENAME}.png`)
  check('file logo masih ada di disk', fs.existsSync(path.join(logoDir, `${LOGO_BASENAME}.png`)))

  console.log('--- STEP 6: Borrow Card merender logo (bukan monogram) ---')
  const htmlWithLogo = await printService.getBorrowCardPreviewHtml(borrow.id)
  check('AFTER save: kartu memuat <img class="logo-img"', htmlWithLogo.includes('<img class="logo-img"'))
  check('AFTER save: logo src adalah data:image/png;base64', htmlWithLogo.includes('<img class="logo-img" src="data:image/png;base64,'))
  check('AFTER save: TANPA fallback monogram (svg 64x64)', !htmlWithLogo.includes('<svg viewBox="0 0 64 64"'))
  check('AFTER save: nama anggota tetap tampil', htmlWithLogo.includes('Anggota Umum'))

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
