import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { PrismaClient } from '@prisma/client'
import { MIGRATIONS_TABLE_DDL } from '../src/main/infrastructure/migrations/migration-bootstrap'
import {
  buildPreMigrationBackupFilename,
  createPreMigrationBackup,
  findLatestPreMigrationBackup,
  formatBackupTimestamp,
  listPreMigrationBackups,
} from '../src/main/infrastructure/migrations/pre-migration-backup'

const MIGRATION_A = '20260101_alpha'
const MIGRATION_B = '20260102_beta'

let root: string
let migrationsDir: string

function dbUrl(file: string): string {
  return 'file:' + file.replace(/\\/g, '/')
}

/** Buat file SQLite temp berisi tabel `_prisma_migrations` + daftar migrasi diterapkan. */
async function createSqliteDbWithApplied(file: string, applied: string[]): Promise<void> {
  const client = new PrismaClient({ datasources: { db: { url: dbUrl(file) } } })
  try {
    await client.$executeRawUnsafe(MIGRATIONS_TABLE_DDL)
    for (const name of applied) {
      await client.$executeRawUnsafe(
        'INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name") VALUES (?, ?, ?)',
        `id-${name}`,
        'checksum',
        name
      )
    }
  } finally {
    await client.$disconnect().catch(() => undefined)
  }
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'pre-migration-backup-'))
  migrationsDir = join(root, 'migrations')
  for (const name of [MIGRATION_A, MIGRATION_B]) {
    const dir = join(migrationsDir, name)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'migration.sql'), `-- ${name}\nSELECT 1;\n`)
  }
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('nama berkas & retensi', () => {
  it('format timestamp dan nama berpola', () => {
    const date = new Date(2026, 1, 3, 4, 5, 6) // 2026-02-03 04:05:06 lokal
    expect(formatBackupTimestamp(date)).toBe('20260203-040506')
    expect(buildPreMigrationBackupFilename('0.2.0', date)).toBe(
      'aplibrary-pra-migrasi-20260203-040506-v0.2.0.db'
    )
  })

  it('findLatestPreMigrationBackup mengembalikan berkas terbaru', () => {
    const dir = join(root, 'nama-retensi')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'aplibrary-pra-migrasi-20260101-000000-v0.1.0.db'), 'a')
    writeFileSync(join(dir, 'aplibrary-pra-migrasi-20260301-000000-v0.1.0.db'), 'b')
    writeFileSync(join(dir, 'lainnya.txt'), 'c')
    expect(findLatestPreMigrationBackup(dir)).toBe(
      join(dir, 'aplibrary-pra-migrasi-20260301-000000-v0.1.0.db')
    )
  })
})

describe('createPreMigrationBackup', () => {
  it('(a) tidak ada migrasi pending → tidak ada backup', async () => {
    const dbFile = join(root, 'a.db')
    await createSqliteDbWithApplied(dbFile, [MIGRATION_A, MIGRATION_B])
    const backupDir = join(root, 'a-backup')

    const result = await createPreMigrationBackup({
      migrationsDir,
      databaseFile: dbFile,
      backupDir,
      appVersion: '0.2.0',
    })

    expect(result.created).toBe(false)
    expect(result.backupPath).toBeNull()
    expect(result.pendingMigrations).toEqual([])
    expect(existsSync(backupDir)).toBe(false)
  })

  it('(b) ada pending + DB ada → backup berpola dan isinya identik', async () => {
    const dbFile = join(root, 'b.db')
    await createSqliteDbWithApplied(dbFile, [])
    const backupDir = join(root, 'b-backup')
    const now = new Date(2026, 1, 3, 4, 5, 6)

    const result = await createPreMigrationBackup({
      migrationsDir,
      databaseFile: dbFile,
      backupDir,
      appVersion: '0.2.0',
      now,
    })

    expect(result.created).toBe(true)
    expect([...result.pendingMigrations].sort()).toEqual([MIGRATION_A, MIGRATION_B])
    const expectedPath = join(backupDir, 'aplibrary-pra-migrasi-20260203-040506-v0.2.0.db')
    expect(result.backupPath).toBe(expectedPath)
    expect(existsSync(expectedPath)).toBe(true)
    expect(readFileSync(expectedPath).equals(readFileSync(dbFile))).toBe(true)
  })

  it('(c) file database belum ada → tanpa backup', async () => {
    const backupDir = join(root, 'c-backup')

    const result = await createPreMigrationBackup({
      migrationsDir,
      databaseFile: join(root, 'tidak-ada.db'),
      backupDir,
      appVersion: '0.2.0',
    })

    expect(result.created).toBe(false)
    expect(result.backupPath).toBeNull()
    expect(existsSync(backupDir)).toBe(false)
  })

  it('(d) lebih dari 5 backup → hanya 5 terbaru; berkas di luar folder tidak tersentuh', async () => {
    const base = join(root, 'd-backup')
    const backupDir = join(base, 'pre-migration')
    const siblingDir = join(base, 'manual')
    mkdirSync(backupDir, { recursive: true })
    mkdirSync(siblingDir, { recursive: true })

    for (let i = 1; i <= 6; i++) {
      writeFileSync(join(backupDir, `aplibrary-pra-migrasi-2026010${i}-00000${i}-v0.1.0.db`), `old-${i}`)
    }
    const sibling = join(siblingDir, 'keep.apbackup')
    writeFileSync(sibling, 'keep-me')

    const dbFile = join(root, 'd.db')
    await createSqliteDbWithApplied(dbFile, [])

    const result = await createPreMigrationBackup({
      migrationsDir,
      databaseFile: dbFile,
      backupDir,
      appVersion: '0.2.0',
      now: new Date(2026, 5, 1, 0, 0, 0),
    })

    expect(result.created).toBe(true)
    const remaining = listPreMigrationBackups(backupDir)
    expect(remaining.length).toBe(5)
    expect(remaining).not.toContain('aplibrary-pra-migrasi-20260101-000001-v0.1.0.db')
    expect(remaining).not.toContain('aplibrary-pra-migrasi-20260102-000002-v0.1.0.db')
    expect(remaining).toContain('aplibrary-pra-migrasi-20260601-000000-v0.2.0.db')
    expect(existsSync(sibling)).toBe(true)
  })

  it('(e) kegagalan menyalin → fungsi melempar error yang jelas', async () => {
    const backupDir = join(root, 'e-backup')
    const notAFile = join(root, 'e-direktori-sebagai-db')
    mkdirSync(notAFile, { recursive: true })

    await expect(
      createPreMigrationBackup({
        migrationsDir,
        databaseFile: notAFile,
        backupDir,
        appVersion: '0.2.0',
      })
    ).rejects.toThrow(/Backup pra-migrasi gagal/)
  })
})
