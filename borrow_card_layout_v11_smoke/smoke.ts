// WO BORROW CARD LAYOUT v1.1 + REFINEMENT v1.2 — smoke test MURNI (tanpa DB, tanpa Electron).
// Memverifikasi optimasi layout kartu 110×60mm:
//   - Jumlah + Status pindah ke pojok kanan ATAS (header-info), footer kiri bawah dikosongkan.
//   - Kapasitas daftar buku: halaman 1 = 5, lanjutan = 13 (dipertahankan di v1.2).
//   - REFINEMENT v1.2: judul buku diperkecil 7.5pt (tetap dominan di list);
//     inventory number mengikuti judul dengan jarak tetap ~13mm (bukan rata tepi kanan);
//     garis pemisah tipis abu terang antara data anggota & daftar buku.
//   - QR & tanda tangan tetap di kanan bawah footer.
// Jalankan: compile tsc commonjs + node dengan NODE_PATH=<repo>\node_modules
import {
  generateBorrowCardHtml,
  generateBorrowCardPages,
  generateBorrowCardPageHtml,
  generateAvatarPlaceholderSvg,
  paginateBorrowCard
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

const BORROW_ID = 'c1e2f3a4-5b6c-4d7e-8f90-1234567890ab'
const BORROW_NUMBER = 'PJ/202608/0001'

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
  console.log('--- STEP 1: pagination v1.1 (kapasitas 5 + 13, dipertahankan v1.2) ---')
  expectEqual('1 buku -> 1 halaman', paginateBorrowCard(1).length, 1)
  expectEqual('3 buku -> 1 halaman', paginateBorrowCard(3).length, 1)
  expectEqual('5 buku -> 1 halaman (kapasitas hal1 >= 5)', paginateBorrowCard(5).length, 1)
  expectEqual('6 buku -> 2 halaman (kapasitas hal1 == 5)', paginateBorrowCard(6).length, 2)
  const p13 = paginateBorrowCard(13)
  expectEqual('13 buku -> 2 halaman (5+8)', p13.length, 2)
  expectEqual('hal2 memuat 8', p13[1].endIndex - p13[1].startIndex, 8)
  const p18 = paginateBorrowCard(18)
  expectEqual('18 buku -> 2 halaman (5+13)', p18.length, 2)
  expectEqual('hal2 memuat 13 (kapasitas lanjutan >= 13)', p18[1].endIndex - p18[1].startIndex, 13)
  const p19 = paginateBorrowCard(19)
  expectEqual('19 buku -> 3 halaman (5+13+1, kapasitas lanjutan == 13)', p19.length, 3)
  const p20 = paginateBorrowCard(20)
  expectEqual('20 buku -> 3 halaman (5+13+2)', p20.length, 3)
  expectEqual('hal1 memuat 5', p20[0].endIndex - p20[0].startIndex, 5)
  expectEqual('hal2 memuat 13', p20[1].endIndex - p20[1].startIndex, 13)
  expectEqual('hal3 memuat 2', p20[2].endIndex - p20[2].startIndex, 2)
  expectEqual('tidak ada celah index', p20[2].endIndex, 20)

  console.log('--- STEP 2: preview 1 buku ---')
  const html1 = generateBorrowCardHtml(baseData())
  check('1 kartu', countOccurrences(html1, 'class="borrow-card"') === 1)
  check('header-info berisi Jumlah: 1', html1.includes('class="header-info"') && html1.includes('Jumlah: 1'))
  check('badge AKTIF di header-info', html1.includes('<span class="badge badge-active">AKTIF</span>'))
  check('tidak ada footer-left', !html1.includes('footer-left'))
  check('QR ada di footer', html1.includes('class="qr"'))
  check('QR SVG 264 viewBox', html1.includes('viewBox="0 0 264 264"'))
  check('tanda tangan ada', html1.includes('(Siti Aminah)'))
  check('identitas anggota utuh', html1.includes('Nama') && html1.includes('Budi Santoso') && html1.includes('S-000123'))
  check('kelas & jenis utuh', html1.includes('X Merdeka 1') && html1.includes('Siswa'))
  check('no pinjam & tanggal utuh', html1.includes(BORROW_NUMBER) && html1.includes('01-08-2026') && html1.includes('08-08-2026'))

  console.log('--- STEP 3: preview 3 buku & 5 buku (UAT PO) ---')
  const html3 = generateBorrowCardHtml(baseData({ books: books(3), footer: { ...baseData().footer, totalBooks: 3 } }))
  const html5 = generateBorrowCardHtml(baseData({ books: books(5), footer: { ...baseData().footer, totalBooks: 5 } }))
  check('3 buku -> 1 kartu', countOccurrences(html3, 'class="borrow-card"') === 1)
  check('5 buku -> 1 kartu', countOccurrences(html5, 'class="borrow-card"') === 1)
  check('3 baris buku ter-render', countOccurrences(html3, 'class="book-row"') === 3)
  check('5 baris buku ter-render', countOccurrences(html5, 'class="book-row"') === 5)
  for (let n = 1; n <= 5; n++) {
    check(`buku ke-${n} judul tampil`, html5.includes(`Buku Ke-${n}`))
    check(`buku ke-${n} inv tampil`, html5.includes(`INV-${String(n).padStart(6, '0')}`))
  }
  check('Jumlah: 5 di header-info', html5.includes('Jumlah: 5'))

  console.log('--- STEP 4: struktur baris (judul kiri, inv kanan) ---')
  const page1 = generateBorrowCardPageHtml(baseData({ books: books(1) }), paginateBorrowCard(1)[0])
  check('urutan dalam baris: nomor -> judul -> inv', /<div class="book-row"><span class="num">1\.<\/span><span class="title">Buku Ke-1<\/span><span class="inv">INV-000001<\/span><\/div>/.test(page1))

  console.log('--- STEP 5: CSS v1.1 + REFINEMENT v1.2 (spacing & font) ---')
  check('baris buku 7.5pt (judul dominan di list)', html1.includes('.book-row { display: flex; font-size: 7.5pt;'))
  check('line-height baris 2.7mm', html1.includes('line-height: 2.7mm;'))
  check('num 6.5pt + jarak ke judul 3mm', html1.includes('.book-row .num { flex: 0 0 5mm; margin-right: 3mm; font-size: 6.5pt;'))
  check('inv mengikuti judul ~13mm (margin-left)', html1.includes('.book-row .inv { flex: 0 0 auto; margin-left: 13mm; font-family: Consolas, \'Courier New\', monospace; font-size: 6.5pt; }'))
  check('judul ellipsis, flex 0 1 auto (tidak memenuhi sisa baris)', html1.includes('.book-row .title { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }'))
  check('baris tanpa justify-content space-between (inv dekat judul)', html1.includes('.book-row { display: flex; font-size: 7.5pt;') && !html1.includes('.book-row { display: flex; justify-content: space-between'))
  check('body 17mm + pemisah border-bottom abu terang + margin-bottom 1mm', html1.includes('.body { display: flex; gap: 3mm; height: 17mm; margin-top: 0; margin-bottom: 1mm; align-items: stretch; border-bottom: 1px solid #e2e8f0; }'))
  check('avatar menyesuaikan body 17mm', html1.includes('.avatar { width: 17mm; height: 17mm; flex: 0 0 17mm;'))
  check('footer 9mm', html1.includes('.footer { display: flex; align-items: flex-end; gap: 4mm; height: 9mm;'))
  check('QR rata kanan (margin-left auto)', html1.includes('.qr { width: 9mm; height: 9mm; flex: 0 0 9mm; margin-left: auto; }'))
  check('header-info di pojok kanan (flex-end)', html1.includes('.header-info { flex: 0 0 auto; display: flex; flex-direction: column; align-items: flex-end;'))

  console.log('--- STEP 6: banyak buku — 3 kartu, distribusi per halaman ---')
  const many = baseData({ books: books(20), footer: { ...baseData().footer, totalBooks: 20 } })
  const pages = generateBorrowCardPages(many)
  expectEqual('jumlah halaman = 3', pages.length, 3)
  const rowsPerSheet = pages.map((p) => countOccurrences(p, 'class="book-row"'))
  expectEqual('distribusi baris 5+13+2', JSON.stringify(rowsPerSheet), JSON.stringify([5, 13, 2]))
  check('hal1 memuat buku 1..5', pages[0].includes('Buku Ke-1') && pages[0].includes('Buku Ke-5') && !pages[0].includes('Buku Ke-6'))
  check('hal2 memuat buku 6..18', pages[1].includes('Buku Ke-6') && pages[1].includes('Buku Ke-18') && !pages[1].includes('Buku Ke-19'))
  check('hal3 memuat buku 19..20', pages[2].includes('Buku Ke-19') && pages[2].includes('Buku Ke-20'))
  const manyHtml = generateBorrowCardHtml(many)
  check('tiap kartu punya header-info (Jumlah: 20)', countOccurrences(manyHtml, 'class="header-info"') === 3)
  check('tiap kartu punya QR', countOccurrences(manyHtml, 'class="qr"') === 3)
  check('tiap kartu punya tanda tangan', countOccurrences(manyHtml, '(Siti Aminah)') === 3)
  check('halaman lanjutan memuat LANJUTAN', manyHtml.includes('LANJUTAN'))

  console.log(`RESULT: ${pass} PASS, ${fail} FAIL`)
  if (fail > 0) process.exit(1)
}

main()
