# WORK_ORDER_8_IMPLEMENTATION_REPORT

**WO-8 — CL-2a: Class Master UI (CRUD per Tahun Ajaran + Kurikulum)**
**Status: DONE — READY review PO**
**Tanggal: 2026-08-03**

---

## 1. Ringkasan

Implementasi WO-8 CL-2a sesuai `WO8_DISCOVERY_REPORT.md` (APPROVED) dengan keputusan PO **fetch-all + client-side filtering**. Murni renderer — mengonsumsi API `classes:*` yang sudah ada (Service/Repository/IPC/Preload/DTO/env.d.ts **0 perubahan**).

Dependency WBS terpenuhi: AY-2 (WO-5) ✓, C-1 (WO-6) ✓, CL-1 (WO-7) ✓.

## 2. Deliverable

| Kategori | File |
|----------|------|
| **BARU** | `src/pages/master/ClassListPage.tsx` |
| **BARU** | `src/pages/master/ClassFormPage.tsx` |
| **BARU** | `src/components/master/ClassForm.tsx` |
| **BARU** | `wo8_cl2a_smoke/smoke.ts` (16/16 PASS) |
| **BARU** | `WO8_DISCOVERY_REPORT.md`, `WORK_ORDER_8_IMPLEMENTATION_REPORT.md`, `WO8_FINAL_REVIEW.md`, `WO8_RELEASE_REPORT.md` |
| Diubah | `src/routes/index.tsx` (+3 route `master/classes[...]`) |
| Diubah | `src/components/layout/Sidebar.tsx` (+item "Kelas") |
| Diubah | `src/utils/labels.ts` (+blok `CLASS`) |
| Diubah | `src/utils/navigation.ts` (+`ROUTES.MASTER_CLASSES/NEW/EDIT` + `classEditPath`) |
| Diubah | `AGENTS.md` (section WO-8) |

## 3. Perilaku UI

### List (`ClassListPage`)
- **Fetch-all:** `Promise.all` → `academicYears.findMany()`, `curricula.findMany()`, `classes.findMany(undefined, page, 100)` di-loop `while (all.length < result.total) page++`.
- **Filter client-side** (keputusan PO): dropdown `Tahun Ajaran` + `Kurikulum` + `search` (cocok `educationLevel + parallel`) → `useMemo` `filtered`.
- Kolom: Kelas (`displayName`), Tahun Ajaran, Kurikulum (lookup nama via `Map<id,name>`), Guru Kelas, Status (badge Aktif/Nonaktif).
- Delete: `confirm` → `api.classes.delete(id)` → hapus lokal; error guard (beranggota) via `alert(err.message)`.

### Form (`ClassForm` + `ClassFormPage`)
- Field: dropdown Tahun Ajaran (wajib), dropdown Kurikulum (wajib), dropdown Tingkat X/XI/XII (`EDUCATION_LEVELS` F1, wajib), input Paralel (wajib), input Guru Kelas (opsional), checkbox Aktif.
- **Edit mode:** Tingkat + Paralel `disabled` + hint `IMMUTABLE_HINT` (RFC §13); payload update **TANPA** `educationLevel`/`parallel`.
- Create payload: `homeroomTeacher` di-map `?? undefined` (DTO `string | undefined`).
- Submit → `create`/`update` → `navigate(-1)`; error service via `alert`.

## 4. Hasil Smoke — 16/16 PASS (fresh DB)

| # | Skenario | Hasil |
|---|----------|-------|
| 1-3 | Create 3 kelas (payload UI, 2 tahun × 2 kurikulum) | PASS |
| 4-5 | Fetch-all `findMany(undefined,1,100)` memuat 3 + total 3 | PASS |
| 6-9 | Filter client-side: tahun→2, tahun+kurikulum→2, search "xi"→1, tahun tak dikenal→0 | PASS |
| 10-11 | Update guru `Ibu Sari` + isActive false | PASS |
| 12-13 | Immutable (regresi CL-1): update educationLevel/parallel ditolak 400 | PASS |
| 14 | Duplicate guard 400 | PASS |
| 15 | Delete beranggota 400 | PASS |
| 16 | Delete tanpa anggota → total 2 | PASS |

## 5. Validation (Gate WBS §4) — semua PASS

| # | Check | Hasil |
|---|-------|-------|
| 1 | `npm run lint` | exit 0 (tsc node + web) |
| 2 | `npm run build` | exit 0 — main 1,776.84 kB · preload 7.68 kB · renderer **978.36 kB** (main/preload **tidak berubah** = bukti backend N/A) |
| 3 | Manual CRUD PASS | smoke 16/16 (create/read/update/delete + filter) |
| 4 | Immutable UI PASS | Tingkat/Paralel `disabled` saat edit; payload update tanpa keduanya |
| 5 | Delete Guard PASS | kelas beranggota → 400 ditampilkan |
| 6 | Smoke PASS | 16/16 fresh DB temp |
| 7 | Documentation | AGENTS.md + 3 laporan; env.d.ts/DTO tidak berubah |
| 8 | PO Approval | menunggu (workflow berhenti) |

## 6. Yang TIDAK dikerjakan (eksplisit)

- Service / Repository / IPC / Preload / DTO / env.d.ts / Bootstrap — **0 perubahan** (constraint PO).
- Schema `prisma/schema.prisma` + migration — tidak disentuh.
- CL-2b (clone ke tahun baru) — **tidak disentuh** (WO terpisah).
- Enrollment / Promotion / AcademicYear / Curriculum / Member — tidak disentuh.

## 7. Catatan Teknis

- **Fetch-all pattern:** `limit` max 100 (`getPaginationParams` `Math.min(100, ...)`); loop `while (all.length < result.total) page++` menjamin kelengkapan tanpa ubah IPC.
- **Filter client-side di renderer** (bukan business rule — hanya tampilan), lookup nama via Map dari fetch paralel.
- Smoke memakai fresh DB temp dan dibersihkan; DB live dev tidak disentuh.
