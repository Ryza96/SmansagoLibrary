// WO SAM: SAMPUL BUKU — Resize gambar sampul via sharp.
// Mengikuti pola logo-resize.ts (RFC_LOGO_MANAGEMENT_ARCHITECTURE.md §9):
// resize dilakukan DI MAIN setelah validasi; yang disimpan = hasil resize
// (bukan file asli). Downscale-only + contain:
//   • gambar sudah ≤ 512×512 → TIDAK di-upscale, byte asli dikembalikan;
//   • gambar lebih besar → di-scale agar sisi terpanjang ≤ 512 px,
//     aspect ratio dijaga (fit: 'inside').
// Format output = format input (sharp default), sehingga ekstensi file
// target tetap konsisten dengan whitelist.

import { readFile } from 'fs/promises'
import sharp from 'sharp'

export const BOOK_COVER_RESIZE_MAX_DIMENSION = 512

export async function resizeBookCoverImage(
  sourcePath: string,
  maxDimension: number = BOOK_COVER_RESIZE_MAX_DIMENSION
): Promise<Buffer> {
  const meta = await sharp(sourcePath).metadata()
  const width = meta.width ?? 0
  const height = meta.height ?? 0
  if (width > 0 && height > 0 && width <= maxDimension && height <= maxDimension) {
    return readFile(sourcePath)
  }
  return sharp(sourcePath)
    .resize({
      width: maxDimension,
      height: maxDimension,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .toBuffer()
}
