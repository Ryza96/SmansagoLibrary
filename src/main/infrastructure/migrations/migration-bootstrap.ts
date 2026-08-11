import { createHash, randomUUID } from 'crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { PrismaClient } from '@prisma/client'
import { splitSqlStatements } from './sql-split'

export const MIGRATIONS_TABLE_DDL = `CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id"                    TEXT PRIMARY KEY NOT NULL,
    "checksum"              TEXT NOT NULL,
    "finished_at"           DATETIME,
    "migration_name"        TEXT NOT NULL,
    "logs"                  TEXT,
    "rolled_back_at"        DATETIME,
    "started_at"            DATETIME NOT NULL DEFAULT current_timestamp,
    "applied_steps_count"   INTEGER UNSIGNED NOT NULL DEFAULT 0
)`

export interface MigrationFile {
  name: string
  checksum: string
  statements: string[]
}

export interface BootstrapResult {
  applied: string[]
  skipped: string[]
}

export function computeMigrationChecksum(raw: string | Buffer): string {
  return createHash('sha256').update(raw).digest('hex')
}

export function loadMigrationFiles(migrationsDir: string): MigrationFile[] {
  if (!existsSync(migrationsDir)) {
    return []
  }
  const names = readdirSync(migrationsDir)
    .filter((entry) => {
      const dir = join(migrationsDir, entry)
      const stat = statSync(dir, { throwIfNoEntry: false })
      return stat?.isDirectory() === true && existsSync(join(dir, 'migration.sql'))
    })
    .sort()

  return names.map((name) => {
    const migrationFile = join(migrationsDir, name, 'migration.sql')
    const raw = readFileSync(migrationFile)
    return {
      name,
      checksum: computeMigrationChecksum(raw),
      statements: splitSqlStatements(raw.toString('utf8'))
    }
  })
}

export async function ensureMigrationsTable(client: PrismaClient): Promise<void> {
  await client.$executeRawUnsafe(MIGRATIONS_TABLE_DDL)
}

export async function applyPendingMigrations(
  client: PrismaClient,
  files: MigrationFile[]
): Promise<BootstrapResult> {
  await ensureMigrationsTable(client)
  const rows = await client.$queryRawUnsafe<Array<{ migration_name: string }>>(
    'SELECT "migration_name" FROM "_prisma_migrations"'
  )
  const existing = new Set(rows.map((r) => r.migration_name))
  const applied: string[] = []
  const skipped: string[] = []

  for (const file of files) {
    if (existing.has(file.name)) {
      skipped.push(file.name)
      continue
    }

    await client.$transaction(async (tx) => {
      const startedAt = Date.now()
      for (const statement of file.statements) {
        await tx.$executeRawUnsafe(statement)
      }
      await tx.$executeRaw`
        INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "started_at", "applied_steps_count")
        VALUES (${randomUUID()}, ${file.checksum}, ${Date.now()}, ${file.name}, ${startedAt}, ${file.statements.length})
      `
    })
    applied.push(file.name)
  }

  return { applied, skipped }
}

export async function bootstrapMigrations(migrationsDir: string): Promise<BootstrapResult> {
  const files = loadMigrationFiles(migrationsDir)
  if (files.length === 0) {
    throw new Error(`Migration bootstrap: tidak ada migration ditemukan di: ${migrationsDir}`)
  }
  const client = new PrismaClient()
  try {
    return await applyPendingMigrations(client, files)
  } finally {
    await client.$disconnect().catch(() => undefined)
  }
}
