// LABEL DATA-URL FIX — LOADURL NYATA (ELECTRON)
// Tujuan: membuktikan OPTION A end-to-end — generateLabelsHtml ASLI (dengan logo
// sekali via CSS) DITERIMA Chromium loadURL untuk 12 label (produksi) DAN 24
// label. Tanpa fix, 12 label dataURL = 3,978,555 chars (> 2,097,152) gagal
// ERR_INVALID_URL. Dengan fix, 12/24 jauh di bawah batas.
// TIDAK mengubah source / DB / printer.

const { app, BrowserWindow } = require('electron')
const { readFileSync } = require('fs')
const path = require('path')

app.on('window-all-closed', () => {
  // Tetap hidup antar kasus (harness multi-kasus)
})

const outDir = process.argv[2]
const logoPath = process.argv[3]

const labelService = require(path.join(outDir, 'src', 'main', 'services', 'label.service.js'))

const base64Logo = readFileSync(logoPath).toString('base64')
const LOGO_DATA_URI = `data:image/png;base64,${base64Logo}`

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

function bytesToKB(n) {
  return (n / 1024).toFixed(1)
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

function tryLoadUrl(url, timeoutMs = 45000) {
  return new Promise((resolve) => {
    let settled = false
    const win = new BrowserWindow({
      width: 400,
      height: 400,
      show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false }
    })
    const done = (r) => {
      if (settled) return
      settled = true
      if (!win.isDestroyed()) win.destroy()
      resolve(r)
    }
    win.webContents.on('did-fail-load', (_e, errorCode, errorDescription) =>
      done({ ok: false, errorCode, errorDescription })
    )
    win.webContents.on('did-finish-load', () => done({ ok: true }))
    const t = setTimeout(() => done({ ok: false, timeout: true }), timeoutMs)
    win
      .loadURL(url)
      .then(() => {
        clearTimeout(t)
        done({ ok: true })
      })
      .catch((err) => {
        clearTimeout(t)
        done({ ok: false, loadUrlError: String((err && err.message) || err) })
      })
  })
}

async function main() {
  process.stdout.write('=== LABEL DATA-URL FIX — LOADURL NYATA (ELECTRON) ===\n')
  process.stdout.write(`logo path  : ${logoPath}\n`)
  process.stdout.write(`logo dataURI chars: ${LOGO_DATA_URI.length}\n\n`)

  for (const n of [12, 24]) {
    const html = labelService.generateLabelsHtml(makeLabelData(n))
    const url = 'data:text/html;charset=utf-8,' + encodeURIComponent(html)
    const r = await tryLoadUrl(url)
    process.stdout.write(
      `n=${String(n).padStart(2)}: dataURL=${String(url.length).padStart(9)} chars (${bytesToKB(url.length)} KB) -> ${r.ok ? 'OK' : `FAIL code=${r.errorCode} ${r.errorDescription || r.loadUrlError || '(timeout)'}`}\n`
    )
    assert(r.ok, `n=${n} loadURL DITERIMA Chromium (12 label = produksi, wajib)`)
  }

  process.stdout.write(`\nHASIL: ${passed} PASS, ${failed} FAIL\n`)
  app.exit(failed === 0 ? 0 : 1)
}

app
  .whenReady()
  .then(main)
  .catch((err) => {
    process.stderr.write(`HARNESS ERROR: ${err && err.stack ? err.stack : err}\n`)
    app.exit(1)
  })
