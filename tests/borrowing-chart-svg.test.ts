import { describe, expect, it } from 'vitest'
import {
  buildHorizontalBarChartSvg,
  buildVerticalBarChartSvg,
  CHART_EMPTY_TEXT,
  CHART_OTHER_LABEL,
  MAX_HORIZONTAL_BARS,
  mergeTopChartItems,
  truncateChartLabel
} from '../src/main/services/borrowing-chart-svg'
import type { ChartPoint } from '../src/main/services/borrowing-chart-svg'

const MONTHS: ChartPoint[] = [
  { label: 'Jan 2026', count: 12 },
  { label: 'Feb 2026', count: 0 },
  { label: 'Mar 2026', count: 27 },
  { label: 'Apr 2026', count: 9 },
  { label: 'Mei 2026', count: 31 },
  { label: 'Jun 2026', count: 4 }
]

const BOOKS: ChartPoint[] = Array.from({ length: 10 }, (_, index) => ({
  label: `Buku Populer Nomor ${index + 1}`,
  count: 40 - index * 3
}))

function rectCount(svg: string): number {
  return (svg.match(/<rect\b/g) ?? []).length
}

function expectCleanSvg(svg: string): void {
  expect(svg).not.toMatch(/NaN/)
  expect(svg).not.toMatch(/undefined/)
  expect(svg).not.toMatch(/Infinity/)
}

describe('buildVerticalBarChartSvg', () => {
  it('menggambar satu <rect> per titik data dan label bulan di bawah', () => {
    // Semua count > 0 agar satu titik = satu batang (count 0 tidak menggambar batang).
    const points = MONTHS.map((month, index) => ({ label: month.label, count: index + 3 }))
    const svg = buildVerticalBarChartSvg({ points, widthMm: 120, heightMm: 40 })

    expect(rectCount(svg)).toBe(points.length)
    expect(svg).toContain('Jan 2026')
    expect(svg).toContain('Jun 2026')
    expect(svg).toContain('>5</text>')
    expect(svg).toContain('viewBox="0 0 120 40"')
    expectCleanSvg(svg)
  })

  it('menampilkan "Tidak ada data" untuk titik kosong', () => {
    const svg = buildVerticalBarChartSvg({ points: [], widthMm: 120, heightMm: 40 })

    expect(svg).toContain(CHART_EMPTY_TEXT)
    expect(rectCount(svg)).toBe(0)
    expectCleanSvg(svg)
  })

  it('semua 0: sumbu 0..1 tanpa batang dan tanpa error', () => {
    const zeros: ChartPoint[] = MONTHS.map((month) => ({ label: month.label, count: 0 }))
    const svg = buildVerticalBarChartSvg({ points: zeros, widthMm: 120, heightMm: 40 })

    expect(svg).toContain(CHART_EMPTY_TEXT)
    expect(rectCount(svg)).toBe(0)
    expect(svg).toContain('>0</text>')
    expect(svg).toContain('>1</text>')
    expectCleanSvg(svg)
  })

  it('24 bulan: semua nilai tampil, label di-skip selang-seling, tanpa NaN', () => {
    const months: ChartPoint[] = Array.from({ length: 24 }, (_, index) => ({
      label: `B${index + 1}`,
      count: index % 5 === 0 ? 0 : index + 1
    }))
    const svg = buildVerticalBarChartSvg({ points: months, widthMm: 160, heightMm: 40 })

    // 23 titik bernilai > 0 (indeks 0,5,10,15,20 = 0)
    expect(rectCount(svg)).toBe(19)
    // Label hanya indeks genap -> 12 label bulan.
    const monthLabels = (svg.match(/<text[^>]*>B\d+<\/text>/g) ?? []).length
    expect(monthLabels).toBe(12)
    // Nilai tetap tampil untuk SEMUA titik (24 nilai, beberapa bertabrakan dengan label).
    const valueTexts = svg.match(/font-weight="700"[^>]*>\d+<\/text>/g) ?? []
    expect(valueTexts.length).toBe(24)
    expectCleanSvg(svg)
  })

  it('menolak nilai tidak valid tanpa menghasilkan NaN', () => {
    const svg = buildVerticalBarChartSvg({
      points: [
        { label: 'Rusak', count: Number.NaN },
        { label: 'Tak hingga', count: Number.POSITIVE_INFINITY },
        { label: 'Negatif', count: -5 },
        { label: 'Normal', count: 3 }
      ],
      widthMm: 100,
      heightMm: 30
    })

    expect(rectCount(svg)).toBe(1)
    expect(svg).toContain('>0</text>')
    expectCleanSvg(svg)
  })
})

describe('buildHorizontalBarChartSvg', () => {
  it('menggambar satu <rect> per item dan nilai di ujung batang', () => {
    const svg = buildHorizontalBarChartSvg({
      items: BOOKS,
      widthMm: 100,
      heightMm: 40,
      maxLabelChars: 24
    })

    expect(rectCount(svg)).toBe(BOOKS.length)
    expect(svg).toContain('>40</text>')
    expectCleanSvg(svg)
  })

  it('meng-escape label berisi markup dan menyimpan judul lengkap di <title>', () => {
    const judul = `Buku <script>alert("x")</script> & 'kutip'`
    const svg = buildHorizontalBarChartSvg({
      items: [{ label: judul, count: 7 }],
      widthMm: 100,
      heightMm: 20,
      maxLabelChars: 60
    })

    expect(svg).not.toContain('<script>')
    expect(svg).toContain('&lt;script&gt;')
    expect(svg).toContain('&amp;')
    expect(svg).toContain('&quot;')
    expect(svg).toContain('&#39;')
    expect(svg).toContain('<title>')
    expect(svg).toContain('Buku &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;kutip&#39; (7)')
    expectCleanSvg(svg)
  })

  it('memotong judul panjang dengan "…" dan tetap menyimpan judul lengkap', () => {
    const judul = 'Sejarah Kebudayaan Indonesia Pada Masa Kerajaan Majapahit dan Sriwijaya'
    const svg = buildHorizontalBarChartSvg({
      items: [{ label: judul, count: 5 }],
      widthMm: 100,
      heightMm: 20,
      maxLabelChars: 20
    })

    expect(truncateChartLabel(judul, 20)).toBe('Sejarah Kebudayaan…')
    expect(svg).toContain('Sejarah Kebudayaan…')
    expect(svg).toContain(`<title>${judul} (5)</title>`)
    expect(svg).not.toContain(`>${judul}<`)
    expectCleanSvg(svg)
  })

  it('menggabungkan kelas di luar 12 teratas menjadi "Lainnya" dengan jumlah benar', () => {
    const classes: ChartPoint[] = Array.from({ length: 15 }, (_, index) => ({
      label: `Kelas ${index + 1}`,
      count: 15 - index
    }))
    const merged = mergeTopChartItems(classes)

    expect(merged.merged).toBe(true)
    expect(merged.mergedCount).toBe(3)
    expect(merged.mergedTotal).toBe(6) // 3 + 2 + 1
    expect(merged.items).toHaveLength(MAX_HORIZONTAL_BARS + 1)
    expect(merged.items[MAX_HORIZONTAL_BARS].label).toBe(CHART_OTHER_LABEL)
    expect(merged.items[MAX_HORIZONTAL_BARS].count).toBe(6)

    const svg = buildHorizontalBarChartSvg({
      items: classes,
      widthMm: 140,
      heightMm: 40,
      maxLabelChars: 20
    })

    expect(rectCount(svg)).toBe(13)
    expect(svg).toContain(CHART_OTHER_LABEL)
    expect(svg).toContain('<title>Lainnya (6)</title>')
    const totalInSvg = merged.items.reduce((sum, item) => sum + item.count, 0)
    expect(totalInSvg).toBe(classes.reduce((sum, item) => sum + item.count, 0))
    expectCleanSvg(svg)
  })

  it('tidak menggabungkan bila jumlah item <= 12', () => {
    const merged = mergeTopChartItems(BOOKS)

    expect(merged.merged).toBe(false)
    expect(merged.mergedCount).toBe(0)
    expect(merged.items).toHaveLength(BOOKS.length)
    expect(merged.items.some((item) => item.label === CHART_OTHER_LABEL)).toBe(false)
  })

  it('kondisi kosong dan semua nol menampilkan "Tidak ada data"', () => {
    const empty = buildHorizontalBarChartSvg({ items: [], widthMm: 100, heightMm: 40, maxLabelChars: 20 })
    const zeros = buildHorizontalBarChartSvg({
      items: [
        { label: 'Kelas A', count: 0 },
        { label: 'Kelas B', count: 0 }
      ],
      widthMm: 100,
      heightMm: 40,
      maxLabelChars: 20
    })

    for (const svg of [empty, zeros]) {
      expect(svg).toContain(CHART_EMPTY_TEXT)
      expect(rectCount(svg)).toBe(0)
      expectCleanSvg(svg)
    }
  })

  it('24 bulan dan data campuran tetap bersih dari NaN', () => {
    const months: ChartPoint[] = Array.from({ length: 24 }, (_, index) => ({
      label: `Bulan Peminjaman ${index + 1}`,
      count: index % 3
    }))
    const svg = buildHorizontalBarChartSvg({
      items: months,
      widthMm: 160,
      heightMm: 45,
      maxLabelChars: 12
    })

    expect(rectCount(svg)).toBe(13)
    expect(svg).toContain('…')
    expectCleanSvg(svg)
  })
})
