// BORROW CARD LAYOUT REFINEMENT v1.2 — geometry check di Electron (render nyata).
// Memuat HTML kartu asli (generateBorrowCardHtml) di BrowserWindow dan mengukur
// bounding box untuk membuktikan penyempurnaan visual v1.2:
//   - inventory number mengikuti judul dgn jarak proporsional ~8mm (flex gap 3mm
//     + inv margin-left 5mm; bukan rata tepi kanan & bukan jarak keras 13mm);
//   - judul PENDEK menyisakan ruang legroom di kanan baris (sign area terlihat lebih luas);
//   - judul PANJANG ter-ellipsis namun inv tetap ~8mm setelah judul;
//   - garis pemisah abu terang antara data anggota & daftar buku + jarak ~1mm;
//   - regresi v1.1: baris tidak overlap, di dalam kartu, footer clear, QR & ttd terpisah;
//   - kapasitas 5+13 dipertahankan (20 buku -> 3 sheet, distribusi 5+13+2).
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

const BORROW_ID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'
const MM = 96 / 25.4 // px per mm di CSS (96 DPI)

function books(n) {
  return Array.from({ length: n }, (_, i) => ({
    inventoryNumber: `INV-${String(i + 1).padStart(6, '0')}`,
    title: `Buku Ke-${i + 1}`
  }))
}

function buildCardHtml(totalBooks, titleOverride) {
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
    books: titleOverride
      ? [{ inventoryNumber: 'INV-000001', title: titleOverride }]
      : books(totalBooks),
    footer: {
      totalBooks: titleOverride ? 1 : totalBooks,
      borrowStatus: 'ACTIVE',
      qrSvg: generateQrCodeSvg(BORROW_ID),
      officerName: 'Ibu Pustakawan'
    }
  }
  return generateBorrowCardHtml(data)
}

const MEASURE = `(() => {
  try {
  const MM = 96 / 25.4
  const toRect = (el) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, w: r.width, h: r.height }; }
  const cards = Array.from(document.querySelectorAll('.borrow-card'))
  const result = { sheets: cards.length, cards: [] }
  for (const card of cards) {
    const cardRect = toRect(card)
    const body = card.querySelector('.body')
    const bodyStyle = body ? getComputedStyle(body) : null
    const books = card.querySelector('.books')
    const rows = Array.from(card.querySelectorAll('.book-row')).map((row) => {
      const num = row.querySelector('.num')
      const title = row.querySelector('.title')
      const inv = row.querySelector('.inv')
      const n = toRect(num)
      const t = toRect(title)
      const v = toRect(inv)
      return {
        titleTruncated: title.scrollWidth > title.clientWidth + 1,
        numTitleGapMm: +( (t.left - n.right) / MM ).toFixed(2),
        titleInvGapMm: +( (v.left - t.right) / MM ).toFixed(2),
        inv: v
      }
    })
    const footerEl = card.querySelector('.footer')
    const headerInfo = card.querySelector('.header-info')
    const qr = card.querySelector('.qr')
    const sign = card.querySelector('.sign')
    const footerRect = footerEl ? toRect(footerEl) : null
    let overlap = false
    const rowRects = rows.map((r) => r.inv)
    for (let i = 1; i < rowRects.length; i++) {
      if (rowRects[i].top < rowRects[i - 1].bottom - 0.5) { overlap = true; break }
    }
    const lastBottom = rowRects.length ? rowRects[rowRects.length - 1].bottom : 0
    const invRight = rows.length ? rows[rows.length - 1].inv.right : null
    result.cards.push({
      cardLeft: +cardRect.left.toFixed(1),
      cardRight: +cardRect.right.toFixed(1),
      legroomMm: invRight !== null ? +((cardRect.right - invRight) / MM).toFixed(2) : null,
      rows: rows.length,
      rowOverlap: overlap,
      insideCard: rowRects.every((r) => r.top >= cardRect.top - 0.5 && r.bottom <= cardRect.bottom + 0.5),
      lastRowBottom: +lastBottom.toFixed(1),
      footerTop: footerRect ? +footerRect.top.toFixed(1) : null,
      footerClear: footerRect ? lastBottom <= footerRect.top + 0.5 : true,
      qr: qr ? toRect(qr) : null,
      sign: sign ? toRect(sign) : null,
      headerInfo: headerInfo ? toRect(headerInfo) : null,
      hasFooterLeft: !!card.querySelector('.footer-left'),
      hasBody: !!body,
      hasSeparator: !!body && bodyStyle.borderBottomWidth !== '0px' && bodyStyle.borderBottomColor === 'rgb(226, 232, 240)',
      bodyBooksGapMm: body && books ? +( (books.getBoundingClientRect().top - body.getBoundingClientRect().bottom) / MM ).toFixed(2) : null,
      inv: rows.length ? rows[rows.length - 1].inv : null,
      titleTruncated: rows.length ? rows.some((r) => r.titleTruncated) : false,
      gaps: rows.map((r) => ({ numTitle: r.numTitleGapMm, titleInv: r.titleInvGapMm }))
    })
  }
  return result
  } catch (e) { return { error: String(e && e.message || e), stack: e && e.stack ? String(e.stack) : null } }
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

function inRange(value, expected, tol) {
  return Math.abs(value - expected) <= tol
}

app.whenReady().then(async () => {
  let failures = 0
  const report = (label, ok, detail) => {
    console.log(`${ok ? 'PASS' : 'FAIL'} | ${label} | ${detail}`)
    if (!ok) failures += 1
  }

  const single = await measure(buildCardHtml(5))
  const c0 = single.cards[0]
  report('1 kartu utk 5 buku (kapasitas hal1 = 5)', single.sheets === 1 && c0.rows === 5, `sheets=${single.sheets} rows=${c0.rows}`)
  report('5 baris tidak overlap & di dalam kartu & footer clear', !c0.rowOverlap && c0.insideCard && c0.footerClear, `overlap=${c0.rowOverlap} inside=${c0.insideCard} lastBottom=${c0.lastRowBottom} footerTop=${c0.footerTop}`)
  report('gap inv->judul ~8mm (flex gap 3mm + margin-left 5mm, semua baris)', c0.gaps.every((g) => inRange(g.titleInv, 8, 2)), JSON.stringify(c0.gaps.map((g) => g.titleInv)))
  report('gap num->judul ~3mm (flex gap)', c0.gaps.every((g) => inRange(g.numTitle, 3, 2)), JSON.stringify(c0.gaps.map((g) => g.numTitle)))
  report('judul pendek menyisakan legroom kanan (inv tidak rata ke tepi)', c0.legroomMm !== null && c0.legroomMm >= 5, `legroom=${c0.legroomMm}mm cardRight=${c0.cardRight}`)
  report('separator abu terang antara body & books', c0.hasSeparator, `borderBottom=${c0.hasSeparator}`)
  report('jarak pemisah ke daftar buku ~1mm', c0.hasBody && inRange(c0.bodyBooksGapMm, 1, 0.8), `gap=${c0.bodyBooksGapMm}mm`)
  report('QR & tanda tangan terpisah (tidak overlap)', c0.qr && !overlaps(c0.qr, c0.sign), JSON.stringify({ qr: c0.qr, sign: c0.sign }))
  report('header-info di kanan atas (ada di atas footer)', c0.headerInfo !== null && c0.headerInfo.top < c0.footerTop, JSON.stringify(c0.headerInfo))
  report('tidak ada footer-left', !c0.hasFooterLeft, `hasFooterLeft=${c0.hasFooterLeft}`)

  const longTitle = await measure(buildCardHtml(1, 'Panduan Lengkap Administrasi Perpustakaan Sekolah dan Pengelolaan Koleksi Buku Digital Tahun 2026'))
  const cLong = longTitle.cards[0]
  report('judul panjang ter-ellipsis (truncate)', cLong.titleTruncated, `titleTruncated=${cLong.titleTruncated}`)
  report('judul panjang: inv tetap ~8mm setelah judul', cLong.gaps.every((g) => inRange(g.titleInv, 8, 2)), JSON.stringify(cLong.gaps.map((g) => g.titleInv)))
  report('judul panjang: baris tidak overlap / di dalam kartu', !cLong.rowOverlap && cLong.insideCard && cLong.footerClear, JSON.stringify({ ov: cLong.rowOverlap, in: cLong.insideCard, fc: cLong.footerClear }))

  const many = await measure(buildCardHtml(20))
  report('20 buku -> 3 sheet', many.sheets === 3, `sheets=${many.sheets}`)
  const dist = many.cards.map((c) => c.rows)
  report('distribusi baris 5+13+2 (kapasitas dipertahankan)', JSON.stringify(dist) === JSON.stringify([5, 13, 2]), JSON.stringify(dist))
  const allNoOverlap = many.cards.every((c) => !c.rowOverlap && c.insideCard && c.footerClear)
  report('tiap sheet: tanpa overlap, di dalam kartu, footer clear', allNoOverlap, JSON.stringify(many.cards.map((c) => ({ rows: c.rows, ov: c.rowOverlap, in: c.insideCard, fc: c.footerClear }))))
  report('tiap sheet: gap inv->judul ~8mm', many.cards.every((c) => c.gaps.length === 0 || c.gaps.every((g) => inRange(g.titleInv, 8, 2))), JSON.stringify(many.cards.map((c) => c.gaps[0])))
  report('halaman lanjutan TANPA separator (tidak ada body)', many.cards.slice(1).every((c) => !c.hasBody && !c.hasSeparator), JSON.stringify(many.cards.slice(1).map((c) => ({ body: c.hasBody, sep: c.hasSeparator }))))

  console.log('GEOMETRY=' + JSON.stringify({ single: { rows: c0.rows, gaps: c0.gaps, sepGap: c0.bodyBooksGapMm }, many: dist, longTitle: { truncated: cLong.titleTruncated, gap: cLong.gaps[0] } }))
  console.log(failures === 0 ? 'SMOKE_RESULT=PASS' : `SMOKE_RESULT=FAIL (${failures})`)
  app.exit(failures === 0 ? 0 : 1)
}).catch((error) => {
  console.error('SMOKE_RESULT=ERROR', error)
  app.exit(1)
})
