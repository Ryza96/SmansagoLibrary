// WO-1 (LOGO MANAGEMENT — FOUNDATION) — Konfigurasi & validasi logo sekolah.
// Sumber: RFC_LOGO_MANAGEMENT_ARCHITECTURE.md (LOCKED REVISION 1):
//   §4  naming: basename TETAP `school-logo`, ekstensi huruf kecil.
//   §8  format: whitelist PNG/JPG/JPEG/WEBP (GIF/BMP/ICO/SVG DIHAPUS);
//       ukuran maks ≤ 512 KB; file > 0 byte.

export const LOGO_BASENAME = 'school-logo'

// REVISION 1 — whitelist format logo. IMAGE_MIME existing di print.service
// memuat 8 format (dipakai untuk BACA aset apa pun); whitelist ini dipakai
// DI-FILTER pada validasi upload, bukan dibiarkan mentah (RFC §8).
export const LOGO_IMAGE_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
}

export const MAX_LOGO_SIZE_BYTES = 512 * 1024 // 512 KB (REVISION 1, bukan 2 MB)

export function toDotExtension(ext: string): string {
  const trimmed = ext.trim().toLowerCase()
  return trimmed.startsWith('.') ? trimmed : `.${trimmed}`
}

export function isSupportedLogoExtension(ext: string): boolean {
  return toDotExtension(ext) in LOGO_IMAGE_MIME
}

export type LogoValidationError = 'UNSUPPORTED_FORMAT' | 'TOO_LARGE' | 'EMPTY'

export interface LogoFileMeta {
  extension: string
  sizeBytes: number
}

// §8 — satu pintu validasi isi (non-throwing; pemanggil memutuskan pesan error).
// Urutan: format → ukuran (min > 0, maks ≤ 512 KB).
// MIME sniffing (magic bytes) = Open Question §16 #1 (default: ekstensi
// whitelist saja) — TIDAK diterapkan di v1.
export function validateLogoFile(file: LogoFileMeta): LogoValidationError | null {
  if (!isSupportedLogoExtension(file.extension)) return 'UNSUPPORTED_FORMAT'
  if (file.sizeBytes <= 0) return 'EMPTY'
  if (file.sizeBytes > MAX_LOGO_SIZE_BYTES) return 'TOO_LARGE'
  return null
}
