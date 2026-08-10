// LABEL VISUAL REDESIGN — geometry verification via real Electron render.
// Bagian dari folder smoke permanen label_visual_smoke/ (pola
// borrow_card_print_fix_smoke), dipakai untuk regression desain label v2 ke
// depan — dijalankan lewat Electron, bukan plain node.
//
// Memuat HTML label ASLI di BrowserWindow, lalu executeJavaScript mengukur
// bounding box setiap zona (.label, .label-header, .label-barcode,
// .label-inventory, .label-book-divider, .label-book, .label-footer).
// Memverifikasi:
//   1. Setiap label 66×71.25mm di grid 3×4 dalam A4 (tidak tumpang tindih).
//   2. Urutan vertikal zona (header → barcode → inventory → divider → book → footer).
//   3. Footer = baris terakhir dan berada di dalam label.
//   4. Konten tidak terpotong (setiap zona bottom <= label bottom).
//   5. Gap antar label >= 0 (tidak overlap horizontal/vertikal).
//
// Catatan: pengukuran bounding box melengkapi main.cjs (HTML/PDF structure)
// dan capture.cjs (PNG preview untuk review PO).
//
// Jalankan: electron geometry.cjs <compiledOutDir>

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

const { generateLabelsHtml } = require(path.join(OUT_DIR, 'src', 'main', 'services', 'label.service.js'))

function buildFixture() {
  const items = []
  for (let i = 0; i < 12; i++) {
    items.push({
      barcode: `INV-${String(i + 1).padStart(6, '0')}`,
      inventoryNumber: `INV-${String(i + 1).padStart(6, '0')}`,
      shelfLocation: `RAK-${String(10 + (i % 3))}`,
      author: i === 0 ? '' : `Penulis Ke-${i + 1} ${'Judul Panjang '.repeat(4)}`
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

// A4 dipatok 210×297mm pada 96dpi CSS: 1mm = 96/25.4 px.
const PX_PER_MM = 96 / 25.4

app.whenReady().then(async () => {
  let failures = 0
  const report = (label, ok, detail) => {
    console.log(`${ok ? 'PASS' : 'FAIL'} | ${label} | ${detail}`)
    if (!ok) failures += 1
  }

  const html = generateLabelsHtml(buildFixture())
  const htmlPath = path.join(os.tmpdir(), `label-geometry-${Date.now()}.html`)
  fs.writeFileSync(htmlPath, html, 'utf8')

  const win = new BrowserWindow({ width: 1400, height: 1600, show: false, webPreferences: { offscreen: true } })
  await win.loadFile(htmlPath)
  await new Promise((r) => setTimeout(r, 900))

  const rects = await win.webContents.executeJavaScript(`
    (() => {
      const sel = (s) => Array.from(document.querySelectorAll(s))
      const box = (el) => { const r = el.getBoundingClientRect(); return { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height } }
      const labels = sel('.label').map(box)
      const zones = sel('.label').map((el) => ({
        header: box(el.querySelector('.label-header')),
        barcode: box(el.querySelector('.label-barcode')),
        inventory: box(el.querySelector('.label-inventory')),
        divider: box(el.querySelector('.label-book-divider')),
        book: box(el.querySelector('.label-book')),
        footer: box(el.querySelector('.label-footer'))
      }))
      const page = box(document.querySelector('.label-page'))
      return { page, labels, zones }
    })()
  `)

  // --- Label count ---
  report('12 label dirender', rects.labels.length === 12, `count=${rects.labels.length}`)

  // --- Setiap label di dalam A4 page ---
  const pageR = rects.page
  const allInside = rects.labels.every((l) => l.top >= pageR.top - 1 && l.bottom <= pageR.bottom + 1 && l.left >= pageR.left - 1 && l.right <= pageR.right + 1)
  report('Semua label di dalam halaman A4', allInside, `page=${pageR.width.toFixed(1)}x${pageR.height.toFixed(1)}px`)

  // --- Ukuran label 66×71.25mm ---
  const sizesOk = rects.labels.every((l) => Math.abs(l.width - 66 * PX_PER_MM) < 2 && Math.abs(l.height - 71.25 * PX_PER_MM) < 2)
  report('Ukuran label = 66×71.25mm', sizesOk, `w=${(rects.labels[0].width / PX_PER_MM).toFixed(2)}mm h=${(rects.labels[0].height / PX_PER_MM).toFixed(2)}mm`)

  // --- Tidak ada overlap antar label (grid) ---
  let minGap = Infinity
  for (let i = 0; i < rects.labels.length; i++) {
    for (let j = i + 1; j < rects.labels.length; j++) {
      const a = rects.labels[i]
      const b = rects.labels[j]
      const overlapX = a.left < b.right - 1 && b.left < a.right - 1
      const overlapY = a.top < b.bottom - 1 && b.top < a.bottom - 1
      if (overlapX && overlapY) {
        const gap = Math.min(Math.abs(a.right - b.left), Math.abs(b.right - a.left), Math.abs(a.bottom - b.top), Math.abs(b.bottom - a.top))
        minGap = Math.min(minGap, gap)
        if (gap < -1) minGap = gap
      }
    }
  }
  report('Label tidak saling tumpang tindih (grid 3×4)', minGap > -1, `minGap=${minGap === Infinity ? 'n/a (tidak overlap)' : minGap.toFixed(2)}px`)

  // --- Per-label: urutan zona + footer di dalam label + konten tidak terpotong ---
  const zoneOk = rects.zones.every((z, i) => {
    const L = rects.labels[i]
    const order =
      z.header.top < z.barcode.top &&
      z.barcode.top < z.inventory.top &&
      z.inventory.top < z.divider.top &&
      z.divider.top < z.book.top &&
      z.book.top < z.footer.top
    const inside = z.header.top >= L.top - 1 && z.header.bottom <= L.bottom + 1 && z.footer.bottom <= L.bottom + 1 && z.footer.left >= L.left - 1 && z.footer.right <= L.right + 1
    const footerIsLast = z.footer.bottom >= z.book.bottom - 1
    return order && inside && footerIsLast
  })
  report('Urutan zona header→barcode→inventory→divider→book→footer (12/12)', zoneOk, 'footer = baris terakhir')

  // --- Footer tidak terpotong / tidak meluber keluar label ---
  const footersOk = rects.zones.every((z, i) => {
    const L = rects.labels[i]
    return z.footer.bottom <= L.bottom + 1 && z.footer.width <= L.width + 1
  })
  report('Footer di dalam label (tidak meluber)', footersOk, 'footer width <= label width')

  // --- Book row tidak menimpa footer / divider (gap positif) ---
  const gapsOk = rects.zones.every((z) => z.book.bottom <= z.footer.top + 1 && z.divider.bottom <= z.book.top + 1)
  report('Book row tidak menimpa divider/footer', gapsOk, 'gap >= 0')

  // --- Barcode 37mm ---
  const barcodeH = rects.zones[0].barcode.height / PX_PER_MM
  report('Barcode tinggi 37mm', Math.abs(barcodeH - 37) < 1.5, `h=${barcodeH.toFixed(2)}mm`)

  console.log(failures === 0 ? 'GEOMETRY_RESULT=PASS' : `GEOMETRY_RESULT=FAIL (${failures})`)
  win.destroy()
  try { fs.unlinkSync(htmlPath) } catch { /* noop */ }
  app.exit(failures === 0 ? 0 : 1)
}).catch((error) => {
  console.error('GEOMETRY_RESULT=ERROR', error)
  app.exit(1)
})
