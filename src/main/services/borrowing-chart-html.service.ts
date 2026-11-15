// Report Module — Template HTML laporan "Grafik Peminjaman" (SESSION 2).
// Fungsi MURNI generateBorrowingChartHtml(data): data masuk, string HTML keluar.
// Tanpa Electron / DB / IPC / script. SATU halaman A4 landscape (tanpa paginasi).
// Kotak/tipe/kop/tanda tangan MENYALIN pola laporan tabel
// (report-print-html.service.ts) — file itu TIDAK diubah, hanya polanya disalin.
// Seluruh teks dari data dilewati escapeHtml.
import type { BorrowingChartData, BorrowingChartMonthPoint } from '../../shared/dto/borrowing-chart'
import { escapeHtml } from '../../shared/utils/escape-html'
import { generateLogoMonogramSvg } from './borrow-card.service'
import {
  buildHorizontalBarChartSvg,
  buildVerticalBarChartSvg,
  truncateChartLabel
} from './borrowing-chart-svg'

/** Geometri lembar A4 landscape (identik laporan tabel: margin isi 12mm). */
export const BORROWING_CHART_SHEET = {
  widthMm: 297,
  heightMm: 210,
  marginMm: 12
} as const

/**
 * Tinggi grafik dipilih agar seluruh blok muat di area isi 186mm
 * (273 x 186mm setelah padding 12mm). Bila konten bertambah, kecilkan
 * tinggi grafik — bukan membuang bagian.
 */
export const BORROWING_CHART_LAYOUT = {
  monthlyWidthMm: 104,
  monthlyHeightMm: 32,
  topBooksWidthMm: 95,
  topBooksHeightMm: 32,
  byClassWidthMm: 160,
  /**
   * 30mm (bukan 32mm) agar grafik + catatan "Lainnya" tetap di dalam kartu
   * setinggi 42mm ketika baris kelas digabung (>12 kelas).
   */
  byClassHeightMm: 30,
  topBookLabelChars: 26,
  classLabelChars: 30,
  /** Tabel angka bulanan memakai 2 kolom sempit; dilewati bila bulan > batas. */
  monthlyTableMaxRows: 12
} as const

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function toCount(value: unknown): number {
  const n = finiteNumber(value, 0)
  return n > 0 ? Math.round(n) : 0
}

function formatCount(value: unknown): string {
  return String(toCount(value)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

function safeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function formatPrintedAt(isoString: string): string {
  const d = new Date(isoString)
  if (Number.isNaN(d.getTime())) return '-'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function normalizeMonths(months: BorrowingChartMonthPoint[] | undefined | null): BorrowingChartMonthPoint[] {
  if (!Array.isArray(months)) return []
  return months.map((month) => ({
    label: safeText(month?.label),
    count: toCount(month?.count)
  }))
}

function headerHtml(data: BorrowingChartData, printedAt: string): string {
  const institution = data.institution
  const monogram = generateLogoMonogramSvg(institution.schoolName, institution.libraryName)
  const contact = [institution.phone, institution.email].filter((item) => item && item.trim()).join(' • ')
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
      <div class="meta-line"><span class="meta-label">Periode:</span> <span>${escapeHtml(data.periodLabel)}</span></div>
      <div class="meta-line"><span class="meta-label">Dicetak:</span> <span>${escapeHtml(printedAt)}</span></div>
    </div>`
}

function summaryCardsHtml(data: BorrowingChartData): string {
  const cards = [
    { label: 'Total Peminjaman', value: formatCount(data.summary.totalBorrowings) },
    { label: 'Total Buku Dipinjam', value: formatCount(data.summary.totalBooks) },
    { label: 'Anggota Aktif', value: formatCount(data.summary.activeBorrowers) }
  ]
  return `
    <section class="summary-cards">
      ${cards
        .map(
          (card) => `
      <div class="summary-card">
        <div class="summary-label">${escapeHtml(card.label)}</div>
        <div class="summary-value">${escapeHtml(card.value)}</div>
      </div>`
        )
        .join('')}
    </section>`
}

function monthlyTableHtml(months: BorrowingChartMonthPoint[]): string {
  const maxRows = BORROWING_CHART_LAYOUT.monthlyTableMaxRows
  if (months.length > maxRows) {
    return `
      <div class="chart-note">Tabel angka bulanan disembunyikan (${months.length} bulan) — nilai tampil pada grafik.</div>`
  }
  const rows = Math.ceil(months.length / 2)
  const body: string[] = []
  for (let index = 0; index < rows; index += 1) {
    const left = months[index]
    const right = months[index + rows]
    body.push(
      `<tr><td>${escapeHtml(left.label)}</td><td class="cell-number">${escapeHtml(String(left.count))}</td>` +
        `<td>${right ? escapeHtml(right.label) : ''}</td><td class="cell-number">${right ? escapeHtml(String(right.count)) : ''}</td></tr>`
    )
  }
  return `
      <table class="numeric-table">
        <thead><tr><th>Bulan</th><th class="cell-number">Jml</th><th>Bulan</th><th class="cell-number">Jml</th></tr></thead>
        <tbody>${body.join('')}</tbody>
      </table>`
}

function monthlyCardHtml(months: BorrowingChartMonthPoint[]): string {
  return `
    <section class="chart-card chart-card--monthly">
      <div class="chart-caption">Peminjaman per Bulan</div>
      <div class="monthly-row">
        <div class="chart-canvas">
          ${buildVerticalBarChartSvg({
            points: months,
            widthMm: BORROWING_CHART_LAYOUT.monthlyWidthMm,
            heightMm: BORROWING_CHART_LAYOUT.monthlyHeightMm
          })}
        </div>
        <div class="monthly-table">${monthlyTableHtml(months)}</div>
      </div>
    </section>`
}

function topBooksCardHtml(data: BorrowingChartData): string {
  const items = Array.isArray(data.topBooks)
    ? data.topBooks.map((book) => ({ label: safeText(book?.title), count: toCount(book?.count) }))
    : []
  return `
    <section class="chart-card chart-card--books">
      <div class="chart-caption">10 Buku Terpopuler</div>
      <div class="chart-canvas">
        ${buildHorizontalBarChartSvg({
          items,
          widthMm: BORROWING_CHART_LAYOUT.topBooksWidthMm,
          heightMm: BORROWING_CHART_LAYOUT.topBooksHeightMm,
          maxLabelChars: BORROWING_CHART_LAYOUT.topBookLabelChars
        })}
      </div>
    </section>`
}

function byClassCardHtml(data: BorrowingChartData): string {
  const items = Array.isArray(data.byClass)
    ? data.byClass.map((row) => ({ label: safeText(row?.className), count: toCount(row?.count) }))
    : []
  return `
    <section class="chart-card chart-card--class">
      <div class="chart-caption">Peminjaman per Kelas</div>
      <div class="chart-canvas">
        ${buildHorizontalBarChartSvg({
          items,
          widthMm: BORROWING_CHART_LAYOUT.byClassWidthMm,
          heightMm: BORROWING_CHART_LAYOUT.byClassHeightMm,
          maxLabelChars: BORROWING_CHART_LAYOUT.classLabelChars
        })}
      </div>
      ${items.length > 12 ? '<div class="chart-note">Baris di luar 12 teratas digabung menjadi "Lainnya".</div>' : ''}
    </section>`
}

// Kartu kanan bawah: tabel KATEGORI (bukan judul buku — judul tetap hanya di
// grafik "10 Buku Terpopuler"). Maks 10 baris; label panjang dipotong "…"
// dengan nama lengkap di atribut title; seluruh teks di-escape.
function categoriesTableHtml(data: BorrowingChartData): string {
  const categories = Array.isArray(data.topCategories) ? data.topCategories.slice(0, 10) : []
  if (categories.length === 0) {
    return `
    <section class="chart-card chart-card--table">
      <div class="chart-caption">Kategori Buku Paling Diminati</div>
      <div class="chart-note">Tidak ada data.</div>
    </section>`
  }
  const rows = categories
    .map((row, index) => {
      const name = safeText(row?.category) || '-'
      const short = truncateChartLabel(name, 40)
      return `<tr><td class="cell-index">${index + 1}</td><td title="${escapeHtml(name)}">${escapeHtml(short)}</td><td class="cell-number">${escapeHtml(String(toCount(row?.count)))}</td></tr>`
    })
    .join('')
  return `
    <section class="chart-card chart-card--table">
      <div class="chart-caption">Kategori Buku Paling Diminati</div>
      <table class="numeric-table">
        <thead><tr><th class="cell-index">No</th><th>Kategori</th><th class="cell-number">Jml</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
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

function signaturesHtml(data: BorrowingChartData): string {
  return `
    <section class="signatures-block">
      ${signatureBoxHtml('Pustakawan', data.institution.librarianName, data.institution.librarianNip)}
      ${signatureBoxHtml('Kepala Sekolah', data.institution.principalName, data.institution.principalNip)}
    </section>`
}

const STYLES = `
  @page {
    size: A4 landscape;
    margin: 0;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 8.5pt;
    color: #111827;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .a4-sheet {
    position: relative;
    width: ${BORROWING_CHART_SHEET.widthMm}mm;
    height: ${BORROWING_CHART_SHEET.heightMm}mm;
    padding: ${BORROWING_CHART_SHEET.marginMm}mm;
    overflow: hidden;
    page-break-after: auto;
    break-after: auto;
    display: flex;
    flex-direction: column;
  }
  .doc-header { display: flex; align-items: center; gap: 4mm; }
  .doc-logo { flex: 0 0 auto; width: 12mm; height: 12mm; }
  .doc-logo svg { width: 100%; height: 100%; }
  .doc-identity { flex: 1 1 auto; min-width: 0; }
  .doc-library { font-size: 13pt; font-weight: 700; line-height: 1.2; }
  .doc-school { font-size: 10pt; font-weight: 700; line-height: 1.25; }
  .doc-address, .doc-contact { font-size: 8pt; line-height: 1.3; }
  .doc-title { font-size: 14pt; font-weight: 700; margin: 2mm 0 1mm; text-align: center; }
  .doc-meta { margin-bottom: 2mm; }
  .meta-line { line-height: 1.35; }
  .meta-label { font-weight: 700; }
  .summary-cards { display: flex; gap: 3mm; }
  .summary-card {
    flex: 1 1 0;
    border: 0.2mm solid #cbd5e1;
    border-radius: 1mm;
    padding: 1.5mm 3mm;
    background: #f8fafc;
  }
  .summary-label { font-size: 8pt; color: #374151; line-height: 1.25; }
  .summary-value { font-size: 13pt; font-weight: 700; line-height: 1.2; }
  .chart-grid {
    display: grid;
    grid-template-columns: 1.65fr 1fr;
    gap: 3mm 4mm;
    margin-top: 3mm;
  }
  .chart-card {
    border: 0.2mm solid #cbd5e1;
    border-radius: 1mm;
    padding: 1.5mm 2mm;
    height: 42mm;
    overflow: hidden;
    break-inside: avoid;
  }
  .chart-caption { font-size: 8pt; font-weight: 700; line-height: 1.3; margin-bottom: 0.6mm; }
  .monthly-row { display: flex; gap: 3mm; align-items: flex-start; }
  .chart-canvas { line-height: 0; }
  .chart-canvas svg { display: block; }
  .monthly-table { flex: 1 1 auto; min-width: 0; }
  .chart-note { font-size: 6.8pt; color: #374151; line-height: 1.3; margin-top: 1mm; }
  .numeric-table { width: 100%; border-collapse: collapse; font-size: 6.8pt; }
  .numeric-table th, .numeric-table td {
    border-bottom: 0.15mm solid #e2e8f0;
    padding: 0.35mm 0.6mm;
    text-align: left;
    line-height: 1.2;
  }
  .numeric-table th { font-weight: 700; border-bottom: 0.2mm solid #94a3b8; }
  .numeric-table td { overflow: hidden; }
  /*
   * Kartu "Kategori Buku Paling Diminati" (kanan bawah) harus memuat 10 baris
   * di dalam kartu 42mm. Dengan 6.8pt/1.2 barisnya ~46mm sehingga terpotong
   * ~8mm; tabel di kartu ini dirapatkan (6.2pt, padding 0.2mm, line-height 1.1)
   * agar seluruh baris masuk tanpa membuang bagian.
   */
  .chart-card--table .numeric-table { font-size: 6.2pt; }
  .chart-card--table .numeric-table th,
  .chart-card--table .numeric-table td {
    padding: 0.2mm 0.6mm;
    line-height: 1.1;
  }
  .chart-card--table .numeric-table th { padding-bottom: 0.3mm; }
  .cell-number { text-align: right; white-space: nowrap; }
  .cell-index { width: 6mm; text-align: right; white-space: nowrap; color: #374151; }
  .signatures-block {
    margin-top: auto;
    display: flex;
    justify-content: space-between;
    gap: 20mm;
    padding-top: 6mm;
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
    margin-top: 2mm;
    border-top: 0.2mm solid #6b7280;
    padding-top: 1.5mm;
    text-align: right;
    font-size: 8pt;
  }
`

/**
 * Bangun HTML cetak laporan grafik peminjaman: SATU lembar A4 landscape.
 * Tidak ada <script>, tidak ada paginasi; footer selalu "Halaman 1 dari 1".
 */
export function generateBorrowingChartHtml(data: BorrowingChartData): string {
  const printedAt = formatPrintedAt(data.generatedAt)
  const months = normalizeMonths(data.monthly)

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(data.title)}</title>
<style>${STYLES}</style>
</head>
<body>
  <section class="a4-sheet">
    ${headerHtml(data, printedAt)}
    ${summaryCardsHtml(data)}
    <div class="chart-grid">
      ${monthlyCardHtml(months)}
      ${topBooksCardHtml(data)}
      ${byClassCardHtml(data)}
      ${categoriesTableHtml(data)}
    </div>
    ${signaturesHtml(data)}
    <footer class="sheet-footer"><span>Halaman 1 dari 1</span></footer>
  </section>
</body>
</html>`
}
