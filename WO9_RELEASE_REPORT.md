# WO9 — RELEASE REPORT (CL-2b Class Clone)

- **Release:** WO-9 CL-2b — Clone struktur kelas ke tahun baru
- **Status:** **READY FOR RELEASE — menunggu review PO.** Satu commit final `feat: add class clone to new year (WO-9 CL-2b)` + push.

## Fitur yang Dirilis
- Halaman Kelas (Master Data → Kelas) kini punya tombol **"Clone ke Tahun Baru"**.
- Operator memilih **Tahun Sumber** + **Tahun Target** → struktur kelas (kurikulum, tingkat, paralel) tersalin ke tahun baru.
- Guru kelas & status TIDAK disalin: kelas baru `homeroomTeacher = null`, `isActive = true` (keputusan PO).
- Aman & idempoten: kelas yang sudah ada di tahun target dilewati; run ulang tidak membuat duplikat; komposit `(targetAY, kurikulum, tingkat, paralel)` tetap 1 baris.
- Prasyarat promosi RFC §7 terpenuhi: struktur kelas tahun baru tersedia sebelum Mode A Automatic.

## File yang Terkena
```
M src/shared/dto/academic.ts
M src/main/services/class.service.ts
M electron/ipc/class.ipc.ts
M electron/preload/class.preload.ts
M src/renderer/env.d.ts
A src/components/master/ClassCloneModal.tsx
M src/pages/master/ClassListPage.tsx
M src/utils/labels.ts
A wo9_cl2b_smoke/smoke.ts
A WO9_DISCOVERY_REPORT.md
A WORK_ORDER_9_IMPLEMENTATION_REPORT.md
A WO9_FINAL_REVIEW.md
A WO9_RELEASE_REPORT.md
```

## Validation Gate (final)
- `npm run lint` — PASS
- `npm run build` — PASS (main 1,778.91 kB · preload 7.84 kB · renderer 985.76 kB)
- Smoke fresh DB — **26/26 PASS** (created/skip/homeroomTeacher null/isActive true/idempotency/source≠target/duplicate skip/regresi CRUD)
- Grep bundle: `classes:cloneToYear` (main) & `Clone ke Tahun Baru` (renderer) ter-render.

## Artifact
Build `out/` sudah mengandung fitur. Repackage electron-builder + verifikasi `app.asar` mengikuti pola WO-2 bila PO akan install dari `dist/` — di luar scope WO-9 (dilakukan saat Release Milestone A, WBS WO-12 PR-A).

## Catatan Rilis
- WO ini tidak menyentuh Schema/Migration/Repository — tidak perlu deploy ulang DB.
- Setelah commit, langsung BERHENTI menunggu review PO (tidak lanjut WO berikutnya).
