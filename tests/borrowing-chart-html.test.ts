import { describe, expect, it } from 'vitest'
import type { BorrowingChartData } from '../src/shared/dto/borrowing-chart'
import { generateBorrowingChartHtml } from '../src/main/services/borrowing-chart-html.service'

const LONG_TITLE =
  'Sejarah Kebudayaan Indonesia Pada Masa Kerajaan Majapahit dan Sriwijaya Serta Warisannya'

function baseData(overrides: Partial<BorrowingChartData> = {}): BorrowingChartData {
  return {
    title: 'Grafik Peminjaman',
    orientation: 'landscape',
    institution: {
      libraryName: 'Perpustakaan Sekolah',
      schoolName: 'SMA Negeri 1 Contoh',
      address: 'Jl. Pendidikan No. 1, Bandung',
      phone: '022-1234567',
      email: 'perpus@sman1.example',
      librarianName: 'Siti Rahayu',
      principalName: 'Budi Santoso',
      librarianNip: '198701232010012001',
      principalNip: ''
    },
    periodLabel: 'Jan 2026 - Jun 2026',
    generatedAt: new Date(2026, 10, 15, 9, 30).toISOString(),
    summary: {
      totalBorrowings: 1234,
      totalBooks: 2500,
      activeBorrowers: 87
    },
    monthly: [
      { label: 'Jan 2026', count: 12 },
      { label: 'Feb 2026', count: 0 },
      { label: 'Mar 2026', count: 27 },
      { label: 'Apr 2026', count: 9 },
      { label: 'Mei 2026', count: 31 },
      { label: 'Jun 2026', count: 4 }
    ],
    topBooks: [
      { title: 'Laskar Pelangi', count: 40 },
      { title: 'Bumi Manusia', count: 33 },
      { title: LONG_TITLE, count: 21 },
      { title: 'Negeri 5 Menara', count: 18 },
      { title: 'Buku <script>alert("x")</script> & "kutip"', count: 11 }
    ],
    byClass: [
      { className: 'X Merdeka 1', count: 15 },
      { className: 'X Merdeka 2', count: 14 },
      { className: 'X Merdeka 3', count: 13 },
      { className: 'XI Merdeka 1', count: 12 },
      { className: 'XI Merdeka 2', count: 11 },
      { className: 'XI Merdeka 3', count: 10 },
      { className: 'XII Merdeka 1', count: 9 },
      { className: 'XII Merdeka 2', count: 8 }
    ],
    ...overrides
  }
}

function countOccurrences(haystack: string, needle: RegExp): number {
  return (haystack.match(needle) ?? []).length
}

function expectCleanHtml(html: string): void {
  expect(html).not.toMatch(/NaN/)
  expect(html).not.toMatch(/undefined/)
  expect(html).not.toMatch(/Infinity/)
}

describe('generateBorrowingChartHtml', () => {
  it('menghasilkan TEPAT satu lembar A4 landscape tanpa <script> dan footer 1 dari 1', () => {
    const html = generateBorrowingChartHtml(baseData())

    expect(countOccurrences(html, /class="a4-sheet"/g)).toBe(1)
    expect(html).toMatch(/@page\s*\{[^}]*size:\s*A4 landscape/)
    expect(html).toMatch(/@page\s*\{[^}]*margin:\s*0/)
    expect(html).not.toMatch(/<script/i)
    expect(html).toContain('Halaman 1 dari 1')
    expect(html).toContain('<!DOCTYPE html>')
    expectCleanHtml(html)
  })

  it('menulis kop institusi, judul, periode, dan waktu cetak', () => {
    const html = generateBorrowingChartHtml(baseData())

    expect(html).toContain('Perpustakaan Sekolah')
    expect(html).toContain('SMA Negeri 1 Contoh')
    expect(html).toContain('Jl. Pendidikan No. 1, Bandung')
    expect(html).toContain('022-1234567')
    expect(html).toContain('perpus@sman1.example')
    expect(html).toContain('Grafik Peminjaman')
    expect(html).toContain('Jan 2026 - Jun 2026')
    expect(html).toContain('15/11/2026 09:30')
  })

  it('menampilkan tiga kartu ringkasan dengan pemisah ribuan', () => {
    const html = generateBorrowingChartHtml(baseData())

    expect(html).toContain('Total Peminjaman')
    expect(html).toContain('Total Buku Dipinjam')
    expect(html).toContain('Anggota Aktif')
    expect(html).toContain('>1.234<')
    expect(html).toContain('>2.500<')
    expect(html).toContain('>87<')
  })

  it('memakai blok tanda tangan yang sama dengan laporan tabel', () => {
    const html = generateBorrowingChartHtml(baseData())

    expect(html).toContain('Pustakawan')
    expect(html).toContain('Kepala Sekolah')
    expect(html).toContain('Siti Rahayu')
    expect(html).toContain('Budi Santoso')
    expect(html).toContain('NIP. 198701232010012001')
    expect(html).toContain('NIP. -')
    expect(html).toContain('class="signature-space"')
    expect(html).toContain('class="signature-name"')
    expect(countOccurrences(html, /class="signature-box"/g)).toBe(2)
  })

  it('meng-escape seluruh teks data dan tidak pernah menulis markup mentah', () => {
    const html = generateBorrowingChartHtml(
      baseData({
        title: 'Grafik <script>alert("x")</script> & "laporan"',
        periodLabel: "Jan 2026 & 'Feb 2026'"
      })
    )

    expect(html).not.toMatch(/<script/i)
    expect(html).toContain('Grafik &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &quot;laporan&quot;')
    expect(html).toContain('Jan 2026 &amp; &#39;Feb 2026&#39;')
    // Judul buku jahat dari fixture juga harus ter-escape, termasuk di <title> SVG.
    expect(html).toContain('Buku &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &quot;kutip&quot;')
    expect(html).toContain('&amp;')
  })

  it('memotong judul buku panjang dengan "…" dan menyimpan judul lengkap', () => {
    const html = generateBorrowingChartHtml(baseData())

    expect(html).toContain('…')
    expect(html).toContain(`title="${LONG_TITLE}"`)
    expect(html).toContain(`<title>${LONG_TITLE} (21)</title>`)
    expect(html).not.toContain(`>${LONG_TITLE}<`)
  })

  it('menggabungkan kelas di luar 12 teratas menjadi "Lainnya" dengan jumlah benar', () => {
    const classes = Array.from({ length: 15 }, (_, index) => ({
      className: `Kelas ${index + 1}`,
      count: 15 - index
    }))
    const html = generateBorrowingChartHtml(baseData({ byClass: classes }))

    // 15 kelas (15..1) -> 12 teratas + Lainnya 3+2+1 = 6.
    expect(html).toContain('<title>Lainnya (6)</title>')
    expect(html).toContain('digabung menjadi "Lainnya"')
    expect(html).toContain('Peminjaman per Kelas')
    expectCleanHtml(html)
  })

  it('24 bulan: tabel angka bulanan disembunyikan, grafik tetap lengkap', () => {
    const months = Array.from({ length: 24 }, (_, index) => ({
      label: `B${index + 1} 2026`,
      count: index % 5 === 0 ? 0 : index + 1
    }))
    const html = generateBorrowingChartHtml(baseData({ monthly: months }))

    expect(html).toContain('Tabel angka bulanan disembunyikan (24 bulan)')
    expect(countOccurrences(html, /<table class="numeric-table">/g)).toBe(1) // hanya tabel buku
    expect(html).toContain('Peminjaman per Bulan')
    expectCleanHtml(html)
  })

  it('data kosong tetap menghasilkan dokumen lengkap dengan "Tidak ada data"', () => {
    const html = generateBorrowingChartHtml(
      baseData({
        summary: { totalBorrowings: 0, totalBooks: 0, activeBorrowers: 0 },
        monthly: [],
        topBooks: [],
        byClass: []
      })
    )

    expect(countOccurrences(html, /class="a4-sheet"/g)).toBe(1)
    expect(html).toContain('Tidak ada data')
    expect(html).toContain('Halaman 1 dari 1')
    expect(html).toContain('NIP. -')
    expect(html).not.toMatch(/<script/i)
    expect(html).not.toMatch(/NaN|undefined|Infinity/)
  })
})
