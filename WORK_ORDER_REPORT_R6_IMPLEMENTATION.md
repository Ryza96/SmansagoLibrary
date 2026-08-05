# WORK ORDER REPORT R-6 — Laporan Koleksi Buku UI + Backend Aditif (4 Keputusan PO)

## Status: DONE - READY review PO

## Ringkasan
WO UI keempat modul Report (setelah R-2 Peminjaman, R-3 Pengembalian, R-4 Keterlambatan, R-5 Anggota) sekaligus **perluasan backend aditif** sesuai **4 keputusan PO** dari `REPORT_R6_DISCOVERY.md` (DISCOVERY APPROVED):
- **G-2:** "Rusak" = count `condition ∈ {LIGHT_DAMAGE, HEAVY_DAMAGE}` (tanpa migration — nilai `RUSAK` tidak ada di schema).
- **G-4:** "Jumlah Eksemplar" (`copyCount`) & `totalCopies` = **Non-REMOVED saja** (`status != REMOVED`); `LOST` tetap dihitung.
- **G-5:** Status × kondisi **per dimensi, boleh overlap** — kolom `Tersedia + Dipinjam + Hilang + Rusak` tidak dijamin sum = total.
- **G-6:** Search **diperluas** — `OR` atas `title`, `isbn`, `author.name`, `publisher.name` (bukan hanya `title contains`).

## Backend (aditif, 3 file)
- `src/shared/dto/report.ts` — `CollectionReportRowDTO` +`borrowedCount`/`availableCount`/`lostCount`/`damagedCount` (semua aditif; `copyCount` tetap).
- `src/main/repositories/report.repository.ts`:
  - `bookReportInclude._count.bookCopies` → **difilter** `where: { status: { not: REMOVED } }` (G-4).
  - `findBookReportRows` — setelah fetch halaman, breakdown per-judul via **groupBy** (bukan fetch-all / anti-pola B1): status group `(bookId, status)` + damaged group `(bookId)` utk `condition ∈ {LIGHT_DAMAGE, HEAVY_DAMAGE}`, keduanya filter non-REMOVED; hasil digabung ke `BookReportRowWithCounts`.
  - `getCollectionSummary(categoryId?, search?)` — kini **search-aware** (G-6) & mengeksklusi REMOVED dari `totalCopies`/`byStatus`/`byCondition`/asset (G-4); signature backward-compat (argumen lama `getCollectionSummary(catId)` tetap valid — regression R-1 repo membuktikan).
  - Helper `buildBookReportWhere` — filter kategori + search `OR` lintas relasi; dipakai findMany & summary agar ringkasan konsisten (pola R-2..R-5).
- `src/main/services/report.service.ts` — `getCollectionReport` meneruskan `search` ke summary & mapping 4 field count baru ke DTO.

## Renderer (5 file)
- `src/pages/report/CollectionReportPage.tsx` (**baru**) — filter Kategori `select` (dari `categories.findMany`) + Search (server-side); 3 kartu statistik (Total Judul / Total Eksemplar / Nilai Aset); tabel 11 kolom (ISBN, Judul, Penulis, Penerbit, Kategori, Tahun, Jumlah Eksemplar, Tersedia, Dipinjam, Hilang, Rusak) dengan ikon inline per kolom count; pagination 20/halaman; loading & empty state.
- `src/pages/ReportsPage.tsx` (+kartu "Laporan Koleksi Buku" ikon `BookMarked` amber).
- `src/routes/index.tsx` (+`reports/collections`).
- `src/utils/navigation.ts` (+`REPORT_COLLECTIONS`).
- `src/utils/labels.ts` (+`REPORT.COLLECTIONS/COLLECTIONS_DESC/TOTAL_TITLES/TOTAL_COPIES/TOTAL_ASSET_VALUE/COL_ISBN/COL_AUTHOR/COL_PUBLISHER/COL_CATEGORY/COL_PUBLICATION_YEAR/COL_COPY_COUNT/STATUS_AVAILABLE/STATUS_BORROWED/STATUS_LOST/CONDITION_DAMAGED/CATEGORY_FILTER/CATEGORY_ALL/SEARCH_BOOK`).

## TIDAK diubah
IPC/preload/env.d.ts/bootstrap (**channel `reports:collections` reused** — DTO aditif auto-flow, tanpa wiring baru), schema/migration (diff = "This is an empty migration."), `BookCopyStatus`/`BookCopyCondition` config, `BorrowService`/`ReturnService`, laporan lain, `buildBookReportWhere` tidak mengubah `findBookReportRows` kontrak lama (search single-word tetap title-match — smoke R-1 hijau).

## Validation PASS
1. **smoke `report_r6_smoke` 30/30** (fresh DB): 4 keputusan PO — G-2 damagedCount Alpha=2 (LIGHT+HEAVY, overlap BORROWED), G-4 copyCount Alpha=4 (5-1 REMOVED) & summary totalCopies=6 & byStatus tanpa REMOVED, G-5 invariant `available+borrowed+lost == copyCount` per-judul + overlap damaged, G-6 search 5 skenario (judul/ISBN/author/publisher/no-result) + ringkasan ikut filter; filter kategori; **skala bulk 105 → page 2 = 6 rows tanpa clamp**; backward-compat `getCollectionSummary(catId)` & `getCollectionSummary()`.
2. **Regression Report 7 suite fresh DB total 290 PASS** — r1 46 · r1_service 52 · r2 35 · r3 41 · r4 40 · r5 46 · **r6 30** (perubahan aditif tidak memutus kontrak lama; bukti: smoke lama dijalankan, bukan hanya tsc).
3. `npm run lint` PASS (tsc node+web).
4. `npm run build` PASS (main **1,872.87 kB** +2.44 [backend koleksi] · preload **9.95 kB identik** · renderer **1,137.66 kB** +17.64 [UI baru]).
5. `prisma migrate diff --from-migrations --to-schema-datamodel` = "This is an empty migration." (schema tidak disentuh).
6. Grep bundle: main `reports:collections`=1; renderer `Laporan Koleksi Buku`=1/`reports/collections`=3/`Jumlah Eksemplar`=2/`Nilai Aset`=1/`Total Eksemplar`=1 ter-render.

## Laporan Terkait
- `REPORT_R6_DISCOVERY.md` (DISCOVERY APPROVED + keputusan PO, kini berstatus implementasi selesai)
- `REPORT_R6_FINAL_REVIEW.md`, `REPORT_R6_RELEASE.md`
