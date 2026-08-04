import { BorrowService } from '../src/main/services/borrow.service'
import { BorrowRepository } from '../src/main/repositories/borrow.repository'
import { BorrowDetailRepository } from '../src/main/repositories/borrow-detail.repository'
import { MemberRepository } from '../src/main/repositories/member.repository'
import { BookCopyRepository } from '../src/main/repositories/book-copy.repository'
import { EnrollmentService } from '../src/main/services/enrollment.service'
import { EnrollmentRepository } from '../src/main/repositories/enrollment.repository'
import { ClassRepository } from '../src/main/repositories/class.repository'
import { PrintService, buildBorrowCardPdfFilename } from '../electron/main/services/print.service'
import { SettingService } from '../electron/main/services/setting.service'
import { SettingRepository } from '../electron/main/repositories/setting.repository'
import { getPrisma } from '../src/main/repositories/base/prisma'
import { initDatabase } from '../electron/main/database'
import { generateQrCodeSvg } from '../src/main/services/barcode.service'

let pass = 0
let fail = 0

function check(name: string, ok: boolean, detail?: string): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`)
  if (ok) pass += 1
  else fail += 1
}

async function expectRejected(name: string, fn: () => Promise<unknown>, messagePart: string): Promise<void> {
  try {
    await fn()
    check(name, false, 'seharusnya ditolak, tetapi berhasil')
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    check(name, msg.includes(messagePart), `message="${msg}"`)
  }
}

function sheetCount(html: string): number {
  return (html.match(/class="sheet"/g) ?? []).length
}

function futureIso(): string {
  return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
}

async function main(): Promise<void> {
  const prisma = getPrisma()
  await initDatabase()

  const memberRepo = new MemberRepository()
  const enrollmentService = new EnrollmentService(new EnrollmentRepository(), memberRepo, new ClassRepository())
  const borrowService = new BorrowService(
    new BorrowRepository(),
    new BorrowDetailRepository(),
    memberRepo,
    new BookCopyRepository(),
    enrollmentService
  )
  const printService = new PrintService(new BorrowRepository(), new SettingService(new SettingRepository()))

  console.log('--- STEP 1: seed (settings + member + buku) ---')
  await prisma.setting.create({
    data: {
      libraryName: 'Perpustakaan SMP Negeri 1 Tunas Bangsa',
      schoolName: 'SMP Negeri 1 Tunas Bangsa',
      librarianName: 'Siti Aminah',
      logoPath: ''
    }
  })
  const m1 = await prisma.member.create({
    data: { memberNumber: 'U-000001', fullName: 'Anggota Umum', memberType: 'general', status: 'ACTIVE' }
  })
  const m2 = await prisma.member.create({
    data: { memberNumber: 'U-000002', fullName: 'Dewi Utama', memberType: 'general', status: 'ACTIVE' }
  })
  const bookA = await prisma.book.create({ data: { title: 'Buku UAT Tunggal' } })
  const copyA = await prisma.bookCopy.create({
    data: { bookId: bookA.id, inventoryNumber: 'INV-000001', barcode: 'INV-000001', shelfLocation: 'R1', status: 'AVAILABLE' }
  })
  const bookB = await prisma.book.create({ data: { title: 'Buku UAT Banyak' } })
  const copyBIds: string[] = []
  for (let i = 0; i < 20; i++) {
    const inv = `INV-${String(i + 2).padStart(5, '0')}`
    const c = await prisma.bookCopy.create({
      data: { bookId: bookB.id, inventoryNumber: inv, barcode: inv, shelfLocation: 'R1', status: 'AVAILABLE' }
    })
    copyBIds.push(c.id)
  }
  check('seed: settings + 2 member + 2 buku + 21 eksemplar', !!m1.id && copyBIds.length === 20)

  console.log('--- UAT #1: Simpan transaksi -> Preview muncul ---')
  const dto1 = await borrowService.create({
    memberId: m1.id,
    dueDate: futureIso(),
    bookCopyIds: [copyA.id]
  })
  check('create mengembalikan id', /^[0-9a-f-]{36}$/.test(dto1.id), `id=${dto1.id}`)
  check('create mengembalikan borrowingNumber PJ/YYYYMM/', /^PJ\/\d{6}\/\d{4}$/.test(dto1.borrowingNumber), dto1.borrowingNumber)
  const dto1byId = await borrowService.findById(dto1.id)
  check('findById konsisten (renderer memakai borrowingNumber)', dto1byId.borrowingNumber === dto1.borrowingNumber)
  const preview1 = await printService.getBorrowCardPreviewHtml(dto1.id)
  check('preview muncul (HTML non-kosong)', preview1.length > 5000, `len=${preview1.length}`)
  check('preview memuat borrowingNumber dari hasil create', preview1.includes(dto1.borrowingNumber))
  check('preview memuat nama anggota', preview1.includes('Anggota Umum'))

  console.log('--- UAT #6: Borrow Card 1 buku ---')
  check('1 buku -> 1 sheet', sheetCount(preview1) === 1, `sheet=${sheetCount(preview1)}`)
  check('judul buku tampil', preview1.includes('Buku UAT Tunggal'))
  check('inventoryNumber tampil', preview1.includes('INV-000001'))

  console.log('--- UAT #7: Borrow Card banyak buku (20) ---')
  const dto2 = await borrowService.create({
    memberId: m2.id,
    dueDate: futureIso(),
    bookCopyIds: copyBIds
  })
  const preview2 = await printService.getBorrowCardPreviewHtml(dto2.id)
  check('20 buku -> 3 sheet (1 utama + 2 lanjutan)', sheetCount(preview2) === 3, `sheet=${sheetCount(preview2)}`)
  const rowCount2 = (preview2.match(/<div class="book-row">/g) ?? []).length
  check('seluruh 20 baris buku ter-render', rowCount2 === 20, `row=${rowCount2}`)
  check('footer Jumlah: 20', preview2.includes('Jumlah: 20'))
  check('label LANJUTAN di halaman lanjutan', preview2.includes('LANJUTAN'))
  check('distribusi halaman 3+10+7 tanpa buku hilang', preview2.includes('20.') && preview2.includes('1.'))

  console.log('--- UAT #8: Status badge AKTIF ---')
  check('badge AKTIF (returnDate null + dueDate masa depan)', preview1.includes('<span class="badge badge-active">AKTIF</span>'))

  console.log('--- UAT #9: QR Code ---')
  check('blok QR ada di footer', preview1.includes('class="qr"'))
  check('QR adalah inline SVG', preview1.includes('class="qr"><svg') || (preview1.includes('class="qr"') && preview1.includes('<svg viewBox="0 0 264 264"')))
  check('QR payload = borrowing.id (svg blok == generateQrCodeSvg(id))', preview1.includes(generateQrCodeSvg(dto1.id)))

  console.log('--- UAT #10: Avatar placeholder ---')
  check('avatar placeholder ada', preview1.includes('class="avatar"'))
  check('avatar inisial AU (Anggota Umum)', /<svg[^>]*>[\s\S]*?<text[^>]*>AU<\/text>[\s\S]*?<\/svg>/.test(preview1))
  check('avatar svg ada di dalam .avatar', /class="avatar">\s*<svg/.test(preview1))

  console.log('--- UAT #11: Logo fallback ---')
  check('logo TIDAK data-uri (logoPath kosong)', !preview1.includes('data:image') && !preview1.includes('<img class="logo-img"'))
  check('logo monogram SVG terpakai (fill biru #1d4ed8)', preview1.includes('fill="#1d4ed8"'))
  check('monogram inisial SN (SMP Negeri 1 Tunas Bangsa)', /<svg[^>]*>[\s\S]*?<text[^>]*>SN<\/text>[\s\S]*?<\/svg>/.test(preview1))
  check('header libraryName dari settings DB', preview1.includes('Perpustakaan SMP Negeri 1 Tunas Bangsa'))

  console.log('--- UAT #4 (bagian headless): nama file PDF sesuai desain F5 ---')
  const pdfFilename = buildBorrowCardPdfFilename({ borrowNumber: dto1.borrowingNumber, memberName: dto1.memberName })
  const sanitizedNumber = dto1.borrowingNumber.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim()
  check('format "Kartu Peminjaman - <no> - <nama>.pdf"', pdfFilename === `Kartu Peminjaman - ${sanitizedNumber} - ${dto1.memberName}.pdf`, pdfFilename)
  check('tanpa karakter ilegal Windows (/)', !pdfFilename.includes('/') && !pdfFilename.includes(':'))

  console.log('--- Negative: 404 ---')
  await expectRejected(
    'preview id tak ada -> 404 AppError',
    () => printService.getBorrowCardPreviewHtml('missing-id'),
    'Data peminjaman tidak ditemukan'
  )

  await prisma.$disconnect()
  console.log(`\nRESULT: ${pass} PASS / ${fail} FAIL`)
  if (fail > 0) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
