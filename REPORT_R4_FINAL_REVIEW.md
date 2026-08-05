# R-4 FINAL REVIEW — Laporan Keterlambatan

## Keputusan Review
- [x] **Architecture Gate — LULUS** (R-4 READY review PO, tidak lanjut R-5..R-9)
- Search server-side mengikuti pola aditif non-breaking R-2/R-3 (tidak mengubah kontrak R-1 yang sudah di-approve).
- Kolom tabel **8** (Tanggal Pinjam, Nomor Transaksi, Nama Anggota, Kelas snapshot, Judul Buku, Jatuh Tempo, Hari Terlambat, Status); tanpa Petugas (K1) & tanpa nominal denda (K2) — `Setting.lateFee` tidak dikonsumsi.

## Arsitektur (pola konsisten repo)
- **Renderer TIDAK menurunkan angka** — `lateDays`, `category`/status, `summary.active`/`returned` seluruhnya dihitung `ReportService`; renderer hanya memformat tanggal & badge. Search dikirim sebagai `search` ke channel `reports.overdues`.
- **1 IPC `reports.overdues` reused** — TIDAK ada channel/preload/env.d.ts/bootstrap baru; DTO aditif auto-flow ke kontrak renderer.
- **Server-side search memakai snapshot** untuk kedua kategori: MASIH TERLAMBAT via `buildActiveOverdueWhere` (satu grup `OR` di LEVEL DETAIL — `{ borrow: { borrowNumber/memberNumber/memberName } }` relation-field + `bookTitle`, agar `(nomor | nama | judul)` adalah satu OR, bukan dua klausa yang di-AND); SUDAH DIKEMBALIKAN TERLAMBAT via raw SQL `LIKE` (shared `buildReturnedLateSearchSql` untuk row & count) — persis nilai kolom yang ditampilkan.
- **late = perbandingan dua kolom lintas baris** (`returnedAt > dueDate`) yang tak bisa jadi Prisma relation filter → raw SQL join (pola R-1 `findReturnedLateBetween`); count MASIH TERLAMBAT = Prisma count dengan builder yang sama → ringkasan `summary.active + summary.returned == pagination.total` dijamin konsisten dengan filter.
- **MASIH TERLAMBAT kini per-buku** (`findActiveOverdueDetails` baru, 1 baris = 1 `BorrowDetail`) — konsisten dengan R-2/R-3; legacy `findActiveOverdue` (per-transaksi, R-1) dipertahankan untuk regression.

## Checklist Mandat
| Mandat | Bukti |
|--------|-------|
| Renderer tidak menghitung business logic | grep di `src/pages/report` — hanya format tanggal/badge; semua angka dari DTO |
| Backend additive, tidak refactor R-1 | `git diff` hanya +field (`search?`/`skip?`/`take?`) +builder +method baru +pass-through; laporan lain 0 perubahan |
| Tidak menyentuh schema/migration | `prisma migrate diff` = "empty migration" (exit 0) |
| Tidak menyentuh domain lain | `BorrowService`/`ReturnService`/Enrollment/Dashboard/Promotion tidak diubah |
| Kontrak DTO dipertahankan | field baru semua **opsional/aditif** — caller lama aman (regression R-1 98/98) |
| Smoke membuktikan 6 VALIDASI PO | 40 kasus (data-DB / hari-terlambat / status / search / periode / statistik) + 1 baris=1 buku + pagination gabungan + skala |

## Risiko / Catatan
- **Pagination gabungan** (daftar = `[active..., returned...]` dari dua query): `computeOverdueSlice` (murni) menghitung posisi skip/take per kategori agar tiap halaman berisi `limit` baris (kecuali halaman terakhir); totalPages = `ceil((active+returned)/limit)`. Ini perbaikan atas perilaku legacy `Math.max(totalPages)` yang membuat baris gabungan bisa melebihi limit. Regression R-1 tetap hijau (kasus 1 halaman tak terpengaruh).
- **Periode tidak memfilter MASIH TERLAMBAT** — kategori ACTIVE (ongoing) selalu tampil apa pun periode; hanya RETURNED yang dibatasi `returnedAt`. Ini kontrak R-1 (`findActiveOverdue` tanpa rentang).
- **Kelas = snapshot saat pinjam**, bukan kondisi enrollment terkini — perilaku R-1/IT-1 (`BorrowService.create` menulis `className`), tidak diubah.
- Search `contains` (SQLite LIKE) case-insensitive untuk ASCII — cocok untuk angka/nama (sama dengan R-2/R-3).
- 2 kegagalan awal smoke adalah **kesalahan asersi fixture, bukan bug source**: (1) cek "data sesuai DB" memakai `returnedAt: { not: null }` yang ikut menghitung pengembalian tepat-waktu → diganti raw SQL `returnedAt > dueDate`; (2) cek periode [90,20] mengira ob6 (dikembalikan 28 hari lalu) berada di luar rentang `to = 20 hari lalu` padahal 28 ≤ 20 (lebih TUA), dan `rows` gabungan diawali baris ACTIVE yang tidak ter-filter periode → dibatasi ke subset `category === 'RETURNED'`.

## Hasil Gate
lint PASS · build PASS (main 1,868.43 · preload 9.95 · renderer 1,104.99 kB) · smoke R-4 40/40 · regression R-1 98/98 + Borrow 77/77 · `prisma migrate diff` no-drift · grep bundle ter-render.
