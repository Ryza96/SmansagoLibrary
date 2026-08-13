// WO MEMBER PHOTO — Konfigurasi & validasi foto anggota.
// Mengikuti pola book-cover-config.ts (WO SAM SAMPUL BUKU) yang sama:
//   • format whitelist PNG/JPG/JPEG/WEBP;
//   • ukuran maks ≤ 2 MB; file > 0 byte;
//   • ekstensi huruf kecil (disimpan via toDotExtension).

export const MEMBER_PHOTO_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
}

export const MAX_MEMBER_PHOTO_SIZE_BYTES = 2 * 1024 * 1024 // 2 MB

export function toDotExtension(ext: string): string {
  const trimmed = ext.trim().toLowerCase()
  return trimmed.startsWith('.') ? trimmed : `.${trimmed}`
}

export function isSupportedPhotoExtension(ext: string): boolean {
  return toDotExtension(ext) in MEMBER_PHOTO_MIME
}

export type PhotoValidationError = 'UNSUPPORTED_FORMAT' | 'TOO_LARGE' | 'EMPTY'

export interface PhotoFileMeta {
  extension: string
  sizeBytes: number
}

// Satu pintu validasi isi (non-throwing; pemanggil memutuskan pesan error).
// Urutan: format → ukuran (min > 0, maks ≤ 2 MB).
export function validateMemberPhotoFile(file: PhotoFileMeta): PhotoValidationError | null {
  if (!isSupportedPhotoExtension(file.extension)) return 'UNSUPPORTED_FORMAT'
  if (file.sizeBytes <= 0) return 'EMPTY'
  if (file.sizeBytes > MAX_MEMBER_PHOTO_SIZE_BYTES) return 'TOO_LARGE'
  return null
}
