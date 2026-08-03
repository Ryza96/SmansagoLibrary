import { EnrollmentService } from '../src/main/services/enrollment.service'
import { EnrollmentRepository } from '../src/main/repositories/enrollment.repository'
import { MemberRepository } from '../src/main/repositories/member.repository'
import { ClassRepository } from '../src/main/repositories/class.repository'
import { getPrisma } from '../src/main/repositories/base/prisma'
import { ACADEMIC_STATUS } from '../src/shared/config/academic-status'

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

async function main(): Promise<void> {
  const prisma = getPrisma()
  const memberRepo = new MemberRepository()
  const enrollmentRepo = new EnrollmentRepository()
  const classRepo = new ClassRepository()
  const enrollmentService = new EnrollmentService(enrollmentRepo, memberRepo, classRepo)

  const seedStudent = (memberNumber: string, fullName: string) =>
    prisma.member.create({ data: { memberNumber, fullName, memberType: 'student', status: 'ACTIVE' } })
  const enrollActive = (memberId: string, classId: string, academicYearId: string) =>
    enrollmentService.enroll({ memberId, classId, academicYearId })

  console.log('--- STEP 0: seed master data (fresh DB) ---')
  const curriculumA = await prisma.curriculum.create({ data: { name: 'MERDEKA' } })
  const curriculumB = await prisma.curriculum.create({ data: { name: 'K13' } })
  const yearA = await prisma.academicYear.create({
    data: { name: '2025/2026', startDate: new Date('2025-07-01'), endDate: new Date('2026-06-30'), isActive: true }
  })
  const yearB = await prisma.academicYear.create({
    data: { name: '2026/2027', startDate: new Date('2026-07-01'), endDate: new Date('2027-06-30'), isActive: false }
  })
  const classA = await prisma.class.create({
    data: { academicYearId: yearA.id, curriculumId: curriculumA.id, educationLevel: 'X', parallel: 'A', homeroomTeacher: null, isActive: true }
  })
  const classB = await prisma.class.create({
    data: { academicYearId: yearA.id, curriculumId: curriculumA.id, educationLevel: 'X', parallel: 'B', homeroomTeacher: null, isActive: true }
  })
  const classYearB = await prisma.class.create({
    data: { academicYearId: yearB.id, curriculumId: curriculumB.id, educationLevel: 'X', parallel: 'A', homeroomTeacher: null, isActive: true }
  })
  const student1 = await seedStudent('S-000001', 'Siswa Satu')
  const student2 = await seedStudent('S-000002', 'Siswa Dua')
  const student3 = await seedStudent('S-000003', 'Siswa Tiga')
  check('seed: 2 kurikulum, 2 tahun, 3 kelas, 3 siswa', curriculumA.id !== '' && student1.id !== '')

  console.log('--- STEP 1: history kosong + member tidak ditemukan ---')
  const empty = await enrollmentService.historyByMember(student1.id)
  expectEqual('history awal kosong ([])', empty.length, 0)
  await expectRejected('history member tidak ada ditolak', () => enrollmentService.historyByMember('member-nope'), 'tidak ditemukan')

  console.log('--- STEP 2: enroll → 1 baris ACTIVE (joinedAt, status, curriculum, tahun) ---')
  const en1 = await enrollActive(student1.id, classA.id, yearA.id)
  const h1 = await enrollmentService.historyByMember(student1.id)
  expectEqual('history 1 baris', h1.length, 1)
  expectEqual('academicYearName tampil', h1[0].academicYearName, '2025/2026')
  expectEqual('curriculumName tampil', h1[0].curriculumName, 'MERDEKA')
  expectEqual('className tampil', h1[0].className, 'X A')
  expectEqual('status ACTIVE tampil', h1[0].status, ACADEMIC_STATUS.active)
  expectEqual('joinedAt (enrolledAt) tampil benar', h1[0].enrolledAt, en1.enrolledAt)
  expectEqual('leftAt null saat aktif', h1[0].leftAt, null)
  expectEqual('note null saat enroll tanpa catatan', h1[0].note, null)

  console.log('--- STEP 3: close → status terminal + leftAt + note tampil ---')
  const closed1 = await enrollmentService.close(en1.id, { status: ACADEMIC_STATUS.promoted, note: 'naik ke XI' })
  const h1c = await enrollmentService.historyByMember(student1.id)
  expectEqual('history tetap 1 baris', h1c.length, 1)
  expectEqual('status PROMOTED tampil', h1c[0].status, ACADEMIC_STATUS.promoted)
  expectEqual('leftAt tampil benar', h1c[0].leftAt, closed1.leftAt)
  expectEqual('note tampil benar', h1c[0].note, 'naik ke XI')
  expectEqual('academicYearName tidak berubah', h1c[0].academicYearName, '2025/2026')
  expectEqual('curriculumName tidak berubah', h1c[0].curriculumName, 'MERDEKA')

  console.log('--- STEP 4: 2-baris-setahun (repoint) — urutan terbaru dulu ---')
  const en2 = await enrollActive(student2.id, classA.id, yearA.id)
  const repointed = await enrollmentService.repoint(en2.id, { targetClassId: classB.id, note: 'redistribusi' })
  const h2 = await enrollmentService.historyByMember(student2.id)
  expectEqual('history repoint == 2 baris (2-baris-setahun)', h2.length, 2)
  expectEqual('baris terbaru = ACTIVE kelas baru', h2[0].className, 'X B')
  expectEqual('baris terbaru status ACTIVE', h2[0].status, ACADEMIC_STATUS.active)
  expectEqual('baris terbaru leftAt null', h2[0].leftAt, null)
  expectEqual('baris lama = REDISTRIBUTED', h2[1].status, ACADEMIC_STATUS.redistributed)
  expectEqual('baris lama leftAt set', h2[1].leftAt !== null, true)
  expectEqual('baris lama note tampil', h2[1].note, 'redistribusi')
  expectEqual('urutan terbaru dulu (enrolledAt desc)', h2[0].enrolledAt > h2[1].enrolledAt, true)
  expectEqual('keduanya tahun sama (2-baris-setahun)', h2[0].academicYearName === h2[1].academicYearName && h2[0].academicYearName === '2025/2026', true)
  expectEqual('curriculumName kedua baris sama', h2[0].curriculumName === 'MERDEKA' && h2[1].curriculumName === 'MERDEKA', true)

  console.log('--- STEP 5: multi-tahun — urutan lintas tahun + kurikulum berbeda ---')
  const en3b = await enrollActive(student3.id, classYearB.id, yearB.id)
  const closed3b = await enrollmentService.close(en3b.id, { status: ACADEMIC_STATUS.promoted, note: 'promosi tahun B' })
  const en3a = await enrollActive(student3.id, classA.id, yearA.id)
  const h3 = await enrollmentService.historyByMember(student3.id)
  expectEqual('history multi-tahun == 2 baris', h3.length, 2)
  expectEqual('terbaru = tahun A ACTIVE', h3[0].academicYearName, '2025/2026')
  expectEqual('terbaru status ACTIVE', h3[0].status, ACADEMIC_STATUS.active)
  expectEqual('terbaru kurikulum MERDEKA', h3[0].curriculumName, 'MERDEKA')
  expectEqual('lama = tahun B PROMOTED', h3[1].academicYearName, '2026/2027')
  expectEqual('lama status PROMOTED + leftAt', h3[1].status === ACADEMIC_STATUS.promoted && h3[1].leftAt !== null, true)
  expectEqual('lama kurikulum K13', h3[1].curriculumName, 'K13')
  expectEqual('urutan lintas tahun terbaru dulu', h3[0].enrolledAt > h3[1].enrolledAt, true)

  console.log('--- STEP 6: exit criteria — label historis tak berubah walau rename tahun lain ---')
  const beforeRename = JSON.stringify(h2.map((r) => ({ y: r.academicYearName, c: r.className, s: r.status, j: r.enrolledAt, l: r.leftAt, n: r.note })))
  await prisma.academicYear.update({ where: { id: yearB.id }, data: { name: 'TA 2026-2027' } })
  const afterRename = await enrollmentService.historyByMember(student2.id)
  const afterRenameJson = JSON.stringify(afterRename.map((r) => ({ y: r.academicYearName, c: r.className, s: r.status, j: r.enrolledAt, l: r.leftAt, n: r.note })))
  expectEqual('baris tahun A identik sebelum/sesudah rename tahun B', afterRenameJson, beforeRename)
  const h3after = await enrollmentService.historyByMember(student3.id)
  expectEqual('baris milik tahun B menampilkan nama tahun sendiri (diperbarui)', h3after[1].academicYearName, 'TA 2026-2027')
  expectEqual('baris tahun A lain tidak ikut berubah', h3after[0].academicYearName, '2025/2026')

  console.log('--- STEP 7: regression E-1/E-3 — guard + DTO aditif di semua method ---')
  const sInvalid = await seedStudent('S-000004', 'Siswa Empat')
  const enInv = await enrollActive(sInvalid.id, classA.id, yearA.id)
  await expectRejected('enroll kedua tetap ditolak (satu-ACTIVE)', () => enrollActive(sInvalid.id, classB.id, yearA.id), 'masih memiliki enrollment aktif')
  await expectRejected('close non-terminal tetap ditolak', () => enrollmentService.close(enInv.id, { status: ACADEMIC_STATUS.active }), 'status terminal')
  const activeDto = await enrollmentService.findActiveByMember(sInvalid.id)
  expectEqual('findActiveByMember DTO punya curriculumName', activeDto?.curriculumName, 'MERDEKA')
  expectEqual('findActiveByMember status ACTIVE', activeDto?.status, ACADEMIC_STATUS.active)
  const closeDto = await enrollmentService.close(enInv.id, { status: ACADEMIC_STATUS.dropped, note: 'DO' })
  expectEqual('close DTO punya curriculumName', closeDto.curriculumName, 'MERDEKA')
  const histInv = await enrollmentService.historyByMember(sInvalid.id)
  expectEqual('histori setelah close menampilkan DROPPED', histInv[0].status, ACADEMIC_STATUS.dropped)
  expectEqual('histori DROPPED leftAt + note', histInv[0].leftAt !== null && histInv[0].note === 'DO', true)

  await prisma.$disconnect()
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
