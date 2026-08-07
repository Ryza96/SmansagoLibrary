// WO-2 (LOGO MANAGEMENT — BACKEND) — Resize logo via sharp.
// Sumber: RFC_LOGO_MANAGEMENT_ARCHITECTURE.md (LOCKED REVISION 1):
//   §9  resize dilakukan DI MAIN setelah validasi; yang disimpan = hasil resize
//       (bukan file asli). Downscale-only + contain (OQ #6/#7 default):
//         • gambar sudah ≤ 512×512 → TIDAK di-upscale, byte asli dikembalikan;
//         • gambar lebih besar → di-scale agar sisi terpanjang ≤ 512 px,
//           aspect ratio dijaga (fit: 'inside').
//       Format output = format input (sharp default), sehingga ekstensi file
//       target tetap konsisten dengan whitelist RFC §4.
// sharp dipilih (keputusan WO-2): N-API native, kompatibel Electron tanpa
// rebuild, encode PNG/JPEG/WebP andal, paling setia kebutuhan RFC §4.

import { readFile } from 'fs/promises'
import sharp from 'sharp'

export const LOGO_RESIZE_MAX_DIMENSION = 512

export async function resizeLogoImage(
  sourcePath: string,
  maxDimension: number = LOGO_RESIZE_MAX_DIMENSION
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
