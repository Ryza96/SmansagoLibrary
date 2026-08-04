// WO-1 Borrow Card — smoke test MURNI (tanpa DB, tanpa Electron).
// Memverifikasi Borrow Card Engine: data contract, template tunggal, auto pagination,
// avatar placeholder, logo fallback, QR SVG, status badge.
// Jalankan: compile tsc commonjs + node dengan NODE_PATH=<repo>\node_modules
import {
  buildBorrowCardData,
  generateBorrowCardHtml,
  generateBorrowCardPages,
  generateAvatarPlaceholderSvg,
  generateLogoMonogramSvg,
  generateBookIconSvg,
  initialsOf,
  paginateBorrowCard
} from '../src/main/services/borrow-card.service'
import { generateQrCodeSvg } from '../src/main/services/barcode.service'
import { BORROW_STATUS, deriveBorrowStatus, borrowStatusConfig } from '../src/shared/config/borrow-status'
import type { BorrowCardBookData, BorrowCardData, BorrowCardFooterData } from '../src/shared/dto/borrow-card'

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

const BORROW_ID = 'b6f2a4c0-8d1e-4f9a-9c3b-2e5d1a7b9c04'
const BORROW_NUMBER = 'PJ/202607/0001'

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
  console.log('--- STEP 1: config BORROW_STATUS (R3/D9) ---')
  expectEqual('config ACTIVE label', BORROW_STATUS.ACTIVE.label, 'AKTIF')
  expectEqual('config ACTIVE class', BORROW_STATUS.ACTIVE.className, 'badge-active')
  expectEqual('config RETURNED label', BORROW_STATUS.RETURNED.label, 'DIKEMBALIKAN')
  expectEqual('config OVERDUE label', BORROW_STATUS.OVERDUE.label, 'TERLAMBAT')
  expectEqual('derive ACTIVE (dueDate future)', deriveBorrowStatus(null, new Date(Date.now() + 86400000)), 'ACTIVE')
  expectEqual('derive OVERDUE (dueDate past)', deriveBorrowStatus(null, new Date(Date.now() - 86400000)), 'OVERDUE')
  expectEqual('derive RETURNED (returnDate set)', deriveBorrowStatus(new Date(), new Date(Date.now() - 86400000)), 'RETURNED')
  expectEqual('lookup unknown -> neutral class', borrowStatusConfig('XYZ').className, 'badge-neutral')
  expectEqual('lookup unknown -> label fallback raw', borrowStatusConfig('XYZ').label, 'XYZ')

  console.log('--- STEP 2: initials (D6/D13) ---')
  expectEqual('multi-word inisial', initialsOf('SMP Negeri 1 Tunas Bangsa'), 'SN')
  expectEqual('single word inisial', initialsOf('APLibrary'), 'AP')
  expectEqual('nama orang', initialsOf('Budi Santoso'), 'BS')
  expectEqual('empty string', initialsOf(''), '')
  expectEqual('lowercase dinormalisasi', initialsOf('budi santoso'), 'BS')

  console.log('--- STEP 3: SVG generator helper ---')
  const avatarSvg = generateAvatarPlaceholderSvg('Budi Santoso')
  check('avatar svg valid', avatarSvg.startsWith('<svg') && avatarSvg.includes('</svg>'))
  check('avatar memuat inisial BS', avatarSvg.includes('>BS<'))
  const monogram = generateLogoMonogramSvg('SMP Negeri 1 Tunas Bangsa', 'x')
  check('monogram svg valid', monogram.startsWith('<svg') && monogram.includes('>SN<'))
  const bookIcon = generateBookIconSvg()
  check('book icon svg valid', bookIcon.startsWith('<svg') && bookIcon.includes('</svg>'))

  console.log('--- STEP 4: pagination (D10 / R4) ---')
  expectEqual('0 buku -> 1 halaman', paginateBorrowCard(0).length, 1)
  expectEqual('1 buku -> 1 halaman', paginateBorrowCard(1).length, 1)
  expectEqual('3 buku -> 1 halaman', paginateBorrowCard(3).length, 1)
  const p4 = paginateBorrowCard(4)
  expectEqual('4 buku -> 2 halaman', p4.length, 2)
  expectEqual('hal1 memuat 3', p4[0].endIndex - p4[0].startIndex, 3)
  expectEqual('hal2 memuat 1', p4[1].endIndex - p4[1].startIndex, 1)
  const p13 = paginateBorrowCard(13)
  expectEqual('13 buku -> 2 halaman', p13.length, 2)
  expectEqual('hal1 memuat 3', p13[0].endIndex, 3)
  expectEqual('hal2 memuat 10', p13[1].endIndex - p13[1].startIndex, 10)
  const p14 = paginateBorrowCard(14)
  expectEqual('14 buku -> 3 halaman', p14.length, 3)
  expectEqual('hal3 memuat 1', p14[2].endIndex - p14[2].startIndex, 1)
  const p20 = paginateBorrowCard(20)
  expectEqual('20 buku -> 3 halaman (3+10+7)', p20.length, 3)
  expectEqual('hal3 memuat 7', p20[2].endIndex - p20[2].startIndex, 7)
  expectEqual('tidak ada celah index', p20[2].endIndex, 20)

  console.log('--- STEP 5: generateBorrowCardHtml — 1 buku ---')
  const html1 = generateBorrowCardHtml(baseData())
  check('html terbentuk', html1.startsWith('<!DOCTYPE html>'))
  check('memuat title Kartu Peminjaman', html1.includes('Kartu Peminjaman'))
  check('@page 110mm 60mm', html1.includes('size: 110mm 60mm'))
  expectEqual('jumlah kartu = 1', countOccurrences(html1, 'class="borrow-card"'), 1)
  check('memuat judul buku', html1.includes('Buku Ke-1'))
  check('memuat inventoryNumber', html1.includes('INV-000001'))
  check('memuat nama anggota', html1.includes('Budi Santoso'))
  check('memuat no anggota', html1.includes('S-000123'))
  check('memuat jenis Siswa', html1.includes('Siswa'))
  check('memuat kelas', html1.includes('X Merdeka 1'))
  check('memuat no pinjam', html1.includes(BORROW_NUMBER))
  check('memuat tgl pinjam 01-08-2026', html1.includes('01-08-2026'))
  check('memuat jatuh tempo 08-08-2026', html1.includes('08-08-2026'))
  check('memuat petugas', html1.includes('Siti Aminah'))
  check('memuat Jumlah: 1', html1.includes('Jumlah: 1'))
  check('memuat badge AKTIF', html1.includes('AKTIF') && html1.includes('badge-active'))
  check('tidak memuat "+N lainnya"', !html1.includes('lainnya'))

  console.log('--- STEP 6: banyak buku — semua tampil, tanpa "+N lainnya" ---')
  const many = baseData({ books: books(20), footer: { ...baseData().footer, totalBooks: 20 } as BorrowCardFooterData })
  const htmlMany = generateBorrowCardHtml(many)
  expectEqual('jumlah kartu = 3', countOccurrences(htmlMany, 'class="borrow-card"'), 3)
  check('memuat Jumlah: 20', htmlMany.includes('Jumlah: 20'))
  check(
    'semua 20 inventoryNumber tampil',
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].every((n) =>
      htmlMany.includes(`INV-${String(n).padStart(6, '0')}`)
    )
  )
  check(
    'semua 20 judul tampil',
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].every((n) =>
      htmlMany.includes(`Buku Ke-${n}`)
    )
  )
  check('tidak memuat "+N lainnya"', !htmlMany.includes('lainnya'))
  const pagesMany = generateBorrowCardPages(many)
  expectEqual('array halaman = 3', pagesMany.length, 3)
  check('halaman lanjutan memuat label LANJUTAN', htmlMany.includes('LANJUTAN'))
  check('no pinjam tampil di >= 3 tempat', countOccurrences(htmlMany, BORROW_NUMBER) >= 3)
  check('footer berulang tiap halaman (Jumlah: 20)', countOccurrences(htmlMany, 'Jumlah: 20') === 3)

  console.log('--- STEP 7: avatar placeholder (D6) ---')
  check('avatar svg di dalam html', html1.includes(avatarSvg))
  const emptyAvatar = baseData({ member: { ...baseData().member, avatarPlaceholder: '' } })
  const htmlEmptyAvatar = generateBorrowCardHtml(emptyAvatar)
  check('fallback avatar bila kosong', htmlEmptyAvatar.includes('<div class="avatar">') && htmlEmptyAvatar.includes('<svg'))

  console.log('--- STEP 8: logo fallback (D13) ---')
  check('monogram SN di html (logo kosong)', html1.includes('>SN<'))
  const bothEmpty = baseData({
    header: { logo: '', schoolName: '', libraryName: '' }
  })
  const htmlBothEmpty = generateBorrowCardHtml(bothEmpty)
  check('ikon buku saat school+library kosong', htmlBothEmpty.includes(generateBookIconSvg()))
  const withLogo = baseData({
    header: { logo: 'data:image/png;base64,AAAA', schoolName: 'SMP Negeri 1 Tunas Bangsa', libraryName: 'Perpustakaan SMP Negeri 1 Tunas Bangsa' }
  })
  const htmlWithLogo = generateBorrowCardHtml(withLogo)
  check('logo data URI dipakai saat ada', htmlWithLogo.includes('src="data:image/png;base64,AAAA"'))

  console.log('--- STEP 9: QR SVG (D7/D8) ---')
  const qr = generateQrCodeSvg(BORROW_ID)
  check('qrSvg terbentuk', qr.startsWith('<svg') && qr.includes('<path'))
  check('qrSvg termuat di html', html1.includes(qr))
  const qrOther = generateQrCodeSvg('id-lain')
  check('qr bergantung pada payload', qr !== qrOther)

  console.log('--- STEP 10: status badge mapping (R3) ---')
  const statuses: Array<[string, string, string]> = [
    ['ACTIVE', 'AKTIF', 'badge-active'],
    ['RETURNED', 'DIKEMBALIKAN', 'badge-returned'],
    ['OVERDUE', 'TERLAMBAT', 'badge-overdue'],
    ['XYZ', 'XYZ', 'badge-neutral']
  ]
  for (const [code, label, cls] of statuses) {
    const d = baseData({ footer: { ...baseData().footer, borrowStatus: code } as BorrowCardFooterData })
    const h = generateBorrowCardHtml(d)
    check(`status ${code} -> label ${label}`, h.includes(label))
    check(`status ${code} -> class ${cls}`, h.includes(cls))
  }

  console.log('--- STEP 11: escape HTML (D3) ---')
  const malicious = baseData({ books: [{ inventoryNumber: 'INV-000001', title: `<script>alert('x')</script> & "quote"` }] })
  const htmlMalicious = generateBorrowCardHtml(malicious)
  check('script tag di-escape', !htmlMalicious.includes('<script>alert') && htmlMalicious.includes('&lt;script&gt;'))
  check('ampersand di-escape', htmlMalicious.includes('&amp;'))
}

async function assemblerSection(): Promise<void> {
  const sourceSettings = {
    libraryName: 'Perpustakaan SMP Negeri 1 Tunas Bangsa',
    schoolName: 'SMP Negeri 1 Tunas Bangsa',
    logoPath: 'D:/logo.png',
    librarianName: 'Siti Aminah'
  }

  const sourceBorrowing = {
    id: BORROW_ID,
    borrowNumber: BORROW_NUMBER,
    borrowDate: new Date('2026-08-01T00:00:00'),
    dueDate: new Date('2026-08-08T00:00:00'),
    returnDate: null,
    memberName: 'Budi Santoso',
    memberNumber: 'S-000123',
    className: 'X Merdeka 1',
    member: { fullName: 'Budi Santoso', memberNumber: 'S-000123', memberType: 'student' },
    details: [
      { bookTitle: 'snapshot-1', bookCopy: { inventoryNumber: 'INV-000001', book: { title: 'Laskar Pelangi' } } },
      { bookTitle: 'snapshot-2', bookCopy: null }
    ]
  }

  const withLogo = await buildBorrowCardData(
    sourceBorrowing,
    sourceSettings,
    { readFileAsDataUri: async (p) => (p === 'D:/logo.png' ? 'data:image/png;base64,QUJD' : null) }
  )
  expectEqual('assembler logo terbaca', withLogo.header.logo, 'data:image/png;base64,QUJD')
  expectEqual('assembler schoolName', withLogo.header.schoolName, 'SMP Negeri 1 Tunas Bangsa')
  expectEqual('assembler libraryName', withLogo.header.libraryName, 'Perpustakaan SMP Negeri 1 Tunas Bangsa')
  expectEqual('assembler fullName (relasi)', withLogo.member.fullName, 'Budi Santoso')
  expectEqual('assembler memberNumber (relasi)', withLogo.member.memberNumber, 'S-000123')
  expectEqual('assembler memberType -> Siswa', withLogo.member.memberType, 'Siswa')
  expectEqual('assembler className', withLogo.member.className, 'X Merdeka 1')
  expectEqual('assembler borrowId', withLogo.borrow.borrowId, BORROW_ID)
  expectEqual('assembler borrowDate format', withLogo.borrow.borrowDate, '01-08-2026')
  expectEqual('assembler dueDate format', withLogo.borrow.dueDate, '08-08-2026')
  expectEqual('assembler totalBooks', withLogo.footer.totalBooks, 2)
  expectEqual('assembler borrowStatus ACTIVE', withLogo.footer.borrowStatus, 'ACTIVE')
  expectEqual('assembler officerName', withLogo.footer.officerName, 'Siti Aminah')
  expectEqual('assembler qrSvg == generateQrCodeSvg(borrowId)', withLogo.footer.qrSvg, generateQrCodeSvg(BORROW_ID))
  expectEqual('assembler buku 1 dari relasi', withLogo.books[0].title, 'Laskar Pelangi')
  expectEqual('assembler inventory 1', withLogo.books[0].inventoryNumber, 'INV-000001')
  expectEqual('assembler buku 2 fallback snapshot', withLogo.books[1].title, 'snapshot-2')
  check('assembler avatar placeholder svg', withLogo.member.avatarPlaceholder.startsWith('<svg') && withLogo.member.avatarPlaceholder.includes('>BS<'))

  const logoMissing = await buildBorrowCardData(sourceBorrowing, sourceSettings, { readFileAsDataUri: async () => null })
  expectEqual('logo gagal baca -> fallback', logoMissing.header.logo, '')

  const noLogoPath = await buildBorrowCardData(
    sourceBorrowing,
    { ...sourceSettings, logoPath: '' },
    { readFileAsDataUri: async () => 'data:image/png;base64,NEVER' }
  )
  expectEqual('logoPath kosong -> fallback', noLogoPath.header.logo, '')

  const noMemberRelation = await buildBorrowCardData(
    { ...sourceBorrowing, member: null },
    sourceSettings,
    { readFileAsDataUri: async () => null }
  )
  expectEqual('fallback snapshot memberName', noMemberRelation.member.fullName, 'Budi Santoso')
  expectEqual('fallback snapshot memberNumber', noMemberRelation.member.memberNumber, 'S-000123')

  const returned = await buildBorrowCardData(
    { ...sourceBorrowing, returnDate: new Date('2026-08-05T00:00:00') },
    sourceSettings,
    { readFileAsDataUri: async () => null }
  )
  expectEqual('returnDate set -> RETURNED', returned.footer.borrowStatus, 'RETURNED')

  const h = generateBorrowCardHtml(withLogo)
  check('html assembler logo data uri termuat', h.includes('src="data:image/png;base64,QUJD"'))
  check('2 buku muat di 1 kartu (kapasitas hal1 >= 2)', countOccurrences(h, 'class="borrow-card"') === 1)
}

async function run(): Promise<void> {
  main()
  await assemblerSection()
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
  if (fail > 0) {
    console.error('SMOKE FAILED')
    process.exit(1)
  }
  console.log('SMOKE PASS')
}

void run()
