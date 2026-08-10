// LABEL VISUAL REDESIGN — Visual preview capture (PNG untuk review PO).
// Merender generateLabelsHtml ASLI (label.service.ts hasil compile) ke BrowserWindow
// offscreen, lalu capturePage → PNG resolusi tinggi (device scale factor 2).
//
// Tujuan & alur:
//   1. Data dummy representatif: 12 label pada SATU halaman A4, campuran item
//      yang MEMILIKI penulis dan yang TIDAK (label-author di-skip).
//   2. Logo adalah nilai per-persetujuan (BookLabelData.logo), sehingga untuk
//      menunjukkan DUA kondisi header sekaligus PNG ini memuat DUA lembar A4
//      yang ditumpuk vertikal:
//        - Lembar 1: logo SVG data URI (base64) → header memakai <img> logo.
//        - Lembar 2: logo kosong        → header memakai fallback monogram
//          (generateLogoMonogramSvg, inisial schoolName/libraryName).
//   3. Resolusi tinggi: app.commandLine force-device-scale-factor=2 (harus
//      dipanggil SEBELUM whenReady) → setiap lembar A4 794x1123 CSS px dirender
//      pada 2x (1588x2246 px) sehingga teks/barcode terbaca jelas saat di-zoom.
//   4. Window di-resize ke ukuran konten nyata (scrollWidth/scrollHeight)
//      sebelum capture agar seluruh konten (2 lembar) tertangkap utuh.
//
// Catatan: file ini adalah bagian dari smoke permanen label_visual_smoke/
// (pola borrow_card_print_fix_smoke). Ia BUKAN regression assert — hanya
// menghasilkan artefak visual preview-final.png untuk konfirmasi Product Owner.
//
// Jalankan: electron capture.cjs <compiledOutDir> <outPngPath>

const path = require('path')
const fs = require('fs')
const os = require('os')
const { app, BrowserWindow } = require('electron')

// Resolusi 2x — WAJIB dipanggil sebelum app ready (module scope).
app.commandLine.appendSwitch('force-device-scale-factor', '2')

process.on('uncaughtException', (error) => {
  console.error('UNCAUGHT', error)
  app.exit(1)
})

const args = process.argv.slice(2)
const OUT_DIR = args[0]
const PNG_PATH = args[1]

if (!OUT_DIR || !PNG_PATH) {
  console.error('USAGE: electron capture.cjs <compiledOutDir> <outPngPath>')
  app.exit(2)
}

const { generateLabelsHtml } = require(path.join(OUT_DIR, 'src', 'main', 'services', 'label.service.js'))

// ---------------------------------------------------------------------------
// Fixture representatif (12 label / 1 halaman A4).
// Campuran penulis: i=0,2,5,8,10 tanpa author; i=1 & i=7 penulis panjang
// (uji ellipsis); sisanya penulis normal. Judul sengaja panjang untuk menguji
// clamp 2-baris + ellipsis. Rak bervariasi (RAK A-1 ... D-3).
// ---------------------------------------------------------------------------
const AUTHOR_MIX = [
  '',                              // 0  tanpa penulis
  'Prof. Dr. Budi Santoso, M.Pd.', // 1  penulis panjang
  '',                              // 2  tanpa penulis
  'Siti Rahayu, S.Pd.',            // 3  normal
  'Drs. H. Ahmad Yani',            // 4  normal
  '',                              // 5  tanpa penulis
  'Ir. Bambang Wijaya, M.T.',      // 6  normal
  'Dr. Ratna Sari Dewi, S.Si., M.Si.', // 7  sangat panjang → ellipsis
  '',                              // 8  tanpa penulis
  'Nurul Hidayah, S.Kom.',         // 9  normal
  '',                              // 10 tanpa penulis
  'Tim Penyusun Kurikulum Merdeka' // 11 normal
]

function buildItems() {
  return AUTHOR_MIX.map((author, i) => ({
    barcode: `INV-${String(i + 1).padStart(6, '0')}`,
    inventoryNumber: `INV-${String(i + 1).padStart(6, '0')}`,
    shelfLocation: `RAK ${String.fromCharCode(65 + (i % 4))}-${1 + Math.floor(i / 4)}`,
    author
  }))
}

// Logo SVG data URI (base64) — emblen sekolah navy sederhana, mewakili logo
// asli yang di-upload lewat Settings. Di-base64 agar bebas karakter yang
// di-escape escapeHtml (tidak ada &, <, >, ", ') di dalam src.
function logoDataUri() {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
    '<circle cx="32" cy="32" r="30" fill="#12235a"/>' +
    '<circle cx="32" cy="32" r="24" fill="none" stroke="#ffffff" stroke-width="2"/>' +
    '<path d="M26 22v22M38 22v22" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/>' +
    '<path d="M21 30l11-8 11 8" fill="none" stroke="#f59e0b" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>'
  return 'data:image/svg+xml;base64,' + Buffer.from(svg, 'utf8').toString('base64')
}

function buildData(logo) {
  return {
    libraryName: 'Perpustakaan SMAN Contoh',
    schoolName: 'SMA Negeri 1 Contoh Kota',
    logo,
    bookTitle: 'Matematika Wajib untuk SMA/MA Kelas X Kurikulum Merdeka',
    items: buildItems()
  }
}

// generateLabelsHtml menghasilkan dokumen HTML penuh. Ganti logo tidak mungkin
// tanpa mengubah template, jadi gabung DUA lembar A4 (logo vs monogram) dalam
// SATU dokumen: reuse blok <style> dari panggilan pertama + konten <body> keduanya.
function buildCombinedDocument() {
  const htmlWithLogo = generateLabelsHtml(buildData(logoDataUri()))
  const htmlWithoutLogo = generateLabelsHtml(buildData(''))

  const styleMatch = htmlWithLogo.match(/<style>([\s\S]*?)<\/style>/)
  const bodyWithLogo = htmlWithLogo.match(/<body>([\s\S]*?)<\/body>/)
  const bodyWithoutLogo = htmlWithoutLogo.match(/<body>([\s\S]*?)<\/body>/)

  if (!styleMatch || !bodyWithLogo || !bodyWithoutLogo) {
    throw new Error('Gagal mengekstrak <style>/<body> dari generateLabelsHtml')
  }

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Label Buku - Preview (Lembar 1: logo | Lembar 2: monogram)</title>
<style>${styleMatch[1]}</style>
</head>
<body>
${bodyWithLogo[1]}
${bodyWithoutLogo[1]}
</body>
</html>`
}

app.whenReady().then(async () => {
  const html = buildCombinedDocument()
  const htmlPath = path.join(os.tmpdir(), `label-capture-${Date.now()}.html`)
  fs.writeFileSync(htmlPath, html, 'utf8')

  const win = new BrowserWindow({
    width: 900,
    height: 1300,
    show: false,
    webPreferences: { offscreen: true }
  })

  try {
    await win.loadFile(htmlPath)
    await new Promise((r) => setTimeout(r, 500))

    // Samakan ukuran jendela dengan konten nyata agar capturePage menangkap
    // SELURUH konten (2 lembar A4 yang ditumpuk) — bukan hanya viewport awal.
    const size = await win.webContents.executeJavaScript(
      `({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight })`
    )
    win.setContentSize(Math.ceil(size.w), Math.ceil(size.h))
    await new Promise((r) => setTimeout(r, 700))

    const image = await win.webContents.capturePage()
    fs.writeFileSync(PNG_PATH, image.toPNG())

    const raw = image.getSize()
    const scale = win.webContents.getZoomFactor()
    console.log('PNG_WRITTEN=' + PNG_PATH)
    console.log('PNG_SIZE=' + raw.width + 'x' + raw.height)
    console.log('PNG_CSS_PX=' + Math.round(size.w) + 'x' + Math.round(size.h))
    console.log('PNG_ZOOM_FACTOR=' + scale)
    app.exit(0)
  } catch (error) {
    console.error('ERROR', error)
    app.exit(1)
  } finally {
    win.destroy()
    try { fs.unlinkSync(htmlPath) } catch { /* noop */ }
  }
})
