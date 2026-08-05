// R-2 — Smoke ReportService.getBorrowingReport (kontrak halaman Laporan Peminjaman).
// VALIDASI PO:
//   1. Periode (Dari/Sampai) server-side
//   2. Filter Status server-side
//   3. Statistik (summary) == Tabel (summary.total == pagination.total; 4 kartu dari summary)
//   4. Search server-side (borrowNumber / memberNumber / memberName / bookTitle) — baru R-2
//   5. Kelas dari SSOT Enrollment ACTIVE (snapshot className saat pinjam)
//   6. Status turunan ACTIVE/COMPLETED/OVERDUE benar
// Plus: boundary tanggal, pagination, 1 baris = 1 buku (multi-detail).
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

async function main(): Promise<void> {
  const prisma = getPrisma()
  await initDatabase()
  const reportService = new ReportService(new ReportRepository())

  console.log('--- STEP 0: seed master (AY, kurikulum, kelas, anggota, buku, eksemplar) ---')
  const ay1 = await prisma.academicYear.create({ data: { name: '2026/2027', startDate: new Date('2026-07-01'), endDate: new Date('2027-06-30'), isActive: true } })
  const cur = await prisma.curriculum.create({ data: { name: 'Kurikulum Merdeka' } })
  const classA = await prisma.class.create({ data: { academicYearId: ay1.id, curriculumId: cur.id, educationLevel: 'X', parallel: 'Merdeka 1' } })

  const student = await prisma.member.create({ data: { memberNumber: 'R2-0001', fullName: 'Dina Sari', memberType: 'student', gender: 'PEREMPUAN', status: 'ACTIVE' } })
  await prisma.memberEnrollment.create({ data: { memberId: student.id, classId: classA.id, academicYearId: ay1.id, status: 'ACTIVE' } })
  const teacher = await prisma.member.create({ data: { memberNumber: 'R2-0002', fullName: 'Budi Santoso', memberType: 'teacher', gender: 'LAKI_LAKI', status: 'ACTIVE' } })
  const general = await prisma.member.create({ data: { memberNumber: 'R2-0003', fullName: 'Citra Umum', memberType: 'general', status: 'INACTIVE' } })

  const cat1 = await prisma.category.create({ data: { code: 'CAT1', name: 'Fiksi' } })
  const cat2 = await prisma.category.create({ data: { code: 'CAT2', name: 'Nonfiksi' } })
  const author = await prisma.author.create({ data: { name: 'Pengarang A' } })
  const publisher = await prisma.publisher.create({ data: { name: 'Penerbit X' } })
  const book1 = await prisma.book.create({ data: { title: 'Buku Alpha', isbn: '978-1', authorId: author.id, publisherId: publisher.id, categoryId: cat1.id, publicationYear: 2020 } })
  const book2 = await prisma.book.create({ data: { title: 'Buku Beta', isbn: '978-2', categoryId: cat2.id, publicationYear: 2021 } })

  const mkCopy = (bookId: string, inv: string) =>
    prisma.bookCopy.create({ data: { bookId, inventoryNumber: inv, barcode: inv, shelfLocation: 'R1', status: 'AVAILABLE' } })
  const c1 = await mkCopy(book1.id, 'R2-INV-0001')
  const c2 = await mkCopy(book1.id, 'R2-INV-0002')
  const c3 = await mkCopy(book2.id, 'R2-INV-0003')
  const c4 = await mkCopy(book2.id, 'R2-INV-0004')
  check('seed master', !!ay1.id && !!classA.id && !!student.id && !!book1.id && !!c1.id)

  console.log('--- STEP 1: seed peminjaman (5 transaksi; br4 = 2 buku) ---')
  // br1: siswa, Buku Alpha, belum dikembalikan, due 10 hari lalu → OVERDUE; kelas snapshot 'X Merdeka 1' (dari SSOT enrollment).
  const br1 = await prisma.borrow.create({
    data: {
      borrowNumber: 'PJ-R2-0001', memberId: student.id, memberName: 'Dina Sari', memberNumber: 'R2-0001', className: 'X Merdeka 1',
      borrowDate: daysAgo(30), dueDate: daysAgo(10),
      details: { create: [{ bookCopyId: c1.id, bookTitle: 'Buku Alpha' }] }
    }
  })
  // br2: guru, Buku Alpha, dikembalikan sebelum due → COMPLETED.
  const br2 = await prisma.borrow.create({
    data: {
      borrowNumber: 'PJ-R2-0002', memberId: teacher.id, memberName: 'Budi Santoso', memberNumber: 'R2-0002',
      borrowDate: daysAgo(30), dueDate: daysAgo(15), returnDate: daysAgo(22),
      details: { create: [{ bookCopyId: c2.id, bookTitle: 'Buku Alpha', returnedAt: daysAgo(22), conditionBack: 'BAIK' }] }
    }
  })
  // br3: umum, Buku Alpha, dikembalikan TERLAMBAT (returnDate set) → COMPLETED (status COMPLETED menang).
  const br3 = await prisma.borrow.create({
    data: {
      borrowNumber: 'PJ-R2-0003', memberId: general.id, memberName: 'Citra Umum', memberNumber: 'R2-0003',
      borrowDate: daysAgo(25), dueDate: daysAgo(15), returnDate: daysAgo(3),
      details: { create: [{ bookCopyId: c1.id, bookTitle: 'Buku Alpha', returnedAt: daysAgo(3), conditionBack: 'BAIK' }] }
    }
  })
  // br4: siswa, 2 buku Buku Beta, belum dikembalikan, due 5 hari mendatang → ACTIVE. → 2 baris laporan.
  const br4 = await prisma.borrow.create({
    data: {
      borrowNumber: 'PJ-R2-0004', memberId: student.id, memberName: 'Dina Sari', memberNumber: 'R2-0001', className: 'X Merdeka 1',
      borrowDate: daysAgo(12), dueDate: daysAgo(-5),
      details: { create: [{ bookCopyId: c3.id, bookTitle: 'Buku Beta' }, { bookCopyId: c4.id, bookTitle: 'Buku Beta' }] }
    }
  })
  // br5: di LUAR periode (borrowDate 120 hari lalu) → tidak boleh muncul pada periode default.
  const br5 = await prisma.borrow.create({
    data: {
      borrowNumber: 'PJ-R2-0005', memberId: teacher.id, memberName: 'Budi Santoso', memberNumber: 'R2-0002',
      borrowDate: daysAgo(120), dueDate: daysAgo(100), returnDate: daysAgo(110),
      details: { create: [{ bookCopyId: c3.id, bookTitle: 'Buku Beta', returnedAt: daysAgo(110), conditionBack: 'BAIK' }] }
    }
  })
  check('seed: 5 transaksi', !!br1.id && !!br2.id && !!br3.id && !!br4.id && !!br5.id)

  const period = { from: iso(daysAgo(60)), to: iso(new Date()) }

  console.log('--- STEP 2: periode server-side ---')
  const all = await reportService.getBorrowingReport(period)
  check('periode 60 hari → total 4 transaksi (br5 keluar)', all.pagination.total === 4, String(all.pagination.total))
  check('1 baris per buku → rows 5 (br4 punya 2 buku)', all.rows.length === 5, String(all.rows.length))
  const allNumbers = all.rows.map((r) => r.borrowNumber).sort()
  check('baris membawa borrowNumber benar', JSON.stringify(allNumbers) === JSON.stringify(['PJ-R2-0001', 'PJ-R2-0002', 'PJ-R2-0003', 'PJ-R2-0004', 'PJ-R2-0004']), JSON.stringify(allNumbers))

  console.log('--- STEP 3: filter status server-side ---')
  // Kontrak R-1: filter ACTIVE = returnDate null (belum dikembalikan), MENCANGKUP
  // yang terlambat (badge per-baris tetap OVERDUE). OVERDUE = subset ACTIVE.
  const active = await reportService.getBorrowingReport({ ...period, status: 'ACTIVE' })
  check('status ACTIVE → 2 (br1 terbawa + br4); baris br1 berbadge OVERDUE', active.pagination.total === 2 && active.rows.find((r) => r.borrowNumber === 'PJ-R2-0001')?.status === 'OVERDUE' && active.rows.find((r) => r.borrowNumber === 'PJ-R2-0004')?.status === 'ACTIVE', String(active.pagination.total))
  const completed = await reportService.getBorrowingReport({ ...period, status: 'COMPLETED' })
  check('status COMPLETED → 2 (br2, br3)', completed.pagination.total === 2 && completed.rows.every((r) => r.status === 'COMPLETED'), String(completed.pagination.total))
  const overdue = await reportService.getBorrowingReport({ ...period, status: 'OVERDUE' })
  check('status OVERDUE → 1 (br1)', overdue.pagination.total === 1 && overdue.rows[0].borrowNumber === 'PJ-R2-0001', String(overdue.pagination.total))

  console.log('--- STEP 4: statistik == tabel ---')
  check('summary.total == pagination.total (4)', all.summary.total === all.pagination.total, String(all.summary.total))
  check('summary.active=2 (belum kembali: br1 + br4)', all.summary.active === 2, String(all.summary.active))
  check('summary.completed=2 (br2, br3)', all.summary.completed === 2, String(all.summary.completed))
  check('summary.overdue=1 (br1)', all.summary.overdue === 1, String(all.summary.overdue))
  check('4 kartu statistik: active+completed+overdue >= total', all.summary.active + all.summary.completed + all.summary.overdue >= all.summary.total)

  console.log('--- STEP 5: search server-side (R-2) ---')
  const sTitle = await reportService.getBorrowingReport({ ...period, search: 'Alpha' })
  check('search judul "Alpha" → 3 transaksi (br1, br2, br3)', sTitle.pagination.total === 3, String(sTitle.pagination.total))
  check('search "Alpha" → semua baris bertitel Alpha', sTitle.rows.every((r) => r.bookTitle.includes('Alpha')), String(sTitle.rows.map((r) => r.bookTitle).join(',')))
  check('search ikut memfilter summary.total', sTitle.summary.total === 3, String(sTitle.summary.total))
  check('search summary utk "Alpha": belum-kembali=1, kembali=2, terlambat=1', sTitle.summary.active === 1 && sTitle.summary.completed === 2 && sTitle.summary.overdue === 1, JSON.stringify(sTitle.summary))

  const sName = await reportService.getBorrowingReport({ ...period, search: 'Dina' })
  check('search nama "Dina" → 2 transaksi (br1, br4)', sName.pagination.total === 2, String(sName.pagination.total))

  const sNumber = await reportService.getBorrowingReport({ ...period, search: 'R2-0002' })
  check('search nomor anggota "R2-0002" → 1 (br2)', sNumber.pagination.total === 1 && sNumber.rows[0].memberName === 'Budi Santoso', String(sNumber.pagination.total))

  const sBorrowNumber = await reportService.getBorrowingReport({ ...period, search: '0003' })
  check('search nomor transaksi "0003" → 1 (br3)', sBorrowNumber.pagination.total === 1 && sBorrowNumber.rows[0].borrowNumber === 'PJ-R2-0003', String(sBorrowNumber.pagination.total))

  const sNone = await reportService.getBorrowingReport({ ...period, search: 'TidakAda' })
  check('search tanpa match → 0 transaksi', sNone.pagination.total === 0 && sNone.rows.length === 0, String(sNone.pagination.total))

  const sCombined = await reportService.getBorrowingReport({ ...period, search: 'Alpha', status: 'COMPLETED' })
  check('search + status COMPLETED → 2 (br2, br3)', sCombined.pagination.total === 2, String(sCombined.pagination.total))

  console.log('--- STEP 6: kelas dari SSOT Enrollment ACTIVE (snapshot saat pinjam) ---')
  const studentRow = all.rows.find((r) => r.borrowNumber === 'PJ-R2-0001')
  check('br1 (siswa) → className "X Merdeka 1"', studentRow?.className === 'X Merdeka 1', String(studentRow?.className))
  const teacherRow = all.rows.find((r) => r.borrowNumber === 'PJ-R2-0002')
  check('br2 (guru, tanpa enrollment) → className null', teacherRow?.className === null, String(teacherRow?.className))

  console.log('--- STEP 7: status turunan benar ---')
  const st1 = all.rows.find((r) => r.borrowNumber === 'PJ-R2-0001')
  check('br1 (open + due lalu) → OVERDUE', st1?.status === 'OVERDUE', String(st1?.status))
  const st2 = all.rows.find((r) => r.borrowNumber === 'PJ-R2-0002')
  check('br2 (kembali sebelum due) → COMPLETED', st2?.status === 'COMPLETED', String(st2?.status))
  const st3 = all.rows.find((r) => r.borrowNumber === 'PJ-R2-0003')
  check('br3 (kembali terlambat, returnDate set) → COMPLETED', st3?.status === 'COMPLETED', String(st3?.status))
  const st4 = all.rows.find((r) => r.borrowNumber === 'PJ-R2-0004')
  check('br4 (open + due depan) → ACTIVE', st4?.status === 'ACTIVE', String(st4?.status))

  console.log('--- STEP 8: boundary dari/sampai ---')
  const trimmed = await reportService.getBorrowingReport({ from: iso(daysAgo(60)), to: iso(daysAgo(26)) })
  check('periode [60,26] → hanya br1, br2 (br3 borrowDate 25 hari lalu keluar)', trimmed.pagination.total === 2, String(trimmed.pagination.total))
  const wide = await reportService.getBorrowingReport({ from: iso(daysAgo(150)), to: iso(new Date()) })
  check('periode [150, now] → 5 (br5 masuk)', wide.pagination.total === 5, String(wide.pagination.total))

  console.log('--- STEP 9: pagination + skala ---')
  const bulk = Array.from({ length: 12 }, (_, i) => ({
    borrowNumber: `PJ-BULK-${String(i + 1).padStart(4, '0')}`,
    memberId: teacher.id,
    memberName: 'Budi Santoso',
    memberNumber: 'R2-0002',
    borrowDate: daysAgo(10 - (i % 8)),
    dueDate: daysAgo(3),
    returnDate: daysAgo(2)
  }))
  await prisma.borrow.createMany({ data: bulk })
  const p1 = await reportService.getBorrowingReport({ ...period, page: 1, limit: 10 })
  check('bulk 12 → total 16 transaksi', p1.pagination.total === 16, String(p1.pagination.total))
  check('page 1 → 5 baris (hanya br1..br4 punya detail; rows = per buku)', p1.rows.length === 5, String(p1.rows.length))
  check('pagination.totalPages = 2', p1.pagination.totalPages === 2, String(p1.pagination.totalPages))
  const p2 = await reportService.getBorrowingReport({ ...period, page: 2, limit: 10 })
  check('page 2 → 0 baris (bulk tanpa detail)', p2.rows.length === 0, String(p2.rows.length))
  check('summary tetap utk periode (bukan per halaman)', p2.summary.total === 16 && p2.summary.completed === 14, JSON.stringify(p2.summary))

  await prisma.$disconnect()

  console.log(`\nRESULT: ${pass} PASS, ${fail} FAIL`)
  if (fail > 0) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
