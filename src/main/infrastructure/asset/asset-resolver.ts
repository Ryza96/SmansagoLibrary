// WO-1 (LOGO MANAGEMENT — FOUNDATION) — Resolver + pembersih file logo lama.
// Sumber: RFC_LOGO_MANAGEMENT_ARCHITECTURE.md (LOCKED REVISION 1):
//   §5  logoPath disimpan RELATIF terhadap userData (forward slash).
//   §12 resolveAssetPath = SATU-SATUNYA pembaca logoPath:
//        1. '' | null → null (fallback monogram)
//        2. diawali '/', '\', mengandung ':' (drive) atau 'file://'
//             → ABSOLUT LAMA → pakai apa adanya bila ada; bila tidak → null
//        3. selainnya → RELATIF → gabung paths.root (guard resolveWithin)
//   §4/§10 cleanupLegacyLogos: hapus seluruh `school-logo.*` dalam folder
//       (guard resolveWithin) sebelum menulis logo baru.

import { existsSync } from 'fs'
import { lstat, readdir, unlink } from 'fs/promises'
import { resolveWithin } from '../restore/fs-utils'
import { LOGO_BASENAME } from './logo-config'

export function isOldAbsoluteLogoPath(value: string): boolean {
  return (
    value.startsWith('/') ||
    value.startsWith('\\') ||
    value.includes(':') || // drive letter (C:\...) — sekaligus mencakup file://
    value.startsWith('file://')
  )
}

// REVISION 1 — satu pintu menentukan apakah nilai logoPath adalah path RELATIF
// yang aman digabung dengan root (RFC §12 rule 3). Semantik sejalan dengan
// resolveAssetPath: null/'' → false; absolut lama (/ \ : file://) → false;
// traversal (.. / ..\ / '../) → false. Helper dipakai Upload/Remove/Backup/
// Restore/Migration (WO berikutnya) agar logika penentuan relatif tidak diduplikasi.
export function isRelativeAssetPath(value: string | null | undefined): boolean {
  if (!value) return false
  if (isOldAbsoluteLogoPath(value)) return false
  if (value === '..' || value.startsWith('../') || value.startsWith('..\\')) return false
  return true
}

// RFC §12 — satusatunya tempat relatif↔absolut logoPath.
// `exists` di-inject agar dapat diuji headless (default: fs.existsSync).
export function resolveAssetPath(
  value: string | null | undefined,
  root: string,
  exists: (filePath: string) => boolean = existsSync
): string | null {
  if (!value) return null
  if (isOldAbsoluteLogoPath(value)) {
    return exists(value) ? value : null
  }
  try {
    const joined = resolveWithin(root, value)
    return exists(joined) ? joined : null
  } catch {
    // path traversal / tidak valid → null (fallback monogram, RFC §12)
    return null
  }
}

// RFC §4 rule 2 — hapus seluruh `school-logo.<ext>` di dalam `dir`
// (guard resolveWithin; hanya file, folder bernama school-logo.* dilewati).
// Mengembalikan jumlah file yang dihapus. Dipanggil saveLogo/clearLogo
// (WO berikutnya — util ini belum ter-wire di alur mana pun).
export async function cleanupLegacyLogos(dir: string): Promise<number> {
  const entries = await readdir(dir)
  let removed = 0
  for (const name of entries) {
    if (!name.startsWith(`${LOGO_BASENAME}.`)) continue
    const target = resolveWithin(dir, name)
    const stat = await lstat(target)
    if (!stat.isFile()) continue
    await unlink(target)
    removed++
  }
  return removed
}
