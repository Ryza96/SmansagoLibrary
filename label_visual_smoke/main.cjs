// LABEL VISUAL REDESIGN — Electron render check (smoke permanen).
// Bagian dari folder smoke permanen label_visual_smoke/ (pola
// borrow_card_print_fix_smoke), dipakai untuk regression desain label v2 ke
// depan — dijalankan lewat Electron, bukan plain node.
//
// Memuat generateLabelsHtml ASLI (label.service.ts hasil compile) dengan 12 label
// dummy (item 0 tanpa author → label-author di-skip; logo top-level kosong →
// fallback monogram; item 2..11 dengan author + rak), menulis HTML ke file temp,
// merender via printToPDF, lalu memverifikasi:
//   1. Struktur HTML: 1 .label-page, 12 .label, monogram fallback, author skip,
//      footer shelfLocation, tanpa "undefined"/"NaN".
//   2. PDF hasil render: MediaBox A4 [0 0 595.28 841.89] pt, 1 halaman.
//
// Catatan: verifikasi HTML/PDF ini melengkapi geometry.cjs (pengukuran bounding
// box render nyata) dan capture.cjs (PNG preview untuk review PO).
//
// Jalankan: electron main.cjs <compiledOutDir> <outPdfPath>

const path = require('path')
const fs = require('fs')
const os = require('os')
const { app, BrowserWindow } = require('electron')

process.on('uncaughtException', (error) => {
  console.error('UNCAUGHT', error)
  app.exit(1)
})

const args = process.argv.slice(2)
const OUT_DIR = args[0]
const PDF_PATH = args[1]

const { generateLabelsHtml } = require(path.join(OUT_DIR, 'src', 'main', 'services', 'label.service.js'))

const MM_TO_PT = 72 / 25.4
const EXPECTED_W_PT = +(210 * MM_TO_PT).toFixed(3) // 595.276
const EXPECTED_H_PT = +(297 * MM_TO_PT).toFixed(3) // 841.890

// ---------------------------------------------------------------------------
// Fixture: 12 label (1 halaman). items[0] tanpa author (uji skip); items[1]
// TANPA logo → fallback monogram; items[2..11] dengan author + rak.
// ---------------------------------------------------------------------------
function buildFixture() {
  const items = []
  for (let i = 0; i < 12; i++) {
    items.push({
      barcode: `INV-${String(i + 1).padStart(6, '0')}`,
      inventoryNumber: `INV-${String(i + 1).padStart(6, '0')}`,
      shelfLocation: `RAK-${String(10 + (i % 3))}`,
      author: i === 0 ? '' : `Penulis Ke-${i + 1}`
    })
  }
  return {
    libraryName: 'Perpustakaan SMAN',
    schoolName: 'SMAN Contoh Negeri 1',
    logo: '',
    bookTitle: 'Matematika Wajib Kelas X',
    items
  }
}

function countMatches(haystack, regex) {
  return (haystack.match(regex) || []).length
}

function extractMediaBox(buffer) {
  const text = buffer.toString('latin1')
  const matches = [...text.matchAll(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/g)]
  if (matches.length === 0) return null
  return matches.map((m) => ({
    x0: parseFloat(m[1]),
    y0: parseFloat(m[2]),
    x1: parseFloat(m[3]),
    y1: parseFloat(m[4])
  }))
}

function renderToPdf(html) {
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({ width: 900, height: 1100, show: false, webPreferences: { offscreen: true } })
    const htmlPath = path.join(os.tmpdir(), `label-visual-${Date.now()}.html`)
    fs.writeFileSync(htmlPath, html, 'utf8')
    win.loadFile(htmlPath).then(() => {
      win.webContents
        .printToPDF({ printBackground: true, preferCSSPageSize: true })
        .then((pdf) => {
          win.destroy()
          try { fs.unlinkSync(htmlPath) } catch { /* noop */ }
          resolve(pdf)
        })
        .catch((e) => {
          win.destroy()
          try { fs.unlinkSync(htmlPath) } catch { /* noop */ }
          reject(e)
        })
    })
  })
}

app.whenReady().then(async () => {
  let failures = 0
  const report = (label, ok, detail) => {
    console.log(`${ok ? 'PASS' : 'FAIL'} | ${label} | ${detail}`)
    if (!ok) failures += 1
  }

  const data = buildFixture()
  const html = generateLabelsHtml(data)

  // --- Struktur HTML ---
  report('HTML memuat 1 .label-page (12 label/1 halaman)', countMatches(html, /<div class="label-page">/g) === 1, String(countMatches(html, /<div class="label-page">/g)))
  report('HTML memuat 12 .label', countMatches(html, /<div class="label">/g) === 12, String(countMatches(html, /<div class="label">/g)))
  report('Logo fallback monogram (logo kosong → SVG, bukan img data:image)', !html.includes('data:image') && html.includes('class="label-logo"') && html.includes('<svg'), 'fallback monogram')
  report('Header memuat libraryName + schoolName', html.includes('Perpustakaan SMAN') && html.includes('SMAN Contoh Negeri 1'), 'teks header ter-render')
  report('Author skip (1 item tanpa author → 11 .label-author)', countMatches(html, /class="label-author"/g) === 11, String(countMatches(html, /class="label-author"/g)))
  report('Footer hadir 12x dengan shelfLocation', countMatches(html, /class="label-footer"/g) === 12 && html.includes('RAK-10'), 'pin + rak')
  report('Tanpa undefined/NaN/null leak', !html.includes('undefined') && !html.includes('NaN'), 'escape aman')
  report('Barcode + inventory ter-render', html.includes('INV-000001') && html.includes('INV-000012'), 'nilai barcode + inventory')
  report('CSS @page A4', html.includes('@page') && html.includes('size: A4'), '@page size A4')
  report('CSS .label fixed size mm', html.includes('width: 66mm') && html.includes('height: 71.25mm'), 'LABEL_WIDTH/HEIGHT dari config')

  // --- PDF hasil render ---
  const pdf = await renderToPdf(html)
  fs.writeFileSync(PDF_PATH, pdf)
  const boxes = extractMediaBox(pdf)
  const first = boxes ? boxes[0] : null
  const wPt = first ? first.x1 - first.x0 : NaN
  const hPt = first ? first.y1 - first.y0 : NaN
  report(
    'PDF MediaBox = A4 (595.28 x 841.89 pt)',
    Math.abs(wPt - EXPECTED_W_PT) < 0.5 && Math.abs(hPt - EXPECTED_H_PT) < 0.5,
    `w=${wPt.toFixed(3)}pt (${(wPt / MM_TO_PT).toFixed(3)}mm) h=${hPt.toFixed(3)}pt (${(hPt / MM_TO_PT).toFixed(3)}mm) pages=${boxes ? boxes.length : 0}`
  )
  report('PDF 1 halaman', boxes && boxes.length === 1, String(boxes && boxes.length))

  console.log('PDF_BYTES=' + pdf.length)
  console.log(failures === 0 ? 'SMOKE_RESULT=PASS' : `SMOKE_RESULT=FAIL (${failures})`)
  app.exit(failures === 0 ? 0 : 1)
}).catch((error) => {
  console.error('SMOKE_RESULT=ERROR', error)
  app.exit(1)
})
