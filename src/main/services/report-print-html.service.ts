// Report Module — Template HTML Laporan Cetak A4 (TAHAP 2).
// Fungsi MURNI generateReportPrintHtml(data, options): tanpa Electron / DB,
// sehingga dapat diuji headless. Satu dokumen = N elemen halaman
// (.a4-sheet), jumlahnya = jumlah halaman paginateReportRows (TAHAP 1).
// Seluruh teks dari data dilewati escapeHtml — tidak ada interpolasi mentah.
// Logo: data URI disematkan SEKALI via CSS variable --report-logo-url
// (pola --label-logo-url di label.service.ts); tanpa data URI → fallback
// monogram (generateLogoMonogramSvg, sama seperti kartu/label).
import { paginateReportRows, reportPrintGeometry } from '../../shared/config/report-print'
import type { ReportPrintPageGeometry, ReportPrintType } from '../../shared/config/report-print'
import type { ReportPrintColumn, ReportPrintData } from '../../shared/dto/report-print'
import { escapeHtml } from '../../shared/utils/escape-html'
import { generateLogoMonogramSvg } from './borrow-card.service'

export interface ReportPrintPreview {
  html: string
  pageCount: number
  orientation: ReportPrintData['orientation']
  title: string
}

// Lebar kolom per tipe (persen, jumlah = 100) — disesuaikan agar tabel
// 11 kolom Koleksi tetap terbaca di landscape.
const COLUMN_WIDTHS: Record<ReportPrintData['type'], number[]> = {
  borrowings: [9, 14, 25, 10, 26, 9, 7],
  returns: [11, 13, 18, 12, 25, 10, 11],
  overdues: [10, 12, 16, 11, 25, 10, 8, 8],
  members: [14, 28, 18, 18, 22],
  collections: [12, 23, 12, 12, 11, 6, 7, 5, 5, 4, 3]
}

/**
 * CSS tabel. Laporan Peminjaman (landscape) memakai varian TANPA pemotongan
 * teks: tidak ada line-clamp / ellipsis / max-height, baris memakai min-height,
 * sel membungkus kata panjang (overflow-wrap: anywhere), baris tidak terbelah
 * antar halaman, dan header tabel diulang di tiap halaman.
 * Laporan lain memakai CSS lama apa adanya (perilaku tidak berubah).
 */
function tableCss(type: ReportPrintType, geometry: ReportPrintPageGeometry): string {
  if (type === 'borrowings') {
    return `  .report-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .report-table th, .report-table td {
    border: 0.2mm solid #6b7280;
    padding: 0.3mm 1mm;
    vertical-align: top;
    overflow: visible;
    overflow-wrap: anywhere;
    word-break: break-word;
    box-sizing: border-box;
  }
  .report-table thead { display: table-header-group; }
  .report-table thead th {
    background: #e5e7eb;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    font-weight: 700;
    height: ${geometry.rowHeightMm}mm;
  }
  .report-table tbody tr {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .report-table tbody td { min-height: ${geometry.rowHeightMm}mm; height: auto; }
  .cell-text {
    display: block;
    overflow: visible;
    line-height: 1.15;
  }
  .cell-status { font-weight: 700; }`
  }
  return `  .report-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .report-table th, .report-table td {
    border: 0.2mm solid #6b7280;
    padding: 0.3mm 1mm;
    vertical-align: middle;
    overflow: hidden;
    box-sizing: border-box;
  }
  .report-table thead th {
    background: #e5e7eb;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    font-weight: 700;
    height: ${geometry.rowHeightMm}mm;
  }
  .report-table tbody tr { height: ${geometry.rowHeightMm}mm; }
  .report-table tbody td { height: ${geometry.rowHeightMm}mm; }
  .cell-text {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.05;
    /* 2 baris pada 8.5pt × 1.05 = 6.3mm < 6.5mm konten (7.5 − 0.6 padding − 0.4 border) */
    max-height: ${geometry.rowHeightMm - 1}mm;
  }
  .cell-status { font-weight: 700; }`
}

function formatPrintedAt(isoString: string): string {
  const d = new Date(isoString)
  if (Number.isNaN(d.getTime())) return '-'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function columnGroupHtml(type: ReportPrintData['type'], columns: ReportPrintColumn[]): string {
  const widths = COLUMN_WIDTHS[type] ?? columns.map(() => Math.floor(100 / columns.length))
  const cols = columns.map((_, i) => `<col style="width:${widths[i] ?? 10}%">`).join('')
  return `<colgroup>${cols}</colgroup>`
}

function headerHtml(columns: ReportPrintColumn[]): string {
  const cells = columns
    .map((c) => `<th class="align-${c.align}">${escapeHtml(c.label)}</th>`)
    .join('')
  return `<thead><tr>${cells}</tr></thead>`
}

function bodyRowsHtml(columns: ReportPrintColumn[], rows: string[][]): string {
  if (rows.length === 0) {
    return `<tr class="row-empty"><td colspan="${columns.length}">Tidak ada data</td></tr>`
  }
  return rows
    .map((row) => {
      const cells = columns
        .map((c, i) => {
          const isStatus = c.key === 'status' || c.key === 'membershipStatus'
          return `<td class="align-${c.align}${isStatus ? ' cell-status' : ''}"><span class="cell-text">${escapeHtml(row[i] ?? '-')}</span></td>`
        })
        .join('')
      return `<tr>${cells}</tr>`
    })
    .join('')
}

function firstPageHeaderHtml(data: ReportPrintData, printedAt: string, monogram: string): string {
  const { institution } = data
  const contact = [institution.phone, institution.email].filter((v) => v.trim() !== '').join(' · ')
  const metaLines = data.filterSummary
    .map((m) => `<div class="meta-line"><span class="meta-label">${escapeHtml(m.label)}:</span> <span>${escapeHtml(m.value)}</span></div>`)
    .join('')
  return `
    <header class="doc-header">
      <div class="doc-logo" aria-hidden="true">${monogram}</div>
      <div class="doc-identity">
        <div class="doc-library">${escapeHtml(institution.libraryName)}</div>
        ${institution.schoolName ? `<div class="doc-school">${escapeHtml(institution.schoolName)}</div>` : ''}
        ${institution.address ? `<div class="doc-address">${escapeHtml(institution.address)}</div>` : ''}
        ${contact ? `<div class="doc-contact">${escapeHtml(contact)}</div>` : ''}
      </div>
    </header>
    <h1 class="doc-title">${escapeHtml(data.title)}</h1>
    <div class="doc-meta">
      ${metaLines}
      <div class="meta-line"><span class="meta-label">Dicetak:</span> <span>${escapeHtml(printedAt)}</span></div>
    </div>`
}

function continuationHeaderHtml(data: ReportPrintData): string {
  return `
    <header class="doc-header-compact">
      <span class="doc-title-compact">${escapeHtml(data.title)}</span>
      <span class="doc-continued">Lanjutan</span>
    </header>`
}

function totalsHtml(data: ReportPrintData): string {
  const rows = data.totals
    .map((t) => `<tr><td class="totals-label">${escapeHtml(t.label)}</td><td class="totals-value">${escapeHtml(t.value)}</td></tr>`)
    .join('')
  return `
    <section class="totals-block">
      <h2 class="block-heading">Total</h2>
      <table class="totals-table"><tbody>${rows}</tbody></table>
    </section>`
}

function notesHtml(data: ReportPrintData): string {
  if (data.notes.length === 0) return ''
  const items = data.notes.map((n) => `<li>${escapeHtml(n)}</li>`).join('')
  return `
    <section class="notes-block">
      <h2 class="block-heading">Catatan</h2>
      <ul class="notes-list">${items}</ul>
    </section>`
}

function signatureBoxHtml(role: string, name: string, nip: string): string {
  return `
    <div class="signature-box">
      <div class="signature-role">${escapeHtml(role)}</div>
      <div class="signature-space"></div>
      <div class="signature-name">${escapeHtml(name)}</div>
      <div class="signature-nip">NIP. ${escapeHtml(nip && nip.trim() ? nip.trim() : '-')}</div>
    </div>`
}

function signaturesHtml(data: ReportPrintData): string {
  return `
    <section class="signatures-block">
      ${signatureBoxHtml('Pustakawan', data.institution.librarianName, data.institution.librarianNip)}
      ${signatureBoxHtml('Kepala Sekolah', data.institution.principalName, data.institution.principalNip)}
    </section>`
}

export function generateReportPrintHtml(
  data: ReportPrintData,
  options?: { logoDataUri?: string | null }
): string {
  const geometry = reportPrintGeometry(data.type, data.orientation)
  const pagination = paginateReportRows(data.totalRows, data.orientation, data.type)
  const pageCount = pagination.pages.length
  const printedAt = formatPrintedAt(data.generatedAt)
  const monogram = options?.logoDataUri ? '' : generateLogoMonogramSvg(data.institution.schoolName, data.institution.libraryName)
  const logoVar = options?.logoDataUri
    ? `:root { --report-logo-url: url("${options.logoDataUri}"); }`
    : ''

  const sheets = pagination.pages
    .map((page, index) => {
      const isFirst = index === 0
      const isLast = index === pageCount - 1
      const pageRows = data.rows.slice(page.startIndex, page.endIndex)
      const header = isFirst ? firstPageHeaderHtml(data, printedAt, monogram) : continuationHeaderHtml(data)
      const lastBlocks = isLast ? `${totalsHtml(data)}${notesHtml(data)}${signaturesHtml(data)}` : ''
      return `
  <section class="a4-sheet${isLast ? ' a4-sheet--last' : ''}">
    ${header}
    <table class="report-table">
      ${columnGroupHtml(data.type, data.columns)}
      ${headerHtml(data.columns)}
      <tbody>${bodyRowsHtml(data.columns, pageRows)}</tbody>
    </table>
    ${lastBlocks}
    <footer class="sheet-footer"><span>Halaman ${page.page} dari ${pageCount}</span></footer>
  </section>`
    })
    .join('')

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<title>${escapeHtml(data.title)}</title>
<style>
  ${logoVar}
  @page {
    size: A4 ${data.orientation};
    margin: 0;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: Arial, 'Segoe UI', sans-serif;
    color: #111111;
    background: #ffffff;
    font-size: 8.5pt;
  }
  .a4-sheet {
    position: relative;
    width: ${geometry.widthMm}mm;
    height: ${geometry.heightMm}mm;
    padding: ${geometry.marginMm}mm;
    overflow: hidden;
    page-break-after: always;
    break-after: page;
    display: flex;
    flex-direction: column;
  }
  .a4-sheet--last { page-break-after: auto; break-after: auto; }
  .doc-header { display: flex; align-items: center; gap: 4mm; }
  .doc-logo {
    flex: 0 0 auto;
    width: 12mm;
    height: 12mm;
    background-image: var(--report-logo-url, none);
    background-size: contain;
    background-repeat: no-repeat;
    background-position: center;
  }
  .doc-logo svg { width: 100%; height: 100%; }
  .doc-identity { flex: 1 1 auto; min-width: 0; }
  .doc-library { font-size: 13pt; font-weight: 700; line-height: 1.2; }
  .doc-school { font-size: 10pt; font-weight: 700; line-height: 1.25; }
  .doc-address, .doc-contact { font-size: 8pt; line-height: 1.3; }
  .doc-title { font-size: 14pt; font-weight: 700; margin: 3mm 0 2mm; text-align: center; }
  .doc-meta { margin-bottom: 2mm; }
  .meta-line { line-height: 1.35; }
  .meta-label { font-weight: 700; }
  .doc-header-compact {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    border-bottom: 0.3mm solid #333333;
    padding-bottom: 1.5mm;
    margin-bottom: 2mm;
  }
  .doc-title-compact { font-size: 11pt; font-weight: 700; }
  .doc-continued { font-size: 8.5pt; }
${tableCss(data.type, geometry)}
  .align-left { text-align: left; }
  .align-center { text-align: center; }
  .align-right { text-align: right; }
  .row-empty td { text-align: center; font-style: italic; }
  .totals-block, .notes-block { margin-top: 4mm; }
  .block-heading { font-size: 10pt; font-weight: 700; margin: 0 0 1.5mm; }
  .totals-table { border-collapse: collapse; }
  .totals-table td { padding: 0.4mm 2mm 0.4mm 0; }
  .totals-table .totals-label { font-weight: 700; }
  .notes-list { margin: 0; padding-left: 5mm; }
  .notes-list li { line-height: 1.35; }
  .signatures-block {
    margin-top: 8mm;
    display: flex;
    justify-content: space-between;
    gap: 20mm;
  }
  .signature-box {
    width: 55mm;
    text-align: center;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .signature-role { line-height: 1.3; }
  .signature-space { height: 18mm; }
  .signature-name {
    font-weight: 700;
    text-decoration: underline;
    padding-top: 1mm;
    min-height: 4mm;
  }
  .signature-nip { line-height: 1.3; }
  .sheet-footer {
    margin-top: auto;
    border-top: 0.2mm solid #6b7280;
    padding-top: 1.5mm;
    text-align: right;
    font-size: 8pt;
  }
</style>
</head>
<body>${sheets}
</body>
</html>`
}
