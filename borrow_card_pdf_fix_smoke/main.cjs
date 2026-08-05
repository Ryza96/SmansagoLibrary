// BORROW CARD PDF FIX — Electron smoke (READ of real renderPdf).
// Menjalankan PrintService.renderPdf() yang ASLI (print.service.ts, sudah
// diperbaiki preferCSSPageSize: true) pada HTML kartu asli dan memverifikasi
// ukuran halaman PDF = 110mm x 60mm (bukan A4/Letter).
//
// Jalankan: electron main.cjs <compiledOutDir> <outPdfPath>
// Kontrol negatif (preferCSSPageSize false) dibuat ke <outPdfPath>.a4.pdf
// untuk membuktikan perbedaannya berasal dari flag tersebut.

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

const { generateQrCodeSvg } = require(path.join(OUT_DIR, 'src', 'main', 'services', 'barcode.service.js'))
const {
  generateAvatarPlaceholderSvg,
  generateBorrowCardHtml
} = require(path.join(OUT_DIR, 'src', 'main', 'services', 'borrow-card.service.js'))
const { PrintService } = require(path.join(OUT_DIR, 'electron', 'main', 'services', 'print.service.js'))

const MM_TO_PT = 72 / 25.4
const EXPECTED_W_PT = +(110 * MM_TO_PT).toFixed(3) // 311.811
const EXPECTED_H_PT = +(60 * MM_TO_PT).toFixed(3) // 170.079

function buildCardHtml() {
  const data = {
    header: {
      logo: '',
      schoolName: 'SMAN Contoh Negeri',
      libraryName: 'Perpustakaan'
    },
    member: {
      memberNumber: 'S-000001',
      fullName: 'Aulia Utami',
      memberType: 'Siswa',
      className: 'X Merdeka 1',
      avatarPlaceholder: generateAvatarPlaceholderSvg('Aulia Utami')
    },
    borrow: {
      borrowId: '6f0f0b5d-6b6c-4a2e-9f12-3c4d5e6f7890',
      borrowNumber: 'PJ2026080001',
      borrowDate: '05-08-2026',
      dueDate: '12-08-2026'
    },
    books: [
      { inventoryNumber: 'INV-000001', title: 'Matematika Wajib Kelas X' },
      { inventoryNumber: 'INV-000002', title: 'Bahasa Indonesia' }
    ],
    footer: {
      totalBooks: 2,
      borrowStatus: 'AKTIF',
      qrSvg: generateQrCodeSvg('6f0f0b5d-6b6c-4a2e-9f12-3c4d5e6f7890'),
      officerName: 'Ibu Pustakawan'
    }
  }
  return generateBorrowCardHtml(data)
}

function renderToPdf(html, preferCSSPageSize) {
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      width: 800,
      height: 600,
      show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false }
    })
    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    win.webContents.on('did-finish-load', async () => {
      try {
        const pdf = await win.webContents.printToPDF({
          printBackground: true,
          preferCSSPageSize
        })
        resolve(pdf)
      } catch (error) {
        reject(error)
      } finally {
        if (!win.isDestroyed()) win.close()
      }
    })
    win.webContents.on('did-fail-load', (_e, code, desc) => {
      if (!win.isDestroyed()) win.close()
      reject(new Error(`did-fail-load ${code} ${desc}`))
    })
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

  const html = buildCardHtml()
  report('html dimuat (template asli)', html.includes('SMAN Contoh Negeri'), `${html.length} chars`)
  report('html memuat @page 110mm 60mm', html.includes('@page') && html.includes('110mm') && html.includes('60mm'), 'SSOT ukuran kartu ada di template')

  const service = new PrintService(null, null)
  const fixedPdf = await service.renderPdf(html)
  fs.writeFileSync(PDF_PATH, fixedPdf)
  console.log(`PASS | renderPdf (preferCSSPageSize:true) menghasilkan ${fixedPdf.length} bytes`)

  const fixedBoxes = extractMediaBox(fixedPdf)
  report('PDF fix punya MediaBox', Array.isArray(fixedBoxes) && fixedBoxes.length > 0, JSON.stringify(fixedBoxes))
  const firstBox = fixedBoxes ? fixedBoxes[0] : null
  const wPt = firstBox ? firstBox.x1 - firstBox.x0 : NaN
  const hPt = firstBox ? firstBox.y1 - firstBox.y0 : NaN
  report(
    'Ukuran halaman 110mm x 60mm',
    Math.abs(wPt - EXPECTED_W_PT) < 0.5 && Math.abs(hPt - EXPECTED_H_PT) < 0.5,
    `w=${wPt.toFixed(3)}pt (${(wPt / MM_TO_PT).toFixed(3)}mm) h=${hPt.toFixed(3)}pt (${(hPt / MM_TO_PT).toFixed(3)}mm) — ekspektasi 311.811pt x 170.079pt`
  )

  const a4Pdf = await renderToPdf(html, false)
  const a4Path = `${PDF_PATH}.a4.pdf`
  fs.writeFileSync(a4Path, a4Pdf)
  const a4Boxes = extractMediaBox(a4Pdf)
  const a4First = a4Boxes ? a4Boxes[0] : null
  const a4w = a4First ? a4First.x1 - a4First.x0 : NaN
  const a4h = a4First ? a4First.y1 - a4First.y0 : NaN
  report(
    'Kontrol: tanpa flag = A4/Letter (bukan kartu)',
    isNaN(a4w) || (a4w > 400 && a4h > 500),
    `w=${Number.isFinite(a4w) ? a4w.toFixed(3) : 'NA'}pt h=${Number.isFinite(a4h) ? a4h.toFixed(3) : 'NA'}pt`
  )

  console.log('PAGESIZE_FIXED=' + wPt.toFixed(3) + 'x' + hPt.toFixed(3))
  console.log('PAGESIZE_A4=' + (Number.isFinite(a4w) ? a4w.toFixed(3) : 'NA') + 'x' + (Number.isFinite(a4h) ? a4h.toFixed(3) : 'NA'))
  console.log(failures === 0 ? 'SMOKE_RESULT=PASS' : `SMOKE_RESULT=FAIL (${failures})`)
  app.exit(failures === 0 ? 0 : 1)
}).catch((error) => {
  console.error('SMOKE_RESULT=ERROR', error)
  app.exit(1)
})
