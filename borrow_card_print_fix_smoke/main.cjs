// BORROW CARD PRINT PIPELINE FIX — Electron smoke.
// Menjalankan jalur cetak ASLI (PrintService.printBorrowCard → buildBorrowCardHtml
// → printHtml → webContents.print) dengan webContents.print di-intercept untuk
// menangkap opsi cetak tanpa membuka dialog printer sistem.
// Memverifikasi:
//   1. Opsi cetak kartu peminjaman memuat pageSize { width: 110000, height: 60000 }
//      (110mm × 60mm dalam mikron) — bukan A4/default.
//   2. Jalur label buku (A4) TIDAK memuat pageSize → scope terbatas kartu.
//   3. HTML yang dicetak = template asli dengan @page 110mm 60mm.
//   4. Regression PDF: renderPdf asli tetap 110×60mm.
//
// Jalankan: electron main.cjs <compiledOutDir> <outPdfPath>

const path = require('path')
const fs = require('fs')
const { app, BrowserWindow } = require('electron')

process.on('uncaughtException', (error) => {
  console.error('UNCAUGHT', error)
  app.exit(1)
})

const args = process.argv.slice(2)
const OUT_DIR = args[0]
const PDF_PATH = args[1]

const { PrintService } = require(path.join(OUT_DIR, 'electron', 'main', 'services', 'print.service.js'))

const MM_TO_PT = 72 / 25.4
const EXPECTED_W_PT = +(110 * MM_TO_PT).toFixed(3) // 311.811
const EXPECTED_H_PT = +(60 * MM_TO_PT).toFixed(3) // 170.079

// ---------------------------------------------------------------------------
// Intercept webContents.print: menangkap opsi cetak, tidak membuka dialog.
// printHtml memanggil loadURL() lalu mendaftarkan did-finish-load yang memanggil
// webContents.print. Patching loadURL memastikan wc.print sudah di-spy SEBELUM
// did-finish-load menembak (loadURL dipanggil lebih dulu di printHtml) — tanpa
// mengubah source PrintService dan tanpa me-reassign BrowserWindow global.
// ---------------------------------------------------------------------------
const capturedPrints = []
function installPrintIntercept() {
  const realLoadURL = BrowserWindow.prototype.loadURL
  BrowserWindow.prototype.loadURL = function (...loadArgs) {
    const wc = this.webContents
    const realPrint = wc.print.bind(wc)
    wc.print = (printOpts, callback) => {
      capturedPrints.push({ printOpts })
      if (typeof callback === 'function') callback(true, '')
      else return realPrint(printOpts)
    }
    return realLoadURL.apply(this, loadArgs)
  }
}

// ---------------------------------------------------------------------------
// Fake repository & settings — PrintService hanya membaca findById/get.
// ---------------------------------------------------------------------------
function buildFakeBorrowing() {
  const due = new Date('2026-08-12T00:00:00Z')
  const borrowDate = new Date('2026-08-05T00:00:00Z')
  return {
    id: '6f0f0b5d-6b6c-4a2e-9f12-3c4d5e6f7890',
    borrowNumber: 'PJ2026080001',
    borrowDate,
    dueDate: due,
    returnDate: null,
    memberName: 'Aulia Utami',
    memberNumber: 'S-000001',
    className: 'X Merdeka 1',
    member: null,
    details: [
      { bookTitle: 'Matematika Wajib Kelas X', bookCopy: { inventoryNumber: 'INV-000001', book: { title: 'Matematika Wajib Kelas X' } } },
      { bookTitle: 'Bahasa Indonesia', bookCopy: { inventoryNumber: 'INV-000002', book: { title: 'Bahasa Indonesia' } } }
    ]
  }
}

const fakeRepo = {
  findById: async () => buildFakeBorrowing()
}
const fakeSettings = {
  get: async () => ({
    libraryName: 'Perpustakaan',
    schoolName: 'SMAN Contoh Negeri',
    logoPath: '',
    librarianName: 'Ibu Pustakawan'
  })
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

app.whenReady().then(async () => {
  let failures = 0
  const report = (label, ok, detail) => {
    console.log(`${ok ? 'PASS' : 'FAIL'} | ${label} | ${detail}`)
    if (!ok) failures += 1
  }

  installPrintIntercept()

  // --- Jalur cetak kartu peminjaman (PrintService ASLI) ---
  const service = new PrintService(fakeRepo, fakeSettings)
  await service.printBorrowCard('6f0f0b5d-6b6c-4a2e-9f12-3c4d5e6f7890')

  report('printBorrowCard memicu webContents.print', capturedPrints.length === 1, `captured=${capturedPrints.length}`)

  const borrowPrintOpts = capturedPrints[0] ? capturedPrints[0].printOpts : null
  report('opsi cetak ada (tidak null)', !!borrowPrintOpts, JSON.stringify(borrowPrintOpts && Object.keys(borrowPrintOpts)))

  // pageSize 110×60mm (mikron)
  const ps = borrowPrintOpts && borrowPrintOpts.pageSize
  report(
    'pageSize = 110000 x 60000 mikron',
    !!ps && ps.width === 110000 && ps.height === 60000,
    JSON.stringify(ps)
  )
  report(
    'pageSize dihapus A4/default → size eksplisit',
    !!ps && (ps.width !== 210000 || ps.height !== 297000),
    'A4 = 210000x297000 mikron'
  )
  report(
    'margins marginType=none (dipertahankan)',
    borrowPrintOpts && borrowPrintOpts.margins && borrowPrintOpts.margins.marginType === 'none',
    JSON.stringify(borrowPrintOpts && borrowPrintOpts.margins)
  )
  report(
    'printBackground dipertahankan',
    borrowPrintOpts && borrowPrintOpts.printBackground === true,
    String(borrowPrintOpts && borrowPrintOpts.printBackground)
  )

  // --- Jalur label buku (A4) — scope terbatas: TIDAK boleh memuat pageSize ---
  await service.printBookLabels({
    bookTitle: 'Buku Contoh',
    items: [{ barcode: 'INV-000001', inventoryNumber: 'INV-000001', shelfLocation: 'RAK 1' }]
  })
  const labelPrintOpts = capturedPrints[1] ? capturedPrints[1].printOpts : null
  report('jalur label buku memicu cetak', capturedPrints.length === 2, `captured=${capturedPrints.length}`)
  report(
    'label buku TANPA pageSize (A4, scope kartu saja)',
    !!labelPrintOpts && labelPrintOpts.pageSize === undefined,
    'label print tidak boleh terpengaruh pageSize kartu'
  )

  // --- HTML yang dicetak = template asli @page 110mm 60mm ---
  // PrintService.buildBorrowCardHtml dipanggil oleh printBorrowCard; verifikasi
  // ulang lewat jalur preview asli (getBorrowCardPreviewHtml).
  const previewHtml = await service.getBorrowCardPreviewHtml('6f0f0b5d-6b6c-4a2e-9f12-3c4d5e6f7890')
  report('preview HTML = template asli', previewHtml.includes('@page') && previewHtml.includes('110mm') && previewHtml.includes('60mm'), `${previewHtml.length} chars`)
  report('preview menampilkan identitas kartu', previewHtml.includes('SMAN Contoh Negeri') && previewHtml.includes('PJ2026080001'), 'data ter-render di template')

  // --- Regression PDF: renderPdf asli tetap 110×60mm ---
  const pdf = await service.renderPdf(previewHtml)
  fs.writeFileSync(PDF_PATH, pdf)
  const boxes = extractMediaBox(pdf)
  const first = boxes ? boxes[0] : null
  const wPt = first ? first.x1 - first.x0 : NaN
  const hPt = first ? first.y1 - first.y0 : NaN
  report(
    'Regression PDF tetap 110x60mm (MediaBox)',
    Math.abs(wPt - EXPECTED_W_PT) < 0.5 && Math.abs(hPt - EXPECTED_H_PT) < 0.5,
    `w=${wPt.toFixed(3)}pt (${(wPt / MM_TO_PT).toFixed(3)}mm) h=${hPt.toFixed(3)}pt (${(hPt / MM_TO_PT).toFixed(3)}mm)`
  )

  console.log('PRINT_PAGE_SIZE=' + (ps ? `${ps.width}x${ps.height}` : 'NA'))
  console.log('PDF_PAGE_SIZE=' + wPt.toFixed(3) + 'x' + hPt.toFixed(3))
  console.log(failures === 0 ? 'SMOKE_RESULT=PASS' : `SMOKE_RESULT=FAIL (${failures})`)
  app.exit(failures === 0 ? 0 : 1)
}).catch((error) => {
  console.error('SMOKE_RESULT=ERROR', error)
  app.exit(1)
})
