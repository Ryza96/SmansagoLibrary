# WORK ORDER R-2 — Laporan Peminjaman (Borrowing Report UI)

## Status: DONE — READY review PO

## Ringkasan
Halaman **Laporan Peminjaman** dibangun end-to-end di atas fondasi R-1 (`ReportService` + `ReportRepository`), dengan **search server-side** yang disetujui PO sebagai perubahan ADITIF non-breaking. WO ini adalah WO UI pertama dari modul Report (WBS R-2).

## Keputusan PO (pra-implementasi)
1. **Kolom tabel = 7** (bukan 8): **Tanggal** (= `borrowDate`, satu kolom) + Nomor Transaksi + Nama Anggota + Kelas + Judul Buku + Jatuh Tempo + Status. Kolom "Tanggal Pinjam" terpisah **DIBATALKAN**.
2. **Search = server-side** (disetujui lewat pertanyaan klarifikasi): `BorrowReportFilter` + `findBorrowingsBetween` + `countBorrowStatusSummary` + `ReportService.getBorrowingReport` menerima `search?: string` opsional — pencarian cocok di **borrowNumber**, **memberNumber**, **memberName**, dan **judul buku** (`details.some.bookCopy.book.title`).
3. **Ringkasan (statistik) = periode + search** (bukan per-halaman, bukan per-baris tampil): `countBorrowStatusSummary(from, to, search)` — konsisten VALIDASI "Ringkasan dihitung dari data periode tersebut".

## Perubahan

### Backend (ADITIF non-breaking — search)
| File | Perubahan |
|------|-----------|
| `src/shared/dto/report.ts` | `BorrowReportFilter` + `search?: string` |
| `src/main/repositories/report.repository.ts` | `BorrowReportQuery` + `search?`; `buildBorrowReportWhere` menambah `OR` (borrowNumber / member.memberNumber / member.fullName / details.bookCopy.book.title `contains`); `countBorrowStatusSummary(from, to, search?)` memakai `buildBorrowReportWhere` |
| `src/main/services/report.service.ts` | `getBorrowingReport` meneruskan `search` ke repo (list + summary) |

### Renderer (UI)
| File | Perubahan |
|------|-----------|
| `src/pages/report/BorrowingReportPage.tsx` | **BARU** — filter Periode (Dari/Sampai `date`), Status (Semua/ACTIVE/COMPLETED/OVERDUE), Search (teks); 4 kartu statistik (Total Transaksi / Sedang Dipinjam / Sudah Kembali / Terlambat); tabel 7 kolom; pagination; loading & empty state |
| `src/pages/ReportsPage.tsx` | Landing modul Laporan (kartu "Laporan Peminjaman") — menggantikan stub |
| `src/routes/index.tsx` | + route `reports/borrowings` |
| `src/utils/navigation.ts` | + `ROUTES.REPORT_BORROWINGS = '/reports/borrowings'` |
| `src/utils/labels.ts` | + blok `LABELS.REPORT` |

### Tidak diubah
- `ReportService.getBorrowingReport` derivasi status, `lateDays`, mapping — **tetap** (hanya pass-through search).
- `BorrowReportStatus` derivation (ACTIVE/COMPLETED/OVERDUE), `deriveBorrowStatus`.
- Laporan lain (returns/overdues/members/collections), `PromotionRunService`.
- Schema, migration, `BorrowService`, `BorrowRepository`, Dashboard, `src/shared/config/borrow-status.ts`.

## Kontrak Status (R-1, dikonfirmasi di smoke)
- **Filter `ACTIVE`** = `returnDate null` (belum dikembalikan) — **mencakup yang terlambat**; badge per-baris tetap OVERDUE.
- **Filter `COMPLETED`** = `returnDate` terisi. **Filter `OVERDUE`** = `returnDate null` + `dueDate < now` (subset ACTIVE).
- **`summary.total` = transaksi** (`Borrow`), **rows = per buku** (`BorrowDetail`) — peminjaman 2 buku → 2 baris.
- **Kelas = snapshot `className`** pada baris `Borrow` yang ditulis `BorrowService.create` dari **SSOT `MemberEnrollment` ACTIVE** saat peminjaman (R-1/IT-1, tidak diubah).

## Validasi
| Gate | Hasil |
|------|-------|
| Smoke `report_r2_smoke` | **35/35 PASS** (fresh DB) |
| Regression R-1 repo `report_r1_smoke` | **46/46 PASS** |
| Regression R-1 service `report_r1_service_smoke` | **52/52 PASS** |
| `npm run lint` | PASS |
| `npm run build` | PASS — main **1,863.01 kB** (+0.41, search aditif) · preload **9.95 kB** (identik) · renderer **1,078.43 kB** (+17.57, UI baru) |
| `prisma migrate diff` | "This is an empty migration." (exit 0) — schema tidak disentuh |
| Grep bundle | main `reports:borrowings`=1 · renderer `Laporan Peminjaman`/`reports/borrowings`/`Total Transaksi`/placeholder search ter-render |

## Smoke R-2 (35 kasus) — pemetaan VALIDASI PO
1. **Periode server-side**: [60 hari] → 4 transaksi (br5 120-hari keluar); [150 hari] → 5; boundary `to` presisi ([60,26] → 2).
2. **Filter status server-side**: ACTIVE=2 (br1 terbawa + br4, badge br1 OVERDUE), COMPLETED=2, OVERDUE=1.
3. **Statistik == tabel**: `summary.total == pagination.total`; active/completed/overdue benar; kartu stabil antar-halaman (pagination tidak mengubah summary).
4. **Search server-side**: judul "Alpha" → 3 + summary ikut terfilter (total 3, belum-kembali 1, kembali 2, terlambat 1); nama "Dina" → 2; nomor anggota "R2-0002" → 1; nomor transaksi "0003" → 1; tanpa match → 0; kombinasi search+status → 2.
5. **Kelas SSOT**: siswa → "X Merdeka 1" (snapshot dari enrollment ACTIVE); guru tanpa enrollment → null.
6. **Status turunan**: open+due lalu → OVERDUE; kembali sebelum due → COMPLETED; kembali terlambat (returnDate set) → COMPLETED (COMPLETED menang); open+due depan → ACTIVE.
7. **Pagination & skala**: bulk 12 → total 16, totalPages 2, page1 5 baris (rows=per-buku), page2 0 baris (bulk tanpa detail).

## Deployment / Run Smoke
```
npx tsc --module commonjs --target es2022 --moduleResolution node --esModuleInterop --skipLibCheck --rootDir . --outDir <tmp>\out report_r2_smoke/smoke.ts report_r1_smoke/smoke.ts report_r1_service_smoke/smoke.ts
# fresh DB per suite: Remove-Item *.db*; DATABASE_URL=file:C:/<tmp>/<suite>.db; prisma migrate deploy (workdir prisma/)
node <tmp>\out\<suite>\smoke.js  (DATABASE_URL absolute + NODE_PATH=<repo>\node_modules)
```
