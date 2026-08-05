# WORK ORDER REPORT R-1 — Report Module Foundation (COMPLETE - READY review PO)

## Source of Truth
- `REPORT_MODULE_DISCOVERY.md` — **APPROVED** (Product Owner). Memuat keputusan K1/K2 + WBS R-1..R-9 + panduan query untuk 6 laporan v1.0.
- WBS Report Module: R-1 = fondasi (DTO + Repository + Service + IPC + Preload + env.d.ts + Bootstrap).

## Scope
R-1 **penuh**: kontrak DTO (6 laporan) + `ReportRepository` + `ReportService` + IPC `reports:*` + preload + `env.d.ts` + wiring Bootstrap. **TANPA** UI, tabel, filter UI, export, PDF/Print. **TANPA** perubahan schema/migration/repository domain.

## Keputusan Product Owner (dari Discovery, tidak dibuka ulang)
- **K1** — Kolom **Petugas** DIHAPUS dari desain laporan v1.0 (tidak ada sistem user). `Setting.librarianName`/`reportSigner` hanya untuk tanda tangan laporan, bukan data transaksi.
- **K2** — Keterlambatan **TANPA nominal denda**; laporan keterlambatan menampilkan kategori (masih/relevan terlambat) + jumlah hari (`lateDays`).

## Arsitektur
```
Renderer → IPC (reports:*) → ReportService → ReportRepository → Prisma (getPrisma — stack baru)
```

## Deliverable

### 1. DTO — `src/shared/dto/report.ts` (fondasi)
Kontrak 5 laporan (Promosi memakai `promotion.ts` existing P-1..P-4):
- `BorrowingReportDTO` — filter `from/to/status (ACTIVE|COMPLETED|OVERDUE)/page/limit`; row per baris buku (`borrowNumber, borrowDate, memberNumber, memberName, className, bookTitle, dueDate, returnDate, status`); summary `total/active/completed/overdue`.
- `ReturnReportDTO` — 1 baris = 1 buku kembali; `lateDays: number | null`; summary `total/returnedGood/returnedDamaged/returnedLost`.
- `OverdueReportDTO` — `category (ACTIVE|RETURNED)`; `lateDays: number`; summary `active/returned`.
- `MemberReportDTO` — filter `memberType/academicYearId/classId/search`; `className` dari SSOT enrollment; summary `total/students/teachers/general`.
- `CollectionReportDTO` — filter `categoryId/search`; summary `totalTitles/totalCopies/totalAssetValue` + `byStatus/byCondition`.

### 2. Repository — `src/main/repositories/report.repository.ts` (fondasi)
`ReportRepository extends BaseRepository` (getPrisma, stack baru). Method query mentah + ringkasan `count()`/`groupBy()`/`aggregate()` (anti-pola bug B1 clamp 100). `findReturnedLateBetween` memakai `$queryRaw` + `Prisma.sql` (perbandingan kolom-ke-kolom `returnedAt > dueDate`).

### 3. Service — `src/main/services/report.service.ts` (BARU - WO ini)
- `getBorrowingReport(filter)` — boundary `startOfDay`/`endOfDay` via `parseRange`; status turunan `deriveBorrowStatus(returnDate, dueDate, now)` per baris buku; summary dari `countBorrowStatusSummary`; Promise.all paralel.
- `getReturnReport(filter)` — 1 baris per detail kembali; `lateDays = diffDays(returnedAt, dueDate)` hanya bila `returnedAt > dueDate`; kondisi dari kolom.
- `getOverdueReport(filter)` — gabung `findActiveOverdue` (lateDays dari `now` vs `dueDate`) + `findReturnedLateBetween` (lateDays dari `returnedAt` vs `dueDate`); kategori ACTIVE/RETURNED.
- `getMemberReport(filter)` — `className` dari `memberEnrollments[0]` (SSOT ACTIVE); summary dari `countMembersByType` dipetakan via `MEMBER_TYPES` (`student/teacher/general`).
- `getCollectionReport(filter)` — row `copyCount` + relasi nama; summary asset/status/kondisi dari repo.
- `parseRange` default "dari sekarang s/d sekarang" saat filter kosong; `iso()`; `diffDays` (normalisasi startOfDay, deterministik).
- Laporan Promosi TIDAK diduplikasi — memakai `PromotionRunService` existing (P-3/P-4).

### 4. IPC — `electron/ipc/report.ipc.ts` (BARU - WO ini)
`registerReportHandlers(reportService)` — 5 channel: `reports:borrowings`, `reports:returns`, `reports:overdues`, `reports:members`, `reports:collections`. Handler tipis (validasi input via DTO shared, teruskan ke service).

### 5. Preload — `electron/preload/report.preload.ts` (BARU) + `electron/preload/index.ts`
`reportAPI.reports.{borrowings,returns,overdues,members,collections}` via `ipcRenderer.invoke`; di-spread ke `electronAPI`.

### 6. env.d.ts — `src/renderer/env.d.ts`
Blok `reports` bertipe penuh memakai `import('../../src/shared/dto/report')`.

### 7. Bootstrap — `electron/main/bootstrap.ts` + `electron/ipc/index.ts`
`ReportService(new ReportRepository())` di Container; `reportService` ditambahkan ke signature `registerAllHandlers`; `registerReportHandlers(services.reportService)`.

## TIDAK diubah
schema & migration, `borrow.repository`/`member.repository`/`dashboard.*`, `PromotionRunService`, UI/routes/sidebar/labels, renderer (bundle identik), channel print.

## Validation

| Gate | Hasil |
|------|-------|
| Smoke Service `report_r1_service_smoke/smoke.ts` (BARU) | **52/52 PASS** (fresh DB) |
| Regression `report_r1_smoke/smoke.ts` (repository) | **46/46 PASS** (fresh DB) |
| `npm run lint` | PASS (tsc node+web) |
| `npm run build` | PASS — main **1,862.60 kB** (+17.31), preload **9.95 kB** (+0.48), renderer **1,060.86 kB** (IDENTIK baseline) |
| `prisma migrate diff --from-migrations --to-schema-datamodel --script` | "This is an empty migration." (exit 0) |
| Grep bundle main | `reports:borrowings/returns/overdues/members/collections` masing-masing 1 |
| Grep bundle preload | `reports:` + `invoke("reports:*")` ter-render |
| Grep bundle renderer | `reports` = 0 (R-1 backend-only, UI di R-2+) |

### Smoke Service (52/52) — kasus yang dibuktikan
- **Peminjaman**: total baris 6 (b5 2 buku), summary 5 transaksi (active 2 / completed 3 / overdue 1); status turunan per baris (b1 OVERDUE, b2 COMPLETED, b4 ACTIVE); filter status 3 jalur; rentang `[-30,-10]` meng-exclude b4 (boundary benar); pagination passthrough.
- **Pengembalian**: 4 detail; kondisi BAIK=2/RUSAK=1/HILANG=1; `lateDays` null (tepat waktu), 4 (telat), 5 (telat 2 baris).
- **Keterlambatan**: ACTIVE 1 (lateDays 20 = daysBetween(now, due)), RETURNED 3 (4/5/5); summary + pagination merge.
- **Anggota**: className dari enrollment ACTIVE; guru null; summary 1/1/1; filter memberType/classId/search.
- **Koleksi**: copyCount + relasi nama; summary asset 80000; byStatus AVAILABLE=2/BORROWED=1/LOST=1; filter kategori → 25000.
- **Determinisme tanggal**: helper `daysBetween` konsisten dengan derivasi Service.

## Rilis
- ONE FINAL COMMIT + push (source + smoke + laporan + AGENTS.md).
- File untracked milik WO lain (BORROW_ENROLLMENT_DISCOVERY, INTEGRATION_TEST_PHASE1_DISCOVERY, IT1_DISCOVERY_REPORT, MEMBERSHIP_STATUS_BUG_REPORT, MEMBER_STATUS_ALIGNMENT_PLAN, MEMBER_STATUS_FINAL_AUDIT, STUDENT_CLASS_DISPLAY_BUG_REPORT) TIDAK diikutkan.

## Status
**DONE - READY review Product Owner.** Tidak lanjut R-2 (UI laporan).
