// WO MEMBER PHOTO — MemberPhotosBackupProvider (implementasi BackupProvider
// untuk aset foto anggota).
// Provider OPTIONAL (ADR-001 §8.2 — aset didaftarkan saat data-nya tersedia),
// klon pola AssetBackupProvider (book-covers):
//   • collect() — zip seluruh isi direktori aset (assets/member-photos/) ke SATU
//     arsip `member-photos.zip` berisi path relatif POSIX (nama polos, tanpa
//     direktori "assets/"); folder tidak ada → arsip kosong (idempoten).
//   • verify() — ukuran + sha256 arsip (pola DatabaseProvider).
//   • cleanup() — buang arsip staging.

import fs from 'fs'
import path from 'path'
import { createHash } from 'crypto'
import AdmZip from 'adm-zip'
import {
  BackupProvider,
  ProviderCollectResult,
  ProviderVerifyResult,
  collectResultOf,
  verifyResultOf,
  PROVIDER_REQUIREMENTS,
} from '../../domain/provider/provider'
import { ProviderId } from '../../domain/provider/provider-id'
import { PROVIDER_KINDS } from '../../domain/provider/provider-kind'
import { ManifestEntry } from '../../domain/manifest/entry'

export const MEMBER_PHOTOS_ARCHIVE_FILENAME = 'member-photos.zip'
export const MEMBER_PHOTOS_ARCHIVE_RELATIVE_PATH = 'assets/member-photos.zip'
export const MEMBER_PHOTOS_ENGINE = 'zip'

export interface MemberPhotosProviderOptions {
  assetDir: string
  stagingDir: string
}

export class MemberPhotosBackupProvider implements BackupProvider {
  readonly id: ProviderId
  readonly kind = PROVIDER_KINDS.ASSET
  readonly requirement = PROVIDER_REQUIREMENTS.OPTIONAL

  constructor(private readonly options: MemberPhotosProviderOptions) {
    this.id = ProviderId.of({ name: 'member-photos', version: '1.0.0' })
  }

  get archivePath(): string {
    // Lokasi arsip harus sama dengan `resolveStagedPath(provider, relativePath)`
    // di BackupService (stagingDir/assets/member-photos.zip) agar packager
    // menemukan file pada path yang tercatat di manifest.
    return path.join(this.options.stagingDir, 'assets', MEMBER_PHOTOS_ARCHIVE_FILENAME)
  }

  private collectFiles(dir: string): string[] {
    const files: string[] = []
    if (!fs.existsSync(dir)) return files
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        files.push(...this.collectFiles(full))
      } else if (entry.isFile()) {
        files.push(full)
      }
    }
    return files
  }

  async collect(): Promise<ProviderCollectResult> {
    const zip = new AdmZip()
    const files = this.collectFiles(this.options.assetDir)
    for (const file of files) {
      const relPosix = path.relative(this.options.assetDir, file).split(path.sep).join('/')
      zip.addLocalFile(file, '', relPosix)
    }
    fs.mkdirSync(path.dirname(this.archivePath), { recursive: true })
    await zip.writeZipPromise(this.archivePath, { overwrite: true })
    const sizeBytes = fs.statSync(this.archivePath).size
    return collectResultOf({
      kind: PROVIDER_KINDS.ASSET,
      relativePath: MEMBER_PHOTOS_ARCHIVE_RELATIVE_PATH,
      sizeBytes,
    })
  }

  async verify(entry: ManifestEntry): Promise<ProviderVerifyResult> {
    const messages: string[] = []
    if (!fs.existsSync(this.archivePath)) {
      return verifyResultOf(false, [`file aset tidak ditemukan: ${this.archivePath}`])
    }
    const actualSize = fs.statSync(this.archivePath).size
    if (actualSize !== entry.sizeBytes) {
      messages.push(`ukuran aset tidak cocok: diharapkan ${entry.sizeBytes}, aktual ${actualSize}`)
    }
    const actualSha = createHash('sha256').update(fs.readFileSync(this.archivePath)).digest('hex')
    if (actualSha !== entry.sha256.value) {
      messages.push('sha256 aset tidak cocok dengan entri manifest')
    }
    return verifyResultOf(messages.length === 0, messages)
  }

  async cleanup(): Promise<void> {
    if (fs.existsSync(this.archivePath)) {
      fs.unlinkSync(this.archivePath)
    }
  }
}
