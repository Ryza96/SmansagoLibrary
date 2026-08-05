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

async function main(): Promise<void> {
  const prisma = getPrisma()
  await initDatabase()
  const service = new ReportService(new ReportRepository())

  console.log('--- STEP 0: seed koleksi (status × condition, termasuk REMOVED) ---')
  const cat1 = await prisma.category.create({ data: { code: 'FIK', name: 'Fiksi' } })
  const cat2 = await prisma.category.create({ data: { code: 'NFI', name: 'Nonfiksi' } })
  const author = await prisma.author.create({ data: { name: 'Pengarang A' } })
  const publisher = await prisma.publisher.create({ data: { name: 'Penerbit X' } })

  const mkBook = (title: string, isbn: string, categoryId: string, authorId: string | null, publisherId: string | null) =>
    prisma.book.create({ data: { title, isbn, categoryId, authorId, publisherId, publicationYear: 2020 } })

  // Buku Alpha: 4 eksemplar NON-REMOVED dengan status/kondisi beragam + 1 REMOVED.
  const alpha = await mkBook('Buku Alpha', '978-1', cat1.id, author.id, publisher.id)
  // 1 AVAILABLE GOOD, 1 AVAILABLE LIGHT_DAMAGE, 1 BORROWED HEAVY_DAMAGE,
  // 1 LOST GOOD, 1 REMOVED GOOD (harus di-exclude totalCopies & copyCount & byStatus).
  const mkCopy = (bookId: string, inv: string, status: string, condition: string, cost: number) =>
    prisma.bookCopy.create({ data: { bookId, inventoryNumber: inv, barcode: inv, shelfLocation: 'R1', status, condition, acquisitionCost: cost } })
  await mkCopy(alpha.id, 'R6-ALPHA-001', 'AVAILABLE', 'GOOD', 10000)
  await mkCopy(alpha.id, 'R6-ALPHA-002', 'AVAILABLE', 'LIGHT_DAMAGE', 15000)
  await mkCopy(alpha.id, 'R6-ALPHA-003', 'BORROWED', 'HEAVY_DAMAGE', 20000)
  await mkCopy(alpha.id, 'R6-ALPHA-004', 'LOST', 'GOOD', 25000)
  await mkCopy(alpha.id, 'R6-ALPHA-005', 'REMOVED', 'GOOD', 999999)

  // Buku Beta: 2 eksemplar, tanpa author/publisher — uji relasi null + isbn search.
  const beta = await mkBook('Buku Beta', '978-2', cat2.id, null, null)
  await mkCopy(beta.id, 'R6-BETA-001', 'AVAILABLE', 'GOOD', 30000)
  await mkCopy(beta.id, 'R6-BETA-002', 'BORROWED', 'GOOD', 35000)

  console.log('--- STEP 1: Laporan Koleksi penuh (4 keputusan PO) ---')
  const full = await service.getCollectionReport({})
  check('2 judul (REMOVED copy tidak menambah judul)', full.pagination.total === 2, String(full.pagination.total))
  const a = full.rows.find((r) => r.title === 'Buku Alpha')
  const b = full.rows.find((r) => r.title === 'Buku Beta')
  check('Alpha relasi author/publisher/category terisi', a?.authorName === 'Pengarang A' && a?.publisherName === 'Penerbit X' && a?.categoryName === 'Fiksi', JSON.stringify(a))
  check('Beta relasi null author/publisher (tidak crash)', b?.authorName === null && b?.publisherName === null, JSON.stringify(b))

  // G-4: copyCount = NON-REMOVED (4, bukan 5). G-5: per-dimensi boleh overlap.
  check('copyCount Alpha = 4 (exclude REMOVED)', a?.copyCount === 4, String(a?.copyCount))
  check('copyCount Beta = 2', b?.copyCount === 2, String(b?.copyCount))
  // Status: AVAILABLE 2 (001,002), BORROWED 1 (003), LOST 1 (004); REMOVED excluded.
  check('availableCount Alpha = 2', a?.availableCount === 2, String(a?.availableCount))
  check('borrowedCount Alpha = 1', a?.borrowedCount === 1, String(a?.borrowedCount))
  check('lostCount Alpha = 1', a?.lostCount === 1, String(a?.lostCount))
  // G-2: damaged = LIGHT_DAMAGE(002) + HEAVY_DAMAGE(003) = 2 (boleh overlap dengan BORROWED).
  check('damagedCount Alpha = 2 (LIGHT+HEAVY, overlap BORROWED)', a?.damagedCount === 2, String(a?.damagedCount))
  check('damagedCount Beta = 0', b?.damagedCount === 0, String(b?.damagedCount))
  // Invariant: available+borrowed+lost === copyCount (per dimensi status).
  check('invariant status sum == copyCount Alpha', (a?.availableCount ?? 0) + (a?.borrowedCount ?? 0) + (a?.lostCount ?? 0) === a?.copyCount, `${a?.availableCount}+${a?.borrowedCount}+${a?.lostCount} vs ${a?.copyCount}`)

  console.log('--- STEP 2: ringkasan koleksi (G-4/G-5) ---')
  check('summary totalTitles = 2', full.summary.totalTitles === 2, String(full.summary.totalTitles))
  check('summary totalCopies = 6 (exclude 1 REMOVED)', full.summary.totalCopies === 6, String(full.summary.totalCopies))
  const statusMap = new Map(full.summary.byStatus.map((s) => [s.status, s.count]))
  check('byStatus: AVAILABLE=3 BORROWED=2 LOST=1 (tanpa REMOVED)', statusMap.get('AVAILABLE') === 3 && statusMap.get('BORROWED') === 2 && statusMap.get('LOST') === 1 && statusMap.get('REMOVED') === undefined, JSON.stringify(full.summary.byStatus))
  const condMap = new Map(full.summary.byCondition.map((c) => [c.condition, c.count]))
  check('byCondition: GOOD=4 LIGHT_DAMAGE=1 HEAVY_DAMAGE=1', condMap.get('GOOD') === 4 && condMap.get('LIGHT_DAMAGE') === 1 && condMap.get('HEAVY_DAMAGE') === 1, JSON.stringify(full.summary.byCondition))
  check('asset value = sum NON-REMOVED (10000+15000+20000+25000+30000+35000 = 135000)', full.summary.totalAssetValue === 135000, String(full.summary.totalAssetValue))

  console.log('--- STEP 3: filter kategori (ringkasan ikut filter) ---')
  const catFik = await service.getCollectionReport({ categoryId: cat1.id })
  check('filter kategori Fiksi → 1 judul', catFik.pagination.total === 1, String(catFik.pagination.total))
  check('summary totalCopies kategori = 4 (exclude REMOVED)', catFik.summary.totalCopies === 4, String(catFik.summary.totalCopies))
  check('summary totalAssetValue kategori = 70000', catFik.summary.totalAssetValue === 70000, String(catFik.summary.totalAssetValue))

  console.log('--- STEP 4: search OR (G-6) — title/isbn/author/publisher ---')
  const sTitle = await service.getCollectionReport({ search: 'Alpha' })
  check('search judul "Alpha" → 1 baris', sTitle.pagination.total === 1, String(sTitle.pagination.total))
  const sIsbn = await service.getCollectionReport({ search: '978-2' })
  check('search ISBN "978-2" → 1 baris (Beta)', sIsbn.pagination.total === 1 && sIsbn.rows[0]?.title === 'Buku Beta', String(sIsbn.pagination.total))
  const sAuthor = await service.getCollectionReport({ search: 'Pengarang' })
  check('search author "Pengarang" → 1 baris (Alpha)', sAuthor.pagination.total === 1 && sAuthor.rows[0]?.title === 'Buku Alpha', String(sAuthor.pagination.total))
  const sPub = await service.getCollectionReport({ search: 'Penerbit' })
  check('search publisher "Penerbit" → 1 baris (Alpha)', sPub.pagination.total === 1, String(sPub.pagination.total))
  check('search ringkasan ikut filter (Penerbit → totalCopies 4)', sPub.summary.totalCopies === 4, String(sPub.summary.totalCopies))
  const sNone = await service.getCollectionReport({ search: 'Tidak Ada' })
  check('search tanpa hasil → 0 baris, summary 0', sNone.pagination.total === 0 && sNone.summary.totalCopies === 0, `${sNone.pagination.total}/${sNone.summary.totalCopies}`)

  console.log('--- STEP 5: pagination + skala >100 (anti-pola B1) ---')
  await prisma.book.createMany({
    data: Array.from({ length: 105 }, (_, i) => ({
      title: `Buku Massal ${String(i + 1).padStart(3, '0')}`,
      isbn: `978-9-${i}`,
      categoryId: cat2.id
    }))
  })
  const bulkBooks = await prisma.book.findMany({ where: { isbn: { startsWith: '978-9-' } }, orderBy: { isbn: 'asc' } })
  await prisma.bookCopy.createMany({
    data: bulkBooks.map((bb, i) => ({
      bookId: bb.id,
      inventoryNumber: `R6-BULK-${String(i + 1).padStart(3, '0')}`,
      barcode: `R6-BULK-${String(i + 1).padStart(3, '0')}`,
      shelfLocation: 'R9',
      status: 'AVAILABLE',
      condition: 'GOOD',
      acquisitionCost: 1000
    }))
  })
  const page2 = await service.getCollectionReport({ categoryId: cat2.id, page: 2, limit: 100 })
  check('bulk 105 + Beta = 106 judul kategori Nonfiksi', page2.pagination.total === 106, String(page2.pagination.total))
  check('page 2 limit 100 → 6 rows (tanpa clamp)', page2.rows.length === 6, String(page2.rows.length))
  check('summary stabil di page 2 (totalCopies Nonfiksi = 105+2)', page2.summary.totalCopies === 107, String(page2.summary.totalCopies))

  console.log('--- STEP 6: REPO — getCollectionSummary backward-compat (categoryId string) ---')
  const repo = new ReportRepository()
  const legacy = await repo.getCollectionSummary(cat2.id)
  check('getCollectionSummary(cat2.id) → totalCopies 107', legacy.totalCopies === 107, String(legacy.totalCopies))
  check('getCollectionSummary() (tanpa argumen) → totalCopies 111', (await repo.getCollectionSummary()).totalCopies === 111, String((await repo.getCollectionSummary()).totalCopies))

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
