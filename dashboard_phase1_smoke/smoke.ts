import { DashboardService } from '../src/main/services/dashboard.service'
import { DashboardRepository } from '../src/main/repositories/dashboard.repository'
import { BOOK_COPY_STATUS } from '../src/shared/config/book-copy-status'
import { getPrisma } from '../src/main/repositories/base/prisma'
import { initDatabase } from '../electron/main/database'

let pass = 0
let fail = 0

function check(name: string, ok: boolean, detail?: string): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`)
  if (ok) pass += 1
  else fail += 1
}

function daysAgo(n: number, hour = 12, minute = 0): Date {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(hour, minute, 0, 0)
  return d
}

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

async function main(): Promise<void> {
  const prisma = getPrisma()
  await initDatabase()
  const dashboardService = new DashboardService(new DashboardRepository())

  console.log('--- STEP 0: overview pada DB kosong ---')
  const empty = await dashboardService.getOverview()
  check('summary semua 0 pada DB kosong', empty.summary.totalBooks === 0 && empty.summary.totalInventories === 0 && empty.summary.totalMembers === 0 && empty.summary.activeBorrowings === 0)
  check('today semua 0 pada DB kosong', empty.today.borrowed === 0 && empty.today.returned === 0 && empty.today.overdue === 0 && empty.today.dueToday === 0)
  check('recentActivity kosong pada DB kosong', empty.recentActivity.length === 0)
  check('alerts kosong pada DB kosong', empty.alerts.length === 0)

  console.log('--- STEP 1: seed member + buku + eksemplar ---')
  const m1 = await prisma.member.create({ data: { memberNumber: 'D-000001', fullName: 'Dina Sari', memberType: 'general', status: 'ACTIVE' } })
  const m2 = await prisma.member.create({ data: { memberNumber: 'D-000002', fullName: 'Budi Santoso', memberType: 'general', status: 'ACTIVE' } })
  const m3 = await prisma.member.create({ data: { memberNumber: 'D-000003', fullName: 'Guru Lestari', memberType: 'teacher', status: 'ACTIVE' } })
  const b1 = await prisma.book.create({ data: { title: 'Buku Dashboard Satu' } })
  const b2 = await prisma.book.create({ data: { title: 'Buku Dashboard Dua' } })
  const mkCopy = (bookId: string, inv: string, status = 'AVAILABLE') =>
    prisma.bookCopy.create({ data: { bookId, inventoryNumber: inv, barcode: inv, shelfLocation: 'R1', status } })
  const c1 = await mkCopy(b1.id, 'D-INV-000001')
  const c2 = await mkCopy(b2.id, 'D-INV-000002')
  const c3 = await mkCopy(b2.id, 'D-INV-000003')
  const c4 = await mkCopy(b2.id, 'D-INV-000004')
  const c5 = await mkCopy(b1.id, 'D-INV-000005', BOOK_COPY_STATUS.LOST)
  const c6 = await mkCopy(b1.id, 'D-INV-000006')
  const c7 = await mkCopy(b1.id, 'D-INV-000007')
  check('seed: 3 member + 2 buku + 7 eksemplar (1 LOST)', !!m1.id && !!b1.id && !!c5.id)

  console.log('--- STEP 2: seed peminjaman + detail ---')
  const now = new Date()
  const todayStart = startOfDay(now)
  const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999)

  // br1: dipinjam hari ini, aktif, jatuh tempo +7 hari
  const br1 = await prisma.borrow.create({
    data: {
      borrowNumber: 'PJ-TEST-0001', memberId: m1.id, memberName: m1.fullName, memberNumber: m1.memberNumber,
      borrowDate: now, dueDate: daysAgo(-7),
      details: { create: [
        { bookCopyId: c1.id, bookTitle: 'Buku Dashboard Satu', returnedAt: null },
        { bookCopyId: c2.id, bookTitle: 'Buku Dashboard Dua', returnedAt: null }
      ] }
    }
  })
  // br2: dipinjam hari ini, aktif, jatuh tempo hari ini
  const br2 = await prisma.borrow.create({
    data: {
      borrowNumber: 'PJ-TEST-0002', memberId: m2.id, memberName: m2.fullName, memberNumber: m2.memberNumber,
      borrowDate: now, dueDate: todayEnd,
      details: { create: [
        { bookCopyId: c3.id, bookTitle: 'Buku Dashboard Dua', returnedAt: null }
      ] }
    }
  })
  // br3: dipinjam kemarin, overdue (-3 hari), 1 detail dikembalikan hari ini, 1 masih aktif
  const br3 = await prisma.borrow.create({
    data: {
      borrowNumber: 'PJ-TEST-0003', memberId: m3.id, memberName: m3.fullName, memberNumber: m3.memberNumber,
      borrowDate: daysAgo(1, 9), dueDate: daysAgo(3),
      details: { create: [
        { bookCopyId: c4.id, bookTitle: 'Buku Dashboard Dua', returnedAt: now },
        { bookCopyId: c6.id, bookTitle: 'Buku Dashboard Satu', returnedAt: null }
      ] }
    }
  })
  // br4: selesai kemarin (dikembalikan penuh)
  await prisma.borrow.create({
    data: {
      borrowNumber: 'PJ-TEST-0004', memberId: m2.id, memberName: m2.fullName, memberNumber: m2.memberNumber,
      borrowDate: daysAgo(1, 15), dueDate: daysAgo(-5), returnDate: daysAgo(1, 16),
      details: { create: [
        { bookCopyId: c7.id, bookTitle: 'Buku Dashboard Satu', returnedAt: daysAgo(1, 16) }
      ] }
    }
  })
  check('seed: 4 peminjaman (3 aktif, 1 selesai)', !!br1.id && !!br2.id && !!br3.id)

  console.log('--- STEP 3: Ringkasan + KPI Hari Ini ---')
  const o1 = await dashboardService.getOverview()
  check('summary.totalBooks = 2', o1.summary.totalBooks === 2, String(o1.summary.totalBooks))
  check('summary.totalInventories = 7', o1.summary.totalInventories === 7, String(o1.summary.totalInventories))
  check('summary.totalMembers = 3', o1.summary.totalMembers === 3, String(o1.summary.totalMembers))
  check('summary.activeBorrowings = 3 (bukan hasil fetch limit 100)', o1.summary.activeBorrowings === 3, String(o1.summary.activeBorrowings))
  check('today.borrowed = 2', o1.today.borrowed === 2, String(o1.today.borrowed))
  check('today.returned = 1 (detail c4 dikembalikan hari ini)', o1.today.returned === 1, String(o1.today.returned))
  check('today.overdue = 1 (br3)', o1.today.overdue === 1, String(o1.today.overdue))
  check('today.dueToday = 1 (br2)', o1.today.dueToday === 1, String(o1.today.dueToday))

  console.log('--- STEP 4: Aktivitas Terbaru ---')
  const activity = o1.recentActivity
  const activityIds = activity.map((a) => a.id)
  check('recentActivity tidak kosong', activity.length > 0, String(activity.length))
  check('memuat event BORROW br1', activityIds.includes(`borrow-${br1.id}`))
  check('memuat event BORROW br2', activityIds.includes(`borrow-${br2.id}`))
  check('memuat event RETURN c4 (br3)', activity.some((a) => a.type === 'RETURN' && a.message.includes('Buku Dashboard Dua')))
  check('urutan descending (event terbaru pertama)', activity.length >= 2 && activity[0].occurredAt >= activity[activity.length - 1].occurredAt)
  check('total items dibatasi 8', activity.length <= 8, String(activity.length))
  check('aktivitas BORROW memuat jumlah buku', activity.some((a) => a.id === `borrow-${br1.id}` && a.message.includes('2 buku')))

  console.log('--- STEP 5: Perlu Perhatian ---')
  const alerts = o1.alerts
  check('alerts berisi OVERDUE (danger)', alerts.some((a) => a.type === 'OVERDUE' && a.severity === 'danger' && a.message.includes('PJ-TEST-0003')))
  check('alerts berisi DUE_TODAY (warning)', alerts.some((a) => a.type === 'DUE_TODAY' && a.severity === 'warning' && a.message.includes('PJ-TEST-0002')))
  check('alerts berisi COPY_LOST (warning)', alerts.some((a) => a.type === 'COPY_LOST' && a.severity === 'warning' && a.message.includes('D-INV-000005')))
  check('tidak ada alert di luar kategori didukung', alerts.every((a) => a.type === 'OVERDUE' || a.type === 'DUE_TODAY' || a.type === 'COPY_LOST'))

  console.log('--- STEP 6: Sedang Dipinjam > 100 (fix B1) ---')
  const bulkRows = []
  for (let i = 0; i < 120; i++) {
    bulkRows.push({
      borrowNumber: `PJ-BULK-${String(i + 1).padStart(4, '0')}`,
      memberId: m1.id, memberName: m1.fullName, memberNumber: m1.memberNumber,
      borrowDate: daysAgo(30, 10), dueDate: daysAgo(-30), returnDate: null
    })
  }
  await prisma.borrow.createMany({ data: bulkRows })
  const o2 = await dashboardService.getOverview()
  check('activeBorrowings = 123 (3 + 120 bulk, bukan terpotong 100)', o2.summary.activeBorrowings === 123, String(o2.summary.activeBorrowings))
  check('KPI hari ini tidak terpengaruh bulk (borrowed tetap 2)', o2.today.borrowed === 2, String(o2.today.borrowed))
  check('overdue tidak terpengaruh bulk (tetap 1)', o2.today.overdue === 1, String(o2.today.overdue))
  check('aktivitas nyata tetap tampil setelah bulk', o2.recentActivity.some((a) => a.id === `borrow-${br1.id}`) && o2.recentActivity.some((a) => a.type === 'RETURN'))
  check('recentActivity tetap dibatasi 8', o2.recentActivity.length <= 8, String(o2.recentActivity.length))

  await prisma.$disconnect()
  console.log(`\nRESULT: ${pass} PASS / ${fail} FAIL`)
  if (fail > 0) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
