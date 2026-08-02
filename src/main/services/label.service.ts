import type { BookLabelData, BookLabelItemData } from '../../shared/dto/print'
import { generateBarcodeSvg } from './barcode.service'

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

function labelItemHtml(item: BookLabelItemData, bookTitle: string, libraryName: string): string {
  const barcodeValue = item.barcode || item.inventoryNumber
  const barcodeSvg = generateBarcodeSvg(barcodeValue)
  const libraryHtml = libraryName
    ? `<div class="label-library">${escapeHtml(libraryName)}</div>`
    : ''

  return `<div class="label">
    ${libraryHtml}
    <div class="label-barcode">${barcodeSvg}</div>
    <div class="label-inventory">${escapeHtml(item.inventoryNumber)}</div>
    <div class="label-title">${escapeHtml(bookTitle)}</div>
    <div class="label-shelf">${escapeHtml(item.shelfLocation || '')}</div>
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
      .map((item) => labelItemHtml(item, data.bookTitle, data.libraryName ?? ''))
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
  @page {
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
    justify-content: space-evenly;
    text-align: center;
    page-break-inside: avoid;
  }
  .label-library {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .label-barcode {
    max-width: 100%;
    height: ${LABEL_PRINT_CONFIG.barcodeHeightMm}mm;
  }
  .label-barcode svg {
    max-width: 100%;
    height: 100%;
  }
  .label-inventory {
    font-size: 13px;
    font-weight: 700;
    font-family: Consolas, 'Courier New', monospace;
    letter-spacing: 1px;
  }
  .label-title {
    font-size: 10.5px;
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    padding: 0 6px;
  }
  .label-shelf {
    font-size: 10px;
    font-weight: 600;
    color: #475569;
  }
</style>
</head>
<body>
${pagesHtml}
</body>
</html>`
}
