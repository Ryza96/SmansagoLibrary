# MI-3 RELEASE REPORT — Import Duplicate Strategy (Skip & Flag)

## Release Summary

- **Work Order:** MI-3 (WBS WO-19) — strategi duplikat per-tahun import (RFC §12.1 step 3,
  §12.2 strategi A "Skip & flag"): member existing tidak lagi diblokir; baris yang sudah ACTIVE
  di tahun target dilewati (`skipped`), member existing yang belum terdaftar tahun target
  mendapat enrollment-only (PO #5).
- **Commit:** tunggal (lihat `git log` setelah push).
- **Arsitektur:** Stack A (`src/main/`); IPC/preload/renderer TIDAK disentuh.

## Validation Matrix

| Gate | Hasil |
|------|-------|
| `npm run lint` | PASS |
| `npm run build` | PASS (main 1,797.87 kB · preload 8.62 kB · renderer 999.83 kB) |
| Smoke MI-3 (fresh DB) | **38/38 PASS** |
| Regression MI-1 | 44/44 PASS |
| Regression MI-2 | 37/37 PASS |
| Regression E-1 | 39/39 PASS |
| Regression E-2 | 36/36 PASS |
| Regression E-3 | 78/78 PASS |
| Regression E-4 | 45/45 PASS |
| `prisma migrate diff` | No drift (empty migration) |
| DB live dev | Tidak disentuh (semua smoke di temp, dibersihkan) |

## Deliverable

1. `MemberDuplicateChecker` — `existingByRow` routing; email blocker hanya member baru.
2. `EnrollmentRepository.findMemberIdsActiveInYear` — batch lookup ACTIVE-per-tahun.
3. `MemberImportService` — `RowRouting` 3 jalur; write-phase split dalam satu tx; result +`skipped`.
4. `MemberImportResultDTO` +`skipped: number`.
5. `wo19_mi3_smoke/smoke.ts` — 8 step / 38 assertion.

## Release Notes

- **Business rule (keputusan PO):** NISN existing = "sudah terdaftar". Baris yang sudah ACTIVE di
  tahun target → **skip** (strategi A); belum terdaftar tahun target → **enrollment-only** (tanpa
  Member baru, tanpa dua ACTIVE); member baru → create Member + Enrollment. Email hanya blokir
  member baru.
- **Non-breaking (IPC):** payload `members:previewCheck(rows, scope?)` / `members:import(rows, scope?)`
  tidak berubah; UI tidak perlu diubah (result mendapat field aditif `skipped`).
- **Menunggu review Product Owner.** Tidak lanjut WO berikutnya sampai approval.
