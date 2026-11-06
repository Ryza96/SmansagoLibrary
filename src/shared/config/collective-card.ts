// Kartu Peminjaman Kolektif A4 — kapasitas baris per halaman.
// Leaf node (nol import) — pola config F1.
//
// Cara menghitung (lihat template di collective-borrow-card.service.ts;
// angka dibuktikan via render headless Chromium, 96dpi → 1mm = 3.7795px):
//   Halaman A4 portrait 210×297mm, @page margin 0, padding konten 13mm
//   → area konten 184×271mm (1024px).
//   Tinggi baris tabel tetap 8mm (30.2px; CSS `td { height: 8mm }`, judul
//   clamp 2 baris di <div> dalam <td> agar sel tetap table-cell).
//   Halaman 1: doc-head+judul+page-line ±49mm + blok info ±30mm + thead 8mm
//     + footer ±6mm + margin antar-blok ±14mm = ±107mm → sisa ±164mm → 19.8
//     baris @8.26mm; dipakai 19 (20 baris terukur 1125.3px > 1122.5px,
//     meluap 1 halaman PDF). Jeda ±7mm.
//   Halaman lanjutan: doc-head penuh + page-line ±37.7mm + thead 8mm + footer
//     ±5.9mm + margin 3mm = ±54.6mm → sisa ±216.4mm → 26.2 baris @8.26mm;
//     dipakai 25 (26 baris hanya sisa ±1.6mm, di bawah margin aman 5mm).
//   Blok ringkasan + ketentuan + tanda tangan ±58.5mm ≈ 7.1 baris: bila sisa
//   baris halaman terakhir > kapasitas - SIGNATURE_RESERVE_ROWS, tanda tangan
//   pindah halaman baru.

export const COLLECTIVE_CARD_PAGE = {
  widthMm: 210,
  heightMm: 297,
  paddingMm: 13,
  rowHeightMm: 8,
  firstPageRows: 19,
  nextPageRows: 25,
  signatureReserveRows: 8
} as const

// Kartu Kolektif A4 — teks ketentuan tercetak (canonical; salinan yang sama
// ada di LABELS.COLLECTIVE.TERMS untuk renderer karena main tidak bisa
// mengimpor src/utils/labels.ts).
export const COLLECTIVE_CARD_TERMS =
  'Penanggung jawab wajib mengembalikan seluruh buku sebelum jatuh tempo. Buku hilang atau rusak menjadi tanggung jawab peminjam.'

// Fungsi MURNI pembagian baris → jumlah baris per halaman konten.
// Aturan tanda tangan: bila baris sisa di halaman terakhir melebihi
// (kapasitas - signatureReserveRows), blok tanda tangan pindah ke halaman baru
// agar tidak terpotong / berdesakan.
export interface CollectiveCardPagination {
  /** Jumlah baris per halaman konten (halaman terakhir = sisa). */
  pages: number[]
  /** 'last' = tanda tangan di halaman konten terakhir; 'new' = halaman baru. */
  signaturePage: 'last' | 'new'
}

export function paginateCollectiveCardRows(totalRows: number): CollectiveCardPagination {
  if (!Number.isInteger(totalRows) || totalRows < 1) {
    return { pages: [], signaturePage: 'last' }
  }
  const { firstPageRows, nextPageRows, signatureReserveRows } = COLLECTIVE_CARD_PAGE
  const pages: number[] = []
  let remaining = totalRows
  let capacity: number = firstPageRows
  while (remaining > 0) {
    const take = Math.min(capacity, remaining)
    pages.push(take)
    remaining -= take
    capacity = nextPageRows
  }
  const lastCapacity = pages.length === 1 ? firstPageRows : nextPageRows
  const lastRows = pages[pages.length - 1]
  const signaturePage = lastRows > lastCapacity - signatureReserveRows ? 'new' : 'last'
  return { pages, signaturePage }
}
