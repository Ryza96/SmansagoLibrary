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

function dayFromNow(n: number, hour = 10, minute = 0): Date {
  const d = new Date()
  d.setDate(d.getDate() + n)
  d.setHours(hour, minute, 0, 0)
  return d
}

function daysBetween(later: Date, earlier: Date): number {
  const a = new Date(later)
  a.setHours(0, 0, 0, 0)
  const b = new Date(earlier)
  b.setHours(0, 0, 0, 0)
  return Math.floor((a.getTime() - b.getTime()) / 86_400_000)
}

async function main(): Promise<void> {
  const prisma = getPrisma()
  await initDatabase()
  const service = new ReportService(new ReportRepository())

  console.log('--- STEP 0: seed master + peminjaman (5 skenario deterministik) ---')
  const ay = await prisma.academicYear.create({ data: { name: 'RS/2026', startDate: dayFromNow(-365), endDate: dayFromNow(365), isActive: true } })
  const cur = await prisma.curriculum.create({ data: { name: 'Kurikulum Merdeka' } })
  const classA = await prisma.class.create({ data: { academicYearId: ay.id, curriculumId: cur.id, educationLevel: 'X', parallel: 'Merdeka 1' } })

  const student = await prisma.member.create({ data: { memberNumber: 'S-000001', fullName: 'Dina Sari', memberType: 'student', gender: 'PEREMPUAN', status: 'ACTIVE' } })
  await prisma.memberEnrollment.create({ data: { memberId: student.id, classId: classA.id, academicYearId: ay.id, status: 'ACTIVE' } })
  const teacher = await prisma.member.create({ data: { memberNumber: 'G-000001', fullName: 'Budi Santoso', memberType: 'teacher', gender: 'LAKI_LAKI', status: 'ACTIVE' } })
  const general = await prisma.member.create({ data: { memberNumber: 'U-000001', fullName: 'Citra Umum', memberType: 'general', gender: 'PEREMPUAN', status: 'ACTIVE' } })

  const cat1 = await prisma.category.create({ data: { code: 'FIK', name: 'Fiksi' } })
  const cat2 = await prisma.category.create({ data: { code: 'NFI', name: 'Nonfiksi' } })
  const author = await prisma.author.create({ data: { name: 'Pengarang A' } })
  const publisher = await prisma.publisher.create({ data: { name: 'Penerbit X' } })
  const book1 = await prisma.book.create({ data: { title: 'Buku Alpha', isbn: '978-A', authorId: author.id, publisherId: publisher.id, categoryId: cat1.id, publicationYear: 2020 } })
  const book2 = await prisma.book.create({ data: { title: 'Buku Beta', isbn: '978-B', categoryId: cat2.id, publicationYear: 2021 } })

  const mkCopy = (bookId: string, inv: string, status: string, cost: number) =>
    prisma.bookCopy.create({ data: { bookId, inventoryNumber: inv, barcode: inv, shelfLocation: 'R1', status, acquisitionCost: cost, condition: 'GOOD' } })
  const c1 = await mkCopy(book1.id, 'S-INV-0001', 'BORROWED', 10000)
  const c2 = await mkCopy(book1.id, 'S-INV-0002', 'AVAILABLE', 15000)
  const c3 = await mkCopy(book2.id, 'S-INV-0003', 'LOST', 30000)
  const c4 = await mkCopy(book2.id, 'S-INV-0004', 'AVAILABLE', 25000)
  check('seed master', !!ay.id && !!classA.id && !!student.id && !!book1.id && !!c1.id && !!cat1.id)

  // b1: AKTIF TERLAMBAT (due -20, belum kembali)
  const b1 = await prisma.borrow.create({
    data: {
      borrowNumber: 'PJ-S-0001', memberId: student.id, memberName: 'Dina Sari', memberNumber: 'S-000001', className: 'X Merdeka 1',
      borrowDate: dayFromNow(-30), dueDate: dayFromNow(-20),
      details: { create: [{ bookCopyId: c1.id, bookTitle: 'Buku Alpha' }] }
    }
  })
  // b2: KEMBALI TEPAT WAKTU (returnedAt = due - 2)
  const b2 = await prisma.borrow.create({
    data: {
      borrowNumber: 'PJ-S-0002', memberId: teacher.id, memberName: 'Budi Santoso', memberNumber: 'G-000001',
      borrowDate: dayFromNow(-25), dueDate: dayFromNow(-10), returnDate: dayFromNow(-12),
      details: { create: [{ bookCopyId: c2.id, bookTitle: 'Buku Alpha', returnedAt: dayFromNow(-12), conditionBack: 'BAIK' }] }
    }
  })
  // b3: KEMBALI TERLAMBAT 4 hari (returnedAt = due + 4)
  const b3 = await prisma.borrow.create({
    data: {
      borrowNumber: 'PJ-S-0003', memberId: general.id, memberName: 'Citra Umum', memberNumber: 'U-000001',
      borrowDate: dayFromNow(-20), dueDate: dayFromNow(-5), returnDate: dayFromNow(-1),
      details: { create: [{ bookCopyId: c3.id, bookTitle: 'Buku Beta', returnedAt: dayFromNow(-1), conditionBack: 'RUSAK' }] }
    }
  })
  // b4: AKTIF TIDAK TERLAMBAT (due +5)
  const b4 = await prisma.borrow.create({
    data: {
      borrowNumber: 'PJ-S-0004', memberId: general.id, memberName: 'Citra Umum', memberNumber: 'U-000001',
      borrowDate: dayFromNow(-7), dueDate: dayFromNow(5),
      details: { create: [{ bookCopyId: c4.id, bookTitle: 'Buku Beta' }] }
    }
  })
  // b5: KEMBALI TERLAMBAT 5 hari, 2 BUKU (HILANG + BAIK)
  const b5 = await prisma.borrow.create({
    data: {
      borrowNumber: 'PJ-S-0005', memberId: teacher.id, memberName: 'Budi Santoso', memberNumber: 'G-000001',
      borrowDate: dayFromNow(-15), dueDate: dayFromNow(-8), returnDate: dayFromNow(-3),
      details: {
        create: [
          { bookCopyId: c1.id, bookTitle: 'Buku Alpha', returnedAt: dayFromNow(-3), conditionBack: 'HILANG' },
          { bookCopyId: c2.id, bookTitle: 'Buku Alpha', returnedAt: dayFromNow(-3), conditionBack: 'BAIK' }
        ]
      }
    }
  })
  check('seed peminjaman', !!b1.id && !!b2.id && !!b3.id && !!b4.id && !!b5.id)

  const from = dayFromNow(-90)
  const to = dayFromNow(0)

  console.log('--- STEP 1: Laporan Peminjaman (Service) ---')
  const borrowReport = await service.getBorrowingReport({ from: from.toISOString(), to: to.toISOString() })
  check('total baris = 6 (b5 punya 2 buku)', borrowReport.rows.length === 6, String(borrowReport.rows.length))
  check('summary.total = 5 transaksi', borrowReport.summary.total === 5, String(borrowReport.summary.total))
  check('summary active = 2 (b1, b4)', borrowReport.summary.active === 2, String(borrowReport.summary.active))
  check('summary completed = 3 (b2, b3, b5)', borrowReport.summary.completed === 3, String(borrowReport.summary.completed))
  check('summary overdue = 1 (b1)', borrowReport.summary.overdue === 1, String(borrowReport.summary.overdue))
  const activeRow = borrowReport.rows.find((r) => r.borrowNumber === 'PJ-S-0001')
  check('b1 → status OVERDUE', activeRow?.status === 'OVERDUE', String(activeRow?.status))
  const completedRow = borrowReport.rows.find((r) => r.borrowNumber === 'PJ-S-0002')
  check('b2 → status COMPLETED + returnDate terisi', completedRow?.status === 'COMPLETED' && !!completedRow?.returnDate, JSON.stringify(completedRow))
  const onTimeRow = borrowReport.rows.find((r) => r.borrowNumber === 'PJ-S-0004')
  check('b4 → status ACTIVE (due belum lewat)', onTimeRow?.status === 'ACTIVE', String(onTimeRow?.status))
  const b5Rows = borrowReport.rows.filter((r) => r.borrowNumber === 'PJ-S-0005')
  check('b5 → 2 baris buku', b5Rows.length === 2, String(b5Rows.length))
  check('baris bawa member + kelas', !!activeRow?.memberNumber && activeRow.memberName === 'Dina Sari' && activeRow.className === 'X Merdeka 1', JSON.stringify(activeRow))

  const compFilter = await service.getBorrowingReport({ from: from.toISOString(), to: to.toISOString(), status: 'COMPLETED' })
  check('filter status COMPLETED → 4 baris (b2+b3+b5×2)', compFilter.rows.length === 4, String(compFilter.rows.length))
  check('filter COMPLETED → tiap baris COMPLETED', compFilter.rows.every((r) => r.status === 'COMPLETED'))
  const actFilter = await service.getBorrowingReport({ from: from.toISOString(), to: to.toISOString(), status: 'ACTIVE' })
  check('filter status ACTIVE → 2 baris (b1, b4)', actFilter.rows.length === 2, String(actFilter.rows.length))
  const overFilter = await service.getBorrowingReport({ from: from.toISOString(), to: to.toISOString(), status: 'OVERDUE' })
  check('filter status OVERDUE → 1 baris (b1)', overFilter.rows.length === 1 && overFilter.rows[0].borrowNumber === 'PJ-S-0001', String(overFilter.rows.length))

  const rangeFilter = await service.getBorrowingReport({ from: dayFromNow(-30).toISOString(), to: dayFromNow(-10).toISOString() })
  check('rentang [-30,-10] → 4 transaksi, 5 baris (b4 di-exclude)', rangeFilter.rows.length === 5 && rangeFilter.summary.total === 4, `${rangeFilter.rows.length}/${rangeFilter.summary.total}`)
  check('pagination passthrough (limit default 10 → totalPages 1)', borrowReport.pagination.page === 1 && borrowReport.pagination.total === 5 && borrowReport.pagination.totalPages === 1, JSON.stringify(borrowReport.pagination))

  console.log('--- STEP 2: Laporan Pengembalian (Service) ---')
  const returnReport = await service.getReturnReport({ from: from.toISOString(), to: to.toISOString() })
  check('4 detail kembali (b2, b3, b5×2)', returnReport.rows.length === 4, String(returnReport.rows.length))
  check('summary.total = 4', returnReport.summary.total === 4, String(returnReport.summary.total))
  check('kondisi BAIK=2 (b2, b5#2)', returnReport.summary.returnedGood === 2, String(returnReport.summary.returnedGood))
  check('kondisi RUSAK=1 (b3)', returnReport.summary.returnedDamaged === 1, String(returnReport.summary.returnedDamaged))
  check('kondisi HILANG=1 (b5#1)', returnReport.summary.returnedLost === 1, String(returnReport.summary.returnedLost))
  const b2Return = returnReport.rows.find((r) => r.borrowNumber === 'PJ-S-0002')
  check('b2 tepat waktu → lateDays null', b2Return?.lateDays === null, String(b2Return?.lateDays))
  const b3Return = returnReport.rows.find((r) => r.borrowNumber === 'PJ-S-0003')
  check('b3 telat → lateDays 4', b3Return?.lateDays === 4, String(b3Return?.lateDays))
  const b5Returns = returnReport.rows.filter((r) => r.borrowNumber === 'PJ-S-0005')
  check('b5 telat → lateDays 5 (dua-duanya)', b5Returns.length === 2 && b5Returns.every((r) => r.lateDays === 5), JSON.stringify(b5Returns.map((r) => r.lateDays)))
  check('baris bawa tanggal ISO', !!b3Return?.borrowDate && !!b3Return?.returnedAt && b3Return.returnedAt > b3Return.dueDate)

  console.log('--- STEP 3: Laporan Keterlambatan (Service) ---')
  const overdueReport = await service.getOverdueReport({ from: from.toISOString(), to: to.toISOString() })
  check('ACTIVE overdue = 1 (b1)', overdueReport.summary.active === 1, String(overdueReport.summary.active))
  check('RETURNED late = 3 (b3, b5×2)', overdueReport.summary.returned === 3, String(overdueReport.summary.returned))
  check('total baris = 4', overdueReport.rows.length === 4, String(overdueReport.rows.length))
  const activeOverdueRow = overdueReport.rows.find((r) => r.category === 'ACTIVE')
  check('b1 category ACTIVE + lateDays 20', activeOverdueRow?.category === 'ACTIVE' && activeOverdueRow?.lateDays === 20, JSON.stringify(activeOverdueRow))
  const returnedLateRows = overdueReport.rows.filter((r) => r.category === 'RETURNED')
  check('returned late 4/5/5', JSON.stringify(returnedLateRows.map((r) => r.lateDays).sort((a, b) => a - b)) === JSON.stringify([4, 5, 5]), JSON.stringify(returnedLateRows.map((r) => r.lateDays)))
  check('row returned membawa returnDate', returnedLateRows.every((r) => !!r.returnDate))
  check('summary.pagination.total = 4', overdueReport.pagination.total === 4, String(overdueReport.pagination.total))

  console.log('--- STEP 4: Laporan Anggota (Service) ---')
  const memberReport = await service.getMemberReport({})
  check('3 anggota', memberReport.rows.length === 3, String(memberReport.rows.length))
  const studentRow = memberReport.rows.find((r) => r.memberNumber === 'S-000001')
  check('student className dari enrollment ACTIVE = X Merdeka 1', studentRow?.className === 'X Merdeka 1', String(studentRow?.className))
  const teacherRow = memberReport.rows.find((r) => r.memberNumber === 'G-000001')
  check('teacher className null', teacherRow?.className === null, String(teacherRow?.className))
  check('summary student=1 teacher=1 general=1', memberReport.summary.students === 1 && memberReport.summary.teachers === 1 && memberReport.summary.general === 1, JSON.stringify(memberReport.summary))
  check('row membawa status + kontak', teacherRow?.status === 'ACTIVE' && !!teacherRow?.fullName && teacherRow.fullName === 'Budi Santoso')
  const typeFilter = await service.getMemberReport({ memberType: 'teacher' })
  check('filter memberType=teacher → 1 baris', typeFilter.rows.length === 1 && typeFilter.rows[0].memberNumber === 'G-000001', String(typeFilter.rows.length))
  const classFilter = await service.getMemberReport({ classId: classA.id })
  check('filter classId → hanya student', classFilter.rows.length === 1 && classFilter.rows[0].memberNumber === 'S-000001', String(classFilter.rows.length))
  const searchFilter = await service.getMemberReport({ search: 'Citra' })
  check('search → Citra', searchFilter.rows.length === 1 && searchFilter.rows[0].fullName === 'Citra Umum', String(searchFilter.rows.length))

  console.log('--- STEP 5: Laporan Koleksi (Service) ---')
  const collReport = await service.getCollectionReport({})
  check('2 judul', collReport.rows.length === 2, String(collReport.rows.length))
  const alpha = collReport.rows.find((r) => r.title === 'Buku Alpha')
  check('Alpha copyCount 2 + relasi nama', alpha?.copyCount === 2 && alpha?.authorName === 'Pengarang A' && alpha?.publisherName === 'Penerbit X' && alpha?.categoryName === 'Fiksi', JSON.stringify(alpha))
  const beta = collReport.rows.find((r) => r.title === 'Buku Beta')
  check('Beta tanpa author → authorName null', beta?.authorName === null, String(beta?.authorName))
  check('summary totalTitles 2 / totalCopies 4', collReport.summary.totalTitles === 2 && collReport.summary.totalCopies === 4, JSON.stringify(collReport.summary))
  check('summary totalAssetValue = 80000', collReport.summary.totalAssetValue === 80000, String(collReport.summary.totalAssetValue))
  const statusMap = new Map(collReport.summary.byStatus.map((s) => [s.status, s.count]))
  check('byStatus AVAILABLE=2 BORROWED=1 LOST=1', statusMap.get('AVAILABLE') === 2 && statusMap.get('BORROWED') === 1 && statusMap.get('LOST') === 1, JSON.stringify(collReport.summary.byStatus))
  const condMap = new Map(collReport.summary.byCondition.map((c) => [c.condition, c.count]))
  check('byCondition GOOD=4', condMap.get('GOOD') === 4, JSON.stringify(collReport.summary.byCondition))
  const catFilter = await service.getCollectionReport({ categoryId: cat1.id })
  check('filter kategori Fiksi → 1 judul, copies 2, asset 25000', catFilter.rows.length === 1 && catFilter.summary.totalCopies === 2 && catFilter.summary.totalAssetValue === 25000, JSON.stringify(catFilter.summary))

  console.log('--- STEP 6: konsistensi deret tanggal (daysBetween helper) ---')
  check('b3 lateDays derivasi = daysBetween(returned, due)', daysBetween(dayFromNow(-1), dayFromNow(-5)) === 4)
  check('b1 active overdue = daysBetween(now, due)', daysBetween(new Date(), dayFromNow(-20)) === 20)

  await prisma.$disconnect()

  console.log(`\nRESULT: ${pass} PASS, ${fail} FAIL`)
  if (fail > 0) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
