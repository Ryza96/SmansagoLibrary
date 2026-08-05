# R-2 RELEASE REPORT — Laporan Peminjaman

## Status: DONE — READY review PO

## Deliverable
| Item | Path |
|------|------|
| Halaman Laporan Peminjaman | `src/pages/report/BorrowingReportPage.tsx` |
| Landing modul Laporan | `src/pages/ReportsPage.tsx` (stub → kartu) |
| Route + nav + labels | `src/routes/index.tsx`, `src/utils/navigation.ts`, `src/utils/labels.ts` |
| Backend search (aditif) | `src/shared/dto/report.ts`, `src/main/repositories/report.repository.ts`, `src/main/services/report.service.ts` |
| Smoke | `report_r2_smoke/smoke.ts` (35/35) |

## Fitur (UI)
- Filter **Periode** (Dari/Sampai tanggal), **Status** (Semua/Sedang Dipinjam/Sudah Kembali/Terlambat), **Pencarian** (nomor transaksi, nomor/nama anggota, judul buku) — semua server-side.
- 4 kartu statistik dari `summary` DTO.
- Tabel 7 kolom: Tanggal · Nomor Transaksi · Nama Anggota (nomor · nama) · Kelas (enrollment) · Judul Buku · Jatuh Tempo · Status (badge).
- Pagination server-side (20/halaman), loading & empty state.

## Akses
`Laporan` (sidebar) → kartu **Laporan Peminjaman** → `/reports/borrowings`.

## Regression
- `report_r2_smoke` 35/35 · `report_r1_smoke` 46/46 · `report_r1_service_smoke` 52/52 (fresh DB temp).
- lint PASS · build PASS · `prisma migrate diff` "empty migration" (schema & migration TIDAK disentuh).

## Komit
SATU final commit (source + smoke + 3 laporan R-2 + AGENTS.md) + push. File untracked milik WO lain TIDAK diikutkan.
