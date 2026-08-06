// WO-5 — Util filesystem untuk Restore Engine.
// resolveWithin: guard path relatif hasil extract agar tidak keluar area staging
//   (pertahanan kedua — path relatif manifest sudah divalidasi isRelativeManifestPath).
// moveFilePreserving: rename dengan fallback copy+unlink (rename lintas volume).

import fs from 'fs'
import path from 'path'

export function resolveWithin(baseDir: string, relativePath: string): string {
  const base = path.resolve(baseDir)
  const target = path.resolve(base, relativePath)
  if (target !== base && !target.startsWith(base + path.sep)) {
    throw new Error(`path di luar area staging tidak diizinkan: ${relativePath}`)
  }
  return target
}

export function moveFilePreserving(source: string, target: string): void {
  fs.mkdirSync(path.dirname(target), { recursive: true })
  try {
    fs.renameSync(source, target)
  } catch {
    fs.copyFileSync(source, target)
    fs.unlinkSync(source)
  }
}

export function removeSideFiles(databaseFile: string): void {
  for (const ext of ['-wal', '-shm']) {
    const side = databaseFile + ext
    if (fs.existsSync(side)) {
      try {
        fs.unlinkSync(side)
      } catch {
        // best-effort pembersihan file sampingan
      }
    }
  }
}
