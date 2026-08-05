# R-2 FINAL REVIEW — Laporan Peminjaman

## Keputusan Review
- [x] **Architecture Gate — LULUS** (R-2 READY review PO, tidak lanjut R-3..R-9)
- Search server-side **disetujui PO** sebagai perubahan ADITIF non-breaking ke kontrak R-1.
- Kolom tabel **7** (Tanggal = `borrowDate`); kolom "Tanggal Pinjam" dibatalkan.

## Arsitektur (pola konsisten repo)
- **Renderer TIDAK menurunkan angka** — seluruh statistik/status dari `ReportService` DTO; renderer hanya memformat tanggal & badge. Search dikirim sebagai `search` ke channel `reports.borrowings` (backend melakukan filter OR).
- **1 IPC `reports.borrowings` reused** — TIDAK ada channel baru; preload/env.d.ts tidak berubah.
- **Server-side search** cocok lintas relasi: `borrowNumber`, `member.memberNumber`, `member.fullName`, `details.bookCopy.book.title` via Prisma `OR` + `contains` (SQLite LIKE) — diuji 5 skenario + kombinasi status.
- **Ringkasan konsisten dengan filter** — `countBorrowStatusSummary(from, to, search)` menerapkan search yang sama; kartu tidak berubah antar-halaman (pagination murni view).

## Checklist Mandat
| Mandat | Bukti |
|--------|-------|
| Renderer tidak menghitung business logic | grep di `src/pages/report` — hanya format tanggal/badge; semua angka dari DTO |
| Backend additive, tidak refactor R-1 | `git diff` hanya +field search +OR clause +pass-through; laporan lain 0 perubahan |
| Tidak menyentuh schema/migration | `prisma migrate diff` = "empty migration" (exit 0) |
| Tidak menyentuh domain lain | `BorrowService`/`BorrowRepository`/Dashboard/Promotion/`borrow-status.ts` tidak diubah |
| Kontrak DTO dipertahankan | `BorrowReportFilter` field baru **opsional** — caller lama aman (regression R-1 98/98) |
| Smoke membuktikan 6 VALIDASI PO | 35 kasus (per periode/status/statistik/search/kelas/status-turunan) + boundary + pagination + skala |

## Risiko / Catatan
- **Filter ACTIVE = belum dikembalikan (returnDate null) mencakup terlambat** — perilaku R-1 yang dikonfirmasi; badge per-baris tetap OVERDUE. Jika PO menghendaki ACTIVE eksklusif-overdue, itu perubahan kontrak R-1 (WO terpisah).
- **rows ≠ transactions**: tabel 1 baris per buku, `summary.total` = transaksi. UI footer menampilkan "Total {n} transaksi" dari `pagination.total` — konsisten kontrak DTO.
- Pencarian `contains` SQLite bersifat case-insensitive untuk ASCII (LIKE) — cocok untuk angka/nama; perilaku non-ASCII mengikuti SQLite.

## Hasil Gate
lint PASS · build PASS (main 1,863.01 · preload 9.95 · renderer 1,078.43 kB) · smoke R-2 35/35 · regression R-1 98/98 · `prisma migrate diff` no-drift · grep bundle ter-render.
