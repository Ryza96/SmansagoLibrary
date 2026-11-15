import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import * as db from '../electron/main/database'
import { SettingRepository } from '../electron/main/repositories/setting.repository'
import { SettingService } from '../electron/main/services/setting.service'

// Uji getSavedLogoPreview: DB temp (vitest.setup.ts) + folder aset temp.
// Isi base64 logo TIDAK pernah dicetak ke log.

const TEMP_ROOT = path.join(os.tmpdir(), `aplibrary-logo-preview-${process.pid}-${Date.now()}`)
const ASSET_DIR = path.join(TEMP_ROOT, 'assets', 'school-logo')

// PNG 1x1 transparan (byte minimal, bukan konten yang dilaporkan).
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
)
// JPEG minimal (byte apa pun cukup — service hanya membaca file & mime dari ekstensi).
const JPG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xd9])

let repository: SettingRepository
let service: SettingService

beforeAll(async () => {
  fs.mkdirSync(ASSET_DIR, { recursive: true })
  await db.initDatabase()
  repository = new SettingRepository()
  service = new SettingService(repository, ASSET_DIR)
  await repository.createDefaultIfNotExists()
})

afterAll(async () => {
  try {
    await db.prisma.setting.deleteMany()
  } catch {
    // best-effort
  }
  await db.closeDatabase()
  fs.rmSync(TEMP_ROOT, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
})

describe('SettingService.getSavedLogoPreview', () => {
  it('(a) logoPath kosong → { hasLogo: false }', async () => {
    await repository.update({ logoPath: '' })
    await expect(service.getSavedLogoPreview()).resolves.toEqual({ hasLogo: false })
  })

  it('(b) logoPath menunjuk file yang tidak ada → { hasLogo: false } tanpa error', async () => {
    await repository.update({ logoPath: 'assets/school-logo/school-logo-tidak-ada.png' })
    await expect(service.getSavedLogoPreview()).resolves.toEqual({ hasLogo: false })
  })

  it('(c) file png valid → hasLogo true dan data URL image/png', async () => {
    fs.writeFileSync(path.join(ASSET_DIR, 'school-logo.png'), PNG_BYTES)
    await repository.update({ logoPath: 'assets/school-logo/school-logo.png' })
    const result = await service.getSavedLogoPreview()
    expect(result.hasLogo).toBe(true)
    if (result.hasLogo) {
      expect(result.previewUri.startsWith('data:image/png;base64,')).toBe(true)
      expect(result.previewUri.length).toBeGreaterThan('data:image/png;base64,'.length)
    }
  })

  it('(d) ekstensi jpg → data URL image/jpeg', async () => {
    fs.writeFileSync(path.join(ASSET_DIR, 'school-logo.jpg'), JPG_BYTES)
    await repository.update({ logoPath: 'assets/school-logo/school-logo.jpg' })
    const result = await service.getSavedLogoPreview()
    expect(result.hasLogo).toBe(true)
    if (result.hasLogo) {
      expect(result.previewUri.startsWith('data:image/jpeg;base64,')).toBe(true)
    }
  })

  it('(e) path traversal ditolak resolver → { hasLogo: false }', async () => {
    await repository.update({ logoPath: '../../rahasia.png' })
    await expect(service.getSavedLogoPreview()).resolves.toEqual({ hasLogo: false })
  })
})
