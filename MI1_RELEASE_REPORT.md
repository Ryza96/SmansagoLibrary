# MI-1 RELEASE REPORT — Member Import Resolver

## Release Summary

- **Work Order:** MI-1 (WBS WO-17) — Member Import Resolver: skop eksplisit
  `resolve(rows, academicYearId, curriculumId)` (RFC §12.1 step 4).
- **Commit:** tunggal (lihat `git log` setelah push).
- **Arsitektur:** Stack A (`src/main/`); renderer TIDAK disentuh (UI = MI-2).

## Validation Matrix

| Gate | Hasil |
|------|-------|
| `npm run lint` | PASS |
| `npm run build` | PASS (main 1,792.23 kB · preload 8.62 kB · renderer 999.83 kB) |
| Smoke MI-1 (fresh DB) | **39/39 PASS** |
| Regression E-1 | 39/39 PASS |
| Regression E-2 | 36/36 PASS |
| Regression E-3 | 78/78 PASS |
| Regression E-4 | 45/45 PASS |
| `prisma migrate diff` | No drift (empty migration) |
| DB live dev | Tidak disentuh (semua smoke di temp, dibersihkan) |

## Deliverable

1. `MemberImportScope` (DTO aditif).
2. `ClassRepository.findByAcademicYearAndCurriculum` (1 query, filter tahun+kurikulum).
3. `MemberClassResolver.resolve(rows, academicYearId, curriculumId)` — fallback tahun aktif;
   notFound/ambiguous tetap BLOCKER; error memuat `className`.
4. Thread scope: `MemberImportService.previewCheck/import`, IPC `members:previewCheck/import`,
   preload `memberImport.*`, `env.d.ts`.
5. `wo17_mi1_smoke/smoke.ts` — 12 step / 39 assertion.

## Release Notes

- **Non-breaking:** semua penambahan aditif; posisi argumen & kontrak lama dipertahankan.
- **Prasyarat MI-2:** UI dialog pilih tahun+kurikulum memakai `MemberImportScope`;
  write phase step 5 (tulis `MemberEnrollment`, `status=INACTIVE`, `classId` tidak lagi ditulis)
  dikerjakan di WO MI-2.
- **Menunggu review Product Owner.** Tidak lanjut WO berikutnya sampai approval.
