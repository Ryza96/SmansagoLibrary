# WO6_DISCOVERY_REPORT

**WO-6 — C-1: Curriculum Master UI**
**Mode: DISCOVERY ONLY (read-only)**
**Tanggal: 2026-08-03**

---

## 1. Current Architecture

### Backend — Curriculum (LENGKAP & ter-wire, tanpa perubahan)
| Layer | File | Status |
|-------|------|--------|
| Model | `prisma/schema.prisma` `model Curriculum` | `name @unique`; relasi `classes Class[]` |
| Repository | `src/main/repositories/curriculum.repository.ts` | `create`/`update`/`delete`/`findById`/`findMany`(search+pagination)/`existsByName`/`existsById`/`count` |
| Service | `src/main/services/curriculum.service.ts` | `findMany`/`findById`/`create`/`update`/`delete`; duplikat nama → 400; id tak ada → 404; **delete guard: `classRepository.countByCurriculum > 0` → 400** |
| IPC | `electron/ipc/curriculum.ipc.ts` | 5 handler: `curricula:findMany`/`findById`/`create`/`update`/`delete` |
| Preload | `electron/preload/curriculum.preload.ts` | `curricula.*` (5 method) |
| Bootstrap | `electron/main/bootstrap.ts` | `curriculumService` di-instantiasi & diregistrasi |
| env.d.ts | `src/renderer/env.d.ts` | `curricula` 5 method + paginated return type |
| DTO re-export | `src/types/dtos/academic.ts` | `CurriculumDTO`, `CreateCurriculumDTO`, `UpdateCurriculumDTO` |
| Repo penunjang | `src/main/repositories/class.repository.ts` `countByCurriculum` | Dipakai guard delete |

### Frontend — Curriculum (BELUM ADA SAMA SEKALI)
- **0 konsumen** `window.electronAPI.curricula` / `api.curricula` di `src/` (grep = 0 match).
- Tidak ada halaman, route, menu sidebar, atau label Kurikulum.
- Pola UI yang tersedia (referensi implementasi, identik dengan WO-5):
  - List: `src/pages/master/AcademicYearListPage.tsx` / `AuthorListPage.tsx` + `src/components/master/MasterTable.tsx`.
  - Form: `src/pages/master/AcademicYearFormPage.tsx` / `AuthorFormPage.tsx` + `src/components/master/AcademicYearForm.tsx` / `AuthorForm.tsx`.
  - Sidebar: `src/components/layout/Sidebar.tsx` — grup collapsible "Master Data" (`masterSubItems`).
  - Navigasi: `src/utils/navigation.ts` (`ROUTES` + path helper).
  - Labels: `src/utils/labels.ts` (blok `MASTER` + `ACADEMIC_YEAR`).

**Catatan:** `CurriculumDTO` hanya berisi `name` (selain id/timestamps) — paling sederhana di antara master akademik. Form Kurikulum ≈ `AuthorForm` (satu field nama).

---

## 2. Files Impact Analysis

### File BARU (3)
| File | Isi |
|------|-----|
| `src/pages/master/CurriculumListPage.tsx` | List + search + tambah/edit/hapus; konsumsi `api.curricula.findMany/delete` |
| `src/pages/master/CurriculumFormPage.tsx` | Halaman form create/edit; konsumsi `findById`/`create`/`update` |
| `src/components/master/CurriculumForm.tsx` | Form komponen: field nama, simpan/batal |

### File DIUBAH (4)
| File | Perubahan |
|------|-----------|
| `src/routes/index.tsx` | +3 route: `master/curricula`, `master/curricula/new`, `master/curricula/:id/edit` |
| `src/components/layout/Sidebar.tsx` | +1 item `masterSubItems`: "Kurikulum" → `/master/curricula` |
| `src/utils/labels.ts` | +blok label `CURRICULUM` (judul, tombol, field, konfirmasi hapus) |
| `src/utils/navigation.ts` | +`ROUTES.MASTER_CURRICULA/NEW/EDIT` + `curriculumEditPath()` |

### TIDAK DIUBAH (N/A — sudah ada / di luar scope)
- Repository, Service, IPC, Preload, Bootstrap, env.d.ts — **semua sudah lengkap & ter-wire**.
- DTO (`src/shared/dto/academic.ts`, `src/types/dtos/academic.ts`).
- Schema `prisma/schema.prisma` + migration.
- AcademicYear, Class, MemberEnrollment, Promotion — **di luar scope** (WBS C-1).

---

## 3. Dependency Analysis

- **WBS §7:** `C-1` berdiri sendiri (tidak bergantung WO lain); diagram menempatkannya paralel dengan AY-2 menuju `CL-2a`.
- **WBS WO-7 C-1:** Dependency: `—`. Flow: `Preload → UI → Testing → PO Review`.
- Backend `curricula:*` sudah ada (WO-005) dan dijadikan dependensi fungsional C-1 — UI hanya mengonsumsi API yang sudah eksis.
- **Delete guard** (`countByCurriculum > 0`) sudah ada di service — UI hanya menampilkan error 400 (`err.message`).
- Dependensi UI: pola `MasterTable` + `labels.ts` + `navigation.ts` + routing (semua tersedia, dibuktikan WO-5).

---

## 4. Risk Analysis

| Risiko | Prob. | Dampak | Mitigasi |
|--------|-------|--------|----------|
| Delete kurikulum yang dipakai kelas ditolak service (400) | Sedang | Rendah | Tampilkan `err.message` via `alert` (pola eksisting) |
| Return shape `findMany` paginated (`{data,total,...}`) vs array | Sedang | Rendah | List page memakai `.data` (pola WO-5 `AcademicYearListPage`) |
| Duplikat nama ditolak service (400) | Sedang | Rendah | `alert(err.message)` dari form |
| Nama file/bentrok laporan | Rendah | Rendah | Suffix `_C1_`/nama khusus `WO6_*` (pelajaran WO-4) |

---

## 5. Architecture Compliance

| Aturan | Kepatuhan |
|--------|-----------|
| Scope hanya C-1 (CRUD Kurikulum) | PASS — hanya 3 file baru + 4 file UI terkait |
| Tidak menyentuh AcademicYear | PASS — file AcademicYear tidak diubah |
| Tidak menyentuh Class | PASS — tidak ada perubahan Class |
| Tidak menyentuh Enrollment / Promotion | PASS — tidak ada file modul tersebut |
| Tidak membuat schema/migration baru | PASS — model & migration tidak disentuh |
| Tidak mengubah backend (Repo/Service/IPC/Preload) | PASS — semua N/A (sudah ada & ter-wire) |
| WBS Flow C-1: Preload → UI → Testing → PO Review | PASS — mulai dari konsumsi preload (`curricula.*`) |
| Gate WBS §4 (lint/build/manual test/docs/PO) | Diadopsi penuh di Implementation Plan |

---

## 6. Implementation Plan

Langkah (semua renderer-only):
1. **`src/utils/labels.ts`** — tambah blok `CURRICULUM`: `TITLE`("Kurikulum"), `NEW`, `EDIT`, `SEARCH`("Cari kurikulum..."), `NAME`("Nama"), `CONFIRM_DELETE`, `DELETED`/`CREATED`/`UPDATED`.
2. **`src/utils/navigation.ts`** — +`ROUTES.MASTER_CURRICULA`(`/master/curricula`), `MASTER_CURRICULUM_NEW`, `MASTER_CURRICULUM_EDIT`(`/master/curricula/:id/edit`), +`curriculumEditPath(id)`.
3. **`src/components/master/CurriculumForm.tsx`** — satu field nama, validasi wajib isi, tombol Simpan/Batal (pola `AuthorForm`).
4. **`src/pages/master/CurriculumListPage.tsx`** — `api.curricula.findMany(search)` → gunakan `.data`; kolom Nama; delete dengan `confirm` + `api.curricula.delete` (error 400 ditampilkan).
5. **`src/pages/master/CurriculumFormPage.tsx`** — edit memuat `findById(id)`; submit `create`/`update`; `navigate(-1)`.
6. **`src/routes/index.tsx`** — +3 route di blok master.
7. **`src/components/layout/Sidebar.tsx`** — +`{ to: '/master/curricula', label: 'Kurikulum' }` di `masterSubItems`.

**Layer N/A (eksplisit):** Repository, Service, IPC, Preload, env.d.ts, DTO, schema/migration.

---

## 7. Validation Plan

| # | Check | Metode |
|---|-------|--------|
| 1 | lint PASS | `npm run lint` |
| 2 | build PASS | `npm run build` (main/preload/renderer) |
| 3 | Create kurikulum | UAT smoke — tersimpan |
| 4 | Edit nama kurikulum | UAT smoke |
| 5 | Delete kurikulum tanpa kelas | UAT smoke — sukses |
| 6 | Delete kurikulum berkelas ditolak (error) | UAT smoke — 400 ditampilkan |
| 7 | Duplikat nama ditolak | UAT smoke |
| 8 | Route + sidebar muncul | UAT manual + grep bundle renderer (`Kurikulum`/`curricula`) |
| 9 | Tidak ada perubahan backend/schema | `git status` sebelum commit |

---

## 8. Exit Criteria

1. Operator membuat, mengedit, dan menghapus Kurikulum **dari aplikasi**.
2. Delete kurikulum yang dipakai kelas diblokir dengan pesan yang jelas (guard service).
3. `npm run lint` + `npm run build` PASS.
4. Tidak ada perubahan di backend, schema, migration, atau modul lain (AcademicYear/Class/Enrollment/Promotion).
5. Dokumentasi (AGENTS.md + laporan) konsisten.

---

## VERDICT

**READY FOR IMPLEMENTATION**

Alasan:
- Backend Curriculum (Repo/Service/IPC/Preload/env.d.ts/bootstrap) **sudah lengkap dan ter-wire** sejak WO-005, termasuk **delete guard** (`countByCurriculum > 0`) — tidak ada pekerjaan backend yang diperlukan.
- Scope murni renderer (3 file baru + 4 file UI), **pola persis WO-5 AY-2** yang sudah terbukti (bahkan lebih sederhana: Curriculum hanya satu field `name`).
- Tidak menyentuh schema/migration, AcademicYear, Class, Enrollment, maupun Promotion.
- WBS C-1: Dependency `—`, Flow `Preload → UI → Testing → PO Review`, Kompleksitas LOW — semua terpenuhi tanpa blokade.
