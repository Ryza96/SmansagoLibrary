// R-4 — Smoke ReportService.getOverdueReport (kontrak halaman Laporan Keterlambatan).
// VALIDASI PO:
//   1. Data sesuai database (active = BorrowDetail dari borrow returnDate null & dueDate<now;
//      returned = detail returnedAt > dueDate; snapshot kolom benar)
//   2. Hari Terlambat benar (ACTIVE = diffDays(now, dueDate); RETURNED = diffDays(returnedAt, dueDate))
//   3. Status benar (hanya 2 nilai: MASIH TERLAMBAT = category ACTIVE, SUDAH DIKEMBALIKAN TERLAMBAT = RETURNED)
//   4. Search berjalan (server-side: borrowNumber / memberNumber / memberName / bookTitle)
//   5. Filter periode berjalan (returned-late di-filter oleh returnedAt; active selalu tampil)
//   6. Statistik sesuai hasil filter (summary.active + summary.returned == pagination.total == rows)
// Plus: 1 baris = 1 buku (multi-detail), pagination + skala.
import { ReportService } from '../src/main/services/report.service'
import { ReportRepository } from '../src/main/repositories/report.repository'
import { getPrisma } from '../src/main/repositories/base/prisma'
import { initDatabase } from '../electron/main/database'

let pass = 0
let fail = 0

function check(name: string, ok: boolean, detail?: string): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`)
  if (ok) pass += 1
  else fail += 1
}

function daysAgo(n: number, hour = 10, minute = 0): Date {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(hour, minute, 0, 0)
  return d
}

function iso(d: Date): string {
  return d.toISOString()
}

function daysBetween(later: Date, earlier: Date): number {
  const a = new Date(later)
  const b = new Date(earlier)
  a.setHours(0, 0, 0, 0)
  b.setHours(0, 0, 0, 0)
  return Math.floor((a.getTime() - b.getTime()) / 86_400_000)
}

async function main(): Promise<void> {
  const prisma = getPrisma()
  await initDatabase()
  const reportService = new ReportService(new ReportRepository())

  console.log('--- STEP 0: seed master (AY, kurikulum, kelas, anggota, buku, eksemplar) ---')
  const ay1 = await prisma.academicYear.create({ data: { name: '2026/2027', startDate: new Date('2026-07-01'), endDate: new Date('2027-06-30'), isActive: true } })
  const cur = await prisma.curriculum.create({ data: { name: 'Kurikulum Merdeka' } })
  const classA = await prisma.class.create({ data: { academicYearId: ay1.id, curriculumId: cur.id, educationLevel: 'X', parallel: 'Merdeka 1' } })

  const student = await prisma.member.create({ data: { memberNumber: 'R4-0001', fullName: 'Dina Sari', memberType: 'student', gender: 'PEREMPUAN', status: 'ACTIVE' } })
  await prisma.memberEnrollment.create({ data: { memberId: student.id, classId: classA.id, academicYearId: ay1.id, status: 'ACTIVE' } })
  const teacher = await prisma.member.create({ data: { memberNumber: 'R4-0002', fullName: 'Budi Santoso', memberType: 'teacher', gender: 'LAKI_LAKI', status: 'ACTIVE' } })
  const general = await prisma.member.create({ data: { memberNumber: 'R4-0003', fullName: 'Citra Umum', memberType: 'general', gender: 'PEREMPUAN', status: 'ACTIVE' } })

  const cat1 = await prisma.category.create({ data: { code: 'CAT1', name: 'Fiksi' } })
  const cat2 = await prisma.category.create({ data: { code: 'CAT2', name: 'Nonfiksi' } })
  const author = await prisma.author.create({ data: { name: 'Pengarang A' } })
  const publisher = await prisma.publisher.create({ data: { name: 'Penerbit X' } })
  const book1 = await prisma.book.create({ data: { title: 'Buku Alpha', isbn: '978-1', authorId: author.id, publisherId: publisher.id, categoryId: cat1.id, publicationYear: 2020 } })
  const book2 = await prisma.book.create({ data: { title: 'Buku Beta', isbn: '978-2', categoryId: cat2.id, publicationYear: 2021 } })
  const book3 = await prisma.book.create({ data: { title: 'Buku Gamma', isbn: '978-3', categoryId: cat2.id, publicationYear: 2022 } })

  const mkCopy = (bookId: string, inv: string) =>
    prisma.bookCopy.create({ data: { bookId, inventoryNumber: inv, barcode: inv, shelfLocation: 'R1', status: 'AVAILABLE' } })
  const c1 = await mkCopy(book1.id, 'R4-INV-0001')
  const c2 = await mkCopy(book2.id, 'R4-INV-0002')
  const c3 = await mkCopy(book3.id, 'R4-INV-0003')
  const c4 = await mkCopy(book1.id, 'R4-INV-0004')
  const c5 = await mkCopy(book2.id, 'R4-INV-0005')
  const c6 = await mkCopy(book3.id, 'R4-INV-0006')
  check('seed master', !!ay1.id && !!classA.id && !!student.id && !!book1.id && !!c1.id)

  console.log('--- STEP 1: seed peminjaman (ob1..ob6; ob2 & ob6 = 2 buku) ---')
  // ob1: siswa, 1 buku, MASIH TERLAMBAT (due -20, belum kembali). Kelas snapshot 'X Merdeka 1'.
  const ob1 = await prisma.borrow.create({
    data: {
      borrowNumber: 'PJ-R4-0001', memberId: student.id, memberName: 'Dina Sari', memberNumber: 'R4-0001', className: 'X Merdeka 1',
      borrowDate: daysAgo(35), dueDate: daysAgo(20),
      details: { create: [{ bookCopyId: c1.id, bookTitle: 'Buku Alpha' }] }
    }
  })
  // ob2: guru, 2 buku (Beta + Gamma), MASIH TERLAMBAT (due -5) → 2 baris.
  const ob2 = await prisma.borrow.create({
    data: {
      borrowNumber: 'PJ-R4-0002', memberId: teacher.id, memberName: 'Budi Santoso', memberNumber: 'R4-0002',
      borrowDate: daysAgo(12), dueDate: daysAgo(5),
      details: { create: [{ bookCopyId: c2.id, bookTitle: 'Buku Beta' }, { bookCopyId: c3.id, bookTitle: 'Buku Gamma' }] }
    }
  })
  // ob3: umum, dikembalikan TERLAMBAT 4 hari (returnedAt = due + 4, 1 hari lalu).
  const ob3 = await prisma.borrow.create({
    data: {
      borrowNumber: 'PJ-R4-0003', memberId: general.id, memberName: 'Citra Umum', memberNumber: 'R4-0003',
      borrowDate: daysAgo(16), dueDate: daysAgo(5), returnDate: daysAgo(1),
      details: { create: [{ bookCopyId: c4.id, bookTitle: 'Buku Alpha', returnedAt: daysAgo(1), conditionBack: 'RUSAK' }] }
    }
  })
  // ob4: dikembalikan TEPAT WAKTU → TIDAK masuk laporan keterlambatan.
  const ob4 = await prisma.borrow.create({
    data: {
      borrowNumber: 'PJ-R4-0004', memberId: student.id, memberName: 'Dina Sari', memberNumber: 'R4-0001', className: 'X Merdeka 1',
      borrowDate: daysAgo(25), dueDate: daysAgo(10), returnDate: daysAgo(12),
      details: { create: [{ bookCopyId: c5.id, bookTitle: 'Buku Beta', returnedAt: daysAgo(12), conditionBack: 'BAIK' }] }
    }
  })
  // ob5: AKTIF TIDAK TERLAMBAT (due +5) → TIDAK masuk.
  const ob5 = await prisma.borrow.create({
    data: {
      borrowNumber: 'PJ-R4-0005', memberId: teacher.id, memberName: 'Budi Santoso', memberNumber: 'R4-0002',
      borrowDate: daysAgo(3), dueDate: daysAgo(-5),
      details: { create: [{ bookCopyId: c6.id, bookTitle: 'Buku Gamma' }] }
    }
  })
  // ob6: dikembalikan TERLAMBAT 2 hari, 2 buku (Alpha + Beta) → 2 baris.
  const ob6 = await prisma.borrow.create({
    data: {
      borrowNumber: 'PJ-R4-0006', memberId: student.id, memberName: 'Dina Sari', memberNumber: 'R4-0001', className: 'X Merdeka 1',
      borrowDate: daysAgo(40), dueDate: daysAgo(30), returnDate: daysAgo(28),
      details: {
        create: [
          { bookCopyId: c1.id, bookTitle: 'Buku Alpha', returnedAt: daysAgo(28), conditionBack: 'HILANG' },
          { bookCopyId: c2.id, bookTitle: 'Buku Beta', returnedAt: daysAgo(28), conditionBack: 'BAIK' }
        ]
      }
    }
  })
  check('seed: 6 transaksi', !!ob1.id && !!ob2.id && !!ob3.id && !!ob4.id && !!ob5.id && !!ob6.id)

  const period = { from: iso(daysAgo(90)), to: iso(new Date()) }

  console.log('--- STEP 2: data sesuai database + 1 baris = 1 buku ---')
  const all = await reportService.getOverdueReport(period)
  const dbActive = await prisma.borrowDetail.count({
    where: { returnedAt: null, borrow: { returnDate: null, dueDate: { lt: new Date() } } }
  })
  check('summary.active == detail DB belum-kembali & due<now (3: ob1 + ob2×2)', all.summary.active === dbActive && dbActive === 3, `${all.summary.active}/${dbActive}`)
  const dbReturnedLate = await prisma.$queryRawUnsafe<Array<{ c: number }>>(`
    SELECT COUNT(*) AS c
    FROM BorrowDetail bd
    JOIN Borrow b ON b.id = bd.borrowId
    WHERE bd.returnedAt IS NOT NULL AND bd.returnedAt > b.dueDate
  `)
  check('summary.returned == detail DB returnedAt>due (3: ob3 + ob6×2)', all.summary.returned === Number(dbReturnedLate[0]?.c) && all.summary.returned === 3, `${all.summary.returned}/${Number(dbReturnedLate[0]?.c)}`)
  check('pagination.total == active + returned (6)', all.pagination.total === 6, String(all.pagination.total))
  check('rows.length == 6 (ob2 2 buku, ob6 2 buku)', all.rows.length === 6, String(all.rows.length))
  const allNumbers = all.rows.map((r) => r.borrowNumber).sort()
  check('baris membawa borrowNumber benar (ob1, ob2×2, ob3, ob6×2)', JSON.stringify(allNumbers) === JSON.stringify(['PJ-R4-0001', 'PJ-R4-0002', 'PJ-R4-0002', 'PJ-R4-0003', 'PJ-R4-0006', 'PJ-R4-0006']), JSON.stringify(allNumbers))
  check('ob4 (tepat waktu) & ob5 (belum lewat) TIDAK muncul', !allNumbers.includes('PJ-R4-0004') && !allNumbers.includes('PJ-R4-0005'), String(allNumbers.includes('PJ-R4-0004')))
  const rowOb1 = all.rows.find((r) => r.borrowNumber === 'PJ-R4-0001')
  check('baris membawa snapshot kolom benar (member, buku, tanggal pinjam/due)', rowOb1?.memberName === 'Dina Sari' && rowOb1?.memberNumber === 'R4-0001' && rowOb1?.bookTitle === 'Buku Alpha' && !!rowOb1?.borrowDate && !!rowOb1?.dueDate, JSON.stringify(rowOb1))
  check('kelas = snapshot saat pinjam (siswa → "X Merdeka 1")', rowOb1?.className === 'X Merdeka 1', String(rowOb1?.className))
  check('kelas guru/umum (tanpa enrollment) → null', all.rows.find((r) => r.borrowNumber === 'PJ-R4-0003')?.className === null, String(all.rows.find((r) => r.borrowNumber === 'PJ-R4-0003')?.className))

  console.log('--- STEP 3: status benar (hanya 2 nilai) ---')
  check('semua category valid (ACTIVE/RETURNED)', all.rows.every((r) => r.category === 'ACTIVE' || r.category === 'RETURNED'))
  const activeRows = all.rows.filter((r) => r.category === 'ACTIVE')
  const returnedRows = all.rows.filter((r) => r.category === 'RETURNED')
  check('active = ob1 + ob2×2 (3)', activeRows.length === 3 && activeRows.every((r) => ['PJ-R4-0001', 'PJ-R4-0002'].includes(r.borrowNumber)), String(activeRows.length))
  check('returned = ob3 + ob6×2 (3)', returnedRows.length === 3 && returnedRows.every((r) => ['PJ-R4-0003', 'PJ-R4-0006'].includes(r.borrowNumber)), String(returnedRows.length))
  check('active returnDate null', activeRows.every((r) => r.returnDate === null))
  check('returned returnDate terisi', returnedRows.every((r) => !!r.returnDate))

  console.log('--- STEP 4: hari terlambat benar (dihitung Service) ---')
  check('ob1 active lateDays = daysBetween(now, due -20) = 20', rowOb1?.lateDays === 20 && rowOb1?.lateDays === daysBetween(new Date(), daysAgo(20)), String(rowOb1?.lateDays))
  const ob2Rows = all.rows.filter((r) => r.borrowNumber === 'PJ-R4-0002')
  check('ob2 active lateDays = 5 (dua-duanya)', ob2Rows.length === 2 && ob2Rows.every((r) => r.lateDays === 5), JSON.stringify(ob2Rows.map((r) => r.lateDays)))
  const ob3Row = all.rows.find((r) => r.borrowNumber === 'PJ-R4-0003')
  check('ob3 returned lateDays = 4 (returned - due)', ob3Row?.lateDays === 4 && ob3Row?.lateDays === daysBetween(daysAgo(1), daysAgo(5)), String(ob3Row?.lateDays))
  const ob6Rows = all.rows.filter((r) => r.borrowNumber === 'PJ-R4-0006')
  check('ob6 returned lateDays = 2 (dua-duanya)', ob6Rows.length === 2 && ob6Rows.every((r) => r.lateDays === 2), JSON.stringify(ob6Rows.map((r) => r.lateDays)))

  console.log('--- STEP 5: statistik sesuai hasil filter ---')
  check('summary.active + summary.returned == pagination.total (3+3=6)', all.summary.active + all.summary.returned === all.pagination.total, `${all.summary.active}+${all.summary.returned}`)
  check('summary.active = 3, summary.returned = 3', all.summary.active === 3 && all.summary.returned === 3, JSON.stringify(all.summary))

  console.log('--- STEP 6: search server-side (R-4) ---')
  const sTitle = await reportService.getOverdueReport({ ...period, search: 'Alpha' })
  check('search judul "Alpha" → 3 baris (ob1, ob3, ob6#1)', sTitle.pagination.total === 3, String(sTitle.pagination.total))
  check('search "Alpha" → semua baris bertitel Alpha', sTitle.rows.every((r) => r.bookTitle.includes('Alpha')), String(sTitle.rows.map((r) => r.bookTitle).join(',')))
  check('search ikut memfilter summary (active 1, returned 2)', sTitle.summary.active === 1 && sTitle.summary.returned === 2, JSON.stringify(sTitle.summary))

  const sName = await reportService.getOverdueReport({ ...period, search: 'Dina' })
  check('search nama "Dina" → 3 baris (ob1 + ob6×2)', sName.pagination.total === 3 && sName.rows.every((r) => r.memberName === 'Dina Sari'), String(sName.pagination.total))

  const sMemberNumber = await reportService.getOverdueReport({ ...period, search: 'R4-0002' })
  check('search nomor anggota "R4-0002" → 2 baris (ob2×2)', sMemberNumber.pagination.total === 2, String(sMemberNumber.pagination.total))

  const sBorrowNumber = await reportService.getOverdueReport({ ...period, search: '0003' })
  check('search nomor transaksi "0003" → 1 (ob3)', sBorrowNumber.pagination.total === 1 && sBorrowNumber.rows[0].borrowNumber === 'PJ-R4-0003', String(sBorrowNumber.pagination.total))

  const sNone = await reportService.getOverdueReport({ ...period, search: 'TidakAda' })
  check('search tanpa match → 0 baris', sNone.pagination.total === 0 && sNone.rows.length === 0 && sNone.summary.active === 0 && sNone.summary.returned === 0, String(sNone.pagination.total))

  console.log('--- STEP 7: filter periode server-side (returned-late; active selalu tampil) ---')
  const narrow = await reportService.getOverdueReport({ from: iso(daysAgo(10)), to: iso(new Date()) })
  check('periode [10, now] → returned hanya ob3 (returnedAt 1 hari lalu); ob6 (28) keluar', narrow.summary.returned === 1 && narrow.rows.some((r) => r.borrowNumber === 'PJ-R4-0003') && !narrow.rows.some((r) => r.borrowNumber === 'PJ-R4-0006'), JSON.stringify(narrow.summary))
  check('active TIDAK dipengaruhi periode (tetap 3)', narrow.summary.active === 3, String(narrow.summary.active))
  check('total = 3 + 1 = 4', narrow.pagination.total === 4, String(narrow.pagination.total))
  const old = await reportService.getOverdueReport({ from: iso(daysAgo(90)), to: iso(daysAgo(20)) })
  const oldReturned = old.rows.filter((r) => r.category === 'RETURNED')
  check('periode [90, 20] → returned = ob6×2 (2, returnedAt 28 lalu); ob3 (1 lalu) keluar', old.summary.returned === 2 && oldReturned.length === 2 && oldReturned.every((r) => r.borrowNumber === 'PJ-R4-0006'), String(old.summary.returned))
  check('active tetap 3 walau periode lama (ongoing)', old.summary.active === 3, String(old.summary.active))
  const combined = await reportService.getOverdueReport({ from: iso(daysAgo(10)), to: iso(new Date()), search: 'Alpha' })
  check('search+periode → 2 (ob1 active + ob3 returned)', combined.pagination.total === 2 && combined.summary.active === 1 && combined.summary.returned === 1, JSON.stringify(combined.summary))

  console.log('--- STEP 8: pagination + skala ---')
  const bulkBorrows = Array.from({ length: 12 }, (_, i) => ({
    borrowNumber: `PJ-BULK-${String(i + 1).padStart(4, '0')}`,
    memberId: teacher.id,
    memberName: 'Budi Santoso',
    memberNumber: 'R4-0002',
    borrowDate: daysAgo(9),
    dueDate: daysAgo(2)
  }))
  await prisma.borrow.createMany({ data: bulkBorrows })
  const bulkBorrowRows = await prisma.borrow.findMany({ where: { borrowNumber: { startsWith: 'PJ-BULK-' } } })
  for (const b of bulkBorrowRows) {
    await prisma.borrowDetail.create({ data: { borrowId: b.id, bookCopyId: c6.id, bookTitle: 'Buku Gamma' } })
  }
  const p1 = await reportService.getOverdueReport({ ...period, page: 1, limit: 10 })
  check('bulk 12 active → total 18 baris (3+3+12)', p1.pagination.total === 18, String(p1.pagination.total))
  check('page 1 → 10 baris', p1.rows.length === 10, String(p1.rows.length))
  check('pagination.totalPages = 2', p1.pagination.totalPages === 2, String(p1.pagination.totalPages))
  const p2 = await reportService.getOverdueReport({ ...period, page: 2, limit: 10 })
  check('page 2 → 8 baris', p2.rows.length === 8, String(p2.rows.length))
  check('summary tetap utk periode (bukan per halaman) → active 15, returned 3', p2.summary.active === 15 && p2.summary.returned === 3, JSON.stringify(p2.summary))

  await prisma.$disconnect()

  console.log(`\nRESULT: ${pass} PASS, ${fail} FAIL`)
  if (fail > 0) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
