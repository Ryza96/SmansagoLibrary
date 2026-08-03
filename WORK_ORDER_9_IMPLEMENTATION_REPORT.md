# WORK ORDER 9 — IMPLEMENTATION REPORT (CL-2b Class Clone)

- **Source of Truth:** `MASTER_DATA_AKADEMIK_ARCHITECTURE_RFC.md` (LOCKED) · `MASTER_DATA_AKADEMIK_WBS.md` (LOCKED) · `WO9_DISCOVERY_REPORT.md` (APPROVED)
- **Keputusan PO:** Clone HANYA menyalin `curriculumId`, `educationLevel`, `parallel`; `homeroomTeacher = null`, `isActive = true`.
- **Status:** IMPLEMENTED — validation PASS.

## Scope & Batasan
Diizinkan: 1 Service method, 1 IPC channel (`classes:cloneToYear`), 1 preload method, 1 env.d.ts entry, UI Clone.
TIDAK diubah: Repository, Schema, Migration, CRUD `classes:*` eksisting, Academic Year, Curriculum, Enrollment, Promotion.

## Perubahan

| Layer | File | Detail |
|-------|------|--------|
| DTO | `src/shared/dto/academic.ts` | + `CloneClassResult { created, skipped }` |
| Service | `src/main/services/class.service.ts` | + `cloneToYear(sourceAY, targetAY)` — validasi `source !== target`, `existsById` kedua tahun; ambil kelas sumber via `findByAcademicYear`; dalam SATU `$transaction` (`runTransaction(getPrisma(), ...)`) per kelas: cek duplikat komposit `(targetAY, curriculumId, educationLevel, parallel)` → skip; belum ada → `create` dengan `homeroomTeacher: null`, `isActive: true`. Return `{ created, skipped }`. |
| IPC | `electron/ipc/class.ipc.ts` | + `ipcMain.handle('classes:cloneToYear', ...)` (5 channel lama utuh) |
| Preload | `electron/preload/class.preload.ts` | + `classes.cloneToYear(sourceAY, targetAY)` |
| env.d.ts | `src/renderer/env.d.ts` | + entry `classes.cloneToYear` → `Promise<CloneClassResult>` |
| UI | `src/components/master/ClassCloneModal.tsx` | **baru** — modal pilih Tahun Sumber + Tahun Target, tombol Clone (loading inline), tampil hasil `created · skipped`, error via `alert`-style inline, tombol Selesai |
| UI | `src/pages/master/ClassListPage.tsx` | + tombol "Clone ke Tahun Baru" di toolbar filter; render modal; re-fetch via `onCloned` |
| Labels | `src/utils/labels.ts` | + blok `CLASS.CLONE_*` (8 label) |

## Keputusan PO (diimplementasikan)
- Clone menyalin **hanya** `curriculumId`, `educationLevel`, `parallel`.
- Class baru: `homeroomTeacher = null`, `isActive = true` — tidak menyalin guru/status sumber.
- Idempoten: kelas yang sudah ada di tahun target **dilewati (skip)**, bukan error.
- Atomik: seluruh baris clone dalam satu `$transaction` (rollback bila gagal).

## Validation
| Check | Hasil |
|-------|-------|
| `npm run lint` | PASS |
| `npm run build` | PASS (main 1,778.91 kB · preload 7.84 kB · renderer 985.76 kB) |
| Smoke `wo9_cl2b_smoke/smoke.ts` (fresh DB temp) | **26/26 PASS** |
| Idempotency | PASS (run ulang → created=0, skipped=3) |
| Source ≠ Target | PASS (AppError 400) |
| Duplicate Skip | PASS (clone ke tahun yang sudah punya kelas → skipped) |
| Grep bundle | `classes:cloneToYear` di `out/main/index.js` = 1; `Clone ke Tahun Baru` di bundle renderer = 1 |

## Status
**DONE — menunggu review Product Owner.**
