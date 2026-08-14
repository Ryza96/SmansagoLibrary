// P0-1 PRINT HARDENING — Electron smoke.
// Menguji printHtml fail-safe pada PrintService ASLI (compiled) tanpa membuka
// dialog printer sistem (webContents.print di-intercept). Empat kasus + regresi:
//   1. sukses            — callback print(true)  → resolve + window ditutup
//   2. callback gagal    — callback print(false, reason) → reject + window ditutup
//   3. timeout           — callback print TIDAK pernah datang → reject setelah
//                          timeoutMs + window ditutup (tidak menggantung)
//   4. loadURL gagal     — loadURL reject → reject + window ditutup
//   R. regresi label     — printBookLabels tetap resolve; opsi cetak label tidak
//                          memuat pageSize; timeoutMs TIDAK bocor ke opsi cetak
//
// Jalankan: electron main.cjs <compiledOutDir>

const path = require('path')
const { app, BrowserWindow } = require('electron')

process.on('uncaughtException', (error) => {
  console.error('UNCAUGHT', error)
  app.exit(1)
})

// Cegah quit otomatis Electron saat semua window (print) ditutup — smoke harus
// terus berjalan sampai seluruh kasus selesai, lalu app.exit() eksplisit di akhir.
app.on('window-all-closed', () => {})

const OUT_DIR = path.resolve(process.argv[2])
const { PrintService } = require(path.join(OUT_DIR, 'electron', 'main', 'services', 'print.service.js'))

const SMALL_HTML = '<html><body><div>P0-1</div></body></html>'
const fakeRepo = { findById: async () => null }
const fakeSettings = {
  get: async () => ({ libraryName: 'L', schoolName: 'S', logoPath: '', librarianName: 'P' })
}

const createdWindows = []
const capturedPrints = []

// Mode perilaku webContents.print / loadURL.
let mode = 'success'

function installIntercept() {
  const realLoadURL = BrowserWindow.prototype.loadURL
  BrowserWindow.prototype.loadURL = function (...loadArgs) {
    const wc = this.webContents
    const realPrint = wc.print.bind(wc)
    createdWindows.push(this)
    wc.print = (printOpts, callback) => {
      if (typeof callback !== 'function') return realPrint(printOpts)
      capturedPrints.push({ mode, printOpts })
      if (mode === 'success') {
        callback(true, '')
      } else if (mode === 'callbackFailure') {
        callback(false, 'dialog closed')
      } else if (mode === 'neverCallback') {
        // sengaja TIDAK memanggil callback → printHtml harus timeout
      } else if (mode === 'loadFailure') {
        // tidak akan sampai sini (loadURL ditolak di bawah)
      }
    }
    if (mode === 'loadFailure') {
      return Promise.reject(new Error('simulated load failure'))
    }
    return realLoadURL.apply(this, loadArgs)
  }
}

// window.close()/destroy() dapat selesai pada tick berikutnya — polling singkat
// agar assertion "cleanup" tidak race dengan teardown asinkron window.
function waitDestroyed(seq, timeoutMs = 1000) {
  const windows = createdWindows.slice(seq)
  const deadline = Date.now() + timeoutMs
  return new Promise((resolveResult) => {
    const check = () => {
      if (windows.every((w) => !w || w.isDestroyed())) {
        resolveResult(true)
      } else if (Date.now() >= deadline) {
        resolveResult(false)
      } else {
        setTimeout(check, 20)
      }
    }
    check()
  })
}

app.whenReady().then(async () => {
  let failures = 0
  const report = (label, ok, detail) => {
    console.log(`${ok ? 'PASS' : 'FAIL'} | ${label} | ${detail}`)
    if (!ok) failures += 1
  }
  installIntercept()

  const service = new PrintService(fakeRepo, fakeSettings)

  // --- Kasus 1: sukses (callback true) ---
  mode = 'success'
  const seq1 = createdWindows.length
  try {
    await service.printHtml(SMALL_HTML, { margins: { marginType: 'none' }, timeoutMs: 9999 })
    report('case1 sukses: resolve tanpa throw', true, 'printHtml resolve')
  } catch (e) {
    report('case1 sukses: resolve tanpa throw', false, `throw: ${e.message}`)
  }
  report('case1 cleanup: window ditutup', await waitDestroyed(seq1), `created sejak seq1=${createdWindows.length - seq1}`)
  report(
    'case1 opsi cetak TIDAK memuat timeoutMs (di-strip)',
    capturedPrints.length >= 1 && capturedPrints[capturedPrints.length - 1].printOpts.timeoutMs === undefined,
    'timeoutMs adalah opsi internal, bukan opsi webContents.print'
  )

  // --- Kasus 2: callback gagal (false, reason) ---
  mode = 'callbackFailure'
  const seq2 = createdWindows.length
  try {
    await service.printHtml(SMALL_HTML, { timeoutMs: 9999 })
    report('case2 callback gagal: reject dengan reason', false, 'tidak throw padahal callback(false)')
  } catch (e) {
    report('case2 callback gagal: reject dengan reason', e.message.includes('dialog closed'), `message="${e.message}"`)
  }
  report('case2 cleanup: window ditutup', await waitDestroyed(seq2), 'satu window, destroyed')

  // --- Kasus 3: timeout (callback tidak pernah datang) ---
  mode = 'neverCallback'
  const seq3 = createdWindows.length
  const t3 = Date.now()
  try {
    await service.printHtml(SMALL_HTML, { timeoutMs: 300 })
    report('case3 timeout: reject setelah timeoutMs', false, 'resolve padahal callback tidak datang')
  } catch (e) {
    const elapsed = Date.now() - t3
    report(
      'case3 timeout: reject dengan pesan timeout',
      e.message.includes('tidak selesai'),
      `message="${e.message}"`
    )
    report('case3 timeout: terjadi sekitar >=250ms', elapsed >= 250, `elapsed=${elapsed}ms (timeoutMs=300)`)
  }
  report('case3 cleanup: window ditutup', await waitDestroyed(seq3), 'window timeout ditutup setelah reject')

  // --- Kasus 4: loadURL gagal ---
  mode = 'loadFailure'
  const seq4 = createdWindows.length
  try {
    await service.printHtml(SMALL_HTML, { timeoutMs: 9999 })
    report('case4 loadURL gagal: reject', false, 'resolve padahal loadURL ditolak')
  } catch (e) {
    report('case4 loadURL gagal: reject dengan error asli', e.message.includes('simulated load failure'), `message="${e.message}"`)
  }
  report('case4 cleanup: window ditutup', await waitDestroyed(seq4), 'window ditutup walau loadURL gagal')

  // --- Regresi: printBookLabels (jalur label nyata) ---
  mode = 'success'
  const seqR = createdWindows.length
  try {
    await service.printBookLabels({
      bookTitle: 'Buku Contoh',
      items: [{ barcode: 'INV-000001', inventoryNumber: 'INV-000001', shelfLocation: 'RAK 1' }]
    })
    report('regresi label: printBookLabels resolve', true, 'jalur label tetap bekerja')
  } catch (e) {
    report('regresi label: printBookLabels resolve', false, `throw: ${e.message}`)
  }
  const lastLabelOpts = capturedPrints[capturedPrints.length - 1]
  report(
    'regresi label: opsi margins none + TANPA pageSize',
    !!lastLabelOpts &&
      lastLabelOpts.printOpts.margins &&
      lastLabelOpts.printOpts.margins.marginType === 'none' &&
      lastLabelOpts.printOpts.pageSize === undefined,
    JSON.stringify(lastLabelOpts && lastLabelOpts.printOpts)
  )
  report('regresi label: cleanup window ditutup', await waitDestroyed(seqR), 'satu window label ditutup')

  console.log(failures === 0 ? 'SMOKE_RESULT=PASS' : `SMOKE_RESULT=FAIL (${failures})`)
  app.exit(failures === 0 ? 0 : 1)
}).catch((error) => {
  console.error('SMOKE_RESULT=ERROR', error)
  app.exit(1)
})
