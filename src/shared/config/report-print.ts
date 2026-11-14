// Laporan A4 (cetak/Simpan PDF, TAHAP 1 = fondasi data + pagination).
// Leaf node (nol import) — pola config F1 / collective-card.ts.
// Config ini HANYA berisi geometri + aturan pagination murni; TIDAK ada
// template HTML, IPC, atau wiring di tahap ini.
//
// Cara menghitung kapasitas (pola collective-card.ts; angka diusulkan
// untuk dibuktikan lewat render headless pada TAHAP 2):
//   Kertas A4 portrait 210x297mm, landscape 297x210mm, margin cetak 12mm
//   di semua sisi (@page + padding konten) → area konten:
//     portrait   : (210-24) x (297-24) = 186 x 273mm
//     landscape  : (297-24) x (210-24) = 273 x 186mm
//   Tinggi baris tabel tetap 7.5mm (font isi 8.5pt + padding sel ±2mm;
//   judul panjang di-wrap 2 baris tanpa menambah tinggi baris).
//   Blok atas halaman pertama (kop sekolah + judul laporan + baris meta
//   filter + thead + footer nomor halaman) diperkirakan 38mm + 7.5mm
//   (thead) + 6mm (footer) = 51.5mm → portrait sisa 221.5mm → 29.5 baris
//   → dipakai 29; landscape sisa 134.5mm → 17.9 → dipakai 17.
//   Halaman lanjutan HANYA memuat judul ringkas (tanpa kop + meta filter)
//   ±14mm + thead 7.5mm + footer 6mm = 27.5mm → portrait sisa 245.5mm
//   → 32.7 → dipakai 32; landscape sisa 158.5mm → 21.1 → dipakai 21.
//   (Angka 29/32/17/21 HARUS dibuktikan ulang dengan render nyata di
//   TAHAP 2; bila template final lebih tinggi, turunkan konstanta ini —
//   pagination ikut menyesuaikan tanpa mengubah kode lain.)
//
// Reserve halaman terakhir: blok total (totalsReserveRows=4 baris ≈ 30mm
// untuk label+angka ringkasan) + blok tanda tangan pejabat
// (signatureReserveRows=6 baris ≈ 45mm untuk kota/tanggal + nama +
// tanda tangan + NIP). Lihat aturan redistribusi di paginateReportRows.

export type ReportPrintOrientation = 'portrait' | 'landscape'

export type ReportPrintType = 'borrowings' | 'returns' | 'overdues' | 'members' | 'collections'

export const REPORT_PRINT_MAX_ROWS = 5000

// Orientasi per laporan (keputusan pemilik, final).
export const REPORT_PRINT_ORIENTATION: Record<ReportPrintType, ReportPrintOrientation> = {
  borrowings: 'landscape',
  returns: 'portrait',
  overdues: 'landscape',
  members: 'portrait',
  collections: 'landscape'
} as const

export interface ReportPrintPageGeometry {
  /** Dimensi kertas (mm). */
  widthMm: number
  heightMm: number
  /** Margin cetak di semua sisi (mm). */
  marginMm: number
  /** Tinggi satu baris tabel (mm). */
  rowHeightMm: number
  /** Kapasitas baris tabel halaman pertama (termasuk kop+meta+judul). */
  firstPageRows: number
  /** Kapasitas baris tabel halaman lanjutan (judul ringkas saja). */
  nextPageRows: number
  /** Reserve baris di halaman terakhir untuk blok total/ringkasan. */
  totalsReserveRows: number
  /** Reserve baris di halaman terakhir untuk blok tanda tangan. */
  signatureReserveRows: number
}

export const REPORT_PRINT_PAGE: Record<ReportPrintOrientation, ReportPrintPageGeometry> = {
  portrait: {
    widthMm: 210,
    heightMm: 297,
    marginMm: 12,
    rowHeightMm: 7.5,
    firstPageRows: 29,
    nextPageRows: 32,
    totalsReserveRows: 4,
    signatureReserveRows: 6
  },
  landscape: {
    widthMm: 297,
    heightMm: 210,
    marginMm: 12,
    rowHeightMm: 7.5,
    firstPageRows: 17,
    nextPageRows: 21,
    totalsReserveRows: 4,
    signatureReserveRows: 6
  }
} as const

/**
 * Geometri khusus Laporan Peminjaman (landscape).
 * Sel laporan ini TIDAK dipotong (tanpa clamp/ellipsis), sehingga satu baris
 * bisa setinggi 2 baris teks; kapasitas baris karena itu lebih kecil daripada
 * landscape biasa (17/21). Angka di bawah adalah perkiraan konservatif untuk
 * baris rata-rata 2 baris teks (kasus 3 baris tetap muat karena baris memakai
 * min-height, bukan tinggi tetap). Reserve total + tanda tangan tidak berubah.
 */
export const REPORT_PRINT_BORROWINGS_PAGE: ReportPrintPageGeometry = {
  widthMm: 297,
  heightMm: 210,
  marginMm: 12,
  rowHeightMm: 7.5,
  firstPageRows: 11,
  nextPageRows: 14,
  totalsReserveRows: 4,
  signatureReserveRows: 6
} as const

/** Geometri halaman efektif sebuah laporan (landscape Peminjaman punya angka sendiri). */
export function reportPrintGeometry(
  type: ReportPrintType,
  orientation: ReportPrintOrientation
): ReportPrintPageGeometry {
  if (type === 'borrowings' && orientation === 'landscape') return REPORT_PRINT_BORROWINGS_PAGE
  return REPORT_PRINT_PAGE[orientation]
}

export interface ReportPrintPage {
  /** Nomor halaman (1-based). */
  page: number
  /** Indeks baris pertama halaman ini (0-based, inklusif). */
  startIndex: number
  /** Indeks baris terakhir halaman ini (0-based, eksklusif). */
  endIndex: number
  /** Jumlah baris di halaman ini (endIndex - startIndex). */
  rowCount: number
  /** Kapasitas halaman ini (firstPageRows halaman 1, nextPageRows sisanya). */
  capacity: number
}

export interface ReportPrintPagination {
  pages: ReportPrintPage[]
  /** Total baris yang dipaginasi (= jumlah baris input). */
  totalRows: number
  /**
   * 'last' = blok total + tanda tangan dicetak di halaman tabel terakhir;
   * 'new' = blok tersebut dicetak di halaman baru TANPA baris tabel.
   * Nilai 'new' TIDAK pernah terjadi pada implementasi saat ini karena
   * paginateReportRows meredistribusikan baris (lihat komentar fungsi);
   * field ini dipertahankan agar Tahap 2 punya kontrak eksplisit.
   */
  signaturePage: 'last' | 'new'
}

// Pembagian baris → halaman (MURNI, tanpa I/O).
//
// Jaminan (diuji di tests/report-print-config.test.ts):
//  1. Tidak ada baris hilang/ganda: gabungan semua halaman =
//     [0, totalRows) persis, urutan terjaga.
//  2. Jumlah halaman minimal 1 meski totalRows = 0 (dokumen kosong tetap
//     punya 1 halaman berisi kop + "tidak ada data" + total + tanda tangan).
//  3. Halaman pertama memakai firstPageRows, halaman lanjutan nextPageRows.
//  4. Blok total + tanda tangan TIDAK pernah terpisah sendirian tanpa baris:
//     bila baris di halaman terakhir menyisakan ruang <
//     totalsReserveRows + signatureReserveRows, sebanyak reserve baris
//     dipindahkan dari halaman terakhir ke halaman baru hingga halaman
//     terakhir memuat >= 1 baris DAN menyisakan ruang untuk blok tersebut.
//     (Aturan ini berbeda dari collective-card yang memindahkan tanda tangan
//     ke halaman baru; di sini redistribusi dipilih agar dokumen cetak
//     selalu konsisten: halaman terakhir = baris + total + tanda tangan.)
export function paginateReportRows(
  totalRows: number,
  orientation: ReportPrintOrientation,
  type?: ReportPrintType
): ReportPrintPagination {
  // `type` opsional: tanpa type, geometri murni orientation (perilaku lama,
  // dipakai laporan lain). Hanya landscape Peminjaman yang bergeometri sendiri.
  const geometry = type ? reportPrintGeometry(type, orientation) : REPORT_PRINT_PAGE[orientation]
  const reserveRows = geometry.totalsReserveRows + geometry.signatureReserveRows

  if (!Number.isInteger(totalRows) || totalRows < 0) {
    return { pages: [{ page: 1, startIndex: 0, endIndex: 0, rowCount: 0, capacity: geometry.firstPageRows }], totalRows: 0, signaturePage: 'last' }
  }

  const pages: ReportPrintPage[] = []
  let start = 0
  let capacity = geometry.firstPageRows
  let pageNumber = 1
  while (start < totalRows) {
    const take = Math.min(capacity, totalRows - start)
    pages.push({ page: pageNumber, startIndex: start, endIndex: start + take, rowCount: take, capacity })
    start += take
    pageNumber += 1
    capacity = geometry.nextPageRows
  }
  if (pages.length === 0) {
    pages.push({ page: 1, startIndex: 0, endIndex: 0, rowCount: 0, capacity: geometry.firstPageRows })
  }

  // Redistribusi reserve pada halaman terakhir.
  const last = pages[pages.length - 1]
  if (last.rowCount > last.capacity - reserveRows) {
    // Pindahkan `moved` baris dari halaman terakhir ke halaman baru.
    // moved = reserveRows, tetapi dijaga agar halaman asal tetap >= 1 baris
    // dan halaman baru tetap <= kapasitasnya (reserve < nextPageRows selalu,
    // sehingga halaman baru selalu muat untuk baris + blok total/tanda tangan).
    const moved = Math.min(reserveRows, last.rowCount - 1)
    if (moved > 0) {
      const movedStart = last.endIndex - moved
      last.endIndex = movedStart
      last.rowCount = last.endIndex - last.startIndex
      pages.push({
        page: pages.length + 1,
        startIndex: movedStart,
        endIndex: movedStart + moved,
        rowCount: moved,
        capacity: geometry.nextPageRows
      })
    }
  }

  return { pages, totalRows, signaturePage: 'last' }
}
