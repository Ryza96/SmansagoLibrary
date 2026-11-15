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
  returns: 'landscape',
  overdues: 'landscape',
  members: 'landscape',
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
 * bisa setinggi 2 baris teks. Kapasitas 14/17 diturunkan dari landscape biasa
 * (17/21) untuk menyisakan ruang baris yang membungkus; baris memakai
 * min-height sehingga baris 3 baris tetap muat tanpa memotong isi.
 * Reserve total + tanda tangan tidak berubah.
 */
export const REPORT_PRINT_BORROWINGS_PAGE: ReportPrintPageGeometry = {
  widthMm: 297,
  heightMm: 210,
  marginMm: 12,
  rowHeightMm: 7.5,
  firstPageRows: 14,
  nextPageRows: 17,
  totalsReserveRows: 4,
  signatureReserveRows: 6
} as const

/**
 * Geometri Laporan Pengembalian (landscape, teks tidak dipotong — menyusul di
 * sesi B). Sementara menyalin nilai Peminjaman: kertas, margin, tinggi baris,
 * reserve total + tanda tangan sama; diukur ulang di sesi C bila perlu.
 */
export const REPORT_PRINT_RETURNS_PAGE: ReportPrintPageGeometry = {
  ...REPORT_PRINT_BORROWINGS_PAGE
} as const

/**
 * Geometri Laporan Keterlambatan (landscape, teks tidak dipotong).
 * Kertas, margin, tinggi baris dasar, dan reserve blok total+tanda tangan sama
 * dengan Peminjaman; kapasitas baris tidak dipakai karena paginasi memakai
 * perkiraan tinggi baris (lihat REPORT_PRINT_OVERDUES_METRICS).
 */
export const REPORT_PRINT_OVERDUES_PAGE: ReportPrintPageGeometry = {
  ...REPORT_PRINT_BORROWINGS_PAGE
} as const

/** Lebar kolom Laporan Peminjaman (persen, total 100). */
export const BORROWINGS_COLUMN_WIDTH_PERCENT: readonly number[] = [8, 12, 25, 10, 25, 9, 11]

/**
 * Lebar kolom Laporan Pengembalian (persen, total 100).
 * Urutan: Tanggal Kembali, Nomor Transaksi, Nama Anggota, Kelas, Judul Buku,
 * Lama Pinjam, Status. Kolom Status (indeks 6) dicetak nowrap.
 */
export const RETURNS_COLUMN_WIDTH_PERCENT: readonly number[] = [10, 12, 22, 10, 25, 9, 12]

/**
 * Metrik hasil UKUR RENDER NYATA (Electron, A4 landscape, margin 12mm, font
 * 8.5pt) yang dipakai paginasi berbasis perkiraan tinggi baris Peminjaman.
 * Satuan mm. Angka "terukur" dicatat agar mudah dibandingkan ulang.
 */
export const REPORT_PRINT_BORROWINGS_METRICS = {
  /** Tinggi area isi halaman: 210 − 2×12 (terukur 186.08). */
  contentHeightMm: 186,
  /** Lebar area isi halaman: 297 − 2×12 (terukur 273.13). */
  contentWidthMm: 273,
  /** Kop + judul + meta halaman pertama (terukur 38.13). */
  firstPageHeaderMm: 38.5,
  /** Header ringkas halaman lanjutan + garis (terukur 7.99). */
  continuationHeaderMm: 8.2,
  /** Tinggi thead (terukur 7.5). */
  tableHeadMm: 7.5,
  /** Footer "Halaman X dari Y" + garis + jarak (terukur 5.02). */
  footerMm: 6,
  /** Padding + border per baris (terukur 0.85). */
  rowOverheadMm: 0.9,
  /** Tinggi satu baris teks: 8.5pt × line-height 1.15 (terukur 3.45). */
  textLineHeightMm: 3.45,
  /** Lebar rata-rata karakter 8.5pt (konservatif). */
  charWidthMm: 1.8,
  /** Padding kiri+kanan sel (0.3mm + 1mm per sisi ≈ 2mm). */
  cellPaddingMm: 2,
  /** Blok total + tanda tangan di halaman terakhir (terukur 51.39). */
  lastPageBlocksMm: 52,
  /** Margin aman pengisian greedy. */
  safeMarginRatio: 0.05
} as const

/** Metrik paginasi Laporan Pengembalian. Sementara menyalin nilai Peminjaman
 * (landscape A4 yang sama, header/footer/blok total+tanda tangan sama);
 * diukur ulang di sesi C bila perlu. */
export const REPORT_PRINT_RETURNS_METRICS = {
  ...REPORT_PRINT_BORROWINGS_METRICS
} as const

/** Geometri Laporan Anggota (landscape, teks tidak dipotong). */
export const REPORT_PRINT_MEMBERS_PAGE: ReportPrintPageGeometry = {
  ...REPORT_PRINT_BORROWINGS_PAGE
} as const

/**
 * Metrik paginasi Laporan Anggota. Diukur render nyata Electron A4 landscape
 * (2026-11-14): header halaman 1 46.35mm (Peminjaman 42.31mm — Anggota punya
 * tiga baris filter, tanpa Periode), blok total (6 baris) + tanda tangan
 * 67.24mm (Peminjaman 59.30mm), satu baris teks pendek 4.30mm. Nilai pakai
 * dibulatkan ke atas agar aman; field lain sama dengan Peminjaman.
 */
export const REPORT_PRINT_MEMBERS_METRICS = {
  ...REPORT_PRINT_BORROWINGS_METRICS,
  firstPageHeaderMm: 46.5,
  lastPageBlocksMm: 67.5
} as const

/**
 * Metrik paginasi Laporan Keterlambatan. Diukur render nyata Electron A4
 * landscape (2026-11-14), kasus terburuk (filter Pencarian tampil sehingga meta
 * 3 baris): header halaman 1 42.31mm (Peminjaman 38.13mm, Anggota 46.35mm) dan
 * blok total (3 baris) + catatan periode + tanda tangan 68.84mm (Peminjaman
 * 59.30mm, Anggota 67.24mm). Catatan periode SELALU dicetak untuk Keterlambatan
 * ("Periode hanya berlaku untuk buku yang sudah dikembalikan..."), jadi blok
 * catatan ikut dihitung. Satu baris teks pendek 4.30mm. Nilai pakai dibulatkan
 * ke atas; field lain sama dengan Peminjaman.
 */
export const REPORT_PRINT_OVERDUES_METRICS = {
  ...REPORT_PRINT_BORROWINGS_METRICS,
  firstPageHeaderMm: 42.5,
  lastPageBlocksMm: 69
} as const

/** Geometri Laporan Koleksi Buku (landscape, teks tidak dipotong). Kertas,
 * margin, tinggi baris dasar, dan reserve blok total+tanda tangan sama dengan
 * Peminjaman; kapasitas baris tidak dipakai karena paginasi memakai perkiraan
 * tinggi baris (lihat REPORT_PRINT_COLLECTIONS_METRICS). */
export const REPORT_PRINT_COLLECTIONS_PAGE: ReportPrintPageGeometry = {
  ...REPORT_PRINT_BORROWINGS_PAGE
} as const

/**
 * Metrik paginasi Laporan Koleksi Buku. Diukur render nyata Electron A4
 * landscape (2026-11-15), kasus terburuk (filter Kategori + Pencarian tampil
 * sehingga meta 3 baris; ringkasan 3 nilai: Total Judul / Total Eksemplar /
 * Nilai Aset; catatan tidak ada): header halaman 1 42.18mm, blok total +
 * tanda tangan 58.51mm (Peminjaman 50.57mm dengan definisi ukur yang sama).
 * Satu baris teks pendek 4.30mm (sama). Nilai pakai dibulatkan ke atas agar
 * aman; field lain sama dengan Peminjaman.
 */
export const REPORT_PRINT_COLLECTIONS_METRICS = {
  ...REPORT_PRINT_BORROWINGS_METRICS,
  firstPageHeaderMm: 42.5,
  lastPageBlocksMm: 59
} as const

export type ReportPrintMetrics = {
  readonly [K in keyof typeof REPORT_PRINT_BORROWINGS_METRICS]: number
}

export interface ReportPrintTypeConfig {
  /** Lebar kolom (persen, total 100) persis seperti yang dipakai template. */
  columnWidthPercent: readonly number[]
  /** Geometri halaman efektif tipe ini (lihat reportPrintGeometry). */
  page: ReportPrintPageGeometry
  /** Metrik paginasi berbasis tinggi baris (dipakai bila heightPaginated). */
  metrics: ReportPrintMetrics
  /** Indeks kolom yang dicetak nowrap (bila ada). */
  nowrapColumnIndex?: number
  /** true = paginasi berbasis perkiraan tinggi baris (bukan kapasitas tetap). */
  heightPaginated: boolean
}

/**
 * SSOT konfigurasi per tipe laporan: orientasi tidak disimpan di sini (tetap di
 * REPORT_PRINT_ORIENTATION), tetapi lebar kolom, geometri, metrik, indeks
 * nowrap, dan cara paginasi disatukan. Menambah dukungan tipe baru cukup
 * menambah satu entri — tanpa menyalin percabangan di service/template.
 * Nilai di bawah adalah nilai efektif saat ini (tidak ada perubahan perilaku).
 */
export const REPORT_PRINT_TYPES: Record<ReportPrintType, ReportPrintTypeConfig> = {
  borrowings: {
    columnWidthPercent: BORROWINGS_COLUMN_WIDTH_PERCENT,
    page: REPORT_PRINT_BORROWINGS_PAGE,
    metrics: REPORT_PRINT_BORROWINGS_METRICS,
    nowrapColumnIndex: 6,
    heightPaginated: true
  },
  returns: {
    columnWidthPercent: RETURNS_COLUMN_WIDTH_PERCENT,
    page: REPORT_PRINT_RETURNS_PAGE,
    metrics: REPORT_PRINT_RETURNS_METRICS,
    nowrapColumnIndex: 6,
    heightPaginated: true
  },
  overdues: {
    // Tanggal Pinjam, Nomor Transaksi, Nama Anggota, Kelas, Judul Buku,
    // Jatuh Tempo, Hari Terlambat, Status (nowrap). Nama Anggota dan Judul Buku
    // dilebarkan (18/18) karena isinya paling panjang; tanggal 10 cukup untuk
    // "dd/mm/yyyy" tanpa membungkus; Status 17 karena kolom status dicetak
    // nowrap dan teks terpanjang "Sudah Dikembalikan Terlambat" terukur
    // 44.19mm (Arial bold 8.5pt) — 17% ≈ 46.1mm area sel.
    columnWidthPercent: [10, 11, 18, 10, 18, 10, 6, 17],
    page: REPORT_PRINT_OVERDUES_PAGE,
    metrics: REPORT_PRINT_OVERDUES_METRICS,
    nowrapColumnIndex: 7,
    heightPaginated: true
  },
  members: {
    // Nomor Anggota, Nama, Kelas, Status Keanggotaan (nowrap), Tanggal Bergabung.
    columnWidthPercent: [14, 34, 16, 19, 17],
    page: REPORT_PRINT_MEMBERS_PAGE,
    metrics: REPORT_PRINT_MEMBERS_METRICS,
    nowrapColumnIndex: 3,
    heightPaginated: true
  },
  collections: {
    // ISBN (nowrap), Judul, Penulis, Penerbit, Kategori, Tahun, Jumlah
    // Eksemplar, Tersedia, Dipinjam, Hilang, Rusak. Lebar diukur Arial 8.5pt
    // (2026-11-15, konten 273mm → 1% = 2.73mm, padding sel ≈ 2.4mm):
    // teks terpanjang per kolom ISBN 25.67mm, Judul 101.14mm, Penulis 69.03mm,
    // Penerbit 47.00mm, Kategori 39.33mm, Tahun 6.67mm, Jumlah Eksemplar
    // 5.00mm, Tersedia/Dipinjam/Hilang/Rusak 5.00mm. Header bold: Tersedia
    // 12.11mm, Dipinjam 12.66mm, Hilang 9.16mm, Rusak 9.00mm, Tahun 8.77mm.
    // Alokasi: ISBN 10.5% (28.7mm ≥ 25.67+2.4 → muat satu baris), Judul 21.8%,
    // Penulis 14.5%, Penerbit 11%, Kategori 10% (membungkus per kata, bukan per
    // huruf), Tahun 4.5% (12.3mm), Jumlah Eksemplar 7.5% (20.5mm agar kata
    // "Eksemplar" utuh), Tersedia 5.5% (15.0mm ≥ 12.11+2.4), Dipinjam 5.7%
    // (15.6mm ≥ 12.66+2.4), Hilang 4.5% (12.3mm ≥ 11.56), Rusak 4.5%
    // (12.3mm ≥ 11.40). Total 100.
    columnWidthPercent: [10.5, 21.8, 14.5, 11, 10, 4.5, 7.5, 5.5, 5.7, 4.5, 4.5],
    page: REPORT_PRINT_COLLECTIONS_PAGE,
    metrics: REPORT_PRINT_COLLECTIONS_METRICS,
    nowrapColumnIndex: 0,
    heightPaginated: true
  }
}

/** Geometri halaman efektif sebuah laporan (landscape Peminjaman & Pengembalian
 * punya angka sendiri). */
export function reportPrintGeometry(
  type: ReportPrintType,
  orientation: ReportPrintOrientation
): ReportPrintPageGeometry {
  // Tipe heightPaginated punya geometri sendiri di peta (saat ini landscape);
  // jalur lain tetap geometri umum sesuai orientasi.
  if (orientation === 'landscape' && REPORT_PRINT_TYPES[type].heightPaginated) {
    return REPORT_PRINT_TYPES[type].page
  }
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

export interface BorrowingRowPaginationOptions {
  /** Indeks kolom yang tidak boleh membungkus (Status, bold nowrap). */
  nowrapColumnIndex?: number
  /** Override margin aman (0–1); default dari metrik (0.05). */
  safeMarginRatio?: number
  /** Override tinggi blok total + tanda tangan (mm). */
  blocksHeightMm?: number
  /** Override metrik paginasi (default: metrik Peminjaman). */
  metrics?: ReportPrintMetrics
}

/**
 * Perkiraan jumlah baris teks satu sel: ceil(panjang teks / karakter per baris),
 * dengan karakter per baris = (lebar kolom − padding) / lebar karakter.
 */
function estimateTextLines(text: string, columnWidthMm: number, charWidthMm: number, paddingMm: number): number {
  const usableMm = Math.max(columnWidthMm - paddingMm, charWidthMm)
  const charsPerLine = Math.max(Math.floor(usableMm / charWidthMm), 1)
  return Math.max(1, Math.ceil(text.trim().length / charsPerLine))
}

/**
 * Perkiraan tinggi satu baris data Peminjaman (mm): jumlah baris teks terbanyak
 * di antara sel × tinggi baris teks + padding/border. Kolom nowrap (Status)
 * dihitung satu baris.
 */
export function estimateBorrowingRowHeightMm(
  row: readonly string[],
  columnWidthsPercent: readonly number[] = BORROWINGS_COLUMN_WIDTH_PERCENT,
  contentWidthMm: number = REPORT_PRINT_BORROWINGS_METRICS.contentWidthMm,
  options?: BorrowingRowPaginationOptions
): number {
  const m = options?.metrics ?? REPORT_PRINT_BORROWINGS_METRICS
  const nowrap = options?.nowrapColumnIndex ?? columnWidthsPercent.length - 1
  let maxLines = 1
  columnWidthsPercent.forEach((percent, i) => {
    const text = row[i] ?? ''
    if (i === nowrap) {
      maxLines = Math.max(maxLines, 1)
      return
    }
    const columnWidthMm = (contentWidthMm * percent) / 100
    maxLines = Math.max(maxLines, estimateTextLines(text, columnWidthMm, m.charWidthMm, m.cellPaddingMm))
  })
  return maxLines * m.textLineHeightMm + m.rowOverheadMm
}

/**
 * Paginasi berbasis perkiraan tinggi baris untuk Laporan Peminjaman.
 *
 * Berbeda dari `paginateReportRows` (kapasitas baris tetap), fungsi ini mengisi
 * halaman secara GREEDY memakai perkiraan tinggi tiap baris, sehingga halaman
 * tidak setengah kosong hanya karena satu baris judul panjang.
 *
 * Jaminan (diuji di tests/report-print-config.test.ts):
 *  1. Tidak ada baris hilang/ganda dan urutan terjaga.
 *  2. Tidak ada halaman non-terakhir yang masih muat untuk baris berikutnya.
 *  3. Baris tidak pernah dibelah antar halaman.
 *  4. Blok total + tanda tangan dicetak di halaman terakhir bila muat; bila
 *     tidak muat, blok itu pindah UTUH ke halaman baru (`signaturePage: 'new'`)
 *     TANPA memindahkan baris data yang sudah muat.
 *  5. totalRows = 0 tetap menghasilkan 1 halaman (blok total tetap tercetak).
 */
export function paginateBorrowingRowsByHeight(
  rows: readonly (readonly string[])[],
  columnWidthsPercent: readonly number[] = BORROWINGS_COLUMN_WIDTH_PERCENT,
  contentWidthMm: number = REPORT_PRINT_BORROWINGS_METRICS.contentWidthMm,
  options?: BorrowingRowPaginationOptions
): ReportPrintPagination {
  const m = options?.metrics ?? REPORT_PRINT_BORROWINGS_METRICS
  const safeRatio = 1 - (options?.safeMarginRatio ?? m.safeMarginRatio)
  const blocksMm = options?.blocksHeightMm ?? m.lastPageBlocksMm
  const heights = rows.map((row) => estimateBorrowingRowHeightMm(row, columnWidthsPercent, contentWidthMm, options))

  const limitFor = (isFirst: boolean): number =>
    (m.contentHeightMm -
      (isFirst ? m.firstPageHeaderMm : m.continuationHeaderMm) -
      m.tableHeadMm -
      m.footerMm) *
    safeRatio

  const pages: ReportPrintPage[] = []
  const usedMm: number[] = []
  let start = 0
  while (start < rows.length) {
    const isFirst = pages.length === 0
    const limit = limitFor(isFirst)
    let used = 0
    let end = start
    while (end < rows.length) {
      const h = heights[end]
      if (used + h > limit) break
      used += h
      end += 1
    }
    if (end === start) {
      // Baris tunggal lebih tinggi dari ruang halaman: paksa satu baris.
      end = start + 1
      used = heights[start]
    }
    pages.push({ page: pages.length + 1, startIndex: start, endIndex: end, rowCount: end - start, capacity: end - start })
    usedMm.push(used)
    start = end
  }
  if (pages.length === 0) {
    pages.push({ page: 1, startIndex: 0, endIndex: 0, rowCount: 0, capacity: 0 })
    usedMm.push(0)
  }

  const lastIndex = pages.length - 1
  const blocksFit = usedMm[lastIndex] + blocksMm <= limitFor(lastIndex === 0)
  return { pages, totalRows: rows.length, signaturePage: blocksFit ? 'last' : 'new' }
}

/**
 * Jumlah halaman sebuah laporan menurut konfigurasi tipenya (satu pintu untuk
 * preview/print/harness): tipe heightPaginated memakai paginasi tinggi baris
 * (blok total+tanda tangan di halaman baru ikut dihitung), tipe lain memakai
 * paginasi kapasitas tetap.
 */
export function paginateReportByType(data: {
  type: ReportPrintType
  rows: readonly (readonly string[])[]
  totalRows: number
  orientation: ReportPrintOrientation
}): { pageCount: number } {
  const config = REPORT_PRINT_TYPES[data.type]
  if (config.heightPaginated) {
    const pagination = paginateBorrowingRowsByHeight(
      data.rows,
      config.columnWidthPercent,
      config.metrics.contentWidthMm,
      { nowrapColumnIndex: config.nowrapColumnIndex, metrics: config.metrics }
    )
    return { pageCount: pagination.pages.length + (pagination.signaturePage === 'new' ? 1 : 0) }
  }
  return { pageCount: paginateReportRows(data.totalRows, data.orientation, data.type).pages.length }
}
