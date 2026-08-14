// LABEL DATA-URL FIX — PENGUKURAN (PURE NODE, TANPA Electron)
// Tujuan: membuktikan OPTION A — logo data URI disematkan SATU KALI di HTML
// (custom property --label-logo-url di <style>), bukan N× via <img> per label.
// - Memakai generateLabelsHtml ASLI (hasil compile tsc) + logo nyata.
// - Assert per N: count `data:image/` === 1, tidak ada <img class="label-logo-img">,
//   dataURL length 12/24 jauh di bawah url::kMaxURLChars (2,097,152).
// TIDAK mengubah source / DB / printer.

const { readFileSync } = require('fs')
const path = require('path')

const outDir = process.argv[2]
const logoPath = process.argv[3]

const labelService = require(path.join(outDir, 'src', 'main', 'services', 'label.service.js'))

const base64Logo = readFileSync(logoPath).toString('base64')
const LOGO_DATA_URI = `data:image/png;base64,${base64Logo}`

const MAX_OK = 2 * 1024 * 1024 // url::kMaxURLChars teoretis

function makeLabelData(n) {
  const items = []
  for (let i = 0; i < n; i++) {
    items.push({
      barcode: `INV-${String(100000 + i)}`,
      inventoryNumber: `INV-${String(100000 + i)}`,
      shelfLocation: `Rak A1`,
      author: i % 3 === 0 ? 'Penulis Contoh' : undefined
    })
  }
  return {
    libraryName: 'Perpustakaan SMPN 1 Tunas Bangsa',
    schoolName: 'SMP Negeri 1 Tunas Bangsa',
    logo: LOGO_DATA_URI,
    bookTitle: 'Contoh Buku untuk Pengukuran Data URL',
    items
  }
}

let passed = 0
let failed = 0

function assert(cond, msg) {
  if (cond) {
    passed++
    process.stdout.write(`  PASS ${msg}\n`)
  } else {
    failed++
    process.stdout.write(`  FAIL ${msg}\n`)
  }
}

function countOccurrences(haystack, needle) {
  return haystack.split(needle).length - 1
}

function bytesToKB(n) {
  return (n / 1024).toFixed(1)
}

async function main() {
  process.stdout.write('=== LABEL DATA-URL FIX — PENGUKURAN (PURE NODE) ===\n')
  process.stdout.write(`logo path  : ${logoPath}\n`)
  process.stdout.write(`logo dataURI chars: ${LOGO_DATA_URI.length}\n\n`)

  const counts = [1, 6, 12, 24]

  for (const n of counts) {
    const html = labelService.generateLabelsHtml(makeLabelData(n))
    const url = 'data:text/html;charset=utf-8,' + encodeURIComponent(html)
    const dataUriCount = countOccurrences(html, 'data:image/')
    const imgLogoCount = countOccurrences(html, 'label-logo-img')
    const rootVarDefCount = countOccurrences(html, '--label-logo-url: url(')
    const rootVarUseCount = countOccurrences(html, 'var(--label-logo-url, none)')

    process.stdout.write(
      `n=${String(n).padStart(2)}: html=${String(html.length).padStart(7)} chars | utf8=${bytesToKB(Buffer.byteLength(html, 'utf8'))} KB | dataURL=${String(url.length).padStart(9)} chars (${bytesToKB(url.length)} KB)\n`
    )
    assert(dataUriCount === 1, `n=${n} data:image/ muncul TEPAT 1x (logo sekali, bukan ${n}x)`)
    assert(imgLogoCount === 0, `n=${n} tidak ada <img class="label-logo-img"> (CSS background pengganti)`)
    assert(rootVarDefCount === 1, `n=${n} definisi --label-logo-url: url(...) muncul 1x di :root`)
    assert(rootVarUseCount === 1, `n=${n} var(--label-logo-url, none) dipakai 1x di rule .label-logo`)
    assert(html.includes(`--label-logo-url: url("${LOGO_DATA_URI}")`), `n=${n} nilai custom property = url("data URI logo") penuh`)
    assert(
      countOccurrences(html, `<div class="label-logo"></div>`) === n,
      `n=${n} tiap label punya <div class="label-logo"> kosong (CSS bg menggambar)`
    )
    assert(url.length < MAX_OK, `n=${n} dataURL ${url.length} < ${MAX_OK} (${bytesToKB(url.length)} KB)`)
  }

  // 12 label (produksi) harus sangat jauh dari batas
  const html12 = labelService.generateLabelsHtml(makeLabelData(12))
  const url12 = 'data:text/html;charset=utf-8,' + encodeURIComponent(html12)
  assert(url12.length < 700 * 1024, `n=12 dataURL ${bytesToKB(url12.length)} KB < 700 KB (margin amat lebar)`)

  // 24 label juga jauh di bawah
  const html24 = labelService.generateLabelsHtml(makeLabelData(24))
  const url24 = 'data:text/html;charset=utf-8,' + encodeURIComponent(html24)
  assert(url24.length < 800 * 1024, `n=24 dataURL ${bytesToKB(url24.length)} KB < 800 KB (margin amat lebar)`)

  process.stdout.write(`\nHASIL: ${passed} PASS, ${failed} FAIL\n`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((err) => {
  process.stderr.write(`HARNESS ERROR: ${err && err.stack ? err.stack : err}\n`)
  process.exit(1)
})
