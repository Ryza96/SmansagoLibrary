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
const { REPORT_PRINT_ORIENTATION, paginateReportByType } = require(path.join(OUT_DIR, 'src', 'shared', 'config', 'report-print.js'))
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

// Data Laporan Koleksi REALISTIS (11 kolom sebenarnya) untuk pembuktian render
// nyata: kolom sempit (Tahun/Hilang/Rusak), kolom nowrap (ISBN), dan teks
// panjang (Judul/Penulis). Filter Kategori + Pencarian dipakai agar meta
// halaman 1 maksimal (3 baris termasuk "Dicetak").
function makeCollectionsData(n, long) {
  const columns = [
    { key: 'isbn', label: 'ISBN', align: 'left' },
    { key: 'title', label: 'Judul', align: 'left' },
    { key: 'author', label: 'Penulis', align: 'left' },
    { key: 'publisher', label: 'Penerbit', align: 'left' },
    { key: 'category', label: 'Kategori', align: 'left' },
    { key: 'year', label: 'Tahun', align: 'center' },
    { key: 'copies', label: 'Jumlah Eksemplar', align: 'center' },
    { key: 'available', label: 'Tersedia', align: 'center' },
    { key: 'borrowed', label: 'Dipinjam', align: 'center' },
    { key: 'lost', label: 'Hilang', align: 'center' },
    { key: 'damaged', label: 'Rusak', align: 'center' }
  ]
  const rows = Array.from({ length: n }, (_, i) => {
    const title = long
      ? `Sejarah Kebudayaan Islam Nusantara Jilid ${i + 1} Beserta Catatan Pinggir Perpustakaan Sekolah`
      : `Laskar Pelangi ${i + 1}`
    const author = long
      ? `Prof. Dr. Muhammad Ridwan Hidayatullah, M.Pd. dan Dra. Siti Nurhaliza Puspitasari`
      : 'Andrea Hirata'
    const publisher = long ? 'Penerbit Majelis Pustaka Nusantara Sejahtera' : 'Bentang Pustaka'
    return [
      '978-602-1234-56-7',
      title,
      author,
      publisher,
      long ? 'Sejarah Kebudayaan' : 'Fiksi',
      '2026',
      String(12 + (i % 7)),
      String(5 + (i % 4)),
      String(i % 5),
      String(i % 2),
      String(i % 3)
    ]
  })
  return {
    type: 'collections',
    title: 'Laporan Koleksi Buku',
    orientation: REPORT_PRINT_ORIENTATION.collections,
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
    filterSummary: [
      { label: 'Kategori', value: 'Fiksi' },
      { label: 'Pencarian', value: 'pelangi' }
    ],
    notes: [],
    columns,
    rows,
    totalRows: n,
    totals: [
      { label: 'Total Judul', value: String(n) },
      { label: 'Total Eksemplar', value: String(n * 3) },
      { label: 'Nilai Aset', value: 'Rp 12.500.000' }
    ],
    generatedAt: new Date(2026, 10, 6, 9, 45).toISOString()
  }
}

// Skrip pengukuran DOM di renderer Electron: baris per halaman, overflow sel,
// konten melewati kertas, dan deteksi kolom terlalu sempit (kata utuh > lebar
// area sel → kata akan dipotong di tengah).
function measureScript() {
  const PX_PER_MM = 96 / 25.4
  const mm = (px) => px / PX_PER_MM
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  const fontOf = (el) => {
    const cs = getComputedStyle(el)
    return `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
  }
  const padX = (el) => {
    const cs = getComputedStyle(el)
    return parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)
  }
  const widestWord = (el, text) => {
    ctx.font = fontOf(el)
    const avail = el.clientWidth - padX(el)
    let worst = null
    String(text)
      .split(/\s+/)
      .filter(Boolean)
      .forEach((w) => {
        const width = ctx.measureText(w).width
        if (width > avail - 0.5 && (!worst || width > worst.width)) worst = { word: w, width }
      })
    return worst
      ? { word: worst.word, needMm: Number(mm(worst.width).toFixed(2)), haveMm: Number(mm(avail).toFixed(2)) }
      : null
  }
  // Kata terlebar per sel (tanpa syarat muat) → bukti pengukur memang berjalan
  // dan margin kolom terketat (avail - need) dapat dilaporkan.
  let tightest = null
  const widestOf = (el, text) => {
    ctx.font = fontOf(el)
    const avail = el.clientWidth - padX(el)
    let widest = 0
    let word = ''
    String(text)
      .split(/\s+/)
      .filter(Boolean)
      .forEach((w) => {
        const width = ctx.measureText(w).width
        if (width > widest) {
          widest = width
          word = w
        }
      })
    const margin = avail - widest
    if (!tightest || margin < tightest.margin) {
      tightest = {
        word: word.slice(0, 20),
        needMm: Number(mm(widest).toFixed(2)),
        haveMm: Number(mm(avail).toFixed(2)),
        margin: margin
      }
    }
    return widest
  }
  const lineCount = (el) => {
    const range = document.createRange()
    range.selectNodeContents(el)
    return range.getClientRects().length
  }
  const sheets = Array.from(document.querySelectorAll('.a4-sheet'))
  const firstSheet = sheets[0]
  const headerCells = firstSheet ? Array.from(firstSheet.querySelectorAll('.report-table thead th')) : []
  const narrow = []
  const perSheet = sheets.map((sheet, index) => {
    const cs = getComputedStyle(sheet)
    const rect = sheet.getBoundingClientRect()
    const contentBottom = rect.bottom - parseFloat(cs.paddingBottom) - parseFloat(cs.borderBottomWidth)
    const rows = Array.from(sheet.querySelectorAll('.report-table tbody tr')).filter(
      (r) => !r.classList.contains('row-empty')
    )
    const cells = Array.from(sheet.querySelectorAll('.report-table tbody td'))
    let maxBottom = -Infinity
    rows.forEach((r) => {
      maxBottom = Math.max(maxBottom, r.getBoundingClientRect().bottom)
    })
    sheet.querySelectorAll('.totals-block, .notes-block, .signatures-block').forEach((b) => {
      maxBottom = Math.max(maxBottom, b.getBoundingClientRect().bottom)
    })
    let cellOverflow = 0
    let textOverflow = 0
    cells.forEach((td) => {
      if (td.scrollWidth > td.clientWidth + 1 || td.scrollHeight > td.clientHeight + 1) cellOverflow += 1
      const span = td.querySelector('.cell-text')
      if (!span) return
      const pr = td.getBoundingClientRect()
      const sr = span.getBoundingClientRect()
      if (sr.right > pr.right - parseFloat(getComputedStyle(td).paddingRight) + 1 || sr.bottom > pr.bottom + 1) {
        textOverflow += 1
      }
      const word = widestWord(td, span.textContent)
      widestOf(td, span.textContent)
      if (word && narrow.length < 6) {
        narrow.push({ where: 'body', cell: span.textContent.slice(0, 20), word: word.word, needMm: word.needMm, haveMm: word.haveMm })
      }
    })
    Array.from(sheet.querySelectorAll('.report-table thead th')).forEach((th) => {
      const word = widestWord(th, th.textContent)
      widestOf(th, th.textContent)
      if (word && narrow.length < 6) {
        narrow.push({ where: 'header', cell: th.textContent.trim(), word: word.word, needMm: word.needMm, haveMm: word.haveMm })
      }
    })
    return {
      page: index + 1,
      dataRows: rows.length,
      cellOverflow,
      textOverflow,
      sheetOver: maxBottom > contentBottom + 0.5,
      overMm: Number(mm(Math.max(0, maxBottom - contentBottom)).toFixed(2)),
      onlyBlocks: rows.length === 0 && !!sheet.querySelector('.totals-block') && !!sheet.querySelector('.signatures-block')
    }
  })
  return {
    sheetCount: sheets.length,
    headers: headerCells.map((th) => th.textContent.trim()),
    headerLines: headerCells.map((th) => lineCount(th)),
    narrow,
    tightest: tightest
      ? {
          word: tightest.word,
          needMm: tightest.needMm,
          haveMm: tightest.haveMm,
          marginMm: Number(mm(tightest.margin).toFixed(2))
        }
      : null,
    perSheet
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
    return renderData(makeData(type, n), tag)
  }

  async function renderData(data, tag) {
    const html = generateReportPrintHtml(data)
    const pdf = await service.renderPdf(html)
    const boxes = extractMediaBoxes(pdf)
    // Satu pintu: konfigurasi per tipe menentukan cara paginasi (tanpa ternary).
    const expectedPages = paginateReportByType({
      type: data.type,
      rows: data.rows,
      totalRows: data.totalRows,
      orientation: data.orientation
    }).pageCount
    const expectedName = data.orientation === 'portrait' ? '594.960x841.920' : '841.920x594.960'
    const first = boxes[0] ? `${boxes[0].w.toFixed(3)}x${boxes[0].h.toFixed(3)}` : 'none'
    const dimsOk = boxes.length > 0 &&
      (data.orientation === 'portrait'
        ? Math.abs(boxes[0].w - 594.96) < 1 && Math.abs(boxes[0].h - 841.92) < 1
        : Math.abs(boxes[0].w - 841.92) < 1 && Math.abs(boxes[0].h - 594.96) < 1)
    report(`${tag} pages == paginate`, boxes.length === expectedPages, `${data.type} n=${data.totalRows} pdfPages=${boxes.length} expected=${expectedPages}`)
    report(`${tag} MediaBox A4`, dimsOk, `${data.type} ${data.orientation} first=${first} expected≈${expectedName}`)
    fs.writeFileSync(path.join(SMOKE_OUT, `${tag}.pdf`), pdf)
    return { pdfPages: boxes.length, expectedPages }
  }

  // Pembuktian render nyata Laporan Koleksi (tidak terpotong) pada A4 landscape.
  const measureWin = new BrowserWindow({ show: false, width: 1400, height: 1000 })
  async function measureHtml(html) {
    await measureWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
    await measureWin.webContents.executeJavaScript('document.fonts.ready.then(() => true)')
    return measureWin.webContents.executeJavaScript(`(${measureScript.toString()})()`)
  }

  async function collectionsProof(tag, n, long) {
    const data = makeCollectionsData(n, long)
    const { pdfPages, expectedPages } = await renderData(data, tag)
    const m = await measureHtml(generateReportPrintHtml(data))
    const overflowCells = m.perSheet.reduce((a, s) => a + s.cellOverflow, 0)
    const overflowText = m.perSheet.reduce((a, s) => a + s.textOverflow, 0)
    const overSheets = m.perSheet.filter((s) => s.sheetOver)
    const last = m.perSheet[m.perSheet.length - 1]
    const rowsPerPage = m.perSheet.map((s) => s.dataRows).join('+')
    report(`${tag} tanpa overflow sel`, overflowCells === 0 && overflowText === 0,
      `cellOverflow=${overflowCells} textOverflow=${overflowText} baris/halaman=${rowsPerPage}`)
    report(`${tag} konten tidak melewati area kertas`, overSheets.length === 0,
      overSheets.length === 0
        ? `semua ${m.sheetCount} halaman aman (max over 0mm)`
        : overSheets.map((s) => `hal${s.page}+${s.overMm}mm`).join(','))
    report(`${tag} tidak ada kolom terlalu sempit`, m.narrow.length === 0,
      m.narrow.length === 0
        ? `marginKolomTerketat=${JSON.stringify(m.tightest)} headerLines=${JSON.stringify(m.headerLines)}`
        : JSON.stringify(m.narrow))
    report(`${tag} halaman DOM == PDF == paginate`, m.sheetCount === pdfPages && pdfPages === expectedPages,
      `domSheets=${m.sheetCount} pdfPages=${pdfPages} expected=${expectedPages} halamanTerakhir: dataRows=${last.dataRows} hanyaTotal+TandaTangan=${last.onlyBlocks}`)
    report(`${tag} header utuh tanpa potong`, m.narrow.filter((x) => x.where === 'header').length === 0,
      `lines=${JSON.stringify(m.headerLines)} headers=${JSON.stringify(m.headers)}`)
    return m
  }

  // 5 laporan, data besar (120 baris).
  for (const type of Object.keys(COLUMNS)) {
    await render(type, 120, `big-${type}`)
  }
  // Skenario batas: tepat kapasitas halaman pertama, +1, redistribusi.
  await render('borrowings', 29, 'edge-portrait-29')
  await render('borrowings', 30, 'edge-portrait-30')
  // Cek edge tambahan: 25 baris pendek untuk tiap tipe ber-paginasi tinggi
  // (Koleksi kini juga berbasis tinggi baris, bukan kapasitas tetap).
  await render('borrowings', 25, 'edge-short-borrowings')
  await render('returns', 25, 'edge-short-returns')
  await render('members', 25, 'edge-short-members')
  await render('overdues', 25, 'edge-short-overdues')
  await render('collections', 25, 'edge-short-collections')
  await render('members', 0, 'empty-members')

  // (a) 24 baris teks pendek, (b) 70 baris judul/penulis panjang, (c) 120 baris.
  await collectionsProof('proof-collections-short-24', 24, false)
  await collectionsProof('proof-collections-long-70', 70, true)
  await collectionsProof('proof-collections-full-120', 120, true)

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
  // Cetak kelima laporan agar orientasi tiap jenis terbukti, bukan diasumsikan.
  const printTypes = Object.keys(COLUMNS)
  for (const type of printTypes) {
    await printService.printReport({ type, filter: { from: '', to: '' } })
  }
  BrowserWindow.prototype.loadURL = origLoadURL

  // Orientasi aktual per laporan berasal dari config SSOT
  // (REPORT_PRINT_ORIENTATION): Peminjaman/Keterlambatan/Koleksi = landscape,
  // Pengembalian/Anggota = portrait. Flag `landscape` wajib mengikutinya.
  printTypes.forEach((type, index) => {
    const opts = captured[index]
    const orientation = REPORT_PRINT_ORIENTATION[type]
    const expectLandscape = orientation === 'landscape'
    report(`print ${type} (${orientation}) pageSize eksplisit A4`, !!opts && opts.pageSize?.width === 210000 && opts.pageSize?.height === 297000 && opts.landscape === expectLandscape,
      `pageSize=${JSON.stringify(opts?.pageSize)} landscapeFlag=${opts?.landscape} expected=${expectLandscape}`)
  })
  report('print margins none', !!captured[0] && captured[0].margins?.marginType === 'none', `margins=${captured[0]?.margins?.marginType}`)

  console.log(failures === 0 ? 'SMOKE OK' : `SMOKE FAILURES=${failures}`)
  app.exit(failures === 0 ? 0 : 1)
})
