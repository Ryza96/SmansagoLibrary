// WO-1 (LOGO MANAGEMENT — FOUNDATION) — Smoke test resolver + validation helper
// + cleanupLegacyLogos. Sumber: RFC_LOGO_MANAGEMENT_ARCHITECTURE.md (LOCKED REVISION 1).
// Murni (fs temp saja — tanpa DB/Electron/bwip-js). Compile:
//   npx tsc --module commonjs --moduleResolution node --target es2022 --esModuleInterop
//           --skipLibCheck --rootDir . --outDir <tmp>\out wo1_logo_foundation_smoke/smoke.ts
//   node <tmp>\out\wo1_logo_foundation_smoke\smoke.js   (NODE_PATH=<repo>\node_modules)

import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  LOGO_IMAGE_MIME,
  LOGO_BASENAME,
  MAX_LOGO_SIZE_BYTES,
  isSupportedLogoExtension,
  toDotExtension,
  validateLogoFile,
} from '../src/main/infrastructure/asset/logo-config'
import { cleanupLegacyLogos, isRelativeAssetPath, resolveAssetPath } from '../src/main/infrastructure/asset/asset-resolver'

let passed = 0
let failed = 0
const failures: string[] = []

function assert(cond: boolean, label: string): void {
  if (cond) {
    passed++
  } else {
    failed++
    failures.push(label)
  }
}

function section(title: string): void {
  console.log(`\n=== ${title} ===`)
}

async function main(): Promise<void> {
  // ------------------------------------------------------------------
  // 1. Validation helper (unit) — RFC §8
  // ------------------------------------------------------------------
  section('Validation helper')
  // whitelist REVISION 1
  assert(Object.keys(LOGO_IMAGE_MIME).length === 4, 'whitelist persis 4 ekstensi')
  assert('.png' in LOGO_IMAGE_MIME && '.jpg' in LOGO_IMAGE_MIME && '.jpeg' in LOGO_IMAGE_MIME && '.webp' in LOGO_IMAGE_MIME, 'png/jpg/jpeg/webp masuk whitelist')
  assert(!('.gif' in LOGO_IMAGE_MIME) && !('.bmp' in LOGO_IMAGE_MIME) && !('.ico' in LOGO_IMAGE_MIME) && !('.svg' in LOGO_IMAGE_MIME), 'gif/bmp/ico/svg TIDAK masuk whitelist')
  assert(LOGO_BASENAME === 'school-logo', 'basename tetap school-logo')

  // ekstensi
  for (const ext of ['png', 'jpg', 'jpeg', 'webp']) {
    assert(isSupportedLogoExtension(ext), `isSupportedLogoExtension('${ext}')`)
    assert(isSupportedLogoExtension(`.${ext}`), `isSupportedLogoExtension('.${ext}')`)
    assert(isSupportedLogoExtension(ext.toUpperCase()), `isSupportedLogoExtension('${ext.toUpperCase()}') case-insensitive`)
  }
  for (const ext of ['gif', 'bmp', 'ico', 'svg', 'tiff', 'png.exe']) {
    assert(!isSupportedLogoExtension(ext), `isSupportedLogoExtension('${ext}') ditolak`)
  }
  assert(toDotExtension('png') === '.png', 'toDotExtension tanpa titik')
  assert(toDotExtension('.PNG') === '.png', 'toDotExtension huruf kecil + titik')
  assert(toDotExtension('  webp  ') === '.webp', 'toDotExtension trim')

  // ukuran: min > 0 byte, maks ≤ 512 KB
  assert(MAX_LOGO_SIZE_BYTES === 512 * 1024, 'MAX_LOGO_SIZE_BYTES = 512 KB')
  assert(validateLogoFile({ extension: 'png', sizeBytes: 1 }) === null, 'valid: png 1 byte')
  assert(validateLogoFile({ extension: 'webp', sizeBytes: 512 * 1024 }) === null, 'valid: webp persis 512 KB (boundary ≤)')
  assert(validateLogoFile({ extension: 'png', sizeBytes: 0 }) === 'EMPTY', 'EMPTY: 0 byte')
  assert(validateLogoFile({ extension: 'png', sizeBytes: 512 * 1024 + 1 }) === 'TOO_LARGE', 'TOO_LARGE: 512 KB + 1')
  assert(validateLogoFile({ extension: 'gif', sizeBytes: 10 }) === 'UNSUPPORTED_FORMAT', 'UNSUPPORTED_FORMAT: gif')

  // ------------------------------------------------------------------
  // 1b. isRelativeAssetPath — REVISION 1 (satu pintu penentu relatif)
  // ------------------------------------------------------------------
  section('isRelativeAssetPath')
  assert(isRelativeAssetPath(null) === false, 'null → false')
  assert(isRelativeAssetPath(undefined) === false, 'undefined → false')
  assert(isRelativeAssetPath('') === false, "'' → false")
  assert(isRelativeAssetPath('assets/school-logo/school-logo.png') === true, 'assets/school-logo/school-logo.png → true')
  assert(isRelativeAssetPath('school-logo/school-logo.png') === true, 'school-logo/school-logo.png → true')
  assert(isRelativeAssetPath('C:\\folder\\logo.png') === false, 'C:\\... → false')
  assert(isRelativeAssetPath('C:/folder/logo.png') === false, 'C:/... → false')
  assert(isRelativeAssetPath('file:///C:/logo.png') === false, 'file://... → false')
  assert(isRelativeAssetPath('/abs/logo.png') === false, 'leading / → false')
  assert(isRelativeAssetPath('\\abs\\logo.png') === false, 'leading backslash → false')
  assert(isRelativeAssetPath('../logo.png') === false, '../... → false')
  assert(isRelativeAssetPath('..\\logo.png') === false, '..\\... → false')
  assert(isRelativeAssetPath('..') === false, '.. → false')

  // ------------------------------------------------------------------
  // 2. Resolver (real fs) — RFC §12 backward compatibility
  // ------------------------------------------------------------------
  section('Resolver — backward compatibility')
  const root = mkdtempSync(join(tmpdir(), 'wo1-logo-'))
  const logoDir = join(root, 'assets', 'school-logo')
  const legacyAbs = join(root, 'old-logo.jpg')
  mkdirSync(logoDir, { recursive: true })
  writeFileSync(join(logoDir, 'school-logo.png'), Buffer.from('fake-png'))
  writeFileSync(legacyAbs, Buffer.from('fake-jpg'))

  // rule 1: '' | null → null
  assert(resolveAssetPath('', root) === null, "'' → null")
  assert(resolveAssetPath(null, root) === null, 'null → null')
  assert(resolveAssetPath(undefined, root) === null, 'undefined → null')

  // rule 2: ABSOLUT LAMA → pakai apa adanya bila ada
  assert(resolveAssetPath(legacyAbs, root) === legacyAbs, 'absolut lama yang ada → dipakai apa adanya')
  assert(resolveAssetPath(join(root, 'missing.png'), root) === null, 'absolut yang tidak ada → null')
  assert(resolveAssetPath('file:///C:/fake.png', root) === null, 'file:// → null (bukan path fs)')

  // rule 3: RELATIF → gabung paths.root (guard resolveWithin)
  const expectedNew = join(root, 'assets', 'school-logo', 'school-logo.png')
  assert(resolveAssetPath('assets/school-logo/school-logo.png', root) === expectedNew, 'relatif baru yang ada → gabung root')
  assert(resolveAssetPath('assets/school-logo/missing.png', root) === null, 'relatif yang tidak ada → null')

  // guard: path traversal tidak pernah keluar root
  assert(resolveAssetPath('../outside.png', root) === null, 'traversal ../ → null')
  assert(resolveAssetPath('..\\..\\..\\win.ini', root) === null, 'traversal backslash → null')

  // ------------------------------------------------------------------
  // 3. cleanupLegacyLogos — RFC §4/§10 (hapus school-logo.*; skip folder)
  // ------------------------------------------------------------------
  section('cleanupLegacyLogos')
  writeFileSync(join(logoDir, 'school-logo.jpg'), Buffer.from('j'))
  writeFileSync(join(logoDir, 'school-logo.webp'), Buffer.from('w'))
  writeFileSync(join(logoDir, 'keep.txt'), Buffer.from('k'))
  mkdirSync(join(logoDir, 'school-logo.old'))

  const removed = await cleanupLegacyLogos(logoDir)
  assert(removed === 3, `cleanupLegacyLogos menghapus 3 file (got ${removed})`)

  const remaining = readdirSync(logoDir).sort()
  assert(
    JSON.stringify(remaining) === JSON.stringify(['keep.txt', 'school-logo.old'].sort()),
    `hanya keep.txt + folder school-logo.old tersisa (got ${JSON.stringify(remaining)})`
  )

  // idempoten — run ulang di folder kosong
  assert((await cleanupLegacyLogos(logoDir)) === 0, 'run ulang di folder tanpa school-logo.* → 0')

  rmSync(root, { recursive: true, force: true })

  // ------------------------------------------------------------------
  console.log(`\nWO-1 LOGO FOUNDATION SMOKE — ${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log('Failures:')
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('SMOKE ERROR:', err)
  process.exit(1)
})
