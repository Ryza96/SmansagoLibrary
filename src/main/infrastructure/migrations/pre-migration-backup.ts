// Jaring pengaman migrasi — backup file database SEBELUM migrasi dijalankan.
//
// Fungsi ini murni terhadap Electron (tanpa `app`/`dialog`), sehingga bisa
// dites headless. Dipakai `electron/main/index.ts` pada mode packaged:
// backup dibuat HANYA bila (1) ada migrasi yang belum diterapkan dan
// (2) file database sudah ada. Bila tidak ada migrasi pending atau file
// database belum ada (instalasi baru), TIDAK ada backup.
//
// Lokasi backup: <root>/backup/pre-migration/
// Nama berkas : aplibrary-pra-migrasi-<YYYYMMDD-HHmmss>-v<versi aplikasi>.db
// Retensi     : maksimal 5 backup terbaru (hanya di folder itu).

import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs'
import { join } from 'path'
import { PrismaClient } from '@prisma/client'
import { loadMigrationFiles } from './migration-bootstrap'

export const PRE_MIGRATION_BACKUP_PREFIX = 'aplibrary-pra-migrasi-'
export const PRE_MIGRATION_BACKUP_EXTENSION = '.db'
export const PRE_MIGRATION_BACKUP_KEEP = 5

export interface PreMigrationBackupOptions {
  /** Folder berisi folder-folder migrasi (masing-masing berisi migration.sql). */
  migrationsDir: string
  /** Path file database live yang akan disalin. */
  databaseFile: string
  /** Folder tujuan backup pra-migrasi (dibuat bila belum ada). */
  backupDir: string
  /** Versi aplikasi, dipakai pada nama berkas. */
  appVersion: string
  /** Waktu pembuatan nama berkas (opsional; default: sekarang). */
  now?: Date
  /** Jumlah backup terbaru yang dipertahankan (opsional; default 5). */
  keep?: number
}

export interface PreMigrationBackupResult {
  /** true bila berkas backup benar-benar dibuat. */
  created: boolean
  /** Path berkas backup, atau null bila tidak ada backup dibuat. */
  backupPath: string | null
  /** Daftar nama migrasi yang belum diterapkan (pending). */
  pendingMigrations: string[]
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0')
}

/** Format `YYYYMMDD-HHmmss` (waktu lokal). */
export function formatBackupTimestamp(date: Date): string {
  const datePart = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
  const timePart = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  return `${datePart}-${timePart}`
}

/** Nama berkas backup berpola: aplibrary-pra-migrasi-<ts>-v<versi>.db */
export function buildPreMigrationBackupFilename(appVersion: string, date: Date): string {
  return `${PRE_MIGRATION_BACKUP_PREFIX}${formatBackupTimestamp(date)}-v${appVersion}${PRE_MIGRATION_BACKUP_EXTENSION}`
}

function migrationFolderNames(migrationsDir: string): string[] {
  return loadMigrationFiles(migrationsDir).map((file) => file.name)
}

async function readAppliedMigrationNames(databaseFile: string): Promise<Set<string>> {
  const url = 'file:' + databaseFile.replace(/\\/g, '/')
  const client = new PrismaClient({ datasources: { db: { url } } })
  try {
    const rows = await client.$queryRawUnsafe<Array<{ migration_name: string }>>(
      'SELECT "migration_name" FROM "_prisma_migrations"'
    )
    return new Set(rows.map((row) => row.migration_name))
  } catch {
    // Tabel belum ada / file bukan database valid → anggap belum ada migrasi
    // yang diterapkan (semua migrasi dianggap pending).
    return new Set<string>()
  } finally {
    await client.$disconnect().catch(() => undefined)
  }
}

/** Daftar nama berkas backup pra-migrasi di folder, terurut menaik (lama → baru). */
export function listPreMigrationBackups(backupDir: string): string[] {
  if (!existsSync(backupDir)) {
    return []
  }
  return readdirSync(backupDir)
    .filter(
      (name) =>
        name.startsWith(PRE_MIGRATION_BACKUP_PREFIX) &&
        name.endsWith(PRE_MIGRATION_BACKUP_EXTENSION) &&
        statSync(join(backupDir, name), { throwIfNoEntry: false })?.isFile() === true
    )
    .sort()
}

/** Path backup pra-migrasi terbaru, atau null bila belum ada. */
export function findLatestPreMigrationBackup(backupDir: string): string | null {
  const names = listPreMigrationBackups(backupDir)
  if (names.length === 0) {
    return null
  }
  return join(backupDir, names[names.length - 1])
}

function prunePreMigrationBackups(backupDir: string, keep: number): void {
  const names = listPreMigrationBackups(backupDir)
  const excess = names.length - keep
  for (let index = 0; index < excess; index++) {
    unlinkSync(join(backupDir, names[index]))
  }
}

/**
 * Buat backup pra-migrasi bila diperlukan.
 * Melempar Error dengan pesan jelas bila penyalinan gagal.
 */
export async function createPreMigrationBackup(
  options: PreMigrationBackupOptions
): Promise<PreMigrationBackupResult> {
  const {
    migrationsDir,
    databaseFile,
    backupDir,
    appVersion,
    now = new Date(),
    keep = PRE_MIGRATION_BACKUP_KEEP,
  } = options

  // Instalasi baru: file database belum ada → tidak ada yang perlu di-backup.
  if (!existsSync(databaseFile)) {
    return { created: false, backupPath: null, pendingMigrations: [] }
  }

  const allMigrations = migrationFolderNames(migrationsDir)
  const applied = await readAppliedMigrationNames(databaseFile)
  const pendingMigrations = allMigrations.filter((name) => !applied.has(name))

  // Tidak ada migrasi pending → tidak ada backup.
  if (pendingMigrations.length === 0) {
    return { created: false, backupPath: null, pendingMigrations: [] }
  }

  const backupPath = join(backupDir, buildPreMigrationBackupFilename(appVersion, now))

  try {
    mkdirSync(backupDir, { recursive: true })
    copyFileSync(databaseFile, backupPath)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Backup pra-migrasi gagal: tidak dapat menyalin database "${databaseFile}" ke "${backupPath}". ${detail}`
    )
  }

  prunePreMigrationBackups(backupDir, keep)

  return { created: true, backupPath, pendingMigrations }
}
