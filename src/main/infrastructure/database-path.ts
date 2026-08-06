// WO-5 — Resolver jalur file database live (murni, tanpa Electron/Prisma).
// Live DB belum direlokasi ke userData (ADR-001 §8.2 Q2–Q5 = WO masa depan);
// sampai saat itu file live = resolve(process.env.DATABASE_URL).
// Bentuk URL Prisma `file:`:
//   file:./aplibrary.db          (relatif — Prisma resolve terhadap dir schema)
//   file:C:/absolut/path.db      (absolut Windows, forward-slash)
//   file:/absolut/path.db        (absolut POSIX)
// Murni infra: mudah di-smoke headless.

import path from 'path'

export function resolveLiveDatabaseFile(databaseUrl: string, schemaDir?: string): string {
  let raw = databaseUrl.trim()
  if (!raw.startsWith('file:')) {
    // Bukan URL file: → fallback ke path apa adanya (direktori kerja).
    return path.resolve(process.cwd(), raw)
  }
  let p = raw.slice('file:'.length)
  if (p.startsWith('///')) {
    p = p.slice(3)
  } else if (p.startsWith('//')) {
    p = p.slice(2)
  }
  p = p.replace(/\\/g, '/')
  if (/^[A-Za-z]:/.test(p) || p.startsWith('/')) {
    return path.normalize(p)
  }
  const base = schemaDir !== undefined && schemaDir.length > 0 ? schemaDir : process.cwd()
  return path.resolve(base, p)
}
