# WO12 — TEST REPORT FINAL (Milestone A — Re-testing after WO-11A)

- **WO:** WO-12 T-A — Testing & UAT (FINAL), re-run setelah WO-11A (REVISION IMPLEMENTATION)
- **Mode:** READ ONLY / AUDIT ONLY — 0 perubahan kode, 0 commit, 0 push.
- **Tanggal:** 2026-08-03
- **Source of Truth:** `MASTER_DATA_AKADEMIK_ARCHITECTURE_RFC.md` (LOCKED) · `MASTER_DATA_AKADEMIK_WBS.md` (LOCKED)

## Ringkasan
Seluruh 10 suite smoke **PASS (259/259)**. WO-4 dan WO-5 (yang sebelumnya FAIL pada audit WO-12) kini **PASS** setelah diselaraskan ke kontrak activate/deactivate (K3). Tidak ada temuan baru.

## Test Matrix — Smoke Suite (fresh DB per suite, `prisma migrate deploy` 4 migrations)

| Suite | Scope | Hasil | vs WO-12 (pertama) |
|-------|-------|-------|--------------------|
| `wo1_config_smoke` | Shared config (MemberType, EducationLevel) | **46/46 PASS** | 46/46 (sama) |
| `wo2_f2a_smoke` | Schema F2a: Enrollment/Promotion + index + FK + no-default | **35/35 PASS** | 35/35 (sama) |
| `wo3_f2b_smoke` | Backfill classId→Enrollment (idempoten, orphan) | **28/28 PASS** | 28/28 (sama) |
| `wo4_ay1a_smoke` | AY-1a exclusive-active guard (+ kontrak activate) | **23/23 PASS** | **FAILED → PASS** |
| `wo5_ay2_smoke` | AY-2 Academic Year CRUD UI contract (+ activate/K3) | **19/19 PASS** | **FAILED → PASS** |
| `wo6_c1_smoke` | Curriculum CRUD + duplicate + delete guard | **10/10 PASS** | 10/10 (sama) |
| `wo7_cl1_smoke` | Class immutability + duplicate + delete guard | **16/16 PASS** | 16/16 (sama) |
| `wo8_cl2a_smoke` | Class master UI payload + filter + guard regresi | **16/16 PASS** | 16/16 (sama) |
| `wo9_cl2b_smoke` | Class clone (copy/skip/idempotent/source≠target) | **26/26 PASS** | 26/26 (sama) |
| `wo11_ay1b_smoke` | AY-1b activate/deactivate/exactly-one/K3/no-op/404/defensif | **40/40 PASS** | 40/40 (sama) |
| **TOTAL** | | **259/259 PASS** | 217 PASS (2 suite gagal) |

## Test Matrix — Fitur yang Diminta Verifikasi

### 1. Academic Year
| Fitur | Sumber Verifikasi | Hasil |
|-------|-------------------|-------|
| CRUD | wo5 UAT 1-7; wo11 STEP 10-12,16 | PASS |
| Activate | wo11 STEP 3,5,14; wo4 STEP 4-5; wo5 UAT 3 | PASS |
| Deactivate | wo11 STEP 4,6,7,15 | PASS |
| Exclusive Active | wo4 STEP 2-3; wo5 UAT 2 | PASS |
| Exactly One Active | wo11 STEP 1-17 (count==1 di tiap langkah) | PASS |
| Update(isActive) Rejected | wo11 STEP 8; wo4 STEP 6; wo5 UAT 3c | PASS |
| UI Buka/Tutup Tahun | `AcademicYearListPage` (tombol + confirm + alert + refresh); bundle renderer `Buka Tahun`×2 / `Tutup Tahun`×3 / `academicYears.activate`×1 | PASS |

### 2. Curriculum
| Fitur | Sumber Verifikasi | Hasil |
|-------|-------------------|-------|
| CRUD | wo6 UAT 1,3,5,6 | PASS |
| Duplicate | wo6 UAT 2,3 | PASS |
| Delete Guard | wo6 UAT 4,5 | PASS |

### 3. Class
| Fitur | Sumber Verifikasi | Hasil |
|-------|-------------------|-------|
| CRUD | wo7 UAT 7; wo8 UAT 1-4 | PASS |
| Duplicate | wo7 UAT 4; wo8 UAT 6 | PASS |
| Immutable | wo7 UAT 5,6 | PASS |
| Delete Guard | wo7 delete beranggota 400; wo8 UAT 7 | PASS |

### 4. Class Clone
| Fitur | Sumber Verifikasi | Hasil |
|-------|-------------------|-------|
| Clone | wo9 UAT 1 (3 dibuat, field struktur tersalin) | PASS |
| Duplicate Skip | wo9 UAT 4 (clone balik = semua skip) | PASS |
| Idempotent | wo9 UAT 3 (run ulang created=0) | PASS |
| Source ≠ Target | wo9 UAT 5 (ditolak 400) | PASS |

## Regression & Static Verification
- `npm run lint` — **PASS**.
- `npm run build` — **PASS** (main 1,780.16 kB · preload 7.84 kB · renderer 987.29 kB).
- Bundle main: `academic-years:activate` = 1, `academic-years:deactivate` = 1 → handler masuk package.
- Bundle renderer: `Buka Tahun`×2, `Tutup Tahun`×3, `academicYears.activate`×1, `Tahun Ajaran`×16 → UI baru masuk package.
- Routing: `master/academic-years`, `.../new`, `.../:id/edit` → `src/routes/index.tsx:81-83`.
- Sidebar: item "Tahun Ajaran" pada grup Master Data → `src/components/layout/Sidebar.tsx:34`.
- Navigation: `ROUTES.MASTER_ACADEMIC_YEAR*` + `academicYearEditPath` → `src/utils/navigation.ts:32-34`.
- Labels: blok `ACADEMIC_YEAR` lengkap (ACTIVATE/DEACTIVATE/CONFIRM/ACTIVATED/DEACTIVATED) → `src/utils/labels.ts:44-63`.
- IPC: `registerAcademicYearHandlers` → `electron/ipc/academic-year.ipc.ts:5`, didaftarkan di `registerAllHandlers` → `electron/ipc/index.ts:78`.
- Preload: `academicYearAPI.academicYears.{findMany,findById,create,update,delete,activate,deactivate}` → `electron/preload/academic-year.preload.ts`, diagregasi → `electron/preload/index.ts:29`.
- Service: `activate` (`academic-year.service.ts:96`) memakai `updateExclusiveActive`; `deactivate` (`:107`) memakai `findActive` + tolak sole-active; `update` tolak perubahan `isActive` (K3, `:71-75`).
- Repository: `createExclusiveActive` (`academic-year.repository.ts:23`), `updateExclusiveActive` (`:30`), `findActive` (`:45`).

## Bug / Temuan Baru
- **Tidak ada** temuan baru pada re-test ini.
- WO-12 T1 & T2 telah ditutup oleh WO-11A; T3 tetap OPEN (lihat bagian klasifikasi di laporan FINAL REVIEW).

## Kesimpulan (Technical)
Semua jalur fungsional Milestone A (Academic Year, Curriculum, Class, Class Clone) **lolos** pada kontrak terbaru. Perbaikan WO-11A tidak menimbulkan regresi; seluruh 259 asersi smoke hijau.
