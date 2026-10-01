import { execSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterAll } from 'vitest'

const TEMP_DIR = path.join(os.tmpdir(), `aplibrary-test-${process.pid}-${Date.now()}`)
const DB_PATH = path.join(TEMP_DIR, 'test.db')
const DB_URL = `file:${DB_PATH}`

// Pengaman: pastikan tidak mengarah ke database produksi
const FORBIDDEN_PATHS = [
  path.join(__dirname, 'prisma', 'aplibrary.db'),
  path.join(__dirname, '..', 'prisma', 'aplibrary.db'),
]

for (const forbidden of FORBIDDEN_PATHS) {
  if (DB_PATH.startsWith(forbidden) || DB_URL.includes('prisma/aplibrary.db')) {
    throw new Error(`FATAL: Test DB path must not point to production database. Got: ${DB_PATH}`)
  }
}

// Buat direktori temp
fs.mkdirSync(TEMP_DIR, { recursive: true })

// Set DATABASE_URL sebelum modul Prisma diimpor
process.env.DATABASE_URL = DB_URL

// Terapkan skema dengan prisma migrate deploy
const prismaDir = path.join(__dirname, 'prisma')
try {
  execSync('npx prisma migrate deploy', {
    cwd: prismaDir,
    env: { ...process.env, DATABASE_URL: DB_URL },
    stdio: 'pipe',
    shell: process.platform === 'win32',
  })
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  throw new Error(`FATAL: Failed to apply migrations to test DB: ${message}`)
}

// Simpan path untuk teardown
process.env.APLIBRARY_TEST_DB_PATH = DB_PATH
process.env.APLIBRARY_TEST_TEMP_DIR = TEMP_DIR

// Cleanup setelah semua test selesai
afterAll(async () => {
  // Putuskan koneksi Prisma
  try {
    const { getPrisma } = await import('./src/main/repositories/base/prisma')
    await getPrisma().$disconnect()
  } catch (err) {
    console.error('FATAL: Failed to disconnect Prisma:', err)
  }

  // Hapus folder temp DB
  try {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  } catch (err) {
    console.error('FATAL: Failed to remove temp DB folder:', err)
  }
})
