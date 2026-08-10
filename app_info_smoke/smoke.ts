// App Info — Smoke / Engine Test untuk tab "Informasi Aplikasi" (Settings).
// Cakupan: DTO kontrak (murni) + AppInfoService (partial-success, tanpa DB
// disuntik via fake) + AppInfoService DB-backed (fresh DB, real SchemaVersionReader).
// Pola wo5_restore_smoke: smoke TIDAK menyiapkan DB — caller wajib sudah
// `prisma migrate deploy` dari workdir prisma/ dan set DATABASE_URL absolute.
// Compile: npx tsc --module commonjs --moduleResolution node --target es2022
//   --esModuleInterop --skipLibCheck --rootDir . --outDir <tmp>\out app_info_smoke/smoke.ts
// Run: node <tmp>\out\app_info_smoke\smoke.js

import fs from 'fs'
import os from 'os'
import path from 'path'
import { AppInfoService } from '../src/main/services/app-info.service'
import { SchemaVersionReader } from '../src/main/infrastructure/backup/schema-version.reader'
import { resolveLiveDatabaseFile } from '../src/main/infrastructure/database-path'
import { MANIFEST_BACKUP_VERSION } from '../src/main/domain/manifest/metadata'
import type { AppDatabaseInfoDTO } from '../src/shared/dto/app-info'

const EXPECTED_SCHEMA_VERSION = '20260809_wo_print_printer_setting'

let passed = 0
let failed = 0

function check(name: string, condition: boolean): void {
  if (condition) {
    passed++
    console.log(`PASS: ${name}`)
  } else {
    failed++
    console.error(`FAIL: ${name}`)
  }
}

// ── 1. DTO kontrak (shape — tanpa DB/Electron) ──────────────────────────────
function testDtoContract(): void {
  const full: AppDatabaseInfoDTO = {
    dbVersion: '20260809_wo_print_printer_setting',
    backupVersion: 1,
    dbLocation: 'C:/db/aplibrary.db',
    dbSizeBytes: 12345,
  }
  check('DTO dbVersion string', typeof full.dbVersion === 'string')
  check('DTO backupVersion number (int)', Number.isInteger(full.backupVersion))
  check('DTO dbLocation string', typeof full.dbLocation === 'string')
  check('DTO dbSizeBytes number', typeof full.dbSizeBytes === 'number')

  const partial: AppDatabaseInfoDTO = {
    dbVersion: null,
    backupVersion: 1,
    dbLocation: 'C:/db/aplibrary.db',
    dbSizeBytes: null,
  }
  check('DTO dbVersion bisa null (partial success)', partial.dbVersion === null)
  check('DTO dbSizeBytes bisa null (partial success)', partial.dbSizeBytes === null)
}

// ── 2. AppInfoService — partial success dengan fake deps (tanpa DB) ─────────
async function testPartialSuccess(): Promise<void> {
  const missingFile = path.join(os.tmpdir(), 'app-info-smoke-nope.db')
  const service = new AppInfoService({
    schemaVersionReader: {
      read: async () => {
        throw new Error('tidak ada migration')
      },
    } as unknown as SchemaVersionReader,
    liveDatabaseFile: missingFile,
  })

  const info = await service.getDatabaseInfo()
  check('partial: dbVersion null saat reader throw', info.dbVersion === null)
  check('partial: dbSizeBytes null saat file tidak ada', info.dbSizeBytes === null)
  check('partial: backupVersion tetap MANIFEST_BACKUP_VERSION', info.backupVersion === MANIFEST_BACKUP_VERSION)
  check('partial: dbLocation tetap liveDatabaseFile', info.dbLocation === missingFile)

  // dbSize null saat file ada tapi isi tidak bisa di-stat? (tidak realistis —
  // gunakan file yang ada untuk membuktikan jalur ukuran hidup).
  const existing = path.join(os.tmpdir(), 'app-info-smoke-real.db')
  fs.writeFileSync(existing, '0123456789')
  const service2 = new AppInfoService({
    schemaVersionReader: {
      read: async () => {
        throw new Error('tidak ada migration')
      },
    } as unknown as SchemaVersionReader,
    liveDatabaseFile: existing,
  })
  const info2 = await service2.getDatabaseInfo()
  check('partial: dbSizeBytes terisi saat file ada', info2.dbSizeBytes === 10)
  check('partial: dbVersion tetap null (reader throw)', info2.dbVersion === null)
  fs.rmSync(existing, { force: true })
}

// ── 3. AppInfoService — DB-backed (fresh DB, real SchemaVersionReader) ──────
async function dbBackedSection(): Promise<void> {
  const DATABASE_URL = process.env.DATABASE_URL ?? ''
  const liveDatabaseFile = resolveLiveDatabaseFile(DATABASE_URL, process.cwd())
  check('db: liveDatabaseFile ter-resolve', liveDatabaseFile.length > 0)
  check('db: live DB file ada (sudah migrate deploy)', fs.existsSync(liveDatabaseFile))

  const service = new AppInfoService({
    schemaVersionReader: new SchemaVersionReader(),
    liveDatabaseFile,
  })

  const info = await service.getDatabaseInfo()
  check('db: dbVersion = migration terakhir (wo_print_printer_setting)', info.dbVersion === EXPECTED_SCHEMA_VERSION)
  check('db: backupVersion = MANIFEST_BACKUP_VERSION', info.backupVersion === MANIFEST_BACKUP_VERSION)
  check('db: dbLocation = liveDatabaseFile', info.dbLocation === liveDatabaseFile)
  check('db: dbSizeBytes > 0', info.dbSizeBytes !== null && info.dbSizeBytes > 0)
  check(
    'db: dbSizeBytes == statSync(liveDatabaseFile).size',
    info.dbSizeBytes === fs.statSync(liveDatabaseFile).size
  )

  // Service TIDAK menyentuh DB (read-only) — versi ulang deterministik.
  const info2 = await service.getDatabaseInfo()
  check('db: deterministik (dua panggilan identik)', info2.dbVersion === info.dbVersion && info2.dbSizeBytes === info.dbSizeBytes)
}

async function main(): Promise<void> {
  testDtoContract()
  await testPartialSuccess()
  await dbBackedSection()

  console.log(`\nRESULT ${passed} passed, ${failed} failed`)
  if (failed > 0) {
    process.exit(1)
  }
}

main().catch((error) => {
  console.error('FATAL', error)
  process.exit(1)
})
