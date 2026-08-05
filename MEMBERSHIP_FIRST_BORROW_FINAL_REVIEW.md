# MEMBERSHIP STATUS FIRST BORROW ACTIVATION — FINAL REVIEW
Tanggal: 2026-08-05 · Status: DONE — menunggu review PO

## Ringkasan

Bug "Semua anggota NONAKTIF" ditutup dengan aturan bisnis: **peminjaman pertama yang berhasil mengaktifkan keanggotaan (`INACTIVE → ACTIVE`); status tidak pernah kembali `INACTIVE` saat buku dikembalikan.** Satu-satunya perubahan = blok aktivasi di `BorrowService.create()` setelah transaksi `createWithItems` sukses.

## Checklist Review

| # | Item | Status | Bukti |
|---|------|--------|-------|
| 1 | Penerapan minimal & scope disiplin (1 file source) | PASS | `git status` hanya `src/main/services/borrow.service.ts` + smoke baru |
| 2 | Aktivasi hanya pada pinjam yang BERHASIL | PASS | guard berada setelah `await createWithItems(...)`, sebelum `return` |
| 3 | ACTIVE tidak revert saat return | PASS | ReturnService tidak menulis `Member.status`; smoke STEP 3 |
| 4 | Eligibility tetap berbasis Enrollment | PASS | kode guard eligibility tidak disentuh; smoke STEP 4a/4b |
| 5 | Aktivasi berlaku semua tipe member | PASS | smoke STEP 4c (guru INACTIVE → ACTIVE) |
| 6 | Dashboard & Enrollment tidak terpengaruh | PASS | regression dashboard_phase1 30 + wo13_e1 39 + wo15_e3 78 |
| 7 | Schema/migration TIDAK berubah | PASS | `migrate diff` empty; `migrate status` up to date (4 migrations) |
| 8 | Tanpa business rule di renderer | PASS | renderer tidak diubah (bundle identik baseline) |
| 9 | Lint & build hijau | PASS | lint PASS; build main 1,844.57 kB (+0.12 kB dari guard) |
| 10 | Tidak ada backfill siluman | PASS | dev DB tetap 395 INACTIVE; aktivasi organik per pinjam |

## Hasil Smoke & Regression

- Smoke baru **20/20 PASS**
- Regression **253/253 PASS**: it1_borrow_return 34 · it_borrow_eligibility 7 · wo14_e2 36 · borrow_card_uat 29 · dashboard_phase1 30 · wo13_e1 39 · wo15_e3 78
- Total **273 PASS / 0 FAIL**

## Keputusan yang Ditahan (bukan scope)

- Backfill massal `INACTIVE → ACTIVE` — ditolak; aktivasi harus organik lewat peminjaman nyata.
- Sinkronisasi `Member.status` dengan status akademik (alignment `Membership vs Academic`) — tetap **Architecture Backlog** (dokumen `MEMBER_STATUS_ALIGNMENT_PLAN.md` menunggu keputusan PO).

## Rekomendasi

LULUS untuk rilis. Verifikasi visual manual PO disarankan: buat anggota baru (INACTIVE), pinjam satu buku → profil anggota tampil AKTIF setelah transaksi sukses.
