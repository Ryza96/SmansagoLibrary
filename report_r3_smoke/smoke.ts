// R-3 — Smoke ReportService.getReturnReport (kontrak halaman Laporan Pengembalian).
// VALIDASI PO:
//   1. Data sesuai database (rows == BorrowDetail.returnedAt != null; snapshot kolom benar)
//   2. Lama Pinjam benar (durationDays == returnedAt - borrowDate dalam hari)
//   3. Status Tepat Waktu / Terlambat benar (returnedAt vs dueDate)
//   4. Search berjalan (server-side: borrowNumber / memberNumber / memberName / bookTitle)
//   5. Filter periode berjalan (server-side, boundary)
//   6. Statistik sesuai hasil filter (summary.total == pagination.total == rows; onTime + late == total)
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

  const student = await prisma.member.create({ data: { memberNumber: 'R3-0001', fullName: 'Dina Sari', memberType: 'student', gender: 'PEREMPUAN', status: 'ACTIVE' } })
  await prisma.memberEnrollment.create({ data: { memberId: student.id, classId: classA.id, academicYearId: ay1.id, status: 'ACTIVE' } })
  const teacher = await prisma.member.create({ data: { memberNumber: 'R3-0002', fullName: 'Budi Santoso', memberType: 'teacher', gender: 'LAKI_LAKI', status: 'ACTIVE' } })
  const general = await prisma.member.create({ data: { memberNumber: 'R3-0003', fullName: 'Citra Umum', memberType: 'general', gender: 'PEREMPUAN', status: 'INACTIVE' } })

  const cat1 = await prisma.category.create({ data: { code: 'CAT1', name: 'Fiksi' } })
  const cat2 = await prisma.category.create({ data: { code: 'CAT2', name: 'Nonfiksi' } })
  const author = await prisma.author.create({ data: { name: 'Pengarang A' } })
  const publisher = await prisma.publisher.create({ data: { name: 'Penerbit X' } })
  const book1 = await prisma.book.create({ data: { title: 'Buku Alpha', isbn: '978-1', authorId: author.id, publisherId: publisher.id, categoryId: cat1.id, publicationYear: 2020 } })
  const book2 = await prisma.book.create({ data: { title: 'Buku Beta', isbn: '978-2', categoryId: cat2.id, publicationYear: 2021 } })
  const book3 = await prisma.book.create({ data: { title: 'Buku Gamma', isbn: '978-3', categoryId: cat2.id, publicationYear: 2022 } })
  const book4 = await prisma.book.create({ data: { title: 'Buku Delta', isbn: '978-4', categoryId: cat1.id, publicationYear: 2023 } })

  const mkCopy = (bookId: string, inv: string) =>
    prisma.bookCopy.create({ data: { bookId, inventoryNumber: inv, barcode: inv, shelfLocation: 'R1', status: 'AVAILABLE' } })
  const c1 = await mkCopy(book1.id, 'R3-INV-0001')
  const c2 = await mkCopy(book2.id, 'R3-INV-0002')
  const c3 = await mkCopy(book1.id, 'R3-INV-0003')
  const c4 = await mkCopy(book3.id, 'R3-INV-0004')
  const c5 = await mkCopy(book4.id, 'R3-INV-0005')
  check('seed master', !!ay1.id && !!classA.id && !!student.id && !!book1.id && !!c1.id)

  console.log('--- STEP 1: seed peminjaman (6 transaksi; rt6 = 2 buku; rt4 BELUM kembali) ---')
  // rt1: siswa, Buku Alpha, dikembalikan SEBELUM due → TEPAT WAKTU. Kelas snapshot 'X Merdeka 1'.
  const rt1 = await prisma.borrow.create({
    data: {
      borrowNumber: 'PJ-R3-0001', memberId: student.id, memberName: 'Dina Sari', memberNumber: 'R3-0001', className: 'X Merdeka 1',
      borrowDate: daysAgo(25), dueDate: daysAgo(10), returnDate: daysAgo(12),
      details: { create: [{ bookCopyId: c1.id, bookTitle: 'Buku Alpha', returnedAt: daysAgo(12), conditionBack: 'BAIK' }] }
    }
  })
  // rt2: guru, Buku Beta, dikembalikan TERLAMBAT 4 hari.
  const rt2 = await prisma.borrow.create({
    data: {
      borrowNumber: 'PJ-R3-0002', memberId: teacher.id, memberName: 'Budi Santoso', memberNumber: 'R3-0002',
      borrowDate: daysAgo(20), dueDate: daysAgo(5), returnDate: daysAgo(1),
      details: { create: [{ bookCopyId: c2.id, bookTitle: 'Buku Beta', returnedAt: daysAgo(1), conditionBack: 'RUSAK' }] }
    }
  })
  // rt3: umum, Buku Alpha, dikembalikan TERLAMBAT 5 hari.
  const rt3 = await prisma.borrow.create({
    data: {
      borrowNumber: 'PJ-R3-0003', memberId: general.id, memberName: 'Citra Umum', memberNumber: 'R3-0003',
      borrowDate: daysAgo(15), dueDate: daysAgo(8), returnDate: daysAgo(3),
      details: { create: [{ bookCopyId: c3.id, bookTitle: 'Buku Alpha', returnedAt: daysAgo(3), conditionBack: 'HILANG' }] }
    }
  })
  // rt4: siswa, Buku Gamma, BELUM dikembalikan (returnedAt null) → TIDAK masuk laporan pengembalian.
  const rt4 = await prisma.borrow.create({
    data: {
      borrowNumber: 'PJ-R3-0004', memberId: student.id, memberName: 'Dina Sari', memberNumber: 'R3-0001', className: 'X Merdeka 1',
      borrowDate: daysAgo(10), dueDate: daysAgo(3),
      details: { create: [{ bookCopyId: c4.id, bookTitle: 'Buku Gamma' }] }
    }
  })
  // rt5: guru, Buku Delta, dikembalikan SEBELUM due (returnedAt 23 hari lalu vs due 22) → TEPAT WAKTU.
  const rt5 = await prisma.borrow.create({
    data: {
      borrowNumber: 'PJ-R3-0005', memberId: teacher.id, memberName: 'Budi Santoso', memberNumber: 'R3-0002',
      borrowDate: daysAgo(30), dueDate: daysAgo(22), returnDate: daysAgo(23),
      details: { create: [{ bookCopyId: c5.id, bookTitle: 'Buku Delta', returnedAt: daysAgo(23), conditionBack: 'BAIK' }] }
    }
  })
  // rt6: siswa, 2 buku (Gamma + Delta), dikembalikan SEBELUM due → 2 baris TEPAT WAKTU.
  const rt6 = await prisma.borrow.create({
    data: {
      borrowNumber: 'PJ-R3-0006', memberId: student.id, memberName: 'Dina Sari', memberNumber: 'R3-0001', className: 'X Merdeka 1',
      borrowDate: daysAgo(9), dueDate: daysAgo(3), returnDate: daysAgo(5),
      details: {
        create: [
          { bookCopyId: c4.id, bookTitle: 'Buku Gamma', returnedAt: daysAgo(5), conditionBack: 'BAIK' },
          { bookCopyId: c5.id, bookTitle: 'Buku Delta', returnedAt: daysAgo(5), conditionBack: 'BAIK' }
        ]
      }
    }
  })
  check('seed: 6 transaksi', !!rt1.id && !!rt2.id && !!rt3.id && !!rt4.id && !!rt5.id && !!rt6.id)

  const period = { from: iso(daysAgo(60)), to: iso(new Date()) }

  console.log('--- STEP 2: data sesuai database + 1 baris = 1 buku ---')
  const all = await reportService.getReturnReport(period)
  const dbReturned = await prisma.borrowDetail.count({ where: { returnedAt: { not: null } } })
  check('rows == jumlah detail dikembalikan di DB (6)', all.rows.length === dbReturned && dbReturned === 6, `${all.rows.length}/${dbReturned}`)
  check('pagination.total == 6 (1 baris per buku; rt6 punya 2)', all.pagination.total === 6, String(all.pagination.total))
  const allNumbers = all.rows.map((r) => r.borrowNumber).sort()
  check('baris membawa borrowNumber benar (rt1, rt2, rt3, rt5, rt6×2)', JSON.stringify(allNumbers) === JSON.stringify(['PJ-R3-0001', 'PJ-R3-0002', 'PJ-R3-0003', 'PJ-R3-0005', 'PJ-R3-0006', 'PJ-R3-0006']), JSON.stringify(allNumbers))
  check('rt4 (belum kembali) TIDAK muncul', !allNumbers.includes('PJ-R3-0004'), String(allNumbers.includes('PJ-R3-0004')))
  const rowRt2 = all.rows.find((r) => r.borrowNumber === 'PJ-R3-0002')
  check('baris membawa snapshot kolom benar (member, buku, tanggal kembali)', rowRt2?.memberName === 'Budi Santoso' && rowRt2?.memberNumber === 'R3-0002' && rowRt2?.bookTitle === 'Buku Beta' && !!rowRt2?.returnedAt, JSON.stringify(rowRt2))
  const rowRt1 = all.rows.find((r) => r.borrowNumber === 'PJ-R3-0001')
  check('kelas = snapshot saat pinjam (siswa → "X Merdeka 1")', rowRt1?.className === 'X Merdeka 1', String(rowRt1?.className))
  check('kelas guru/umum (tanpa enrollment) → null', rowRt2?.className === null, String(rowRt2?.className))

  console.log('--- STEP 3: lama pinjam (durationDays) benar ---')
  const dur = (bn: string) => all.rows.find((r) => r.borrowNumber === bn)?.durationDays
  check('rt1 duration 13 (25−12)', dur('PJ-R3-0001') === 13, String(dur('PJ-R3-0001')))
  check('rt2 duration 19 (20−1)', dur('PJ-R3-0002') === 19, String(dur('PJ-R3-0002')))
  check('rt3 duration 12 (15−3)', dur('PJ-R3-0003') === 12, String(dur('PJ-R3-0003')))
  check('rt5 duration 7 (30−23)', dur('PJ-R3-0005') === 7, String(dur('PJ-R3-0005')))
  check('rt6 duration 4 (9−5)', all.rows.filter((r) => r.borrowNumber === 'PJ-R3-0006').every((r) => r.durationDays === 4), String(all.rows.filter((r) => r.borrowNumber === 'PJ-R3-0006').map((r) => r.durationDays).join(',')))
  const rowRt3 = all.rows.find((r) => r.borrowNumber === 'PJ-R3-0003')
  check('durationDays konsisten dgn daysBetween(returned, borrow)', rowRt3?.durationDays === daysBetween(daysAgo(3), daysAgo(15)), String(rowRt3?.durationDays))

  console.log('--- STEP 4: status Tepat Waktu / Terlambat benar ---')
  const st = (bn: string) => all.rows.find((r) => r.borrowNumber === bn)
  check('rt1 → ON_TIME + lateDays null', st('PJ-R3-0001')?.status === 'ON_TIME' && st('PJ-R3-0001')?.lateDays === null, String(st('PJ-R3-0001')?.status))
  check('rt2 → LATE + lateDays 4', st('PJ-R3-0002')?.status === 'LATE' && st('PJ-R3-0002')?.lateDays === 4, `${st('PJ-R3-0002')?.status}/${st('PJ-R3-0002')?.lateDays}`)
  check('rt3 → LATE + lateDays 5', st('PJ-R3-0003')?.status === 'LATE' && st('PJ-R3-0003')?.lateDays === 5, `${st('PJ-R3-0003')?.status}/${st('PJ-R3-0003')?.lateDays}`)
  check('rt5 → ON_TIME (dikembalikan sebelum due)', st('PJ-R3-0005')?.status === 'ON_TIME', String(st('PJ-R3-0005')?.status))
  check('rt6 → ON_TIME (dua-duanya)', all.rows.filter((r) => r.borrowNumber === 'PJ-R3-0006').every((r) => r.status === 'ON_TIME'), String(all.rows.filter((r) => r.borrowNumber === 'PJ-R3-0006').map((r) => r.status).join(',')))

  console.log('--- STEP 5: statistik sesuai hasil filter ---')
  check('summary.total == pagination.total == rows.length (6)', all.summary.total === all.pagination.total && all.summary.total === all.rows.length, String(all.summary.total))
  check('summary.onTime=4 (rt1, rt5, rt6×2)', all.summary.onTime === 4, String(all.summary.onTime))
  check('summary.late=2 (rt2, rt3)', all.summary.late === 2, String(all.summary.late))
  check('onTime + late == total', all.summary.onTime + all.summary.late === all.summary.total, `${all.summary.onTime}+${all.summary.late}`)
  check('kondisi BAIK=4 RUSAK=1 HILANG=1', all.summary.returnedGood === 4 && all.summary.returnedDamaged === 1 && all.summary.returnedLost === 1, JSON.stringify(all.summary))

  console.log('--- STEP 6: search server-side (R-3) ---')
  const sTitle = await reportService.getReturnReport({ ...period, search: 'Alpha' })
  check('search judul "Alpha" → 2 baris (rt1, rt3)', sTitle.pagination.total === 2, String(sTitle.pagination.total))
  check('search "Alpha" → semua baris bertitel Alpha', sTitle.rows.every((r) => r.bookTitle.includes('Alpha')), String(sTitle.rows.map((r) => r.bookTitle).join(',')))
  check('search ikut memfilter summary.total', sTitle.summary.total === 2, String(sTitle.summary.total))
  check('search "Alpha" → summary onTime=1 late=1', sTitle.summary.onTime === 1 && sTitle.summary.late === 1, JSON.stringify(sTitle.summary))
  check('search "Alpha" → kondisi HILANG=1 (rt3)', sTitle.summary.returnedLost === 1 && sTitle.summary.returnedGood === 1, JSON.stringify(sTitle.summary))

  const sName = await reportService.getReturnReport({ ...period, search: 'Dina' })
  check('search nama "Dina" → 3 baris (rt1 + rt6×2)', sName.pagination.total === 3, String(sName.pagination.total))

  const sMemberNumber = await reportService.getReturnReport({ ...period, search: 'R3-0002' })
  check('search nomor anggota "R3-0002" → 2 baris (rt2, rt5)', sMemberNumber.pagination.total === 2, String(sMemberNumber.pagination.total))

  const sBorrowNumber = await reportService.getReturnReport({ ...period, search: '0005' })
  check('search nomor transaksi "0005" → 1 (rt5)', sBorrowNumber.pagination.total === 1 && sBorrowNumber.rows[0].borrowNumber === 'PJ-R3-0005', String(sBorrowNumber.pagination.total))

  const sNone = await reportService.getReturnReport({ ...period, search: 'TidakAda' })
  check('search tanpa match → 0 baris', sNone.pagination.total === 0 && sNone.rows.length === 0, String(sNone.pagination.total))

  console.log('--- STEP 7: filter periode server-side (boundary) ---')
  const trimmed = await reportService.getReturnReport({ from: iso(daysAgo(60)), to: iso(daysAgo(15)) })
  check('periode [60,15] → hanya rt5 (returnedAt 23 hari lalu)', trimmed.pagination.total === 1 && trimmed.rows[0].borrowNumber === 'PJ-R3-0005', `${trimmed.pagination.total}/${trimmed.rows[0]?.borrowNumber}`)
  const narrow = await reportService.getReturnReport({ from: iso(daysAgo(14)), to: iso(new Date()) })
  check('periode [14, now] → 5 baris (rt5 keluar)', narrow.pagination.total === 5 && !narrow.rows.some((r) => r.borrowNumber === 'PJ-R3-0005'), String(narrow.pagination.total))

  console.log('--- STEP 8: pagination + skala ---')
  const bulkBorrows = Array.from({ length: 12 }, (_, i) => ({
    borrowNumber: `PJ-BULK-${String(i + 1).padStart(4, '0')}`,
    memberId: teacher.id,
    memberName: 'Budi Santoso',
    memberNumber: 'R3-0002',
    borrowDate: daysAgo(8 - (i % 7)),
    dueDate: daysAgo(1),
    returnDate: daysAgo(2)
  }))
  await prisma.borrow.createMany({ data: bulkBorrows })
  const bulkBorrowRows = await prisma.borrow.findMany({ where: { borrowNumber: { startsWith: 'PJ-BULK-' } } })
  for (const b of bulkBorrowRows) {
    await prisma.borrowDetail.create({
      data: { borrowId: b.id, bookCopyId: c2.id, bookTitle: 'Buku Beta', returnedAt: daysAgo(2), conditionBack: 'BAIK' }
    })
  }
  const p1 = await reportService.getReturnReport({ ...period, page: 1, limit: 10 })
  check('bulk 12 → total 18 baris', p1.pagination.total === 18, String(p1.pagination.total))
  check('page 1 → 10 baris', p1.rows.length === 10, String(p1.rows.length))
  check('pagination.totalPages = 2', p1.pagination.totalPages === 2, String(p1.pagination.totalPages))
  const p2 = await reportService.getReturnReport({ ...period, page: 2, limit: 10 })
  check('page 2 → 8 baris', p2.rows.length === 8, String(p2.rows.length))
  check('summary tetap utk periode (bukan per halaman) → total 18, onTime 16, late 2', p2.summary.total === 18 && p2.summary.onTime === 16 && p2.summary.late === 2, JSON.stringify(p2.summary))

  await prisma.$disconnect()

  console.log(`\nRESULT: ${pass} PASS, ${fail} FAIL`)
  if (fail > 0) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
