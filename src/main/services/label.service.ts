import type { BookLabelData, BookLabelItemData } from '../../shared/dto/print'
import { generateBarcodeSvg } from './barcode.service'
import { generateLogoMonogramSvg } from './borrow-card.service'

export const LABEL_PRINT_CONFIG = {
  pageWidthMm: 210,
  pageHeightMm: 297,
  marginLeftMm: 6,
  marginRightMm: 6,
  marginTopMm: 6,
  marginBottomMm: 6,
  columns: 3,
  rows: 4,
  barcodeHeightMm: 37,
  showLabelBorder: false
} as const

const CUT_GUIDE_COLOR = '#cbd5e1'
const CUT_MARK_COLOR = '#64748b'
const LABELS_PER_PAGE = LABEL_PRINT_CONFIG.columns * LABEL_PRINT_CONFIG.rows

const PRINTABLE_WIDTH_MM =
  LABEL_PRINT_CONFIG.pageWidthMm - LABEL_PRINT_CONFIG.marginLeftMm - LABEL_PRINT_CONFIG.marginRightMm
const PRINTABLE_HEIGHT_MM =
  LABEL_PRINT_CONFIG.pageHeightMm - LABEL_PRINT_CONFIG.marginTopMm - LABEL_PRINT_CONFIG.marginBottomMm
const LABEL_WIDTH_MM = PRINTABLE_WIDTH_MM / LABEL_PRINT_CONFIG.columns
const LABEL_HEIGHT_MM = PRINTABLE_HEIGHT_MM / LABEL_PRINT_CONFIG.rows

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Ikon buku kecil (navy) untuk baris judul — self-contained SVG.
const BOOK_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="#12235a" stroke-width="1.8"><path d="M4 6c2-1 4.5-1.5 7-1.5V18c-2.5-.5-5 0-7 1V6z"/><path d="M20 6c-2-1-4.5-1.5-7-1.5V18c2.5-.5 5 0 7 1V6z"/></svg>`

// Ikon pin lokasi (putih) untuk footer bar navy.
const PIN_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 1 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>`

// Logo label — dirender via CSS background-image (var --label-logo-url) bila
// data URI logo tersedia, selainnya monogram (fallback wajar tanpa ruang kosong:
// inisial schoolName/libraryName; kosong penuh → ikon buku).
//
// OPSI A (FIX BOOK LABEL DATA-URL SIZE): data URI logo TIDAK lagi di-render
// sebagai <img src="data:..."> per label. Logo disematkan SATU KALI di blok
// <style> (custom property --label-logo-url) dan setiap .label-logo menampilkan
// via background-image. Ini menurunkan ukuran data URL HTML dari N× (logo) menjadi
// 1× (logo), sehingga 12/24 label jauh di bawah batas Chromium url::kMaxURLChars
// (2,097,152). Saat logo hadir, labelLogoHtml() mengembalikan '' (CSS yang
// menggambar); saat kosong, monogram SVG (tanpa data URI) dimuat di dalam div.
function labelLogoHtml(data: BookLabelData): string {
  if (data.logo) {
    return ''
  }
  return generateLogoMonogramSvg(data.schoolName ?? '', data.libraryName ?? '')
}

function labelHeaderHtml(data: BookLabelData): string {
  return `<div class="label-header">
  <div class="label-logo">${labelLogoHtml(data)}</div>
  <div class="label-head-text">
    <div class="label-library">${escapeHtml(data.libraryName ?? '')}</div>
    ${data.schoolName ? `<div class="label-school">${escapeHtml(data.schoolName)}</div>` : ''}
  </div>
</div>`
}

function labelItemHtml(item: BookLabelItemData, data: BookLabelData): string {
  const barcodeValue = item.barcode || item.inventoryNumber
  const barcodeSvg = generateBarcodeSvg(barcodeValue, data.barcodeFormat)
  const authorHtml = item.author ? `<div class="label-author">${escapeHtml(item.author)}</div>` : ''

  return `<div class="label">
    ${labelHeaderHtml(data)}
    <div class="label-barcode">${barcodeSvg}</div>
    <div class="label-inventory">${escapeHtml(item.inventoryNumber)}</div>
    <div class="label-book-divider"></div>
    <div class="label-book">
      <div class="label-book-icon">${BOOK_ICON_SVG}</div>
      <div class="label-book-text">
        <div class="label-title">${escapeHtml(data.bookTitle)}</div>
        ${authorHtml}
      </div>
    </div>
    <div class="label-footer">
      ${PIN_ICON_SVG}
      <span>${escapeHtml(item.shelfLocation || '')}</span>
    </div>
  </div>`
}

function cutMarkSvg(xMm: number, yMm: number, rotateDeg: number): string {
  return `<svg class="label-cut-mark" style="left:${xMm}mm;top:${yMm}mm;transform:translate(-50%,-50%) rotate(${rotateDeg}deg)" viewBox="0 0 24 24" fill="none" stroke="${CUT_MARK_COLOR}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="6" cy="6" r="3"></circle>
    <circle cx="6" cy="18" r="3"></circle>
    <line x1="20" y1="4" x2="8.12" y2="15.88"></line>
    <line x1="14.47" y1="14.48" x2="20" y2="20"></line>
    <line x1="8.12" y1="8.12" x2="12" y2="12"></line>
  </svg>`
}

function cutMarkPositions(): Array<{ xMm: number; yMm: number; rotateDeg: number }> {
  const { columns, rows, marginLeftMm, marginTopMm, marginRightMm, marginBottomMm } = LABEL_PRINT_CONFIG
  const innerRightMm = LABEL_PRINT_CONFIG.pageWidthMm - marginRightMm
  const innerBottomMm = LABEL_PRINT_CONFIG.pageHeightMm - marginBottomMm

  const positions: Array<{ xMm: number; yMm: number; rotateDeg: number }> = []
  for (let col = 1; col < columns; col++) {
    const x = marginLeftMm + col * LABEL_WIDTH_MM
    positions.push({ xMm: x, yMm: marginTopMm, rotateDeg: 90 })
    positions.push({ xMm: x, yMm: innerBottomMm, rotateDeg: -90 })
  }
  for (let row = 1; row < rows; row++) {
    const y = marginTopMm + row * LABEL_HEIGHT_MM
    positions.push({ xMm: marginLeftMm, yMm: y, rotateDeg: 0 })
    positions.push({ xMm: innerRightMm, yMm: y, rotateDeg: 180 })
  }
  return positions
}

export function generateLabelsHtml(data: BookLabelData): string {
  const { pageWidthMm, pageHeightMm, marginLeftMm, marginRightMm, marginTopMm, marginBottomMm, columns, rows } =
    LABEL_PRINT_CONFIG
  const labelBorder = LABEL_PRINT_CONFIG.showLabelBorder ? `border: 1px dashed #94a3b8;` : ''

  const pageCount = Math.max(1, Math.ceil(data.items.length / LABELS_PER_PAGE))
  const pagesHtml = Array.from({ length: pageCount }, (_, page) => {
    const pageItems = data.items.slice(page * LABELS_PER_PAGE, (page + 1) * LABELS_PER_PAGE)
    const labelsHtml = pageItems
      .map((item) => labelItemHtml(item, data))
      .join('')
    const cutMarksHtml = cutMarkPositions()
      .map(({ xMm, yMm, rotateDeg }) => cutMarkSvg(xMm, yMm, rotateDeg))
      .join('')
    return `  <div class="label-page">
${labelsHtml}
${cutMarksHtml}
  </div>`
  }).join('\n')

  const guideImages: string[] = []
  const guideSizes: string[] = []
  const guidePositions: string[] = []

  for (let col = 1; col < columns; col++) {
    const x = marginLeftMm + col * LABEL_WIDTH_MM
    guideImages.push(`repeating-linear-gradient(to bottom, ${CUT_GUIDE_COLOR} 0 3.5mm, transparent 3.5mm 7mm)`)
    guideSizes.push('0.28mm 100%')
    guidePositions.push(`${x}mm 0`)
  }
  for (let row = 1; row < rows; row++) {
    const y = marginTopMm + row * LABEL_HEIGHT_MM
    guideImages.push(`repeating-linear-gradient(to right, ${CUT_GUIDE_COLOR} 0 3.5mm, transparent 3.5mm 7mm)`)
    guideSizes.push('100% 0.28mm')
    guidePositions.push(`0 ${y}mm`)
  }

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Label Buku</title>
<style>
${
  data.logo
    ? `  :root {
    --label-logo-url: url("${data.logo}");
  }
`
    : ``
}  @page {
    size: A4;
    margin: 0;
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
  }
  body {
    background: #eef2f7;
  }
  .label-page {
    position: relative;
    width: ${pageWidthMm}mm;
    height: ${pageHeightMm}mm;
    margin: 0 auto 32px;
    background: #ffffff;
    box-shadow: 0 4px 24px rgba(15, 23, 42, 0.14);
    padding: ${marginTopMm}mm ${marginRightMm}mm ${marginBottomMm}mm ${marginLeftMm}mm;
    font-family: 'Arial', sans-serif;
    color: #1f2937;
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-start;
    align-items: stretch;
    align-content: flex-start;
    page-break-after: always;
    break-after: page;
  }
  .label-page:last-of-type {
    margin-bottom: 0;
    page-break-after: auto;
    break-after: auto;
  }
  .label-page::after {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 5;
    pointer-events: none;
    background-image: ${guideImages.join(', ')};
    background-size: ${guideSizes.join(', ')};
    background-position: ${guidePositions.join(', ')};
    background-repeat: no-repeat;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .label-cut-mark {
    position: absolute;
    width: 5mm;
    height: 5mm;
    z-index: 6;
    pointer-events: none;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  @media print {
    body {
      background: #ffffff;
    }
    .label-page {
      margin: 0;
      box-shadow: none;
      background: #ffffff;
    }
  }
  .label {
    width: ${LABEL_WIDTH_MM}mm;
    height: ${LABEL_HEIGHT_MM}mm;
    ${labelBorder}
    padding: 2mm 3mm;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    text-align: center;
    page-break-inside: avoid;
  }
  .label-header {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 2mm;
    padding-bottom: 1.2mm;
    border-bottom: 0.3mm solid #12235a;
  }
  .label-logo {
    flex: 0 0 auto;
    width: 7mm;
    height: 7mm;
    border-radius: 50%;
    border: 0.4mm solid #12235a;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: #ffffff;
    background-image: var(--label-logo-url, none);
    background-size: contain;
    background-repeat: no-repeat;
    background-position: center;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .label-logo svg,
  .label-logo img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .label-head-text {
    flex: 1;
    min-width: 0;
    text-align: left;
  }
  .label-library {
    font-size: 12px;
    font-weight: 800;
    color: #12235a;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .label-school {
    font-size: 7.5px;
    color: #64748b;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-top: 0.5mm;
  }
  .label-barcode {
    width: 100%;
    height: ${LABEL_PRINT_CONFIG.barcodeHeightMm}mm;
  }
  .label-barcode svg {
    max-width: 100%;
    height: 100%;
  }
  .label-inventory {
    font-size: 13px;
    font-weight: 800;
    color: #12235a;
    font-family: Consolas, 'Courier New', monospace;
    letter-spacing: 1px;
    margin-top: 0.8mm;
  }
  .label-book-divider {
    width: 100%;
    height: 0.3mm;
    background: #cbd5e1;
    margin: 0.9mm 0;
  }
  .label-book {
    flex: 1;
    min-height: 0;
    width: 100%;
    display: flex;
    align-items: center;
    gap: 1.5mm;
  }
  .label-book-icon {
    flex: 0 0 auto;
    width: 4.5mm;
    height: 4.5mm;
  }
  .label-book-icon svg {
    width: 100%;
    height: 100%;
  }
  .label-book-text {
    flex: 1;
    min-width: 0;
    text-align: left;
  }
  .label-title {
    font-size: 10.5px;
    line-height: 1.3;
    font-weight: 700;
    color: #1f2937;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  .label-author {
    font-size: 8.5px;
    font-style: italic;
    color: #475569;
    margin-top: 0.4mm;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .label-footer {
    width: 100%;
    margin-top: auto;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1mm;
    background: #12235a;
    border-radius: 2mm;
    padding: 0.8mm 1.5mm;
    color: #ffffff;
    font-size: 8.5px;
    font-weight: 600;
    letter-spacing: 0.3px;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .label-footer svg {
    flex: 0 0 auto;
    width: 3mm;
    height: 3mm;
  }
</style>
</head>
<body>
${pagesHtml}
</body>
</html>`
}
