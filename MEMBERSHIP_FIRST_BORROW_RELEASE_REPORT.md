# MEMBERSHIP STATUS FIRST BORROW ACTIVATION — RELEASE REPORT
Tanggal: 2026-08-05 · Status: DONE — menunggu review PO

## Apa yang Dirilis

Bug "Semua anggota NONAKTIF" diperbaiki dengan aturan bisnis **First Borrow Activation**:
- Anggota baru `INACTIVE` → peminjaman pertama yang berhasil → `Member.status` menjadi `ACTIVE`.
- `ACTIVE` tidak pernah kembali `INACTIVE` hanya karena buku dikembalikan.
- Eligibility peminjaman tetap berbasis `MemberEnrollment` (tidak berubah).

## Perubahan

| File | Tipe |
|------|------|
| `src/main/services/borrow.service.ts` | Modifikasi (blok aktivasi di `create()`) |
| `membership_first_borrow_smoke/smoke.ts` | Baru (20 assertion) |
| `WORK_ORDER_MEMBERSHIP_FIRST_BORROW_REPORT.md` | Laporan |
| `MEMBERSHIP_FIRST_BORROW_FINAL_REVIEW.md` | Laporan |
| `MEMBERSHIP_FIRST_BORROW_RELEASE_REPORT.md` | Laporan |
| `AGENTS.md` | Sesi |

TIDAK ada perubahan schema/migration/IPC/preload/bootstrap/UI/DTO/repository lain.

## Bukti Validasi

- Smoke baru: **20/20 PASS**
- Regression: **253/253 PASS** (Borrow 106 · Dashboard 30 · Enrollment 117)
- `npm run lint`: PASS
- `npm run build`: PASS — main 1,844.57 kB · preload 9.47 kB · renderer 1,060.86 kB (preload & renderer identik baseline = tidak ada perubahan layer lain)
- `prisma migrate diff --from-migrations` & `--from-url`: empty migration
- `prisma migrate status`: up to date (4 migrations)

## Dampak ke Data

- Dev DB tetap 395/395 `INACTIVE`. Tidak ada backfill; aktivasi terjadi saat anggota meminjam pertama kali.
- Satu-satunya peminjaman aktif (S-000012) akan mengaktifkan pemiliknya pada peminjaman berikutnya.

## Commit

SATU final commit (fix + smoke + laporan + AGENTS.md), di-push. File untracked milik WO lain (BORROW_ENROLLMENT_DISCOVERY, INTEGRATION_TEST_PHASE1_DISCOVERY, IT1_DISCOVERY_REPORT, MEMBERSHIP_STATUS_BUG_REPORT, MEMBER_STATUS_ALIGNMENT_PLAN, MEMBER_STATUS_FINAL_AUDIT) TIDAK diikutkan.
