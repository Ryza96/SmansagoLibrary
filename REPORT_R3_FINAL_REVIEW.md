# R-3 FINAL REVIEW — Laporan Pengembalian

## Keputusan Review
- [x] **Architecture Gate — LULUS** (R-3 READY review PO, tidak lanjut R-4..R-9)
- Search server-side mengikuti pola aditif non-breaking R-2 (tidak mengubah kontrak R-1 yang sudah di-approve).
- Kolom tabel **7** (Tanggal Kembali, Nomor Transaksi, Nama Anggota, Kelas snapshot, Judul Buku, Lama Pinjam, Status); tanpa Petugas (K1) & tanpa nominal denda (K2).

## Arsitektur (pola konsisten repo)
- **Renderer TIDAK menurunkan angka** — `durationDays`, `status` (ON_TIME/LATE), `onTime`/`late` seluruhnya dihitung `ReportService`; renderer hanya memformat tanggal & badge. Search dikirim sebagai `search` ke channel `reports.returns`.
- **1 IPC `reports.returns` reused** — TIDAK ada channel/preload/env.d.ts/bootstrap baru; DTO aditif auto-flow ke kontrak renderer.
- **Server-side search memakai snapshot**: `Borrow.borrowNumber` / `Borrow.memberNumber` / `Borrow.memberName` + `BorrowDetail.bookTitle` via Prisma `OR` + `contains` — persis nilai kolom yang ditampilkan (konsisten antara list & summary & late-count raw SQL).
- **late count = raw SQL join** (`returnedAt > dueDate` = perbandingan dua kolom lintas baris yang tak bisa diekspresikan sebagai Prisma relation filter — pola R-1 `findReturnedLateBetween`); total via Prisma count dengan builder yang sama → `onTime = total - late`, dijamin `onTime + late === total`.

## Checklist Mandat
| Mandat | Bukti |
|--------|-------|
| Renderer tidak menghitung business logic | grep di `src/pages/report` — hanya format tanggal/badge; semua angka dari DTO |
| Backend additive, tidak refactor R-1 | `git diff` hanya +field (search/durationDays/status/onTime/late) +builder +pass-through; laporan lain 0 perubahan |
| Tidak menyentuh schema/migration | `prisma migrate diff` = "empty migration" (exit 0) |
| Tidak menyentuh domain lain | `BorrowService`/`ReturnService`/Enrollment/Dashboard/Promotion tidak diubah |
| Kontrak DTO dipertahankan | field baru semua **opsional/aditif** — caller lama aman (regression R-1 98/98) |
| Smoke membuktikan 6 VALIDASI PO | 41 kasus (data-DB / lama-pinjam / status / search / periode / statistik) + pagination + skala |

## Risiko / Catatan
- **`summary.total` = buku yang dikembalikan (baris), bukan transaksi** — kontrak R-1 `findReturnedDetailsBetween` menghitung detail; konsisten `pagination.total == rows.length`. Footer UI "Total {n} pengembalian" dari `pagination.total`.
- **Kelas = snapshot saat pinjam**, bukan kondisi enrollment terkini — perilaku R-1/IT-1 (`BorrowService.create` menulis `className`), tidak diubah.
- Search `contains` (SQLite LIKE) case-insensitive untuk ASCII — cocok untuk angka/nama (sama dengan R-2).

## Hasil Gate
lint PASS · build PASS (main 1,864.98 · preload 9.95 · renderer 1,091.50 kB) · smoke R-3 41/41 · regression R-1 98/98 + Borrow 77/77 · `prisma migrate diff` no-drift · grep bundle ter-render.
