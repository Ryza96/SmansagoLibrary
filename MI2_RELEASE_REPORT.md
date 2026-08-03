# MI-2 RELEASE REPORT — Import Write-Phase (Enrollment)

## Release Summary

- **Work Order:** MI-2 (WBS WO-18) — write-phase impor berorientasi enrollment
  (RFC §12.1 step 5): `Member` + `MemberEnrollment(ACTIVE)` dalam SATU transaksi,
  `Member.classId` tidak lagi ditulis.
- **Commit:** tunggal (lihat `git log` setelah push).
- **Arsitektur:** Stack A (`src/main/`); IPC/preload/renderer TIDAK disentuh.

## Validation Matrix

| Gate | Hasil |
|------|-------|
| `npm run lint` | PASS |
| `npm run build` | PASS (main 1,794.47 kB · preload 8.62 kB · renderer 999.83 kB) |
| Smoke MI-2 (fresh DB) | **37/37 PASS** |
| Regression MI-1 | 44/44 PASS (diperbarui ke kontrak baru) |
| Regression E-1 | 39/39 PASS |
| Regression E-2 | 36/36 PASS |
| Regression E-3 | 78/78 PASS |
| Regression E-4 | 45/45 PASS |
| `prisma migrate diff` | No drift (empty migration) |
| DB live dev | Tidak disentuh (semua smoke di temp, dibersihkan) |

## Deliverable

1. `EnrollmentRepository.createManyWithTx` — batch enrollment tx-aware (chunked).
2. `MemberClassResolutionResult.academicYearId` — tahun efektif resolusi (termasuk fallback tahun aktif).
3. `MemberImportService.writePhase` — 1 transaksi: allocate numbers → createMany Member (tanpa
   classId, status INACTIVE) → lookup id → createMany Enrollment(ACTIVE). Rollback penuh bila gagal.
4. Bootstrap wiring +`EnrollmentRepository`.
5. `wo18_mi2_smoke/smoke.ts` — 6 step / 37 assertion (termasuk rollback stub + histori).

## Release Notes

- **Business rule:** impor menulis Member + Enrollment ACTIVE; `Member.classId` null; `MemberEnrollment`
  = SSOT; tidak ada Member tanpa Enrollment (commit-once + rollback).
- **Non-breaking (IPC):** payload `members:previewCheck(rows, scope?)` / `members:import(rows, scope?)`
  tidak berubah; UI tidak perlu diubah.
- **Deferred (MI-3, gate PO):** strategi duplikat §12.2 + "member ada → hanya enrollment" (PO #5).
- **Menunggu review Product Owner.** Tidak lanjut WO berikutnya sampai approval.
