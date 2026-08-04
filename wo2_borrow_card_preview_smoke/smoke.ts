import { getPrisma } from '../src/main/repositories/base/prisma'
import { initDatabase } from '../electron/main/database'
import { BorrowRepository } from '../src/main/repositories/borrow.repository'
import { SettingService } from '../electron/main/services/setting.service'
import { SettingRepository } from '../electron/main/repositories/setting.repository'
import { PrintService, buildBorrowCardPdfFilename } from '../electron/main/services/print.service'

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

async function main(): Promise<void> {
  const prisma = getPrisma()
  await initDatabase()

  const printService = new PrintService(new BorrowRepository(), new SettingService(new SettingRepository()))

  console.log('--- STEP 1: seed fresh DB ---')
  const m = await prisma.member.create({
    data: { memberNumber: 'U-000001', fullName: 'Anggota Umum', memberType: 'general', status: 'ACTIVE' }
  })
  const book = await prisma.book.create({ data: { title: 'Buku Preview' } })
  const copy = await prisma.bookCopy.create({
    data: { bookId: book.id, inventoryNumber: 'INV-000001', barcode: 'INV-000001', shelfLocation: 'R1', status: 'AVAILABLE' }
  })
  const borrow = await prisma.borrow.create({
    data: {
      borrowNumber: 'PJ-000001',
      memberId: m.id,
      borrowDate: new Date('2026-08-01'),
      dueDate: new Date('2026-08-08'),
      memberName: 'Anggota Umum',
      memberNumber: 'U-000001'
    }
  })
  await prisma.borrowDetail.create({
    data: { borrowId: borrow.id, bookCopyId: copy.id, bookTitle: 'Buku Preview' }
  })
  check('seed: member + buku + eksemplar + peminjaman', !!borrow.id && !!copy.id)

  console.log('--- STEP 2: preview HTML (satu halaman) ---')
  const html = await printService.getBorrowCardPreviewHtml(borrow.id)
  check('preview berisi DOCTYPE html', html.startsWith('<!DOCTYPE html>'))
  check('preview berisi @page 110mm 60mm', html.includes('@page { size: 110mm 60mm; margin: 0; }'))
  check('preview berisi nomor pinjam', html.includes('PJ-000001'))
  check('preview berisi nama anggota', html.includes('Anggota Umum'))
  check('preview berisi nomor anggota', html.includes('U-000001'))
  check('preview berisi judul buku', html.includes('Buku Preview'))
  check('preview berisi blok qr', html.includes('class="qr"') && html.includes('<svg'))
  check('preview 1 buku -> 1 sheet', sheetCount(html) === 1, `sheet=${sheetCount(html)}`)

  console.log('--- STEP 3: preview multi-page (20 buku -> 3 sheet) ---')
  const book2 = await prisma.book.create({ data: { title: 'Buku Panjang' } })
  const borrow2 = await prisma.borrow.create({
    data: {
      borrowNumber: 'PJ-000002',
      memberId: m.id,
      borrowDate: new Date('2026-08-02'),
      dueDate: new Date('2026-08-09'),
      memberName: 'Anggota Umum',
      memberNumber: 'U-000001'
    }
  })
  for (let i = 0; i < 20; i++) {
    const inv = `INV-${String(i + 2).padStart(5, '0')}`
    const c = await prisma.bookCopy.create({
      data: { bookId: book2.id, inventoryNumber: inv, barcode: inv, shelfLocation: 'R1', status: 'AVAILABLE' }
    })
    await prisma.borrowDetail.create({
      data: { borrowId: borrow2.id, bookCopyId: c.id, bookTitle: `Buku Panjang ${i + 1}` }
    })
  }
  const html2 = await printService.getBorrowCardPreviewHtml(borrow2.id)
  check('20 buku -> 3 sheet (1 utama + 2 lanjutan)', sheetCount(html2) === 3, `sheet=${sheetCount(html2)}`)
  const rowCount = (html2.match(/<div class="book-row">/g) ?? []).length
  check('seluruh 20 baris buku ter-render', rowCount === 20, `row=${rowCount}`)
  const titleCount = (html2.match(/<span class="title">Buku Panjang<\/span>/g) ?? []).length
  check('judul dari relasi book terpakai di 20 baris', titleCount === 20, `title=${titleCount}`)
  check('label LANJUTAN ada di halaman lanjutan', html2.includes('LANJUTAN'))
  check('nomor pinjam tampil di header lanjutan', html2.includes('PJ-000002'))

  console.log('--- STEP 4: nama file PDF ---')
  expectEqual(
    'format dasar',
    buildBorrowCardPdfFilename({ borrowNumber: 'PJ-000123', memberName: 'Budi Santoso' }),
    'Kartu Peminjaman - PJ-000123 - Budi Santoso.pdf'
  )
  expectEqual(
    'sanitasi karakter ilegal Windows',
    buildBorrowCardPdfFilename({ borrowNumber: 'PJ-000123', memberName: 'A: <B> "C" /D? \\E| F*' }),
    'Kartu Peminjaman - PJ-000123 - A B C D E F.pdf'
  )
  expectEqual(
    'collapse spasi ganda',
    buildBorrowCardPdfFilename({ borrowNumber: 'PJ-000123', memberName: '  Budi   Santoso  ' }),
    'Kartu Peminjaman - PJ-000123 - Budi Santoso.pdf'
  )
  expectEqual(
    'truncate nama 40 karakter',
    buildBorrowCardPdfFilename({ borrowNumber: 'PJ-000123', memberName: 'X'.repeat(60) }),
    `Kartu Peminjaman - PJ-000123 - ${'X'.repeat(40)}.pdf`
  )
  expectEqual(
    'fallback nama kosong',
    buildBorrowCardPdfFilename({ borrowNumber: 'PJ-000123', memberName: '   ' }),
    'Kartu Peminjaman - PJ-000123 - Anggota.pdf'
  )
  expectEqual(
    'fallback nomor kosong',
    buildBorrowCardPdfFilename({ borrowNumber: '', memberName: 'Budi' }),
    'Kartu Peminjaman - PEMINJAMAN - Budi.pdf'
  )

  console.log('--- STEP 5: 404 ---')
  await expectRejected(
    'preview id tak ada -> 404',
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
