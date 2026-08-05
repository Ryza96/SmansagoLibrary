# WORK ORDER R-3 — Laporan Pengembalian (Return Report UI)

## Status: DONE — READY review PO

## Ringkasan
Halaman **Laporan Pengembalian** dibangun end-to-end di atas fondasi R-1 (`ReportService` + `ReportRepository`) dengan **search server-side** (pola aditif non-breaking yang sama dengan R-2). WO ini adalah WO UI kedua dari modul Report (WBS R-3).

## Keputusan PO (pra-implementasi)
1. **Filter minimal = Periode + Search** (search **server-side**, pola aditif R-2: `ReturnReportFilter.search?` opsional → OR di `findReturnedDetailsBetween` + ringkasan ikut terfilter).
2. **Kolom tabel = 7**: Tanggal Kembali · Nomor Transaksi · Nama Anggota · Kelas (Enrollment Snapshot) · Judul Buku · **Lama Pinjam (dalam hari)** · **Status (Tepat Waktu / Terlambat)**.
3. **Statistik minimal 3 kartu**: Total Pengembalian · Tepat Waktu · Terlambat.
4. **TIDAK ADA kolom Petugas** (K1) dan **TIDAK ADA nominal denda** (K2) — kontrak R-1.
5. **Status ditentukan dari `returnDate` dan `dueDate`** per detail: TEPAT WAKTU = `returnedAt <= dueDate`; TERLAMBAT = `returnedAt > dueDate`.

## Perubahan

### Backend (ADITIF non-breaking — search + lama pinjam + status + statistik waktu)
| File | Perubahan |
|------|-----------|
| `src/shared/dto/report.ts` | `ReturnReportFilter` + `search?: string`; `ReturnReportRowDTO` + `durationDays: number` + `status: ReturnStatus` (`'ON_TIME' | 'LATE'`); `ReturnReportSummaryDTO` + `onTime: number` + `late: number` (onTime + late === total) |
| `src/main/repositories/report.repository.ts` | `ReturnReportQuery` + `search?`; `buildReturnReportWhere` menambah `OR` (borrowNumber / memberNumber / memberName snapshot / bookTitle snapshot `contains`); `findReturnedDetailsBetween` memakai builder; `countReturnedConditionSummary(from, to, search?)`; **baru** `countReturnedTimingSummary` (total via Prisma count + late via raw SQL join karena perbandingan dua kolom `returnedAt > dueDate` tak bisa jadi relation filter) |
| `src/main/services/report.service.ts` | `getReturnReport` meneruskan `search`; per baris menghitung `durationDays = diffDays(returnedAt, borrowDate)` + `status` (LATE/ON_TIME) + `lateDays` (eksisting); summary `onTime = total - late` |

### Renderer (UI)
| File | Perubahan |
|------|-----------|
| `src/pages/report/ReturnReportPage.tsx` | **BARU** — filter Periode (Dari/Sampai `date`) + Search (teks); 3 kartu statistik (Total Pengembalian / Tepat Waktu / Terlambat); tabel 7 kolom; badge status; pagination; loading & empty state |
| `src/pages/ReportsPage.tsx` | + kartu "Laporan Pengembalian" |
| `src/routes/index.tsx` | + route `reports/returns` |
| `src/utils/navigation.ts` | + `ROUTES.REPORT_RETURNS = '/reports/returns'` |
| `src/utils/labels.ts` | + `REPORT.RETURNS/RETURNS_DESC/TOTAL_RETURNS/ON_TIME/LATE/COL_RETURN_DATE/COL_DURATION/DAYS` |

### Tidak diubah
- `ReportService.getReturnReport` mapping `lateDays`/kondisi, `ReportRepository.findReturnedLateBetween`/`findActiveOverdue`, laporan lain (borrowings/overdues/members/collections), `PromotionRunService`.
- IPC/preload/env.d.ts/bootstrap (**channel `reports:returns` reused** — DTO auto-flow, tidak ada wiring baru).
- Schema, migration, `BorrowService`, `ReturnService`, `EnrollmentService`, Dashboard, Promotion.

## Kontrak Data (R-1, dikonfirmasi di smoke)
- **1 baris = 1 buku yang dikembalikan** (`BorrowDetail.returnedAt != null`); `summary.total` = jumlah **buku** kembali (= `pagination.total` = `rows.length`). Peminjaman 2 buku → 2 baris.
- **Kelas = snapshot `className`** pada baris `Borrow` yang ditulis `BorrowService.create` dari **SSOT `MemberEnrollment` ACTIVE** saat peminjaman (R-1/IT-1, tidak diubah).
- **Search memakai snapshot** (borrowNumber / memberNumber / memberName pada `Borrow` + `bookTitle` pada `BorrowDetail`) — persis nilai kolom yang ditampilkan.
- **Ringkasan mengikuti filter** (periode + search): `summary.total`/`onTime`/`late`/kondisi semuanya dari filter yang sama; pagination murni view (summary stabil antar-halaman).

## Validasi
| Gate | Hasil |
|------|-------|
| Smoke `report_r3_smoke` | **41/41 PASS** (fresh DB) |
| Regression R-1 repo `report_r1_smoke` | **46/46 PASS** |
| Regression R-1 service `report_r1_service_smoke` | **52/52 PASS** |
| Regression Borrow `it1_borrow_return_smoke` | **34/34 PASS** |
| Regression Borrow `it_borrow_eligibility_smoke` | **7/7 PASS** |
| Regression Borrow `wo14_e2_smoke` | **36/36 PASS** |
| `npm run lint` | PASS |
| `npm run build` | PASS — main **1,864.98 kB** (+1.97, backend return) · preload **9.95 kB** (identik) · renderer **1,091.50 kB** (+13.07, UI baru) |
| `prisma migrate diff` | "This is an empty migration." (exit 0) — schema tidak disentuh |
| Grep bundle | main `reports:returns`=1 · renderer `Laporan Pengembalian`=1 · `reports/returns`=3 · `Total Pengembalian`=1 |

## Smoke R-3 (41 kasus) — pemetaan VALIDASI PO
1. **Data sesuai database**: `rows.length == borrowDetail.count(returnedAt not null)`; borrowNumber/member/buku/tanggal-kembali benar; rt4 (belum kembali) tidak muncul.
2. **Lama Pinjam benar**: durationDays rt1=13, rt2=19, rt3=12, rt5=7, rt6=4; konsisten `daysBetween(returned, borrow)`.
3. **Status benar**: rt1/rt5/rt6 ON_TIME (lateDays null); rt2 LATE 4; rt3 LATE 5.
4. **Search berjalan (server-side)**: judul "Alpha" → 2 (+ summary ikut terfilter onTime 1/late 1/kondisi); nama "Dina" → 3; nomor anggota "R3-0002" → 2; nomor transaksi "0005" → 1; tanpa match → 0.
5. **Filter periode berjalan**: [60,15] → 1 (rt5); [14,now] → 5 (rt5 keluar) — boundary presisi.
6. **Statistik sesuai hasil filter**: summary.total == pagination.total == rows; onTime+late == total; onTime 4 / late 2; kondisi BAIK 4 / RUSAK 1 / HILANG 1.
7. **Pagination & skala**: bulk 12 (masing-masing 1 detail) → total 18, totalPages 2, page1 10 / page2 8, summary stabil antar-halaman.

## Deployment / Run Smoke
```
npx tsc --module commonjs --target es2022 --moduleResolution node --esModuleInterop --skipLibCheck --rootDir . --outDir <tmp>\out report_r3_smoke/smoke.ts report_r1_smoke/smoke.ts report_r1_service_smoke/smoke.ts it1_borrow_return_smoke/smoke.ts it_borrow_eligibility_smoke/smoke.ts wo14_e2_smoke/smoke.ts
# fresh DB per suite: Remove-Item *.db*; DATABASE_URL=file:C:/<tmp>/<suite>.db; prisma migrate deploy (workdir prisma/)
node <tmp>\out\<suite>\smoke.js  (DATABASE_URL absolute + NODE_PATH=<repo>\node_modules)
```
