import { promises as fsp } from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { cleanupLegacyLogos } from '../../../src/main/infrastructure/asset/asset-resolver'
import {
  LOGO_BASENAME,
  LOGO_IMAGE_MIME,
  validateLogoFile,
} from '../../../src/main/infrastructure/asset/logo-config'
import { resizeLogoImage } from '../../../src/main/infrastructure/asset/logo-resize'
import { moveFilePreserving, resolveWithin } from '../../../src/main/infrastructure/restore/fs-utils'
import { SettingRepository } from '../repositories/setting.repository'
import { AppError } from '../errorHandler'

// WO-2 (LOGO MANAGEMENT — BACKEND) — sisa alur pengaturan + logo sekolah.
// Sumber: RFC_LOGO_MANAGEMENT_ARCHITECTURE.md (LOCKED REVISION 1):
//   §7  saveLogo / clearLogo — satu-satunya manipulasi file logo;
//   §8  validasi (logo-config.ts WO-1, TIDAK diduplikasi);
//   §9  resize ≤ 512×512 (downscale-only + contain) di main;
//   §10 invariant: setelah replace tepat satu school-logo.*; gagal di tengah
//       → file baru dihapus (kondisi seperti sebelum replace);
//   §15.1 pickLogoPreview: validasi → resize → data URI untuk preview renderer.
// Renderer TIDAK pernah menyentuh file; semua error via AppError(err.message).

const LOGO_ERROR_MESSAGES: Record<string, string> = {
  UNSUPPORTED_FORMAT: 'Format file tidak didukung. Gunakan PNG, JPG, JPEG, atau WEBP.',
  EMPTY: 'File logo kosong.',
  TOO_LARGE: 'Ukuran file logo melebihi 512 KB.',
}

export class SettingService {
  constructor(
    private settingRepository: SettingRepository,
    private assetSchoolLogoDir: string
  ) {}

  async get() {
    const settings = await this.settingRepository.get()
    if (!settings) {
      return this.settingRepository.createDefaultIfNotExists()
    }
    return settings
  }

  // RFC §15.1 — validasi + preview logo hasil dialog pilih file (main-side).
  async pickLogoPreview(filePath: string): Promise<{
    filePath: string
    sizeBytes: number
    previewUri: string
  }> {
    const extension = path.extname(filePath).toLowerCase()
    const sizeBytes = (await fsp.stat(filePath)).size
    this.assertValidLogo(extension, sizeBytes)
    const buffer = await this.resizeWithError(filePath)
    const mime = LOGO_IMAGE_MIME[extension]
    const previewUri = `data:${mime};base64,${buffer.toString('base64')}`
    return { filePath, sizeBytes, previewUri }
  }

  // RFC §7/§8/§9/§10 (WO-2 REVISION 1 — ATOMIC SAVE FIX).
  // Invariant "file lama aman": logo lama TIDAK pernah dihapus sebelum DB commit.
  // Urutan: validasi → resize → tulis temp (nama unik) → sisihkan target lama
  // ke backup (HANYA bila ext sama, agar rename tidak menimpa file lama) →
  // rename temp ke target → update DB → sukses: hapus backup + logo legacy
  // (ext beda) → tepat satu school-logo.* di folder.
  // Gagal di tengah → rollback: pulihkan target lama dari backup, hapus file
  // baru + temp → disk & DB kembali ke keadaan sebelum save.
  async saveLogo(sourcePath: string): Promise<void> {
    const extension = path.extname(sourcePath).toLowerCase()
    const sizeBytes = (await fsp.stat(sourcePath)).size
    this.assertValidLogo(extension, sizeBytes)
    const buffer = await this.resizeWithError(sourcePath)

    const dir = this.assetSchoolLogoDir
    await fsp.mkdir(dir, { recursive: true })
    const targetName = `${LOGO_BASENAME}${extension}`
    const target = resolveWithin(dir, targetName)
    const temp = resolveWithin(dir, `.${targetName}.tmp-${randomUUID()}`)
    const oldBackup = resolveWithin(dir, `.${targetName}.old-${randomUUID()}`)
    const hadTarget = await this.pathExists(target)

    try {
      await fsp.writeFile(temp, buffer)
      if (hadTarget) {
        // replace di tempat (ext sama): sisihkan logo lama agar tidak tertimpa
        // rename — backup inilah yang dipulihkan bila operasi gagal.
        await fsp.rename(target, oldBackup)
      }
      moveFilePreserving(temp, target)
      await this.settingRepository.update({ logoPath: `assets/school-logo/${targetName}` })
    } catch {
      // ROLLBACK — kembalikan ke keadaan sebelum save:
      //   hadTarget + backup ada → target = file baru → hapus, lalu pulihkan lama;
      //   hadTarget + backup tidak ada (rename sisih gagal) → target masih lama → jangan sentuh;
      //   !hadTarget → target (jika ada) = file baru → hapus.
      if (hadTarget) {
        if (await this.pathExists(oldBackup)) {
          await this.tryUnlink(target)
          try {
            await fsp.rename(oldBackup, target)
          } catch {
            // best-effort — backup dipertahankan (satu-satunya salinan logo lama)
          }
        }
      } else {
        await this.tryUnlink(target)
      }
      await this.tryUnlink(temp)
      throw new AppError(500, 'LogoSaveError', 'Gagal menyimpan logo sekolah.')
    }

    // SUCCESS — DB sudah menunjuk target: hapus backup (ext sama) + logo lama
    // tak terpakai (ext beda) → tepat satu school-logo.* di folder.
    try {
      await this.tryUnlink(oldBackup)
      await cleanupLegacyLogos(dir, targetName)
    } catch {
      // best-effort — logo baru sudah tersimpan & DB sudah commit
    }
  }

  // RFC §7 — hapus logo (dipanggil update({ logoClear: true })).
  async clearLogo(): Promise<void> {
    const dir = this.assetSchoolLogoDir
    await fsp.mkdir(dir, { recursive: true })
    await cleanupLegacyLogos(dir)
    await this.settingRepository.update({ logoPath: '' })
  }

  async update(data: Record<string, unknown>) {
    // RFC §7 — proses logoUpload / logoClear terlebih dahulu (fase logo),
    // baru field teks di-whitelist lalu ditulis (logoPath tetap ikut).
    if (typeof data.logoUpload === 'string' && data.logoUpload.length > 0) {
      await this.saveLogo(data.logoUpload)
    } else if (data.logoClear === true) {
      await this.clearLogo()
    }

    const allowedFields = [
      'libraryName', 'schoolName', 'address', 'phone', 'email', 'website', 'logoPath',
      'principalName', 'principalNip', 'librarianName', 'librarianNip',
      'defaultBorrowDays', 'maxBorrowBooks', 'lateFee', 'allowRenewal',
      'inventoryPrefix', 'defaultShelfLocation', 'barcodeFormat',
      'reportPaperSize', 'reportDateFormat', 'reportSigner'
    ]

    const filtered: Record<string, unknown> = {}
    for (const key of allowedFields) {
      if (key in data) {
        filtered[key] = data[key]
      }
    }

    await this.settingRepository.update(filtered)
    return this.get()
  }

  private assertValidLogo(extension: string, sizeBytes: number): void {
    const error = validateLogoFile({ extension, sizeBytes })
    if (error) {
      throw new AppError(400, 'LogoValidationError', LOGO_ERROR_MESSAGES[error])
    }
  }

  private async resizeWithError(sourcePath: string): Promise<Buffer> {
    try {
      return await resizeLogoImage(sourcePath)
    } catch {
      throw new AppError(400, 'LogoValidationError', 'File tidak dapat diproses sebagai gambar.')
    }
  }

  private async pathExists(filePath: string): Promise<boolean> {
    try {
      await fsp.access(filePath)
      return true
    } catch {
      return false
    }
  }

  private async tryUnlink(filePath: string): Promise<void> {
    try {
      await fsp.unlink(filePath)
    } catch {
      // best-effort
    }
  }
}
