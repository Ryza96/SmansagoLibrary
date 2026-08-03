# WO12 — TEST REPORT (T-A Testing & UAT Milestone A)

- **Mode:** READ ONLY / AUDIT ONLY — tanpa perubahan source, schema, migration, tanpa commit/push
- **Date:** 2026-08-03
- **Target:** Commit `ac3ba89` (WO-11) — seluruh Milestone A (F1, F2a, F2b, AY-1a, AY-1b, AY-2, C-1, CL-1, CL-2a, CL-2b)

## 1. Metodologi
1. Statik: `npm run lint` (tsc node+web) + `npm run build` (electron-vite).
2. Verifikasi wiring: IPC ↔ preload ↔ env.d.ts ↔ service ↔ repository ↔ bootstrap.
3. Verifikasi frontend: routing, sidebar, navigation, labels (grep source + grep bundle).
4. Dinamik: 10 suite smoke — tiap suite di **fresh DB terpisah** (`prisma migrate deploy` → tsc compile → node), DB temp dibersihkan setelah run. DB live dev TIDAK disentuh.

## 2. Statik
| Check | Hasil |
|---|---|
| `npm run lint` | **PASS** |
| `npm run build` | **PASS** — main 1,780.16 kB · preload 7.84 kB · renderer 985.76 kB |

### Grep bundle
| Surface | main | preload | renderer |
|---|---|---|---|
| `academic-years:activate` / `:deactivate` | True | — | — |
| `academic-years:findMany` / `:update` | True | True | — |
| `curricula:create` / `:delete` / `:findMany` | True | True | — |
| `classes:cloneToYear` / `:update` | True | True | — |
| `Tahun Ajaran` / `master/academic-years` / `Tambah Tahun Ajaran` | — | — | True |
| `Kurikulum` / `master/curricula` / `Tambah Kurikulum` | — | — | True |
| `Kelas` / `master/classes` / `Tambah Kelas` | — | — | True |
| `Clone ke Tahun Baru` | — | — | True |
| `academicYears.activate` di renderer | — | — | **absent** (lihat Temuan T1) |

## 3. Wiring Audit (IPC ↔ Preload ↔ env.d.ts ↔ Service ↔ Repo ↔ Bootstrap)
| Domain | IPC handler | Preload | env.d.ts | Service | Repo | Bootstrap/Reg |
|---|---|---|---|---|---|---|
| Academic Year | 7 channel (findMany/findById/create/update/delete/**activate**/**deactivate**) | 5 (tanpa activate/deactivate) | 5 | `academic-year.service.ts` (create/update/delete/find/activate/deactivate) | `academic-year.repository.ts` (create/update/delete/findById/findActive/findMany/existsByName/existsById/count/**createExclusiveActive**/**updateExclusiveActive**) | `registerAcademicYearHandlers` + `createContainer` |
| Curriculum | 5 channel | 5 | 5 | `curriculum.service.ts` (CRUD + dup + delete-guard) | `curriculum.repository.ts` | `registerCurriculumHandlers` |
| Class | 6 channel (+cloneToYear) | 6 | 6 | `class.service.ts` (CRUD + immutable + dup + delete-guard + **cloneToYear**) | `class.repository.ts` (findDuplicate/findByAcademicYear/countBy*) | `registerClassHandlers` |

Semua konsisten: nama channel ↔ preload method ↔ env.d.ts signature ↔ handler argumen.

## 4. Smoke Matrix (fresh DB per suite)
| Suite | Fokus | Hasil | Catatan |
|---|---|---|---|
| wo1_config_smoke | Config MemberType/EducationLevel | **46/46 PASS** | tanpa DB |
| wo2_f2a_smoke | Schema enrollment/promotion | **35/35 PASS** | |
| wo3_f2b_smoke | Backfill + idempotency + orphan | **28/28 PASS** | |
| wo4_ay1a_smoke | Guard exclusive-active (create) | **FAIL** (stale, lihat T2) | STEP 4/5 gunakan `update(isActive)` pre-K3 |
| wo5_ay2_smoke | AY UI-payload | **FAIL** (stale, lihat T2) | UAT 3 toggle `update(isActive:true)` pre-K3 |
| wo6_c1_smoke | Curriculum CRUD + dup + delete-guard | **10/10 PASS** | |
| wo7_cl1_smoke | Class immutable + level validasi | **16/16 PASS** | |
| wo8_cl2a_smoke | Class UI fetch-all + filter | **16/16 PASS** | |
| wo9_cl2b_smoke | Clone + skip + idempotent + source≠target | **26/26 PASS** | |
| wo11_ay1b_smoke | activate/deactivate/exactly-one/update-reject | **40/40 PASS** | kontrak K1-K3 |

**Total: 8/10 suite hijau (217 PASS); 2 suite stale (wo4, wo5).**

## 5. Temuan
| ID | Severity | Temuan | Detail |
|---|---|---|---|
| T1 | **HIGH (UX gap)** | `academic-years:activate`/`:deactivate` tidak diekspos di preload & env.d.ts; tidak ada affordance UI | User tidak bisa membuka tahun nonaktif dari aplikasi. Form toggle AY-2 (`AcademicYearForm` checkbox) kini ditolak service (K3) → error 400. Alur RFC §7 (buat tahun nonaktif → clone → **buka**) terputus di langkah "buka". |
| T2 | LOW–MEDIUM (test debt) | `wo4_ay1a_smoke` & `wo5_ay2_smoke` stale | Ditulis sebelum K3 (WO-11): masih menguji `update(isActive)` sebagai mekanisme aktivasi. Kontrak saat ini = `activate()`/`deactivate()` (terbukti wo11 40/40). Perlu update/arsip. |
| T3 | INFO | Delete guard Class memakai `Member.classId` legacy | Per RFC F2, cutover ke `enrollment` adalah WO E-2 (Milestone B) — bukan cacat T-A. |

## 6. Verifikasi Frontend (source)
- **Routing:** 9 route master (AY 3, Curriculum 3, Class 3) di `src/routes/index.tsx` — lengkap & cocok `ROUTES` (`navigation.ts`).
- **Sidebar:** grup "Master Data" berisi Tahun Ajaran, Kurikulum, Kelas (+ Penulis/Penerbit/Kategori) — `Sidebar.tsx:33-40`.
- **Navigation:** `academicYearEditPath`, `curriculumEditPath`, `classEditPath`, `ROUTES.MASTER_*` — ada.
- **Labels:** blok `ACADEMIC_YEAR`, `CURRICULUM`, `CLASS` (+ `CLONE_*`, `IMMUTABLE_HINT`, `ACTIVATE_WARNING`) di `labels.ts` — lengkap.

## 7. Kesimpulan Teknis
- Backend Milestone A **lengkap & benar** (guard, invariant, transaksi, layering) — dibuktikan wo6/7/8/9/11 (108 PASS) + statik.
- Frontend master (list/form/delete/clone) **berfungsi** — routing/sidebar/navigation/labels ter-render.
- **Satu gap user-facing**: AY-1b `activate`/`deactivate` tidak terhubung ke UI/preload/env.d.ts → fitur "Buka/Tutup Tahun" tidak reachable dari aplikasi (T1).
- **Test debt**: 2 suite smoke stale (T2).
