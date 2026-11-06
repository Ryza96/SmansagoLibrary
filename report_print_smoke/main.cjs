// REPORT PRINT TAHAP 2 — Smoke RENDER NYATA (Electron).
// Render HTML 5 laporan via PrintService.renderPdf() ASLI (preferCSSPageSize)
// dan verifikasi: jumlah halaman PDF == jumlah halaman paginateReportRows,
// MediaBox A4 portrait/landscape, serta opsi cetak fisik (pageSize/landscape
// eksplisit) via intercept webContents.print.
// Jalankan: electron main.cjs <compiledOutDir>
// PDF contoh ditulis ke ./smoke_out (di-gitignore, JANGAN di-commit).

const path = require('path')
const fs = require('fs')
const { app, BrowserWindow } = require('electron')

// sharp (native) tidak diperlukan smoke ini; cegah kegagalan ABI bila
// rantai import print.service menariknya (logo-resize).
const Module = require('module')
const origLoad = Module._load
Module._load = function (request, ...rest) {
  if (request === 'sharp') return {}
  return origLoad.call(this, request, ...rest)
}

process.on('uncaughtException', (error) => {
  console.error('UNCAUGHT', error)
  app.exit(1)
})

// renderPdf menutup window-nya sendiri; cegah quit saat semua window tertutup.
app.on('window-all-closed', () => {})

const OUT_DIR = process.argv.slice(2)[0]
const SMOKE_OUT = path.join(__dirname, 'smoke_out')
fs.mkdirSync(SMOKE_OUT, { recursive: true })

const { generateReportPrintHtml } = require(path.join(OUT_DIR, 'src', 'main', 'services', 'report-print-html.service.js'))
const { REPORT_PRINT_ORIENTATION, paginateReportRows } = require(path.join(OUT_DIR, 'src', 'shared', 'config', 'report-print.js'))
const { PrintService } = require(path.join(OUT_DIR, 'electron', 'main', 'services', 'print.service.js'))

const COLUMNS = {
  borrowings: [1, 2, 3, 4, 5, 6, 7],
  returns: [1, 2, 3, 4, 5, 6, 7],
  overdues: [1, 2, 3, 4, 5, 6, 7, 8],
  members: [1, 2, 3, 4, 5],
  collections: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
}

function makeData(type, n) {
  const columns = COLUMNS[type].map((i) => ({ key: `c${i}`, label: `Kolom ${i}`, align: i % 3 === 0 ? 'center' : 'left' }))
  return {
    type,
    title: `Laporan Smoke ${type}`,
    orientation: REPORT_PRINT_ORIENTATION[type],
    institution: {
      libraryName: 'Perpustakaan Smoke',
      schoolName: 'SD Smoke',
      address: 'Jl. Smoke No. 1',
      phone: '0800',
      email: 'smoke@example.test',
      librarianName: 'Pustakawan Smoke',
      principalName: 'Kepala Smoke',
      librarianNip: '19800101 001',
      principalNip: '19750101 001'
    },
    filterSummary: [{ label: 'Periode', value: '01/08/2026 s.d. 31/08/2026' }],
    notes: [],
    columns,
    rows: Array.from({ length: n }, (_, i) => columns.map((c, j) => (j === 0 ? `BARIS-${i + 1}` : `${c.label} ${i + 1}`))),
    totalRows: n,
    totals: [{ label: 'Total', value: String(n) }],
    generatedAt: new Date(2026, 10, 6, 9, 45).toISOString()
  }
}

function extractMediaBoxes(buffer) {
  const text = buffer.toString('latin1')
  const matches = [...text.matchAll(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/g)]
  return matches.map((m) => ({
    w: parseFloat(m[3]) - parseFloat(m[1]),
    h: parseFloat(m[4]) - parseFloat(m[2])
  }))
}

app.whenReady().then(async () => {
  let failures = 0
  const report = (label, ok, detail) => {
    console.log(`${ok ? 'PASS' : 'FAIL'} | ${label} | ${detail}`)
    if (!ok) failures += 1
  }
  const service = new PrintService(null, null, '')

  async function render(type, n, tag) {
    const data = makeData(type, n)
    const html = generateReportPrintHtml(data)
    const pdf = await service.renderPdf(html)
    const boxes = extractMediaBoxes(pdf)
    const expectedPages = paginateReportRows(n, data.orientation).pages.length
    const expectedName = data.orientation === 'portrait' ? '594.960x841.920' : '841.920x594.960'
    const first = boxes[0] ? `${boxes[0].w.toFixed(3)}x${boxes[0].h.toFixed(3)}` : 'none'
    const dimsOk = boxes.length > 0 &&
      (data.orientation === 'portrait'
        ? Math.abs(boxes[0].w - 594.96) < 1 && Math.abs(boxes[0].h - 841.92) < 1
        : Math.abs(boxes[0].w - 841.92) < 1 && Math.abs(boxes[0].h - 594.96) < 1)
    report(`${tag} pages == paginate`, boxes.length === expectedPages, `${type} n=${n} pdfPages=${boxes.length} expected=${expectedPages}`)
    report(`${tag} MediaBox A4`, dimsOk, `${type} ${data.orientation} first=${first} expected≈${expectedName}`)
    fs.writeFileSync(path.join(SMOKE_OUT, `${tag}.pdf`), pdf)
    return { pdfPages: boxes.length, expectedPages }
  }

  // 5 laporan, data besar (120 baris).
  for (const type of Object.keys(COLUMNS)) {
    await render(type, 120, `big-${type}`)
  }
  // Skenario batas: tepat kapasitas halaman pertama, +1, redistribusi.
  await render('borrowings', 29, 'edge-portrait-29')
  await render('borrowings', 30, 'edge-portrait-30')
  await render('overdues', 17, 'edge-landscape-17')
  await render('overdues', 18, 'edge-landscape-18')
  await render('members', 0, 'empty-members')

  // Opsi cetak fisik: intercept webContents.print pada printReport asli.
  const captured = []
  const origLoadURL = BrowserWindow.prototype.loadURL
  BrowserWindow.prototype.loadURL = function (...args) {
    const p = origLoadURL.apply(this, args)
    this.webContents.print = (opts, cb) => {
      captured.push(opts)
      cb(true)
    }
    return p
  }
  const settingsStub = {
    get: async () => ({
      libraryName: 'Perpustakaan Smoke',
      schoolName: 'SD Smoke',
      address: 'Jl. Smoke No. 1',
      phone: '0800',
      email: 'smoke@example.test',
      librarianName: 'Pustakawan Smoke',
      principalName: 'Kepala Smoke',
      librarianNip: '19800101 001',
      principalNip: '19750101 001',
      logoPath: ''
    })
  }
  const reportPrintStub = {
    buildData: async (request) => makeData(request.type, 3)
  }
  const printService = new PrintService(null, settingsStub, '', undefined, reportPrintStub)
  await printService.printReport({ type: 'borrowings', filter: { from: '', to: '' } })
  await printService.printReport({ type: 'overdues', filter: { from: '', to: '' } })
  BrowserWindow.prototype.loadURL = origLoadURL

  const portraitOpts = captured[0]
  const landscapeOpts = captured[1]
  report('print portrait pageSize eksplisit A4', !!portraitOpts && portraitOpts.pageSize?.width === 210000 && portraitOpts.pageSize?.height === 297000 && portraitOpts.landscape === false,
    `portrait=${JSON.stringify(portraitOpts?.pageSize)} landscape=${portraitOpts?.landscape}`)
  report('print landscape:true + pageSize A4', !!landscapeOpts && landscapeOpts.landscape === true && landscapeOpts.pageSize?.width === 210000 && landscapeOpts.pageSize?.height === 297000,
    `landscape=${JSON.stringify(landscapeOpts?.pageSize)} landscapeFlag=${landscapeOpts?.landscape}`)
  report('print margins none', !!portraitOpts && portraitOpts.margins?.marginType === 'none', `margins=${portraitOpts?.margins?.marginType}`)

  console.log(failures === 0 ? 'SMOKE OK' : `SMOKE FAILURES=${failures}`)
  app.exit(failures === 0 ? 0 : 1)
})
