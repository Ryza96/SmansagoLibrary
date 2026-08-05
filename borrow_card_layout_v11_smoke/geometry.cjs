// BORROW CARD LAYOUT v1.1 — geometry check di Electron (render nyata).
// Memuat HTML kartu asli (generateBorrowCardHtml) di BrowserWindow dan mengukur
// bounding box baris buku / QR / tanda tangan untuk membuktikan:
//   - tidak ada baris buku yang saling overlap (vertikal);
//   - seluruh baris buku berada di dalam kartu (tidak terpotong keluar);
//   - QR & tanda tangan tetap di footer kanan-bawah, tidak saling tumpang tindih;
//   - Jumlah+Status berada di pojok kanan atas (header-info), footer kiri kosong.
//
// Jalankan: electron geometry.cjs <compiledOutDir>

const path = require('path')
const { app, BrowserWindow } = require('electron')

process.on('uncaughtException', (error) => {
  console.error('UNCAUGHT', error)
  app.exit(1)
})

const OUT_DIR = process.argv[2]
const {
  generateBorrowCardHtml,
  generateAvatarPlaceholderSvg
} = require(path.join(OUT_DIR, 'src', 'main', 'services', 'borrow-card.service.js'))
const { generateQrCodeSvg } = require(path.join(OUT_DIR, 'src', 'main', 'services', 'barcode.service.js'))

const BORROW_ID = '6f0f0b5d-6b6c-4a2e-9f12-3c4d5e6f7890'

function books(n) {
  return Array.from({ length: n }, (_, i) => ({
    inventoryNumber: `INV-${String(i + 1).padStart(6, '0')}`,
    title: `Buku Ke-${i + 1}`
  }))
}

function buildCardHtml(totalBooks) {
  const data = {
    header: { logo: '', schoolName: 'SMAN Contoh Negeri', libraryName: 'Perpustakaan' },
    member: {
      memberNumber: 'S-000001',
      fullName: 'Aulia Utami',
      memberType: 'Siswa',
      className: 'X Merdeka 1',
      avatarPlaceholder: generateAvatarPlaceholderSvg('Aulia Utami')
    },
    borrow: {
      borrowId: BORROW_ID,
      borrowNumber: 'PJ2026080001',
      borrowDate: '05-08-2026',
      dueDate: '12-08-2026'
    },
    books: books(totalBooks),
    footer: {
      totalBooks,
      borrowStatus: 'ACTIVE',
      qrSvg: generateQrCodeSvg(BORROW_ID),
      officerName: 'Ibu Pustakawan'
    }
  }
  return generateBorrowCardHtml(data)
}

const MEASURE = `(() => {
  const toRect = (el) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, w: r.width, h: r.height }; }
  const cards = Array.from(document.querySelectorAll('.borrow-card'))
  const result = { sheets: cards.length, cards: [] }
  for (const card of cards) {
    const cardRect = toRect(card)
    const rows = Array.from(card.querySelectorAll('.book-row')).map(toRect)
    const footerEl = card.querySelector('.footer')
    const headerInfo = card.querySelector('.header-info')
    const qr = card.querySelector('.qr')
    const sign = card.querySelector('.sign')
    const footerRect = footerEl ? toRect(footerEl) : null
    let overlap = false
    for (let i = 1; i < rows.length; i++) {
      if (rows[i].top < rows[i - 1].bottom - 0.5) { overlap = true; break }
    }
    const lastBottom = rows.length ? rows[rows.length - 1].bottom : 0
    result.cards.push({
      rows: rows.length,
      rowOverlap: overlap,
      insideCard: rows.every((r) => r.top >= cardRect.top - 0.5 && r.bottom <= cardRect.bottom + 0.5),
      lastRowBottom: +lastBottom.toFixed(1),
      footerTop: footerRect ? +footerRect.top.toFixed(1) : null,
      footerClear: footerRect ? lastBottom <= footerRect.top + 0.5 : true,
      qr: qr ? toRect(qr) : null,
      sign: sign ? toRect(sign) : null,
      headerInfo: headerInfo ? toRect(headerInfo) : null,
      hasFooterLeft: !!card.querySelector('.footer-left')
    })
  }
  return result
})()`

function measure(html) {
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({ width: 1200, height: 900, show: false })
    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    win.webContents.on('did-finish-load', async () => {
      try {
        await new Promise((r) => setTimeout(r, 250))
        const result = await win.webContents.executeJavaScript(MEASURE)
        resolve(result)
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

function overlaps(a, b) {
  if (!a || !b) return false
  return a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5
}

app.whenReady().then(async () => {
  let failures = 0
  const report = (label, ok, detail) => {
    console.log(`${ok ? 'PASS' : 'FAIL'} | ${label} | ${detail}`)
    if (!ok) failures += 1
  }

  const single = await measure(buildCardHtml(5))
  const c0 = single.cards[0]
  report('1 kartu utk 5 buku (5 muat di halaman 1)', single.sheets === 1 && c0.rows === 5, `sheets=${single.sheets} rows=${c0.rows}`)
  report('5 baris buku tidak saling overlap', !c0.rowOverlap, `overlap=${c0.rowOverlap}`)
  report('5 baris berada di dalam kartu (tidak terpotong keluar)', c0.insideCard, `lastBottom=${c0.lastRowBottom} cardBottom=${c0.insideCard}`)
  report('daftar buku berhenti di atas footer (footer clear)', c0.footerClear, `lastRowBottom=${c0.lastRowBottom} footerTop=${c0.footerTop}`)
  report('QR ada & terpisah dari tanda tangan (tidak overlap)', c0.qr && !overlaps(c0.qr, c0.sign), JSON.stringify({ qr: c0.qr, sign: c0.sign }))
  report('header-info (Jumlah+Status) di kanan atas header', c0.headerInfo !== null && c0.headerInfo.top < c0.footerTop && c0.headerInfo.left > 0, JSON.stringify(c0.headerInfo))
  report('tidak ada footer-left (area kiri bawah bebas)', !c0.hasFooterLeft, `hasFooterLeft=${c0.hasFooterLeft}`)

  const many = await measure(buildCardHtml(20))
  report('20 buku -> 3 sheet', many.sheets === 3, `sheets=${many.sheets}`)
  const dist = many.cards.map((c) => c.rows)
  report('distribusi baris 5+13+2', JSON.stringify(dist) === JSON.stringify([5, 13, 2]), JSON.stringify(dist))
  const allNoOverlap = many.cards.every((c) => !c.rowOverlap && c.insideCard && c.footerClear)
  report('tiap sheet: tanpa overlap, di dalam kartu, footer clear', allNoOverlap, JSON.stringify(many.cards.map((c) => ({ rows: c.rows, ov: c.rowOverlap, in: c.insideCard, fc: c.footerClear }))))

  console.log('GEOMETRY=' + JSON.stringify({ single: { rows: c0.rows, overlap: c0.rowOverlap, footerClear: c0.footerClear }, many: dist }))
  console.log(failures === 0 ? 'SMOKE_RESULT=PASS' : `SMOKE_RESULT=FAIL (${failures})`)
  app.exit(failures === 0 ? 0 : 1)
}).catch((error) => {
  console.error('SMOKE_RESULT=ERROR', error)
  app.exit(1)
})
