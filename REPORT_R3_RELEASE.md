# R-3 RELEASE REPORT — Laporan Pengembalian

## Status: DONE — READY review PO

## Deliverable
| Item | Path |
|------|------|
| Halaman Laporan Pengembalian | `src/pages/report/ReturnReportPage.tsx` |
| Landing modul Laporan | `src/pages/ReportsPage.tsx` (+ kartu) |
| Route + nav + labels | `src/routes/index.tsx`, `src/utils/navigation.ts`, `src/utils/labels.ts` |
| Backend (aditif) | `src/shared/dto/report.ts`, `src/main/repositories/report.repository.ts`, `src/main/services/report.service.ts` |
| Smoke | `report_r3_smoke/smoke.ts` (41/41) |

## Fitur (UI)
- Filter **Periode** (Dari/Sampai tanggal) + **Pencarian** (nomor transaksi, nomor/nama anggota, judul buku) — server-side.
- 3 kartu statistik dari `summary` DTO: **Total Pengembalian · Tepat Waktu · Terlambat**.
- Tabel 7 kolom: Tanggal Kembali · Nomor Transaksi · Nama Anggota (nomor · nama) · Kelas (enrollment snapshot) · Judul Buku · **Lama Pinjam (N hari)** · **Status (badge Tepat Waktu/Terlambat)**.
- Pagination server-side (20/halaman), loading & empty state.

## Akses
`Laporan` (sidebar) → kartu **Laporan Pengembalian** → `/reports/returns`.

## Regression
- `report_r3_smoke` **41/41** · `report_r1_smoke` **46/46** · `report_r1_service_smoke` **52/52** · `it1_borrow_return` **34/34** · `it_borrow_eligibility` **7/7** · `wo14_e2` **36/36** (fresh DB temp).
- lint PASS · build PASS (main 1,864.98 · preload 9.95 · renderer 1,091.50 kB) · `prisma migrate diff` "empty migration" (schema & migration TIDAK disentuh).

## Komit
SATU final commit (source + smoke + 3 laporan R-3 + AGENTS.md) + push. File untracked milik WO lain TIDAK diikutkan.
