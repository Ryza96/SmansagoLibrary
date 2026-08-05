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

async function main(): Promise<void> {
  const prisma = getPrisma()
  await initDatabase()
  const reportRepo = new ReportRepository()

  console.log('--- STEP 0: seed master (AY, kurikulum, kelas, anggota, buku, eksemplar) ---')
  const ay1 = await prisma.academicYear.create({ data: { name: '2026/2027', startDate: new Date('2026-07-01'), endDate: new Date('2027-06-30'), isActive: true } })
  const ay2 = await prisma.academicYear.create({ data: { name: '2025/2026', startDate: new Date('2025-07-01'), endDate: new Date('2026-06-30'), isActive: false } })
  const cur = await prisma.curriculum.create({ data: { name: 'Kurikulum Merdeka' } })
  const classA = await prisma.class.create({ data: { academicYearId: ay1.id, curriculumId: cur.id, educationLevel: 'X', parallel: 'Merdeka 1' } })
  const classB = await prisma.class.create({ data: { academicYearId: ay1.id, curriculumId: cur.id, educationLevel: 'XI', parallel: 'Merdeka 1' } })

  const student = await prisma.member.create({ data: { memberNumber: 'R-000001', fullName: 'Dina Sari', memberType: 'student', gender: 'PEREMPUAN', phone: '081111', email: 'dina@test.id', status: 'ACTIVE' } })
  await prisma.memberEnrollment.create({ data: { memberId: student.id, classId: classA.id, academicYearId: ay1.id, status: 'ACTIVE' } })
  const teacher = await prisma.member.create({ data: { memberNumber: 'R-000002', fullName: 'Budi Santoso', memberType: 'teacher', gender: 'LAKI_LAKI', status: 'ACTIVE' } })
  const general = await prisma.member.create({ data: { memberNumber: 'R-000003', fullName: 'Citra Umum', memberType: 'general', status: 'INACTIVE' } })

  const cat1 = await prisma.category.create({ data: { code: 'CAT1', name: 'Fiksi' } })
  const cat2 = await prisma.category.create({ data: { code: 'CAT2', name: 'Nonfiksi' } })
  const author = await prisma.author.create({ data: { name: 'Pengarang A' } })
  const publisher = await prisma.publisher.create({ data: { name: 'Penerbit X' } })
  const book1 = await prisma.book.create({ data: { title: 'Buku Alpha', isbn: '978-1', authorId: author.id, publisherId: publisher.id, categoryId: cat1.id, publicationYear: 2020 } })
  const book2 = await prisma.book.create({ data: { title: 'Buku Beta', isbn: '978-2', categoryId: cat2.id, publicationYear: 2021 } })

  const mkCopy = (bookId: string, inv: string, status: string, cost: number) =>
    prisma.bookCopy.create({ data: { bookId, inventoryNumber: inv, barcode: inv, shelfLocation: 'R1', status, acquisitionCost: cost } })
  const c1 = await mkCopy(book1.id, 'R-INV-0001', 'BORROWED', 10000)
  const c2 = await mkCopy(book1.id, 'R-INV-0002', 'AVAILABLE', 15000)
  const c3 = await mkCopy(book1.id, 'R-INV-0003', 'AVAILABLE', 20000)
  const c4 = await mkCopy(book2.id, 'R-INV-0004', 'AVAILABLE', 25000)
  const c5 = await mkCopy(book2.id, 'R-INV-0005', 'LOST', 30000)
  check('seed master', !!ay1.id && !!classA.id && !!student.id && !!book1.id && !!c1.id && !!cat1.id)

  console.log('--- STEP 1: seed peminjaman (6 skenario) ---')
  // br1: masih aktif & TERLAMBAT (due 20 hari lalu, belum dikembalikan)
  const br1 = await prisma.borrow.create({
    data: {
      borrowNumber: 'PJ-R-0001', memberId: student.id, memberName: 'Dina Sari', memberNumber: 'R-000001', className: 'X Merdeka 1',
      borrowDate: daysAgo(30), dueDate: daysAgo(20),
      details: { create: [{ bookCopyId: c1.id, bookTitle: 'Buku Alpha' }] }
    }
  })
  // br2: selesai TEPAT WAKTU (kembali 12 hari lalu, due 10 hari lalu → awal dari due)
  const br2 = await prisma.borrow.create({
    data: {
      borrowNumber: 'PJ-R-0002', memberId: teacher.id, memberName: 'Budi Santoso', memberNumber: 'R-000002',
      borrowDate: daysAgo(25), dueDate: daysAgo(10), returnDate: daysAgo(12),
      details: { create: [{ bookCopyId: c2.id, bookTitle: 'Buku Alpha', returnedAt: daysAgo(12), conditionBack: 'BAIK' }] }
    }
  })
  // br3: selesai TERLAMBAT (kembali 1 hari lalu, due 5 hari lalu → telat 4 hari)
  const br3 = await prisma.borrow.create({
    data: {
      borrowNumber: 'PJ-R-0003', memberId: general.id, memberName: 'Citra Umum', memberNumber: 'R-000003',
      borrowDate: daysAgo(20), dueDate: daysAgo(5), returnDate: daysAgo(1),
      details: { create: [{ bookCopyId: c3.id, bookTitle: 'Buku Alpha', returnedAt: daysAgo(1), conditionBack: 'RUSAK' }] }
    }
  })
  // br4: selesai TERLAMBAT + HILANG (kembali 3 hari lalu, due 8 hari lalu → telat 5 hari)
  const br4 = await prisma.borrow.create({
    data: {
      borrowNumber: 'PJ-R-0004', memberId: student.id, memberName: 'Dina Sari', memberNumber: 'R-000001', className: 'X Merdeka 1',
      borrowDate: daysAgo(15), dueDate: daysAgo(8), returnDate: daysAgo(3),
      details: { create: [{ bookCopyId: c4.id, bookTitle: 'Buku Beta', returnedAt: daysAgo(3), conditionBack: 'HILANG' }] }
    }
  })
  // br5: selesai TEPAT (returnedAt = dueDate - 2)
  const br5 = await prisma.borrow.create({
    data: {
      borrowNumber: 'PJ-R-0005', memberId: teacher.id, memberName: 'Budi Santoso', memberNumber: 'R-000002',
      borrowDate: daysAgo(10), dueDate: daysAgo(6), returnDate: daysAgo(8),
      details: { create: [{ bookCopyId: c5.id, bookTitle: 'Buku Beta', returnedAt: daysAgo(8), conditionBack: 'BAIK' }] }
    }
  })
  // br6: masih aktif TIDAK terlambat (due 5 hari mendatang)
  const br6 = await prisma.borrow.create({
    data: {
      borrowNumber: 'PJ-R-0006', memberId: general.id, memberName: 'Citra Umum', memberNumber: 'R-000003',
      borrowDate: daysAgo(7), dueDate: daysAgo(-5),
      details: { create: [{ bookCopyId: c2.id, bookTitle: 'Buku Alpha' }] }
    }
  })
  check('seed: 6 peminjaman', !!br1.id && !!br2.id && !!br3.id && !!br4.id && !!br5.id && !!br6.id)

  const from = daysAgo(90)
  const to = new Date()

  console.log('--- STEP 2: Laporan Peminjaman (findBorrowingsBetween + summary) ---')
  const all = await reportRepo.findBorrowingsBetween({ from, to })
  check('findBorrowingsBetween tanpa status → total 6', all.total === 6, String(all.total))
  check('findBorrowingsBetween tanpa status → rows 6', all.data.length === 6, String(all.data.length))
  check('ordered borrowDate asc → br1 dulu', all.data[0].borrowNumber === 'PJ-R-0001', String(all.data[0].borrowNumber))
  check('bawa detail + relasi member + book', all.data[0].details.length === 1 && !!all.data[0].member.fullName && !!all.data[0].details[0].bookCopy.book.title)

  const activeOnly = await reportRepo.findBorrowingsBetween({ from, to, status: 'ACTIVE' })
  check('status ACTIVE → hanya returnDate null (br1, br6) = 2', activeOnly.total === 2, String(activeOnly.total))

  const completedOnly = await reportRepo.findBorrowingsBetween({ from, to, status: 'COMPLETED' })
  check('status COMPLETED → 4 (br2..br5)', completedOnly.total === 4, String(completedOnly.total))

  const overdueOnly = await reportRepo.findBorrowingsBetween({ from, to, status: 'OVERDUE' })
  check('status OVERDUE → hanya br1 (returnDate null + dueDate<now)', overdueOnly.total === 1 && overdueOnly.data[0].borrowNumber === 'PJ-R-0001', String(overdueOnly.total))

  const summary = await reportRepo.countBorrowStatusSummary(from, to)
  check('summary.total dipecah: active=2 (br1,br6)', summary.active === 2, String(summary.active))
  check('summary completed=4 (br2..br5)', summary.completed === 4, String(summary.completed))
  check('summary overdue=1 (br1)', summary.overdue === 1, String(summary.overdue))

  console.log('--- STEP 3: Laporan Pengembalian (findReturnedDetailsBetween + kondisi) ---')
  const returns = await reportRepo.findReturnedDetailsBetween({ from, to })
  check('findReturnedDetailsBetween → 4 detail kembali (br2,3,4,5)', returns.total === 4, String(returns.total))
  check('1 baris per buku; bawa borrow+member+book', returns.data[0].borrow.borrowNumber && !!returns.data[0].borrow.member.fullName && !!returns.data[0].bookCopy.book.title)
  const returnedNumbers = returns.data.map((r) => r.borrow.borrowNumber).sort()
  check('buku kembali dari br2,br3,br4,br5', JSON.stringify(returnedNumbers) === JSON.stringify(['PJ-R-0002', 'PJ-R-0003', 'PJ-R-0004', 'PJ-R-0005']), JSON.stringify(returnedNumbers))

  const cond = await reportRepo.countReturnedConditionSummary(from, to)
  check('kondisi BAIK = 2 (br2, br5)', cond.returnedGood === 2, String(cond.returnedGood))
  check('kondisi RUSAK = 1 (br3)', cond.returnedDamaged === 1, String(cond.returnedDamaged))
  check('kondisi HILANG = 1 (br4)', cond.returnedLost === 1, String(cond.returnedLost))

  console.log('--- STEP 4: Laporan Keterlambatan (findActiveOverdue + findReturnedLateBetween) ---')
  const activeOverdue = await reportRepo.findActiveOverdue(new Date())
  check('findActiveOverdue → hanya br1 (open + due<now)', activeOverdue.total === 1 && activeOverdue.data[0].borrowNumber === 'PJ-R-0001', String(activeOverdue.total))

  const returnedLate = await reportRepo.findReturnedLateBetween({ from, to })
  const lateNumbers = returnedLate.data.map((r) => r.borrowNumber).sort()
  check('findReturnedLateBetween → 2 (br3, br4); br2/br5 tepat waktu di-exclude', returnedLate.total === 2 && JSON.stringify(lateNumbers) === JSON.stringify(['PJ-R-0003', 'PJ-R-0004']), JSON.stringify(lateNumbers))
  check('raw row membawa dueDate+returnedAt untuk hitung hari', returnedLate.data[0].dueDate instanceof Date && returnedLate.data[0].returnedAt instanceof Date && returnedLate.data[0].returnedAt > returnedLate.data[0].dueDate)

  console.log('--- STEP 5: Laporan Anggota (findMembersReport + countMembersByType) ---')
  const members = await reportRepo.findMembersReport({})
  check('findMembersReport → 3 anggota', members.total === 3, String(members.total))
  const studentRow = members.data.find((m) => m.memberNumber === 'R-000001')
  check('bawa enrollment ACTIVE → classInfo kelas terisi', !!studentRow && studentRow.memberEnrollments.length === 1 && studentRow.memberEnrollments[0].class.educationLevel === 'X')
  const teacherRow = members.data.find((m) => m.memberNumber === 'R-000002')
  check('guru tanpa enrollment → classInfo null', !!teacherRow && teacherRow.memberEnrollments.length === 0)

  const byClass = await reportRepo.findMembersReport({ classId: classA.id })
  check('filter classId → hanya student', byClass.total === 1 && byClass.data[0].memberNumber === 'R-000001', String(byClass.total))

  const byYear = await reportRepo.findMembersReport({ academicYearId: ay1.id })
  check('filter academicYearId → hanya student (enrollment AY1)', byYear.total === 1, String(byYear.total))

  const byType = await reportRepo.findMembersReport({ memberType: 'teacher' })
  check('filter memberType=teacher → 1', byType.total === 1 && byType.data[0].fullName === 'Budi Santoso', String(byType.total))

  const bySearch = await reportRepo.findMembersReport({ search: 'Citra' })
  check('search → Citra Umum', bySearch.total === 1 && bySearch.data[0].memberNumber === 'R-000003', String(bySearch.total))

  const typeCount = await reportRepo.countMembersByType()
  const typeMap = new Map(typeCount.map((t) => [t.memberType, t.count]))
  check('countMembersByType → student=1, teacher=1, general=1', typeMap.get('student') === 1 && typeMap.get('teacher') === 1 && typeMap.get('general') === 1, JSON.stringify(typeCount))

  console.log('--- STEP 6: Laporan Koleksi (findBookReportRows + getCollectionSummary) ---')
  const books = await reportRepo.findBookReportRows({})
  check('findBookReportRows → 2 judul', books.total === 2, String(books.total))
  check('ordered title asc → Alpha dulu', books.data[0].title === 'Buku Alpha', books.data[0].title)
  const alpha = books.data.find((b) => b.title === 'Buku Alpha')
  check('copyCount Alpha = 3', alpha?._count.bookCopies === 3, String(alpha?._count.bookCopies))
  check('bawa relasi author/publisher/category', !!alpha?.author?.name && !!alpha.publisher?.name && !!alpha.category?.name)

  const byCategory = await reportRepo.findBookReportRows({ categoryId: cat2.id })
  check('filter categoryId → hanya Buku Beta', byCategory.total === 1 && byCategory.data[0].title === 'Buku Beta', String(byCategory.total))

  const bySearchBook = await reportRepo.findBookReportRows({ search: 'Beta' })
  check('search buku → Buku Beta', bySearchBook.total === 1, String(bySearchBook.total))

  const collSummary = await reportRepo.getCollectionSummary()
  check('summary totalTitles = 2', collSummary.totalTitles === 2, String(collSummary.totalTitles))
  check('summary totalCopies = 5', collSummary.totalCopies === 5, String(collSummary.totalCopies))
  check('summary totalAssetValue = 100000', collSummary.totalAssetValue === 100000, String(collSummary.totalAssetValue))
  const statusMap = new Map(collSummary.byStatus.map((s) => [s.status, s.count]))
  check('byStatus: AVAILABLE=3, BORROWED=1, LOST=1', statusMap.get('AVAILABLE') === 3 && statusMap.get('BORROWED') === 1 && statusMap.get('LOST') === 1, JSON.stringify(collSummary.byStatus))
  const condMap = new Map(collSummary.byCondition.map((c) => [c.condition, c.count]))
  check('byCondition: GOOD=5', condMap.get('GOOD') === 5, JSON.stringify(collSummary.byCondition))

  const collFiltered = await reportRepo.getCollectionSummary(cat2.id)
  check('summary filter kategori: copies=2, asset=55000', collFiltered.totalCopies === 2 && collFiltered.totalAssetValue === 55000, JSON.stringify(collFiltered))

  console.log('--- STEP 7: skala >100 baris (tanpa clamp limit 100) ---')
  const bulk = Array.from({ length: 105 }, (_, i) => ({
    borrowNumber: `PJ-BULK-${String(i + 1).padStart(4, '0')}`,
    memberId: teacher.id,
    memberName: 'Budi Santoso',
    memberNumber: 'R-000002',
    borrowDate: daysAgo(20 - (i % 15)),
    dueDate: daysAgo(12),
    returnDate: daysAgo(5)
  }))
  await prisma.borrow.createMany({ data: bulk })
  const page2 = await reportRepo.findBorrowingsBetween({ from, to, page: 2, limit: 100 })
  check('105 bulk + 6 = 111 total', page2.total === 111, String(page2.total))
  check('page 2 limit 100 → 11 rows (bukan 0/terpotong)', page2.data.length === 11, String(page2.data.length))
  const summary2 = await reportRepo.countBorrowStatusSummary(from, to)
  check('summary pasca bulk: completed = 109', summary2.completed === 109, String(summary2.completed))
  check('summary pasca bulk: active tetap 2', summary2.active === 2, String(summary2.active))

  const late2 = await reportRepo.findReturnedLateBetween({ from, to, page: 1, limit: 100 })
  check('returned-late tetap 2 walau bulk (bulk returnDate<dueDate → tidak terlambat)', late2.total === 2, String(late2.total))

  await prisma.$disconnect()

  console.log(`\nRESULT: ${pass} PASS, ${fail} FAIL`)
  if (fail > 0) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
