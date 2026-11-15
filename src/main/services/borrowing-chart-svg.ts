// Report Module — Generator grafik SVG MURNI untuk laporan "Grafik Peminjaman"
// (SESSION 2). Data masuk, string SVG keluar: tanpa Electron, tanpa DB, tanpa
// library grafik. Semua teks dari data dilewati escapeHtml.
//
// Satuan: 1 unit viewBox = 1 mm (width/height mm + viewBox 0 0 w h), sehingga
// ukuran font memakai mm (1pt = 0.3528mm): 2.4 ≈ 6.8pt, 2.0 ≈ 5.7pt.
// Warna dikunci ke abu gelap / biru tua agar tetap terbaca saat cetak hitam-putih.
import { escapeHtml } from '../../shared/utils/escape-html'

/** Satu titik data grafik (label siap tampil + jumlah). */
export interface ChartPoint {
  label: string
  count: number
}

export interface VerticalBarChartOptions {
  points: ChartPoint[]
  widthMm: number
  heightMm: number
}

export interface HorizontalBarChartOptions {
  items: ChartPoint[]
  widthMm: number
  heightMm: number
  /** Maksimum karakter label sebelum dipotong dengan "…". */
  maxLabelChars: number
  /** Maksimum batang; sisanya digabung menjadi "Lainnya" (default 12). */
  maxBars?: number
}

export interface MergedChartItems {
  items: ChartPoint[]
  /** true bila ada item yang digabung ke "Lainnya". */
  merged: boolean
  /** Jumlah item asli yang digabung (0 bila tidak ada). */
  mergedCount: number
  /** Total count item yang digabung. */
  mergedTotal: number
}

export const CHART_FONT_FAMILY = 'Arial, Helvetica, sans-serif'
export const CHART_EMPTY_TEXT = 'Tidak ada data'
export const CHART_OTHER_LABEL = 'Lainnya'
export const MAX_HORIZONTAL_BARS = 12

const COLOR_BAR_VERTICAL = '#334155' // slate-700
const COLOR_BAR_HORIZONTAL = '#1e3a8a' // blue-900
const COLOR_AXIS = '#111827'
const COLOR_GRID = '#cbd5e1'
const COLOR_TEXT = '#111827'
const COLOR_MUTED = '#374151'
const COLOR_VALUE_ON_BAR = '#ffffff'

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function safeCount(value: unknown): number {
  const n = finiteNumber(value, 0)
  return n > 0 ? Math.round(n) : 0
}

/** Format angka untuk atribut SVG — tidak pernah menghasilkan NaN/Infinity. */
function num(value: number): string {
  const n = finiteNumber(value, 0)
  const rounded = Math.round(n * 100) / 100
  return Object.is(rounded, -0) ? '0' : String(rounded)
}

function safeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function safeSize(value: unknown): number {
  const n = finiteNumber(value, 0)
  return n > 0 ? n : 10
}

/** Normalisasi input agar sisa pipeline hanya menerima angka bulat >= 0. */
function normalizePoints(points: ChartPoint[] | undefined | null): ChartPoint[] {
  if (!Array.isArray(points)) return []
  return points
    .map((point) => ({
      label: safeText(point?.label),
      count: safeCount(point?.count)
    }))
    .filter((point) => point.label.length > 0 || point.count > 0)
}

/** Potong label panjang dengan "…" (label lengkap tetap dipakai di <title>). */
export function truncateChartLabel(label: string, maxLabelChars: number): string {
  const text = safeText(label)
  const limit = Math.max(1, Math.floor(finiteNumber(maxLabelChars, 1)))
  if (text.length <= limit) return text
  if (limit === 1) return '…'
  return `${text.slice(0, limit - 1).trimEnd()}…`
}

/**
 * Ambil `maxBars` item teratas sesuai urutan masuk (data sudah terurut dari
 * Service) dan gabungkan sisanya menjadi satu baris "Lainnya".
 */
export function mergeTopChartItems(
  items: ChartPoint[] | undefined | null,
  maxBars: number = MAX_HORIZONTAL_BARS
): MergedChartItems {
  const normalized = normalizePoints(items)
  const limit = Math.max(1, Math.floor(finiteNumber(maxBars, MAX_HORIZONTAL_BARS)))
  if (normalized.length <= limit) {
    return { items: normalized, merged: false, mergedCount: 0, mergedTotal: 0 }
  }
  const kept = normalized.slice(0, limit)
  const rest = normalized.slice(limit)
  const mergedTotal = rest.reduce((total, item) => total + item.count, 0)
  return {
    items: [...kept, { label: CHART_OTHER_LABEL, count: mergedTotal }],
    merged: true,
    mergedCount: rest.length,
    mergedTotal
  }
}

function svgOpenTag(widthMm: number, heightMm: number, ariaLabel: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${num(widthMm)}mm" height="${num(heightMm)}mm" viewBox="0 0 ${num(widthMm)} ${num(heightMm)}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escapeHtml(ariaLabel)}" font-family="${CHART_FONT_FAMILY}">`
}

function emptyStateSvg(widthMm: number, heightMm: number): string {
  const width = safeSize(widthMm)
  const height = safeSize(heightMm)
  return [
    svgOpenTag(width, height, CHART_EMPTY_TEXT),
    `<text x="${num(width / 2)}" y="${num(height / 2 + 0.8)}" text-anchor="middle" font-size="2.4" fill="${COLOR_MUTED}">${escapeHtml(CHART_EMPTY_TEXT)}</text>`,
    '</svg>'
  ].join('\n')
}

interface NiceScale {
  max: number
  ticks: number[]
}

/** Skala sumbu Y "bulat" 0..max dengan langkah 1/2/5/10 × 10^n. */
function niceScale(maxValue: number, tickCount = 5): NiceScale {
  const value = finiteNumber(maxValue, 0)
  if (value <= 0) return { max: 1, ticks: [0, 1] }
  const rawStep = value / Math.max(1, Math.floor(tickCount))
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)))
  const normalized = rawStep / magnitude
  const niceNormalized = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  const step = Math.max(1, niceNormalized * magnitude)
  const max = Math.max(step, Math.ceil(value / step) * step)
  const ticks: number[] = []
  for (let tick = 0; tick <= max + 1e-9; tick += step) {
    ticks.push(Math.round(tick))
  }
  return { max, ticks }
}

/**
 * Grafik batang VERTIKAL (peminjaman per bulan).
 * - Nilai di atas batang, label bulan di bawah.
 * - Titik > 12: label bulan di-skip selang-seling agar tidak bertabrakan
 *   (nilai di atas batang tetap tampil semua).
 * - Semua 0: sumbu 0..1 + teks "Tidak ada data" (tanpa batang).
 * - Tanpa titik: SVG teks "Tidak ada data" (bukan SVG kosong).
 */
export function buildVerticalBarChartSvg(options: VerticalBarChartOptions): string {
  const width = safeSize(options?.widthMm)
  const height = safeSize(options?.heightMm)
  const points = normalizePoints(options?.points)
  if (points.length === 0) return emptyStateSvg(width, height)

  const total = points.reduce((sum, point) => sum + point.count, 0)
  const padLeft = Math.min(12, width * 0.18)
  const padRight = Math.min(3, width * 0.05)
  const padTop = Math.min(6.5, height * 0.22)
  const padBottom = Math.min(6.5, height * 0.22)
  const plotWidth = Math.max(1, width - padLeft - padRight)
  const plotHeight = Math.max(1, height - padTop - padBottom)
  const baselineY = padTop + plotHeight
  const scale = niceScale(total > 0 ? Math.max(...points.map((point) => point.count)) : 0)
  const manyPoints = points.length > 12
  const valueFont = manyPoints ? 1.85 : 2.1
  const labelFont = manyPoints ? 1.8 : 2.15

  const parts: string[] = [svgOpenTag(width, height, 'Grafik peminjaman per bulan')]

  // Grid + label sumbu Y
  for (const tick of scale.ticks) {
    const y = baselineY - (tick / scale.max) * plotHeight
    parts.push(
      `<line x1="${num(padLeft)}" y1="${num(y)}" x2="${num(padLeft + plotWidth)}" y2="${num(y)}" stroke="${COLOR_GRID}" stroke-width="0.15" />`
    )
    parts.push(
      `<text x="${num(padLeft - 1.2)}" y="${num(y + 0.65)}" text-anchor="end" font-size="1.95" fill="${COLOR_MUTED}">${escapeHtml(String(tick))}</text>`
    )
  }

  // Sumbu X + Y
  parts.push(
    `<line x1="${num(padLeft)}" y1="${num(padTop)}" x2="${num(padLeft)}" y2="${num(baselineY)}" stroke="${COLOR_AXIS}" stroke-width="0.25" />`,
    `<line x1="${num(padLeft)}" y1="${num(baselineY)}" x2="${num(padLeft + plotWidth)}" y2="${num(baselineY)}" stroke="${COLOR_AXIS}" stroke-width="0.25" />`
  )

  const slot = plotWidth / points.length
  const barWidth = Math.max(1, Math.min(slot * 0.62, 16))

  points.forEach((point, index) => {
    const centerX = padLeft + slot * (index + 0.5)
    const barHeight = (point.count / scale.max) * plotHeight
    const barY = baselineY - barHeight
    if (point.count > 0) {
      parts.push(
        `<rect x="${num(centerX - barWidth / 2)}" y="${num(barY)}" width="${num(barWidth)}" height="${num(barHeight)}" fill="${COLOR_BAR_VERTICAL}" />`
      )
    }
    parts.push(
      `<text x="${num(centerX)}" y="${num(Math.max(barY - 1, 2.4))}" text-anchor="middle" font-size="${num(valueFont)}" font-weight="700" fill="${COLOR_TEXT}">${escapeHtml(String(point.count))}</text>`
    )
    // >12 titik: hanya label indeks genap yang ditulis agar tidak bertabrakan.
    if (!manyPoints || index % 2 === 0) {
      parts.push(
        `<text x="${num(centerX)}" y="${num(baselineY + 3.1)}" text-anchor="middle" font-size="${num(labelFont)}" fill="${COLOR_MUTED}">${escapeHtml(point.label)}</text>`
      )
    }
  })

  if (total === 0) {
    parts.push(
      `<text x="${num(padLeft + plotWidth / 2)}" y="${num(padTop + plotHeight / 2 + 0.8)}" text-anchor="middle" font-size="2.4" fill="${COLOR_MUTED}">${escapeHtml(CHART_EMPTY_TEXT)}</text>`
    )
  }

  parts.push('</svg>')
  return parts.join('\n')
}

/**
 * Grafik batang HORIZONTAL (buku terpopuler / per kelas).
 * - Label di kiri dipotong "…" bila > maxLabelChars; label lengkap ada di
 *   <title> tiap batang (aksesibilitas + tooltip).
 * - Nilai di ujung batang; bila batang hampir penuh, nilai ditaruh di dalam
 *   batang dengan warna terang agar tidak terpotong.
 * - > maxBars item: sisanya digabung menjadi "Lainnya".
 */
export function buildHorizontalBarChartSvg(options: HorizontalBarChartOptions): string {
  const width = safeSize(options?.widthMm)
  const height = safeSize(options?.heightMm)
  const maxChars = Math.max(3, Math.floor(finiteNumber(options?.maxLabelChars, 24)))
  const merged = mergeTopChartItems(options?.items, options?.maxBars ?? MAX_HORIZONTAL_BARS)
  const items = merged.items
  if (items.length === 0) return emptyStateSvg(width, height)

  const total = items.reduce((sum, item) => sum + item.count, 0)
  if (total === 0) return emptyStateSvg(width, height)

  const maxCount = Math.max(1, ...items.map((item) => item.count))
  const labelFont = items.length > 9 ? 1.85 : 2.15
  const labelColumn = Math.min(width * 0.56, maxChars * (labelFont * 0.58) + 2.5)
  const valueGutter = 7.5
  const padTop = Math.min(2.5, height * 0.1)
  const padBottom = Math.min(2.5, height * 0.1)
  const plotWidth = Math.max(1, width - labelColumn - valueGutter)
  const plotHeight = Math.max(1, height - padTop - padBottom)
  const rowHeight = plotHeight / items.length
  const barHeight = Math.max(0.9, Math.min(rowHeight * 0.62, 4.2))

  const parts: string[] = [svgOpenTag(width, height, 'Grafik peminjaman per kategori')]
  parts.push(
    `<line x1="${num(labelColumn)}" y1="${num(padTop)}" x2="${num(labelColumn)}" y2="${num(padTop + plotHeight)}" stroke="${COLOR_AXIS}" stroke-width="0.2" />`
  )

  items.forEach((item, index) => {
    const centerY = padTop + rowHeight * (index + 0.5)
    const barWidth = (item.count / maxCount) * plotWidth
    const shortLabel = truncateChartLabel(item.label, maxChars)
    const fullTitle = `${item.label || CHART_OTHER_LABEL} (${item.count})`
    const barFitsValue = barWidth + valueGutter > plotWidth + 3
    parts.push('<g>')
    parts.push(`<title>${escapeHtml(fullTitle)}</title>`)
    parts.push(
      `<text x="${num(labelColumn - 1.5)}" y="${num(centerY + labelFont * 0.35)}" text-anchor="end" font-size="${num(labelFont)}" fill="${COLOR_MUTED}">${escapeHtml(shortLabel)}</text>`
    )
    parts.push(
      `<rect x="${num(labelColumn)}" y="${num(centerY - barHeight / 2)}" width="${num(Math.max(barWidth, 0.2))}" height="${num(barHeight)}" fill="${COLOR_BAR_HORIZONTAL}" />`
    )
    const valueX = barFitsValue ? labelColumn + barWidth - 1.1 : labelColumn + barWidth + 1.1
    const valueAnchor = barFitsValue ? 'end' : 'start'
    const valueFill = barFitsValue ? COLOR_VALUE_ON_BAR : COLOR_TEXT
    parts.push(
      `<text x="${num(valueX)}" y="${num(centerY + 0.75)}" text-anchor="${valueAnchor}" font-size="1.95" font-weight="700" fill="${valueFill}">${escapeHtml(String(item.count))}</text>`
    )
    parts.push('</g>')
  })

  parts.push('</svg>')
  return parts.join('\n')
}
