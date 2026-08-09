// R-5 — Smoke ReportService.getMemberReport (kontrak halaman Laporan Anggota).
// KONTRAK FINAL (MEMBER_STATUS_ALIGNMENT):
//   Member.status = Source of Truth Status Keanggotaan.
//   MemberEnrollment BUKAN sumber membershipStatus — hanya untuk informasi Kelas.
// VALIDASI WAJIB (A-G):
//   A. Member.status=INACTIVE + punya enrollment        → NONAKTIF.
//   B. Member.status=ACTIVE   + tidak punya enrollment  → AKTIF.
//   C. Member.status=ACTIVE   + enrollment DROPPED      → AKTIF.
//   D. Member.status=INACTIVE + tidak punya enrollment  → NONAKTIF.
//   E. Filter ACTIVE  hanya berdasarkan Member.status.
//   F. Filter INACTIVE hanya berdasarkan Member.status.
//   G. Summary ACTIVE/INACTIVE berdasarkan Member.status (active+nonActive===total).
// Plus: Kelas tetap dari MemberEnrollment ACTIVE (SSOT), search server-side,
//       joinedAt = fallback Member.createdAt, pagination + skala.
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

function iso(d: Date): string {
  return d.toISOString()
}

async function main(): Promise<void> {
  const prisma = getPrisma()
  await initDatabase()
  const reportService = new ReportService(new ReportRepository())

  console.log('--- STEP 0: seed master (AY, kurikulum, kelas, anggota, enrollment) ---')
  const ay = await prisma.academicYear.create({ data: { name: '2026/2027', startDate: new Date('2026-07-01'), endDate: new Date('2027-06-30'), isActive: true } })
  const cur = await prisma.curriculum.create({ data: { name: 'Kurikulum Merdeka' } })
  const classX = await prisma.class.create({ data: { academicYearId: ay.id, curriculumId: cur.id, educationLevel: 'X', parallel: 'Merdeka 1' } })
  const classXI = await prisma.class.create({ data: { academicYearId: ay.id, curriculumId: cur.id, educationLevel: 'XI', parallel: 'Merdeka 2' } })

  // m1: ACTIVE + enrollment ACTIVE            → AKTIF, Kelas "X Merdeka 1".
  const m1 = await prisma.member.create({ data: { memberNumber: 'S-0001', fullName: 'Dina Sari', memberType: 'student', gender: 'PEREMPUAN', status: 'ACTIVE' } })
  await prisma.memberEnrollment.create({ data: { memberId: m1.id, classId: classX.id, academicYearId: ay.id, status: 'ACTIVE' } })
  // mA (skenario A): INACTIVE + punya enrollment ACTIVE → NONAKTIF (enrollment TIDAK mengangkat).
  const mA = await prisma.member.create({ data: { memberNumber: 'S-0002', fullName: 'Eka Putri', memberType: 'student', gender: 'PEREMPUAN', status: 'INACTIVE' } })
  await prisma.memberEnrollment.create({ data: { memberId: mA.id, classId: classX.id, academicYearId: ay.id, status: 'ACTIVE' } })
  // mB (skenario B): ACTIVE + TANPA enrollment → AKTIF.
  const mB = await prisma.member.create({ data: { memberNumber: 'U-0001', fullName: 'Budi Umum', memberType: 'general', gender: 'LAKI_LAKI', status: 'ACTIVE' } })
  // mC (skenario C): ACTIVE + enrollment DROPPED (terminal) → AKTIF.
  const mC = await prisma.member.create({ data: { memberNumber: 'S-0003', fullName: 'Cici Ceria', memberType: 'student', gender: 'PEREMPUAN', status: 'ACTIVE' } })
  await prisma.memberEnrollment.create({ data: { memberId: mC.id, classId: classX.id, academicYearId: ay.id, status: 'DROPPED', leftAt: new Date() } })
  // mD (skenario D): INACTIVE + TANPA enrollment → NONAKTIF. Punya pinjaman AKTIF
  // untuk membuktikan status bukan dari pinjaman aktif (Fase 2 tidak tersentuh).
  const mD = await prisma.member.create({ data: { memberNumber: 'G-0001', fullName: 'Dodi Guru', memberType: 'teacher', gender: 'LAKI_LAKI', status: 'INACTIVE' } })
  const m6 = await prisma.member.create({ data: { memberNumber: 'G-0002', fullName: 'Galih Guru', memberType: 'teacher', gender: 'LAKI_LAKI', status: 'ACTIVE' } })
  await prisma.memberEnrollment.create({ data: { memberId: m6.id, classId: classX.id, academicYearId: ay.id, status: 'ACTIVE' } })
  const m4 = await prisma.member.create({ data: { memberNumber: 'U-0002', fullName: 'Citra Umum', memberType: 'general', gender: 'PEREMPUAN', status: 'ACTIVE' } })
  await prisma.memberEnrollment.create({ data: { memberId: m4.id, classId: classXI.id, academicYearId: ay.id, status: 'ACTIVE' } })

  const cat = await prisma.category.create({ data: { code: 'CAT', name: 'Fiksi' } })
  const book = await prisma.book.create({ data: { title: 'Buku R5', isbn: '978-R5', categoryId: cat.id } })
  const copy = await prisma.bookCopy.create({ data: { bookId: book.id, inventoryNumber: 'R5-INV-0001', barcode: 'R5-INV-0001', shelfLocation: 'R1', status: 'AVAILABLE' } })
  const borrow = await prisma.borrow.create({
    data: {
      borrowNumber: 'PJ-R5-0001', memberId: mD.id, memberName: 'Dodi Guru', memberNumber: 'G-0001',
      borrowDate: new Date(Date.now() - 5 * 86400000), dueDate: new Date(Date.now() + 2 * 86400000),
      details: { create: [{ bookCopyId: copy.id, bookTitle: 'Buku R5' }] }
    }
  })
  check('seed: 7 anggota (ACTIVE=5, INACTIVE=2) + 5 enrollment (4 ACTIVE, 1 DROPPED) + 1 pinjaman aktif mD', !!m1.id && !!mA.id && !!mB.id && !!mC.id && !!mD.id && !!m6.id && !!m4.id && !!classX.id && !!classXI.id && !!borrow.id)

  const dbTotal = await prisma.member.count()
  const dbActive = await prisma.member.count({ where: { status: 'ACTIVE' } })
  const dbNonActive = await prisma.member.count({ where: { status: { not: 'ACTIVE' } } })
  console.log('--- STEP 1: jumlah anggota sesuai database ---')
  const all = await reportService.getMemberReport({})
  check('pagination.total == count(member) = 7', all.pagination.total === 7 && all.pagination.total === dbTotal, `${all.pagination.total}/${dbTotal}`)
  check('rows.length == 7', all.rows.length === 7, String(all.rows.length))
  check('summary.total == 7 == pagination.total', all.summary.total === all.pagination.total && all.summary.total === 7, String(all.summary.total))
  check('G: summary.total == active + nonActive (5+2=7)', all.summary.active + all.summary.nonActive === all.summary.total, `${all.summary.active}+${all.summary.nonActive}`)

  console.log('--- STEP 2: Status Keanggotaan sesuai KONTRAK FINAL (Member.status) ---')
  check('G: summary.active == count(status=ACTIVE) = 5', all.summary.active === dbActive && all.summary.active === 5, `${all.summary.active}/${dbActive}`)
  check('G: summary.nonActive == count(status!=ACTIVE) = 2', all.summary.nonActive === dbNonActive && all.summary.nonActive === 2, `${all.summary.nonActive}/${dbNonActive}`)
  check('semua membershipStatus ∈ {ACTIVE, INACTIVE}', all.rows.every((r) => r.membershipStatus === 'ACTIVE' || r.membershipStatus === 'INACTIVE'))
  const rowM1 = all.rows.find((r) => r.memberNumber === 'S-0001')
  const rowMA = all.rows.find((r) => r.memberNumber === 'S-0002')
  const rowMB = all.rows.find((r) => r.memberNumber === 'U-0001')
  const rowMC = all.rows.find((r) => r.memberNumber === 'S-0003')
  const rowMD = all.rows.find((r) => r.memberNumber === 'G-0001')
  const rowM6 = all.rows.find((r) => r.memberNumber === 'G-0002')
  const rowM4 = all.rows.find((r) => r.memberNumber === 'U-0002')
  check('m1 (ACTIVE + enrollment ACTIVE) → AKTIF', rowM1?.membershipStatus === 'ACTIVE', String(rowM1?.membershipStatus))
  check('A: mA (INACTIVE + punya enrollment ACTIVE) → NONAKTIF', rowMA?.membershipStatus === 'INACTIVE', String(rowMA?.membershipStatus))
  check('B: mB (ACTIVE + TANPA enrollment) → AKTIF', rowMB?.membershipStatus === 'ACTIVE', String(rowMB?.membershipStatus))
  check('C: mC (ACTIVE + enrollment DROPPED) → AKTIF', rowMC?.membershipStatus === 'ACTIVE', String(rowMC?.membershipStatus))
  check('D: mD (INACTIVE + TANPA enrollment + PINJAMAN AKTIF) → NONAKTIF', rowMD?.membershipStatus === 'INACTIVE', String(rowMD?.membershipStatus))
  check('m6 (ACTIVE + enrollment ACTIVE) → AKTIF', rowM6?.membershipStatus === 'ACTIVE', String(rowM6?.membershipStatus))
  check('m4 (ACTIVE + enrollment ACTIVE) → AKTIF', rowM4?.membershipStatus === 'ACTIVE', String(rowM4?.membershipStatus))

  console.log('--- STEP 3: Kelas tetap dari MemberEnrollment ACTIVE (SSOT, terpisah dari membershipStatus) ---')
  check('m1 className = X Merdeka 1 (enrollment ACTIVE)', rowM1?.className === 'X Merdeka 1', String(rowM1?.className))
  check('mA className = X Merdeka 1 (enrollment ACTIVE walau membership NONAKTIF)', rowMA?.className === 'X Merdeka 1', String(rowMA?.className))
  check('m6 className = X Merdeka 1 (enrollment ACTIVE)', rowM6?.className === 'X Merdeka 1', String(rowM6?.className))
  check('m4 className = XI Merdeka 2 (enrollment ACTIVE)', rowM4?.className === 'XI Merdeka 2', String(rowM4?.className))
  check('mC className = null (enrollment DROPPED BUKAN ACTIVE)', rowMC?.className === null, String(rowMC?.className))
  check('mB/mD className = null (tanpa enrollment)', rowMB?.className === null && rowMD?.className === null, `${String(rowMB?.className)}/${String(rowMD?.className)}`)

  console.log('--- STEP 4: Tanggal Bergabung = fallback Member.createdAt (domain belum punya field khusus) ---')
  check('m1 joinedAt == m1.createdAt ISO', rowM1?.joinedAt === iso(m1.createdAt), `${rowM1?.joinedAt} vs ${iso(m1.createdAt)}`)
  check('m4 joinedAt == m4.createdAt ISO', rowM4?.joinedAt === iso(m4.createdAt), `${rowM4?.joinedAt} vs ${iso(m4.createdAt)}`)

  console.log('--- STEP 5: Search server-side (nomor anggota & nama) ---')
  const sName = await reportService.getMemberReport({ search: 'Sari' })
  check('search "Sari" → 1 (m1)', sName.pagination.total === 1 && sName.rows[0]?.memberNumber === 'S-0001', String(sName.pagination.total))
  const sName2 = await reportService.getMemberReport({ search: 'Galih' })
  check('search "Galih" → 1 (m6)', sName2.pagination.total === 1 && sName2.rows[0]?.memberNumber === 'G-0002', String(sName2.pagination.total))
  const sNumber = await reportService.getMemberReport({ search: 'U-0001' })
  check('search nomor "U-0001" → 1 (mB)', sNumber.pagination.total === 1 && sNumber.rows[0]?.fullName === 'Budi Umum', String(sNumber.pagination.total))
  const sNone = await reportService.getMemberReport({ search: 'TidakAda' })
  check('search tanpa match → 0 baris + summary nol', sNone.pagination.total === 0 && sNone.rows.length === 0 && sNone.summary.active === 0 && sNone.summary.nonActive === 0, String(sNone.pagination.total))

  console.log('--- STEP 6: Filter Status Keanggotaan (E/F — hanya Member.status) ---')
  const onlyActive = await reportService.getMemberReport({ status: 'ACTIVE' })
  check('E: filter AKTIF → 5 anggota (m1,mB,mC,m6,m4)', onlyActive.pagination.total === 5 && onlyActive.rows.every((r) => r.membershipStatus === 'ACTIVE'), String(onlyActive.pagination.total))
  check('E: filter AKTIF → mA (INACTIVE + enrollment) TIDAK masuk', !onlyActive.rows.some((r) => r.memberNumber === 'S-0002'), String(onlyActive.rows.map((r) => r.memberNumber).join(',')))
  check('E: filter AKTIF → mB (tanpa enrollment) masuk', onlyActive.rows.some((r) => r.memberNumber === 'U-0001'), String(onlyActive.rows.map((r) => r.memberNumber).join(',')))
  check('E: filter AKTIF → mC (enrollment DROPPED) masuk', onlyActive.rows.some((r) => r.memberNumber === 'S-0003'), String(onlyActive.rows.map((r) => r.memberNumber).join(',')))
  check('G: filter AKTIF → summary active 5, nonActive 0', onlyActive.summary.active === 5 && onlyActive.summary.nonActive === 0, JSON.stringify(onlyActive.summary))
  const onlyInactive = await reportService.getMemberReport({ status: 'INACTIVE' })
  check('F: filter NONAKTIF → 2 anggota (mA,mD)', onlyInactive.pagination.total === 2 && onlyInactive.rows.every((r) => r.membershipStatus === 'INACTIVE'), String(onlyInactive.pagination.total))
  check('F: filter NONAKTIF → mA (punya enrollment ACTIVE) masuk', onlyInactive.rows.some((r) => r.memberNumber === 'S-0002'), String(onlyInactive.rows.map((r) => r.memberNumber).join(',')))
  check('F: filter NONAKTIF → mB (ACTIVE tanpa enrollment) TIDAK masuk', !onlyInactive.rows.some((r) => r.memberNumber === 'U-0001'), String(onlyInactive.rows.map((r) => r.memberNumber).join(',')))
  check('G: filter NONAKTIF → summary active 0, nonActive 2', onlyInactive.summary.active === 0 && onlyInactive.summary.nonActive === 2, JSON.stringify(onlyInactive.summary))

  console.log('--- STEP 7: Filter Kelas (MemberEnrollment ACTIVE) ---')
  const byX = await reportService.getMemberReport({ classId: classX.id })
  check('filter kelas X → 3 anggota (m1,mA,m6)', byX.pagination.total === 3 && byX.rows.every((r) => r.memberNumber === 'S-0001' || r.memberNumber === 'S-0002' || r.memberNumber === 'G-0002'), String(byX.pagination.total))
  check('filter kelas X → rows punya className X Merdeka 1', byX.rows.every((r) => r.className === 'X Merdeka 1'), String(byX.rows.map((r) => r.className).join(',')))
  const byXI = await reportService.getMemberReport({ classId: classXI.id })
  check('filter kelas XI → 1 (m4)', byXI.pagination.total === 1 && byXI.rows[0]?.memberNumber === 'U-0002', String(byXI.pagination.total))

  console.log('--- STEP 8: statistik mengikuti hasil filter ---')
  check('kelas X → total 3, active 2 (m1,m6), nonActive 1 (mA)', byX.summary.total === 3 && byX.summary.active === 2 && byX.summary.nonActive === 1, JSON.stringify(byX.summary))
  check('kelas X → students 2 (m1,mA), teachers 1 (m6), general 0', byX.summary.students === 2 && byX.summary.teachers === 1 && byX.summary.general === 0, JSON.stringify(byX.summary))
  check('status NONAKTIF → students 1 (mA), teachers 1 (mD), general 0', onlyInactive.summary.students === 1 && onlyInactive.summary.teachers === 1 && onlyInactive.summary.general === 0, JSON.stringify(onlyInactive.summary))
  check('search "Galih" → total 1, active 1, nonActive 0', sName2.summary.total === 1 && sName2.summary.active === 1 && sName2.summary.nonActive === 0, JSON.stringify(sName2.summary))
  check('search "Dodi" → total 1, active 0, nonActive 1', (await reportService.getMemberReport({ search: 'Dodi' })).summary.nonActive === 1, 'Dodi → nonActive 1')
  const combInactiveX = await reportService.getMemberReport({ status: 'INACTIVE', classId: classX.id })
  check('kombinasi NONAKTIF + kelas X → 1 (mA: INACTIVE berkelas tetap muncul)', combInactiveX.pagination.total === 1 && combInactiveX.rows[0]?.memberNumber === 'S-0002' && combInactiveX.summary.nonActive === 1, String(combInactiveX.pagination.total))
  const combActiveSearch = await reportService.getMemberReport({ status: 'ACTIVE', search: 'Cici' })
  check('kombinasi AKTIF + search "Cici" → mC (enrollment DROPPED tetap AKTIF)', combActiveSearch.pagination.total === 1 && combActiveSearch.rows[0]?.memberNumber === 'S-0003', String(combActiveSearch.pagination.total))

  console.log('--- STEP 9: pagination + skala ---')
  const bulkMembers = Array.from({ length: 15 }, (_, i) => ({
    memberNumber: `BULK-${String(i + 1).padStart(4, '0')}`,
    fullName: `Bulk Member ${i + 1}`,
    memberType: 'general',
    gender: 'LAKI_LAKI',
    status: 'INACTIVE'
  }))
  await prisma.member.createMany({ data: bulkMembers })
  check('total DB pasca bulk = 22', (await prisma.member.count()) === 22, String(await prisma.member.count()))
  const p1 = await reportService.getMemberReport({ page: 1, limit: 10 })
  check('page 1 → 10 baris, total 22', p1.rows.length === 10 && p1.pagination.total === 22, `${p1.rows.length}/${p1.pagination.total}`)
  check('pagination.totalPages = 3', p1.pagination.totalPages === 3, String(p1.pagination.totalPages))
  const p3 = await reportService.getMemberReport({ page: 3, limit: 10 })
  check('page 3 → 2 baris', p3.rows.length === 2, String(p3.rows.length))
  check('G: summary stabil (bukan per halaman): active 5, nonActive 17', p1.summary.active === 5 && p1.summary.nonActive === 17 && p1.summary.active + p1.summary.nonActive === p1.summary.total, JSON.stringify(p1.summary))
  const classFilterWithPage = await reportService.getMemberReport({ classId: classX.id, page: 1, limit: 10 })
  check('kelas X + page → total 3, rows 3, active 2', classFilterWithPage.pagination.total === 3 && classFilterWithPage.rows.length === 3 && classFilterWithPage.summary.active === 2, String(classFilterWithPage.pagination.total))

  await prisma.$disconnect()

  console.log(`\nRESULT: ${pass} PASS, ${fail} FAIL`)
  if (fail > 0) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
