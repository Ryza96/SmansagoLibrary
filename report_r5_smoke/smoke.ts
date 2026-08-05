// R-5 — Smoke ReportService.getMemberReport (kontrak halaman Laporan Anggota).
// VALIDASI PO:
//   1. Jumlah anggota sesuai database (pagination.total == count(member))
//   2. Status Keanggotaan sesuai kontrak — AKTIF = PERNAH memiliki MemberEnrollment
//      (status apa pun), NONAKTIF = tidak pernah; BUKAN dari Member.status maupun
//      pinjaman aktif (dibuktikan member INACTIVE yang punya pinjaman aktif).
//   3. Kelas dari MemberEnrollment ACTIVE sebagai Source of Truth (bukan classId
//      legacy, bukan enrollment terminal).
//   4. Search berjalan (server-side: nomor anggota / nama).
//   5. Filter berjalan (Status Keanggotaan + Kelas, kombinasi).
//   6. Statistik mengikuti hasil filter (total/active/nonActive + students/teachers/general).
// Plus: joinedAt = Member.createdAt (Tanggal Bergabung), pagination + skala.
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

  const m1 = await prisma.member.create({ data: { memberNumber: 'S-0001', fullName: 'Dina Sari', memberType: 'student', gender: 'PEREMPUAN', status: 'ACTIVE' } })
  await prisma.memberEnrollment.create({ data: { memberId: m1.id, classId: classX.id, academicYearId: ay.id, status: 'ACTIVE' } })
  // m2: pernah punya enrollment tapi DITUTUP (terminal DROPPED) → Status Keanggotaan AKTIF (pernah), Kelas null.
  const m2 = await prisma.member.create({ data: { memberNumber: 'S-0002', fullName: 'Eka Putri', memberType: 'student', gender: 'PEREMPUAN', status: 'ACTIVE' } })
  await prisma.memberEnrollment.create({ data: { memberId: m2.id, classId: classX.id, academicYearId: ay.id, status: 'DROPPED', leftAt: new Date() } })
  // m3: TIDAK pernah enrollment → NONAKTIF (punya pinjaman aktif untuk membuktikan bukan dari pinjaman).
  const m3 = await prisma.member.create({ data: { memberNumber: 'G-0001', fullName: 'Budi Santoso', memberType: 'teacher', gender: 'LAKI_LAKI', status: 'ACTIVE' } })
  const m4 = await prisma.member.create({ data: { memberNumber: 'U-0001', fullName: 'Citra Umum', memberType: 'general', gender: 'PEREMPUAN', status: 'ACTIVE' } })
  await prisma.memberEnrollment.create({ data: { memberId: m4.id, classId: classXI.id, academicYearId: ay.id, status: 'ACTIVE' } })
  const m5 = await prisma.member.create({ data: { memberNumber: 'S-0003', fullName: 'Fajar Nugraha', memberType: 'student', gender: 'LAKI_LAKI', status: 'INACTIVE' } })
  const m6 = await prisma.member.create({ data: { memberNumber: 'G-0002', fullName: 'Galih Guru', memberType: 'teacher', gender: 'LAKI_LAKI', status: 'ACTIVE' } })
  await prisma.memberEnrollment.create({ data: { memberId: m6.id, classId: classX.id, academicYearId: ay.id, status: 'ACTIVE' } })

  // Buku + pinjaman AKTIF milik m3 (NONAKTIF keanggotaan) → bukti status ≠ pinjaman aktif.
  const cat = await prisma.category.create({ data: { code: 'CAT', name: 'Fiksi' } })
  const book = await prisma.book.create({ data: { title: 'Buku R5', isbn: '978-R5', categoryId: cat.id } })
  const copy = await prisma.bookCopy.create({ data: { bookId: book.id, inventoryNumber: 'R5-INV-0001', barcode: 'R5-INV-0001', shelfLocation: 'R1', status: 'AVAILABLE' } })
  const borrow = await prisma.borrow.create({
    data: {
      borrowNumber: 'PJ-R5-0001', memberId: m3.id, memberName: 'Budi Santoso', memberNumber: 'G-0001',
      borrowDate: new Date(Date.now() - 5 * 86400000), dueDate: new Date(Date.now() + 2 * 86400000),
      details: { create: [{ bookCopyId: copy.id, bookTitle: 'Buku R5' }] }
    }
  })
  check('seed: 6 anggota + 6 enrollment (4 ACTIVE, 1 DROPPED) + 1 pinjaman aktif m3', !!m1.id && !!m2.id && !!m3.id && !!m4.id && !!m5.id && !!m6.id && !!classX.id && !!classXI.id && !!borrow.id)

  const dbTotal = await prisma.member.count()
  const dbActiveEver = await prisma.member.count({ where: { memberEnrollments: { some: {} } } })
  const dbNonActiveEver = await prisma.member.count({ where: { memberEnrollments: { none: {} } } })

  console.log('--- STEP 1: jumlah anggota sesuai database ---')
  const all = await reportService.getMemberReport({})
  check('pagination.total == count(member) = 6', all.pagination.total === 6 && all.pagination.total === dbTotal, `${all.pagination.total}/${dbTotal}`)
  check('rows.length == 6', all.rows.length === 6, String(all.rows.length))
  check('summary.total == 6 == pagination.total', all.summary.total === all.pagination.total && all.summary.total === 6, String(all.summary.total))
  check('summary.total == active + nonActive (4+2=6)', all.summary.active + all.summary.nonActive === all.summary.total, `${all.summary.active}+${all.summary.nonActive}`)

  console.log('--- STEP 2: Status Keanggotaan sesuai kontrak (AKTIF = pernah memiliki MemberEnrollment) ---')
  check('summary.active == count(memberEnrollments some {}) = 4', all.summary.active === dbActiveEver && all.summary.active === 4, `${all.summary.active}/${dbActiveEver}`)
  check('summary.nonActive == count(memberEnrollments none {}) = 2', all.summary.nonActive === dbNonActiveEver && all.summary.nonActive === 2, `${all.summary.nonActive}/${dbNonActiveEver}`)
  check('semua membershipStatus ∈ {ACTIVE, INACTIVE}', all.rows.every((r) => r.membershipStatus === 'ACTIVE' || r.membershipStatus === 'INACTIVE'))
  const rowM1 = all.rows.find((r) => r.memberNumber === 'S-0001')
  const rowM2 = all.rows.find((r) => r.memberNumber === 'S-0002')
  const rowM3 = all.rows.find((r) => r.memberNumber === 'G-0001')
  const rowM4 = all.rows.find((r) => r.memberNumber === 'U-0001')
  const rowM5 = all.rows.find((r) => r.memberNumber === 'S-0003')
  const rowM6 = all.rows.find((r) => r.memberNumber === 'G-0002')
  check('m1 (enrollment ACTIVE) → AKTIF', rowM1?.membershipStatus === 'ACTIVE', String(rowM1?.membershipStatus))
  check('m2 (enrollment DROPPED/terminal) → AKTIF (PERNAH memiliki)', rowM2?.membershipStatus === 'ACTIVE', String(rowM2?.membershipStatus))
  check('m3 (tanpa enrollment + PINJAMAN AKTIF) → NONAKTIF (bukan dari pinjaman)', rowM3?.membershipStatus === 'INACTIVE', String(rowM3?.membershipStatus))
  check('m4 (enrollment ACTIVE) → AKTIF', rowM4?.membershipStatus === 'ACTIVE', String(rowM4?.membershipStatus))
  check('m5 (tanpa enrollment) → NONAKTIF', rowM5?.membershipStatus === 'INACTIVE', String(rowM5?.membershipStatus))
  check('m6 (enrollment ACTIVE) → AKTIF', rowM6?.membershipStatus === 'ACTIVE', String(rowM6?.membershipStatus))

  console.log('--- STEP 3: Kelas dari MemberEnrollment ACTIVE (SSOT) ---')
  check('m1 className = X Merdeka 1 (enrollment ACTIVE)', rowM1?.className === 'X Merdeka 1', String(rowM1?.className))
  check('m6 className = X Merdeka 1 (enrollment ACTIVE)', rowM6?.className === 'X Merdeka 1', String(rowM6?.className))
  check('m4 className = XI Merdeka 2 (enrollment ACTIVE)', rowM4?.className === 'XI Merdeka 2', String(rowM4?.className))
  check('m2 className = null (enrollment DROPPED BUKAN ACTIVE)', rowM2?.className === null, String(rowM2?.className))
  check('m3/m5 className = null (tanpa enrollment)', rowM3?.className === null && rowM5?.className === null, `${String(rowM3?.className)}/${String(rowM5?.className)}`)

  console.log('--- STEP 4: Tanggal Bergabung = Member.createdAt ---')
  check('m1 joinedAt == m1.createdAt ISO', rowM1?.joinedAt === iso(m1.createdAt), `${rowM1?.joinedAt} vs ${iso(m1.createdAt)}`)
  check('m4 joinedAt == m4.createdAt ISO', rowM4?.joinedAt === iso(m4.createdAt), `${rowM4?.joinedAt} vs ${iso(m4.createdAt)}`)

  console.log('--- STEP 5: Search server-side (nomor anggota & nama) ---')
  const sName = await reportService.getMemberReport({ search: 'Sari' })
  check('search "Sari" → 1 (m1)', sName.pagination.total === 1 && sName.rows[0]?.memberNumber === 'S-0001', String(sName.pagination.total))
  const sName2 = await reportService.getMemberReport({ search: 'Guru' })
  check('search "Guru" → 1 (m6 Galih Guru)', sName2.pagination.total === 1 && sName2.rows[0]?.memberNumber === 'G-0002', String(sName2.pagination.total))
  const sNumber = await reportService.getMemberReport({ search: 'G-0001' })
  check('search nomor "G-0001" → 1 (m3)', sNumber.pagination.total === 1 && sNumber.rows[0]?.fullName === 'Budi Santoso', String(sNumber.pagination.total))
  const sNone = await reportService.getMemberReport({ search: 'TidakAda' })
  check('search tanpa match → 0 baris + summary nol', sNone.pagination.total === 0 && sNone.rows.length === 0 && sNone.summary.active === 0 && sNone.summary.nonActive === 0, String(sNone.pagination.total))

  console.log('--- STEP 6: Filter Status Keanggotaan ---')
  const onlyActive = await reportService.getMemberReport({ status: 'ACTIVE' })
  check('filter AKTIF → 4 anggota (m1,m2,m4,m6)', onlyActive.pagination.total === 4 && onlyActive.rows.every((r) => r.membershipStatus === 'ACTIVE'), String(onlyActive.pagination.total))
  check('filter AKTIF → summary active 4, nonActive 0', onlyActive.summary.active === 4 && onlyActive.summary.nonActive === 0, JSON.stringify(onlyActive.summary))
  check('filter AKTIF → rows berisi m2 (enrollment terminal tetap AKTIF)', onlyActive.rows.some((r) => r.memberNumber === 'S-0002'), String(onlyActive.rows.map((r) => r.memberNumber).join(',')))
  const onlyInactive = await reportService.getMemberReport({ status: 'INACTIVE' })
  check('filter NONAKTIF → 2 anggota (m3,m5)', onlyInactive.pagination.total === 2 && onlyInactive.rows.every((r) => r.membershipStatus === 'INACTIVE'), String(onlyInactive.pagination.total))
  check('filter NONAKTIF → summary active 0, nonActive 2', onlyInactive.summary.active === 0 && onlyInactive.summary.nonActive === 2, JSON.stringify(onlyInactive.summary))

  console.log('--- STEP 7: Filter Kelas (MemberEnrollment ACTIVE) ---')
  const byX = await reportService.getMemberReport({ classId: classX.id })
  check('filter kelas X → 2 anggota (m1,m6)', byX.pagination.total === 2 && byX.rows.every((r) => r.memberNumber === 'S-0001' || r.memberNumber === 'G-0002'), String(byX.pagination.total))
  check('filter kelas X → rows punya className X Merdeka 1', byX.rows.every((r) => r.className === 'X Merdeka 1'), String(byX.rows.map((r) => r.className).join(',')))
  const byXI = await reportService.getMemberReport({ classId: classXI.id })
  check('filter kelas XI → 1 (m4)', byXI.pagination.total === 1 && byXI.rows[0]?.memberNumber === 'U-0001', String(byXI.pagination.total))

  console.log('--- STEP 8: statistik mengikuti hasil filter ---')
  check('kelas X → total 2, active 2, nonActive 0', byX.summary.total === 2 && byX.summary.active === 2 && byX.summary.nonActive === 0, JSON.stringify(byX.summary))
  check('kelas X → students 1 (m1), teachers 1 (m6), general 0', byX.summary.students === 1 && byX.summary.teachers === 1 && byX.summary.general === 0, JSON.stringify(byX.summary))
  check('status NONAKTIF → students 1 (m5), teachers 1 (m3), general 0', onlyInactive.summary.students === 1 && onlyInactive.summary.teachers === 1 && onlyInactive.summary.general === 0, JSON.stringify(onlyInactive.summary))
  check('search "Guru" → total 1, active 1, nonActive 0', sName2.summary.total === 1 && sName2.summary.active === 1 && sName2.summary.nonActive === 0, JSON.stringify(sName2.summary))
  check('search "Budi" → total 1, active 0, nonActive 1', (await reportService.getMemberReport({ search: 'Budi' })).summary.nonActive === 1, 'Budi → nonActive 1')
  const combInactiveX = await reportService.getMemberReport({ status: 'INACTIVE', classId: classX.id })
  check('kombinasi NONAKTIF + kelas X → 0 (anggota berkelas pasti pernah enrollment)', combInactiveX.pagination.total === 0 && combInactiveX.summary.total === 0 && combInactiveX.summary.active === 0 && combInactiveX.summary.nonActive === 0, String(combInactiveX.pagination.total))
  const combActiveSearch = await reportService.getMemberReport({ status: 'ACTIVE', search: 'Eka' })
  check('kombinasi AKTIF + search "Eka" → m2 (enrollment DROPPED tetap AKTIF)', combActiveSearch.pagination.total === 1 && combActiveSearch.rows[0]?.memberNumber === 'S-0002', String(combActiveSearch.pagination.total))

  console.log('--- STEP 9: pagination + skala ---')
  const bulkMembers = Array.from({ length: 15 }, (_, i) => ({
    memberNumber: `BULK-${String(i + 1).padStart(4, '0')}`,
    fullName: `Bulk Member ${i + 1}`,
    memberType: 'general',
    gender: 'LAKI_LAKI',
    status: 'INACTIVE'
  }))
  await prisma.member.createMany({ data: bulkMembers })
  check('total DB pasca bulk = 21', (await prisma.member.count()) === 21, String(await prisma.member.count()))
  const p1 = await reportService.getMemberReport({ page: 1, limit: 10 })
  check('page 1 → 10 baris, total 21', p1.rows.length === 10 && p1.pagination.total === 21, `${p1.rows.length}/${p1.pagination.total}`)
  check('pagination.totalPages = 3', p1.pagination.totalPages === 3, String(p1.pagination.totalPages))
  const p3 = await reportService.getMemberReport({ page: 3, limit: 10 })
  check('page 3 → 1 baris', p3.rows.length === 1, String(p3.rows.length))
  check('summary stabil (bukan per halaman): active 4, nonActive 17', p1.summary.active === 4 && p1.summary.nonActive === 17 && p1.summary.active + p1.summary.nonActive === p1.summary.total, JSON.stringify(p1.summary))
  const classFilterWithPage = await reportService.getMemberReport({ classId: classX.id, page: 1, limit: 10 })
  check('kelas X + page → total 2, rows 2, active 2', classFilterWithPage.pagination.total === 2 && classFilterWithPage.rows.length === 2 && classFilterWithPage.summary.active === 2, String(classFilterWithPage.pagination.total))

  await prisma.$disconnect()

  console.log(`\nRESULT: ${pass} PASS, ${fail} FAIL`)
  if (fail > 0) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
