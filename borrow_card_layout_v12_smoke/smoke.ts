// BORROW CARD LAYOUT REFINEMENT v1.2 — smoke test MURNI (tanpa DB, tanpa Electron).
// Memverifikasi penyempurnaan visual kartu 110×60mm TANPA mengubah ukuran kartu/PDF:
//   1. Judul buku diperkecil 8→7.5pt (tetap > teks identitas 6.5pt, tetap terbaca).
//   2. Inventory number MENGIKUTI judul dengan jarak proporsional
//      (flex gap 3mm + margin-left .inv 5mm ≈ 8mm total) — bukan rata ke tepi
//      kanan (space-between dihapus) & bukan jarak keras 13mm (revisi PO).
//   3. Garis pemisah tipis abu terang antara data anggota & daftar buku
//      (border-bottom .body + margin-bottom 1mm) + jarak nyaman atas & bawah.
//   Kapasitas A6: 20 per halaman pertama, 27 per lanjutan (body 26mm & baris 4.4mm).
// Jalankan: compile tsc commonjs + node dengan NODE_PATH=<repo>\node_modules
import {
  generateBorrowCardHtml,
  generateBorrowCardPages,
  generateBorrowCardPageHtml,
  generateAvatarPlaceholderSvg,
  paginateBorrowCard,
  BORROW_CARD_LAYOUT
} from '../src/main/services/borrow-card.service'
import { generateQrCodeSvg } from '../src/main/services/barcode.service'
import type { BorrowCardBookData, BorrowCardData } from '../src/shared/dto/borrow-card'

let pass = 0
let fail = 0

function check(name: string, ok: boolean, detail?: string): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`)
  if (ok) pass += 1
  else fail += 1
}

function expectEqual<T>(name: string, actual: T, expected: T): void {
  check(name, actual === expected, `expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`)
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

const BORROW_ID = 'a1b2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d'
const BORROW_NUMBER = 'PJ/202608/0002'

function books(n: number): BorrowCardBookData[] {
  return Array.from({ length: n }, (_, i) => ({
    inventoryNumber: `INV-${String(i + 1).padStart(6, '0')}`,
    title: `Buku Ke-${i + 1}`
  }))
}

function baseData(overrides: Partial<BorrowCardData> = {}): BorrowCardData {
  return {
    header: {
      logo: '',
      schoolName: 'SMP Negeri 1 Tunas Bangsa',
      libraryName: 'Perpustakaan SMP Negeri 1 Tunas Bangsa'
    },
    member: {
      memberNumber: 'S-000123',
      fullName: 'Budi Santoso',
      memberType: 'Siswa',
      className: 'X Merdeka 1',
      avatarPlaceholder: generateAvatarPlaceholderSvg('Budi Santoso')
    },
    borrow: {
      borrowId: BORROW_ID,
      borrowNumber: BORROW_NUMBER,
      borrowDate: '01-08-2026',
      dueDate: '08-08-2026'
    },
    books: books(1),
    footer: {
      totalBooks: 1,
      borrowStatus: 'ACTIVE',
      qrSvg: generateQrCodeSvg(BORROW_ID),
      officerName: 'Siti Aminah'
    },
    ...overrides
  }
}

function main(): void {
  console.log('--- STEP 1: konstanta layout A6 (kapasitas hal1 20 / lanjutan 27) ---')
  expectEqual('bookRowHeightMm = 4.4', BORROW_CARD_LAYOUT.bookRowHeightMm, 4.4)
  expectEqual('pageOne.bodyMm = 26', BORROW_CARD_LAYOUT.pageOne.bodyMm, 26)
  expectEqual('pageOne.headerMm = 14', BORROW_CARD_LAYOUT.pageOne.headerMm, 14)
  expectEqual('pageOne.footerMm = 12', BORROW_CARD_LAYOUT.pageOne.footerMm, 12)
  expectEqual('continuation header 8', BORROW_CARD_LAYOUT.continuation.headerMm, 8)
  expectEqual('continuation footer 12', BORROW_CARD_LAYOUT.continuation.footerMm, 12)
  expectEqual('ukuran kartu A6 105x148', BORROW_CARD_LAYOUT.pageWidthMm, 105)
  expectEqual('5 buku -> 1 halaman', paginateBorrowCard(5).length, 1)
  const p20 = paginateBorrowCard(20)
  expectEqual('20 buku -> 1 halaman (hal1 == 20)', p20.length, 1)
  const p47 = paginateBorrowCard(47)
  expectEqual('47 buku -> 2 halaman (20+27)', p47.length, 2)
  expectEqual('hal2 memuat 27 (kapasitas lanjutan)', p47[1].endIndex - p47[1].startIndex, 27)
  const p48 = paginateBorrowCard(48)
  expectEqual('48 buku -> 3 halaman (20+27+1)', p48.length, 3)
  expectEqual('hal1 20 / hal2 27 / hal3 1', JSON.stringify(p48.map((p) => p.endIndex - p.startIndex)), JSON.stringify([20, 27, 1]))

  console.log('--- STEP 2: judul buku diperkecil 7.5pt (tetap > identitas 6.5pt) ---')
  const html1 = generateBorrowCardHtml(baseData())
  check('judul/baris 7.5pt', html1.includes('.book-row { display: flex; gap: 3mm; font-size: 7.5pt;'))
  check('judul 7.5pt > teks identitas 6.5pt (kode sumber)', (() => {
    const titlePos = html1.indexOf('.book-row { display: flex; gap: 3mm; font-size: 7.5pt;')
    const identPos = html1.indexOf('.col { flex: 1; min-width: 0; font-size: 6.5pt;')
    return titlePos !== -1 && identPos !== -1
  })())
  check('line-height 4.4mm (>= 7.5pt = 2.646mm, leading cukup)', html1.includes('line-height: 4.4mm;'))
  check('nomor urut & inv tetap 6.5pt', html1.includes('.book-row .num { flex: 0 0 5mm; font-size: 6.5pt;') && html1.includes('font-size: 6.5pt; }'))
  check('judul utuh ter-render (1 buku)', html1.includes('Buku Ke-1'))

  console.log('--- STEP 3: inventory number mengikuti judul (gap proporsional ~8mm) ---')
  check('gap baris 3mm (pemisah antar item fleksibel)', html1.includes('.book-row { display: flex; gap: 3mm; font-size: 7.5pt;'))
  check('inv margin-left 5mm (≈8mm total gap ke judul)', html1.includes('.book-row .inv { flex: 0 0 auto; margin-left: 5mm;'))
  check('baris TANPA justify-content space-between (inv tidak dipaksa ke kanan)', !html1.includes('.book-row { display: flex; justify-content: space-between') && !html1.includes('justify-content: space-between; font-size: 7.5pt'))
  check('judul flex 0 1 auto (tidak memenuhi sisa baris)', html1.includes('.book-row .title { flex: 0 1 auto; min-width: 0;'))
  check('num TANPA margin-right keras (gap baris menggantikannya)', !html1.includes('.book-row .num { flex: 0 0 5mm; margin-right: 3mm;'))
  const page1 = generateBorrowCardPageHtml(baseData({ books: books(1) }), paginateBorrowCard(1)[0])
  check('struktur baris tetap: nomor -> judul -> inv', /<div class="book-row"><span class="num">1\.<\/span><span class="title">Buku Ke-1<\/span><span class="inv">INV-000001<\/span><\/div>/.test(page1))

  console.log('--- STEP 4: garis pemisah antara data anggota & daftar buku ---')
  check('body border-bottom #e2e8f0 (abu terang)', html1.includes('border-bottom: 1px solid #e2e8f0;'))
  check('body tanpa margin-bottom (pemisah hanya border-bottom)', html1.includes('.body { display: flex; gap: 3mm; height: 26mm; margin-top: 0; margin-bottom: 0; align-items: stretch; border-bottom: 1px solid #e2e8f0; }'))
  check('body height 26mm', html1.includes('.body { display: flex; gap: 3mm; height: 26mm;'))
  check('avatar menyesuaikan 20mm', html1.includes('.avatar { width: 20mm; height: 20mm; flex: 0 0 20mm;'))
  check('halaman lanjutan TANPA body/pemisah (books langsung setelah header)', (() => {
    const p = generateBorrowCardPages(baseData({ books: books(21) }))
    return p[1].includes('class="books"') && !p[1].includes('class="body"') && !p[1].includes('border-bottom: 1px solid #e2e8f0;')
  })())

  console.log('--- STEP 5: visual lain tidak berubah (regresi) ---')
  check('QR & tanda tangan tetap di footer kanan bawah', html1.includes('class="qr"') && html1.includes('(Siti Aminah)'))
  check('header-info Jumlah+AKTIF di kanan atas', html1.includes('class="header-info"') && html1.includes('Jumlah: 1') && html1.includes('<span class="badge badge-active">AKTIF</span>'))
  check('tidak ada footer-left', !html1.includes('footer-left'))
  check('avatar/identitas utuh', html1.includes('Budi Santoso') && html1.includes('S-000123') && html1.includes('X Merdeka 1'))

  console.log('--- STEP 6: banyak buku — distribusi 20+27+1 A6 ---')
  const many = baseData({ books: books(48), footer: { ...baseData().footer, totalBooks: 48 } })
  const pages = generateBorrowCardPages(many)
  expectEqual('jumlah halaman = 3', pages.length, 3)
  const rowsPerSheet = pages.map((p) => countOccurrences(p, 'class="book-row"'))
  expectEqual('distribusi baris 20+27+1', JSON.stringify(rowsPerSheet), JSON.stringify([20, 27, 1]))
  check('hal1 buku 1..20, hal2 buku 21..47, hal3 buku 48', pages[0].includes('Buku Ke-1') && pages[0].includes('Buku Ke-20') && pages[1].includes('Buku Ke-21') && pages[1].includes('Buku Ke-47') && pages[2].includes('Buku Ke-48'))
  const manyHtml = generateBorrowCardHtml(many)
  check('tiap kartu header-info (Jumlah: 48)', countOccurrences(manyHtml, 'class="header-info"') === 3)
  check('tiap kartu QR & tanda tangan', countOccurrences(manyHtml, 'class="qr"') === 3 && countOccurrences(manyHtml, '(Siti Aminah)') === 3)
  check('LANJUTAN di halaman lanjutan', manyHtml.includes('LANJUTAN'))

  console.log(`RESULT: ${pass} PASS, ${fail} FAIL`)
  if (fail > 0) process.exit(1)
}

main()
