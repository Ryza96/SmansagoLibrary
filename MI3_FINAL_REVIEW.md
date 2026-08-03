# MI-3 FINAL REVIEW — Import Duplicate Strategy (Skip & Flag)

## 1. Status Work Order

| Kriteria | Status |
|----------|--------|
| Scope sesuai WBS WO-19 MI-3 (gate PO) — strategi §12.2 terpilih | ✅ |
| Strategi A "Skip & flag" untuk member existing + ACTIVE di tahun target | ✅ |
| PO #5 — member existing tanpa ACTIVE di tahun target → enrollment-only (tanpa Member baru) | ✅ |
| Member baru → create Member + Enrollment ACTIVE | ✅ |
| Email hanya diblokir untuk member BARU | ✅ |
| Invarian satu-ACTIVE per (member, tahun) dijaga | ✅ |
| Semua operasi transaksional; rollback bila gagal; tanpa data parsial | ✅ |
| Lint PASS | ✅ |
| Build PASS (main 1,797.87 kB · preload 8.62 kB · renderer 999.83 kB) | ✅ |
| Smoke MI-3 38/38 (8 step: baru / enrollment-only / skip / email / campuran / invariant / rollback) | ✅ |
| Regression MI-1 44/44 · MI-2 37/37 · E-1 39/39 · E-2 36/36 · E-3 78/78 · E-4 45/45 | ✅ |
| `migrate diff` = no drift (schema/migration tidak disentuh) | ✅ |
| Temp DB dibersihkan; DB live dev tidak disentuh | ✅ |

## 2. Ringkasan Perubahan

**3 file source modified + 1 DTO + 1 smoke baru:**
- `MemberDuplicateChecker` — NISN existing → routing (`existingByRow`); email blocker hanya
  untuk member baru.
- `EnrollmentRepository.findMemberIdsActiveInYear` — batch lookup ACTIVE-per-tahun.
- `MemberImportService` — `RowRouting` (create-member / enrollment-only / skip); preflight
  routing; `writePhase` 3 jalur dalam satu tx; result +`skipped`.
- `MemberImportResultDTO` +`skipped: number` (aditif).
- `wo19_mi3_smoke/smoke.ts` (baru, 38/38).

## 3. Review Checklist

| Item | Verdict |
|------|---------|
| IPC `members:previewCheck` / `members:import` payload `(rows, scope?)` dipertahankan | ✅ |
| UI Import tidak diubah | ✅ |
| `EnrollmentService` (enroll/close/repoint) tidak disentuh | ✅ |
| Schema/Migration tidak disentuh (migrate diff = empty) | ✅ |
| Routing skip/enrollment-only memakai batch query (bukan per baris) | ✅ |
| `allocateMemberNumbers` hanya untuk create-member (count 0 aman) | ✅ |
| Rollback terbukti untuk batch campuran (stub gagal → 0 Member + 0 Enrollment) | ✅ |
| Tidak ada dua ACTIVE per (member, tahun) | ✅ |
| Strategi A "flag" disajikan sebagai `skipped` count (bukan per-baris) | ✅ |

## 4. Risiko / Catatan Reviewer

1. **Keputusan PO strategi A.** Strategi B (repoint REDISTRIBUTED) / D (merge) tidak dibangun.
   Ekstensi tersedia via `EnrollmentService.repoint` bila PO memilih B di masa depan; saat ini
   member yang sudah ACTIVE di tahun target = skip (bukan repoint).
2. **Enrollment-only tidak menyinkronkan `Member.status`** — member lama tetap INACTIVE saat
   di-enrollment ulang via import; sync status keanggotaan berada di scope E-3/terpisah.
3. **`skipped` = flag agregat.** Tidak ada daftar per-baris yang di-skip; konsisten keputusan
   WO-2 (renderer tidak menurunkan business logic; result counts-only).
4. **Backward-compat smoke MI-1/MI-2** lolos tanpa perubahan — kontrak payload IPC dan result
   `created/failed` tetap, hanya ada field baru `skipped`.

## 5. Kesimpulan

**READY untuk review Product Owner.** Tidak lanjut WO berikutnya sebelum approval.
