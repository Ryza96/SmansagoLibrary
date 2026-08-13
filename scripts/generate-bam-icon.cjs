// One-time icon generation: BAM.png (portrait, transparent) -> resources/icon.ico
// Multi-size PNG-compressed ICO (16,32,48,64,128,256), logo centered on a
// transparent square canvas without redesign/crop (proportions preserved).
// Run: node scripts/generate-bam-icon.cjs
const sharp = require('sharp')
const path = require('path')
const fs = require('fs')

const SRC = process.argv[2] || 'C:/Users/hp/Desktop/BAM.png'
const OUT_DIR = path.join(__dirname, '..', 'resources')
const OUT_ICO = path.join(OUT_DIR, 'icon.ico')
const SIZES = [16, 32, 48, 64, 128, 256]

async function main() {
  const srcBuf = await sharp(SRC).png().toBuffer()
  const meta = await sharp(srcBuf).metadata()
  const side = Math.max(meta.width, meta.height)

  const square = await sharp({
    create: {
      width: side,
      height: side,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: srcBuf,
        left: Math.round((side - meta.width) / 2),
        top: Math.round((side - meta.height) / 2),
      },
    ])
    .png()
    .toBuffer()

  const entries = []
  for (const size of SIZES) {
    const png = await sharp(square).resize(size, size).png().toBuffer()
    entries.push({ size, png })
  }

  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(entries.length, 4)

  let offset = 6 + entries.length * 16
  const parts = [header]
  for (const { size, png } of entries) {
    const e = Buffer.alloc(16)
    e.writeUInt8(size === 256 ? 0 : size, 0)
    e.writeUInt8(size === 256 ? 0 : size, 1)
    e.writeUInt8(0, 2)
    e.writeUInt8(0, 3)
    e.writeUInt16LE(1, 4)
    e.writeUInt16LE(32, 6)
    e.writeUInt32LE(png.length, 8)
    e.writeUInt32LE(offset, 12)
    parts.push(e)
    offset += png.length
  }
  for (const { png } of entries) parts.push(png)

  fs.mkdirSync(OUT_DIR, { recursive: true })
  fs.writeFileSync(OUT_ICO, Buffer.concat(parts))
  console.log('source:', SRC, meta.width + 'x' + meta.height)
  console.log('wrote:', OUT_ICO, fs.statSync(OUT_ICO).size, 'bytes, sizes', SIZES.join(','))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
