# R-4 RELEASE REPORT — Laporan Keterlambatan

## Status: DONE — READY review PO

## Deliverable
| Item | Path |
|------|------|
| Halaman Laporan Keterlambatan | `src/pages/report/OverdueReportPage.tsx` |
| Landing modul Laporan | `src/pages/ReportsPage.tsx` (+ kartu) |
| Route + nav + labels | `src/routes/index.tsx`, `src/utils/navigation.ts`, `src/utils/labels.ts` |
| Backend (aditif) | `src/shared/dto/report.ts`, `src/main/repositories/report.repository.ts`, `src/main/services/report.service.ts` |
| Smoke | `report_r4_smoke/smoke.ts` (40/40) |

## Fitur (UI)
- Filter **Periode** (Dari/Sampai tanggal) + **Pencarian** (nomor transaksi, nomor/nama anggota, judul buku) — server-side.
- 3 kartu statistik dari `summary` DTO: **Total Terlambat · Belum Dikembalikan · Sudah Dikembalikan Terlambat**.
- Tabel 8 kolom: Tanggal Pinjam · Nomor Transaksi · Nama Anggota (nomor · nama) · Kelas (enrollment snapshot) · Judul Buku · Jatuh Tempo · **Hari Terlambat (N hari)** · **Status (badge Masih Terlambat / Sudah Dikembalikan Terlambat)**.
- Pagination server-side (20/halaman), loading & empty state.
- **1 baris = 1 buku** (kategori MASIH TERLAMBAT juga per-buku, konsisten R-2/R-3).

## Akses
`Laporan` (sidebar) → kartu **Laporan Keterlambatan** → `/reports/overdues`.

## Regression
- `report_r4_smoke` **40/40** · `report_r1_smoke` **46/46** · `report_r1_service_smoke` **52/52** · `it1_borrow_return` **34/34** · `it_borrow_eligibility` **7/7** · `wo14_e2` **36/36** (fresh DB temp).
- lint PASS · build PASS (main 1,868.43 · preload 9.95 · renderer 1,104.99 kB) · `prisma migrate diff` "empty migration" (schema & migration TIDAK disentuh).

## Komit
SATU final commit (source + smoke + 3 laporan R-4 + AGENTS.md) + push. File untracked milik WO lain TIDAK diikutkan.
