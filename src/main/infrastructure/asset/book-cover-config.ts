// WO SAM: SAMPUL BUKU — Konfigurasi & validasi gambar sampul buku.
// Mengikuti pola RFC_LOGO_MANAGEMENT_ARCHITECTURE.md (LOCKED) yang sama
// dengan logo sekolah:
//   • format whitelist PNG/JPG/JPEG/WEBP;
//   • ukuran maks ≤ 2 MB; file > 0 byte;
//   • ekstensi huruf kecil (disimpan via toDotExtension).

export const COVER_IMAGE_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
}

export const MAX_BOOK_COVER_SIZE_BYTES = 2 * 1024 * 1024 // 2 MB

export function toDotExtension(ext: string): string {
  const trimmed = ext.trim().toLowerCase()
  return trimmed.startsWith('.') ? trimmed : `.${trimmed}`
}

export function isSupportedCoverExtension(ext: string): boolean {
  return toDotExtension(ext) in COVER_IMAGE_MIME
}

export type CoverValidationError = 'UNSUPPORTED_FORMAT' | 'TOO_LARGE' | 'EMPTY'

export interface CoverFileMeta {
  extension: string
  sizeBytes: number
}

// Satu pintu validasi isi (non-throwing; pemanggil memutuskan pesan error).
// Urutan: format → ukuran (min > 0, maks ≤ 2 MB).
export function validateBookCoverFile(file: CoverFileMeta): CoverValidationError | null {
  if (!isSupportedCoverExtension(file.extension)) return 'UNSUPPORTED_FORMAT'
  if (file.sizeBytes <= 0) return 'EMPTY'
  if (file.sizeBytes > MAX_BOOK_COVER_SIZE_BYTES) return 'TOO_LARGE'
  return null
}
