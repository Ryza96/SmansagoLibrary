import type { BookLabelData, BookLabelItemData } from '../../shared/dto/print'
import { generateBarcodeSvg } from './barcode.service'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function labelItemHtml(item: BookLabelItemData, bookTitle: string): string {
  const barcodeValue = item.barcode || item.inventoryNumber
  const barcodeSvg = generateBarcodeSvg(barcodeValue)

  return `<div class="label">
    <div class="label-barcode">${barcodeSvg}</div>
    <div class="label-inventory">${escapeHtml(item.inventoryNumber)}</div>
    <div class="label-title">${escapeHtml(bookTitle)}</div>
    <div class="label-shelf">${escapeHtml(item.shelfLocation || '')}</div>
  </div>`
}

export function generateLabelsHtml(data: BookLabelData): string {
  const labelsHtml = data.items.map((item) => labelItemHtml(item, data.bookTitle)).join('')

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
  body {
    margin: 0;
    font-family: 'Arial', sans-serif;
    color: #1f2937;
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-start;
  }
  .label {
    width: 50%;
    height: 63mm;
    padding: 8px;
    border: 1px dashed #9ca3af;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    page-break-inside: avoid;
  }
  .label-barcode {
    max-width: 100%;
    height: 34mm;
  }
  .label-barcode svg {
    max-width: 100%;
    height: 100%;
  }
  .label-inventory {
    margin-top: 4px;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 1px;
  }
  .label-title {
    margin-top: 2px;
    font-size: 11px;
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    padding: 0 6px;
  }
  .label-shelf {
    margin-top: 2px;
    font-size: 11px;
    color: #6b7280;
  }
</style>
</head>
<body>
${labelsHtml}
</body>
</html>`
}
