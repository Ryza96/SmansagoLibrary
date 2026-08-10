// Tab "Informasi Aplikasi" (Settings) — service read-only, tahap 1.
// Membangun seluruh nilai DTO di main (renderer HANYA klien). Partial success:
// kegagalan satu field (dbVersion / dbSize) = null, TIDAK menggagalkan seluruh
// permintaan — pola BackupInspector.inspect (WO-6).
// dbSize memakai file .db utama SAJA (bukan -wal/-shm yang transien).

import fs from 'fs'
import { MANIFEST_BACKUP_VERSION } from '../domain/manifest/metadata'
import type { SchemaVersionReader } from '../infrastructure/backup/schema-version.reader'
import type { AppDatabaseInfoDTO } from '../../shared/dto/app-info'

export interface AppInfoServiceDeps {
  schemaVersionReader: SchemaVersionReader
  liveDatabaseFile: string
}

export class AppInfoService {
  constructor(private readonly deps: AppInfoServiceDeps) {}

  async getDatabaseInfo(): Promise<AppDatabaseInfoDTO> {
    let dbVersion: string | null = null
    try {
      dbVersion = (await this.deps.schemaVersionReader.read()).value
    } catch {
      dbVersion = null
    }

    let dbSizeBytes: number | null = null
    try {
      dbSizeBytes = fs.statSync(this.deps.liveDatabaseFile).size
    } catch {
      dbSizeBytes = null
    }

    return {
      dbVersion,
      backupVersion: MANIFEST_BACKUP_VERSION,
      dbLocation: this.deps.liveDatabaseFile,
      dbSizeBytes,
    }
  }
}
