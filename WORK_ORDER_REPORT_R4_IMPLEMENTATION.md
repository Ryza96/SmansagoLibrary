# WORK ORDER R-4 — Laporan Keterlambatan (Overdue Report UI)

## Status: DONE — READY review PO

## Ringkasan
Halaman **Laporan Keterlambatan** dibangun end-to-end di atas fondasi R-1 (`ReportService` + `ReportRepository`) dengan **search server-side** (pola aditif non-breaking yang sama dengan R-2/R-3). WO ini adalah WO UI ketiga dari modul Report (WBS R-4). Kategori **MASIH TERLAMBAT** kini **1 baris = 1 buku** (per-buku `BorrowDetail`), bukan per-transaksi (perbaikan legacy R-1 `findActiveOverdue`), sehingga konsisten dengan R-2/R-3.

## Keputusan PO (pra-implementasi)
1. **Filter minimal = Periode + Search** (search **server-side**, pola aditif R-2/R-3: `OverdueReportFilter.search?` opsional → filter identik di baris & ringkasan & count).
2. **Kolom tabel = 8**: Tanggal Pinjam · Nomor Transaksi · Nama Anggota · Kelas (Enrollment Snapshot) · Judul Buku · Jatuh Tempo · **Hari Terlambat** · **Status (Masih Terlambat / Sudah Dikembalikan Terlambat)**.
3. **Statistik minimal 3 kartu**: Total Terlambat · Belum Dikembalikan · Sudah Dikembalikan Terlambat.
4. **TIDAK ADA kolom Petugas** (K1) dan **TIDAK ADA nominal denda** (K2) — `Setting.lateFee` TIDAK dikonsumsi; `lateDays` hanya jumlah hari (tanpa satuan denda).
5. **Status hanya 2 nilai**: MASIH TERLAMBAT = `returnDate null` + `dueDate < now` (category `ACTIVE`); SUDAH DIKEMBALIKAN TERLAMBAT = `returnedAt > dueDate` (category `RETURNED`).

## Perubahan

### Backend (ADITIF non-breaking — search + per-buku ACTIVE + pagination gabungan)
| File | Perubahan |
|------|-----------|
| `src/shared/dto/report.ts` | `OverdueReportFilter` + `search?: string` (kontrak existing `OverdueCategory`/`OverdueReportRowDTO`/`SummaryDTO` tidak berubah) |
| `src/main/repositories/report.repository.ts` | `OverdueActiveQuery` + `search?/skip?/take?`; `ReturnReportQuery` + `skip?/take?`; **baru** `buildActiveOverdueWhere` (satu grup OR di level detail: `{ borrow: { borrowNumber/memberNumber/memberName } }` + `bookTitle` — snapshot, pola R-3) & `buildReturnedLateSearchSql` (SQL AND-clause shared row+count); **baru** `findActiveOverdueDetails` (1 baris = 1 buku: `returnedAt: null` + `borrow: { returnDate: null, dueDate: { lt: asOf } }`, include `{ borrow: true }`, order `dueDate asc`) & `countActiveOverdueDetails` & `countReturnedLateBetween`; `findReturnedLateBetween` + search + skip/take override |
| `src/main/services/report.service.ts` | `getOverdueReport` + `search` pass-through; **pagination gabungan** via `computeOverdueSlice` (pure — alokasi skip/take per kategori dari posisi di daftar gabungan `[active..., returned...]`); ringkasan via count (search ikut terfilter); `lateDays = diffDays(now, dueDate)` (ACTIVE) / `diffDays(returnedAt, dueDate)` (RETURNED); `pagination.total = active + returned`, `totalPages = ceil(total / limit)` |

### Renderer (UI)
| File | Perubahan |
|------|-----------|
| `src/pages/report/OverdueReportPage.tsx` | **BARU** — filter Periode (Dari/Sampai `date`) + Search (teks); 3 kartu statistik (Total Terlambat / Belum Dikembalikan / Sudah Dikembalikan Terlambat); tabel 8 kolom; badge status (rose = Masih Terlambat, amber = Sudah Dikembalikan Terlambat); pagination 20/halaman; loading & empty state |
| `src/pages/ReportsPage.tsx` | + kartu "Laporan Keterlambatan" (ikon TriangleAlert, warna rose) |
| `src/routes/index.tsx` | + route `reports/overdues` |
| `src/utils/navigation.ts` | + `ROUTES.REPORT_OVERDUES = '/reports/overdues'` |
| `src/utils/labels.ts` | + `REPORT.OVERDUES/OVERDUES_DESC/TOTAL_OVERDUE/STILL_LATE/RETURNED_LATE/COL_BORROW_DATE/COL_LATE_DAYS/STATUS_STILL_LATE/STATUS_RETURNED_LATE` |

### Tidak diubah
- IPC/preload/env.d.ts/bootstrap (**channel `reports:overdues` reused** — DTO auto-flow, tidak ada wiring baru).
- `ReportRepository.findActiveOverdue` (legacy per-transaksi) & `findReturnedLateBetween` dipakai regression R-1 — dipertahankan; `getCollectionReport`/`getMemberReport`/`getBorrowingReport`/`getReturnReport` tidak berubah.
- Schema, migration, `BorrowService`, `ReturnService`, `EnrollmentService`, Dashboard, Promotion.

## Kontrak Data (R-1, dikonfirmasi di smoke)
- **MASIH TERLAMBAT = 1 baris = 1 buku** (`BorrowDetail` dari borrow `returnDate null` + `dueDate < now`); SUDAH DIKEMBALIKAN TERLAMBAT = 1 baris = 1 buku (`returnedAt > dueDate`). Peminjaman 2 buku → 2 baris.
- **Periode hanya memfilter kategori RETURNED** (oleh `returnedAt`); kategori ACTIVE (ongoing) **selalu tampil** apa pun periode — `parseRange` boundary `startOfDay/endOfDay` (pola R-1).
- **Kelas = snapshot `className`** pada baris `Borrow` yang ditulis `BorrowService.create` dari **SSOT `MemberEnrollment` ACTIVE** saat peminjaman (R-1/IT-1, tidak diubah).
- **Ringkasan mengikuti filter** (periode + search): `summary.active`/`summary.returned` dari count dengan filter yang sama; `summary.active + summary.returned == pagination.total`; pagination murni view (summary stabil antar-halaman).
- **Hari Terlambat** dihitung Service: ACTIVE = `diffDays(now, dueDate)`; RETURNED = `diffDays(returnedAt, dueDate)` (normalisasi tengah malam — deterministik).

## Validasi
| Gate | Hasil |
|------|-------|
| Smoke `report_r4_smoke` | **40/40 PASS** (fresh DB) |
| Regression R-1 repo `report_r1_smoke` | **46/46 PASS** |
| Regression R-1 service `report_r1_service_smoke` | **52/52 PASS** |
| Regression Borrow `it1_borrow_return_smoke` | **34/34 PASS** |
| Regression Borrow `it_borrow_eligibility_smoke` | **7/7 PASS** |
| Regression Borrow `wo14_e2_smoke` | **36/36 PASS** |
| `npm run lint` | PASS |
| `npm run build` | PASS — main **1,868.43 kB** (+3.45, backend overdue) · preload **9.95 kB** (identik) · renderer **1,104.99 kB** (+13.49, UI baru) |
| `prisma migrate diff` | "This is an empty migration." (exit 0) — schema tidak disentuh |
| Grep bundle | main `reports:overdues`=1 · renderer `Laporan Keterlambatan`=1 · `reports/overdues`=3 · `Masih Terlambat`=1 · `Hari Terlambat`=1 |

## Smoke R-4 (40 kasus) — pemetaan VALIDASI PO
1. **Data sesuai database**: `summary.active == borrowDetail.count(returnedAt null && borrow returnDate null && dueDate<now)`; `summary.returned == raw SQL count(returnedAt > dueDate)`; borrowNumber/member/buku/snapshot/kelas benar; ob4 (tepat waktu) & ob5 (belum lewat) tidak muncul.
2. **Hari Terlambat benar**: ob1=20, ob2=[5,5], ob3=4, ob6=[2,2]; konsisten `daysBetween` helper.
3. **Status benar (hanya 2 nilai)**: category ACTIVE/RETURNED valid; active returnDate null; returned returnDate terisi.
4. **Search berjalan (server-side)**: judul "Alpha" → 3 (+ summary ikut terfilter active 1/returned 2); nama "Dina" → 3; nomor anggota "R4-0002" → 2; nomor transaksi "0003" → 1; tanpa match → 0.
5. **Filter periode berjalan**: [10,now] → returned hanya ob3 (ob6 keluar), active tetap 3; [90,20] → returned = ob6×2, ob3 keluar (boundary presisi).
6. **Statistik sesuai hasil filter**: `summary.active + summary.returned == pagination.total`; active 3 / returned 3; search+periode → 2 (ob1 active + ob3 returned).
7. **Pagination & skala**: bulk 12 active → total 18, totalPages 2, **page1 10 baris / page2 8 baris** (pagination gabungan — baris dari dua query digabung tanpa melebihi limit), summary stabil antar-halaman.

## Deployment / Run Smoke
```
npx tsc --module commonjs --target es2022 --moduleResolution node --esModuleInterop --skipLibCheck --rootDir . --outDir <tmp>\out report_r4_smoke/smoke.ts report_r1_smoke/smoke.ts report_r1_service_smoke/smoke.ts it1_borrow_return_smoke/smoke.ts it_borrow_eligibility_smoke/smoke.ts wo14_e2_smoke/smoke.ts
# fresh DB per suite: Remove-Item *.db*; DATABASE_URL=file:C:/<tmp>/<suite>.db; prisma migrate deploy (workdir prisma/)
node <tmp>\out\<suite>\smoke.js  (DATABASE_URL absolute + NODE_PATH=<repo>\node_modules)
```
