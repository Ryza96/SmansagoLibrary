# WO5_DISCOVERY_REPORT

**WO-5 — AY-2: Academic Year Master UI**
**Mode: DISCOVERY ONLY (read-only)**
**Tanggal: 2026-08-03**

---

## 1. Current Architecture

### Backend — Academic Year (LENGKAP & ter-wire, tanpa perubahan)
| Layer | File | Status |
|-------|------|--------|
| Model | `prisma/schema.prisma` `model AcademicYear` | `name @unique`, `startDate`, `endDate`, `isActive @default(false)` |
| Repository | `src/main/repositories/academic-year.repository.ts` | `create`/`update`/`createExclusiveActive`/`updateExclusiveActive`/`delete`/`findById`/`findActive`/`findMany`(search+pagination)/`existsByName`/`existsById`/`count` |
| Service | `src/main/services/academic-year.service.ts` | `findMany`/`findById`/`create`/`update`/`delete`; guard AY-1a (`isActive===true` → exclusive-active); delete diblokir bila `classRepository.countByAcademicYear > 0`; duplikat nama → 400; id tak ada → 404 |
| IPC | `electron/ipc/academic-year.ipc.ts` | 5 handler: `academic-years:findMany`/`findById`/`create`/`update`/`delete` |
| Preload | `electron/preload/academic-year.preload.ts` | `academicYears.*` (5 method) |
| Bootstrap | `electron/main/bootstrap.ts` | `academicYearService` di-instantiasi & diregistrasi |
| env.d.ts | `src/renderer/env.d.ts` | `academicYears` 5 method + paginated return type |
| DTO re-export | `src/types/dtos/academic.ts` | `AcademicYearDTO`, `CreateAcademicYearDTO`, `UpdateAcademicYearDTO` |

### Frontend — Academic Year (BELUM ADA SAMA SEKALI)
- **0 konsumen** `window.electronAPI.academicYears` / `api.academicYears` di `src/` (grep = 0 match).
- Tidak ada halaman, route, menu sidebar, atau label Tahun Ajaran.
- Pola UI yang tersedia (referensi implementasi):
  - List: `src/pages/master/AuthorListPage.tsx` + `src/components/master/MasterTable.tsx` (search, add, edit, delete, loading).
  - Form: `src/pages/master/AuthorFormPage.tsx` + `src/components/master/AuthorForm.tsx`.
  - Sidebar: `src/components/layout/Sidebar.tsx` — grup collapsible "Master Data" (`masterSubItems`: Penulis/Penerbit/Kategori).
  - Navigasi: `src/utils/navigation.ts` (`ROUTES` + path helper `*EditPath`).
  - Labels: `src/utils/labels.ts` (blok `MASTER`).

---

## 2. Files Impact Analysis

### File BARU (3)
| File | Isi |
|------|-----|
| `src/pages/master/AcademicYearListPage.tsx` | List + search + tambah/edit/hapus; konsumsi `api.academicYears.findMany/delete`; kolom Nama, Tanggal Mulai, Tanggal Selesai, Status Aktif |
| `src/pages/master/AcademicYearFormPage.tsx` | Halaman form create/edit; konsumsi `findById`/`create`/`update` |
| `src/components/master/AcademicYearForm.tsx` | Form komponen: nama, tanggal mulai/selesai (input date), toggle aktif, simpan/batal |

### File DIUBAH (4)
| File | Perubahan |
|------|-----------|
| `src/routes/index.tsx` | +3 route: `master/academic-years`, `master/academic-years/new`, `master/academic-years/:id/edit` |
| `src/components/layout/Sidebar.tsx` | +1 item `masterSubItems`: "Tahun Ajaran" → `/master/academic-years` |
| `src/utils/labels.ts` | +blok label `ACADEMIC_YEAR` (judul, tombol, field, konfirmasi hapus) |
| `src/utils/navigation.ts` | +`ROUTES.MASTER_ACADEMIC_YEARS/NEW/EDIT` + `academicYearEditPath()` |

### TIDAK DIUBAH (N/A — sudah ada / di luar scope)
- Repository, Service, IPC, Preload, Bootstrap, env.d.ts — **semua sudah lengkap & ter-wire**.
- DTO (`src/shared/dto/academic.ts`, `src/types/dtos/academic.ts`).
- Schema `prisma/schema.prisma` + migration.
- Curriculum, Class, MemberEnrollment, Promotion — **di luar scope** (WBS AY-2).

---

## 3. Dependency Analysis

- **WBS §7:** `AY-1a → AY-1b → AY-2`. **AY-1b (Buka/Tutup Tahun) BELUM dikerjakan** — tidak ada endpoint `academic-years:activate`.
- **Implikasi untuk AY-2:** "tandai aktif" tetap bisa diimplementasikan via **`academic-years:update(id, { isActive: true })`** yang sudah mengarah ke `updateExclusiveActive` (guard 1-aktif AY-1a, transaksional). Tidak ada kebutuhan backend baru.
- **Catatan sequencing (penting untuk PO):** WBS mencantumkan AY-1b sebagai WO-5 dan AY-2 sebagai WO-6. PO memerintahkan **AY-2 terlebih dahulu** (dilabeli "WORK ORDER 5"). Karena AY-2 hanya mengonsumsi API yang sudah ada (Flow WBS AY-2: Preload → UI → Testing; Repo/Service/IPC = N/A), implementasi AY-2 **tidak memerlukan AY-1b** secara fungsional. AY-1b (buka/tutup eksplisit + hook clone) tetap dijadwalkan sebagai WO terpisah. **Tidak ada perubahan RFC/WBS yang dilakukan di WO ini.**
- Dependensi UI: pola `MasterTable` + `labels.ts` + `navigation.ts` + routing (semua ada).

---

## 4. Risk Analysis

| Risiko | Prob. | Dampak | Mitigasi |
|--------|-------|--------|----------|
| Mengaktifkan tahun menonaktifkan tahun lain (guard) mengejutkan operator | Sedang | Rendah | Label/konfirmasi UI: "Mengaktifkan akan menonaktifkan tahun lain" |
| Delete tahun yang dipakai kelas ditolak service (400) | Sedang | Rendah | Tampilkan pesan error dari `AppError` (`alert(err.message)`), pola eksisting |
| AY-1b ditunda → "buka/tutup" belum eksplisit | Rendah | Rendah | "tandai aktif" via update sudah aman (guard 1-aktif); AY-1b tetap WO berikutnya |
| Return shape `findMany` paginated (`{data,total,...}`) vs array (pola Author) | Sedang | Rendah | List page memakai `.data` dari `academicYears.findMany(search)` (server-side search, pola eksisting) |
| Format tanggal (ISO → input `date`) | Rendah | Rendah | slice/format ISO `YYYY-MM-DD` untuk value input; DTO kirim ISO utuh |

---

## 5. Architecture Compliance

| Aturan | Kepatuhan |
|--------|-----------|
| Scope hanya AY-2 (CRUD Tahun Ajaran) | PASS — hanya 3 file baru + 4 file UI terkait |
| Tidak menyentuh Curriculum, Class, Enrollment, Promotion | PASS — tidak ada file modul lain |
| Tidak membuat schema/migration baru | PASS — model & migration tidak disentuh |
| Tidak mengubah backend (Repo/Service/IPC/Preload) | PASS — semua N/A (sudah ada & ter-wire) |
| WBS Flow AY-2: Preload → UI → Testing → PO Review | PASS — mulai dari konsumsi preload (`academicYears.*`) |
| RFC §2.4 guard 1-aktif | PASS — dijamin service (AY-1a), UI hanya konsumen |
| Gate WBS §4 (lint/build/manual test/docs/PO) | Diadopsi penuh di Implementation Plan |

**Catatan compliance:** sequencing WBS murni `AY-1b → AY-2`, namun implementasi AY-2 tidak mengubah perilaku backend maupun melanggar RFC; hanya mengekspos UI ke channel yang sudah ada. Penyimpangan jadwal didokumentasikan (bukan perubahan desain).

---

## 6. Implementation Plan

Langkah (semua renderer-only):
1. **`src/utils/labels.ts`** — tambah blok `ACADEMIC_YEAR`: `TITLE`("Tahun Ajaran"), `NEW`, `EDIT`, `SEARCH`("Cari tahun ajaran..."), `NAME`("Nama Tahun"), `START_DATE`("Tanggal Mulai"), `END_DATE`("Tanggal Selesai"), `STATUS`("Status"), `ACTIVE`/`INACTIVE`, `CONFIRM_DELETE`, `ACTIVATE_WARNING`("Mengaktifkan akan menonaktifkan tahun ajaran lain"), `DELETED`/`CREATED`/`UPDATED`.
2. **`src/utils/navigation.ts`** — +`ROUTES.MASTER_ACADEMIC_YEARS`(`/master/academic-years`), `MASTER_ACADEMIC_YEAR_NEW`, `MASTER_ACADEMIC_YEAR_EDIT`(`/master/academic-years/:id/edit`), +`academicYearEditPath(id)`.
3. **`src/components/master/AcademicYearForm.tsx`** — state `name`/`startDate`/`endDate`/`isActive`; validasi wajib isi; input date; toggle aktif + teks peringatan guard; tombol Simpan/Batal (pola `AuthorForm`).
4. **`src/pages/master/AcademicYearListPage.tsx`** — `api.academicYears.findMany(search)` → gunakan `.data`; kolom: Nama, Tanggal Mulai, Tanggal Selesai, Status (badge Aktif/Nonaktif); delete dengan `confirm` + `api.academicYears.delete` (error 400 ditampilkan).
5. **`src/pages/master/AcademicYearFormPage.tsx`** — edit memuat `findById(id)`; submit `create`/`update`; `navigate(-1)`.
6. **`src/routes/index.tsx`** — +3 route di blok master.
7. **`src/components/layout/Sidebar.tsx`** — +`{ to: '/master/academic-years', label: 'Tahun Ajaran' }` di `masterSubItems`.

**Layer N/A (eksplisit):** Repository, Service, IPC, Preload, env.d.ts, DTO, schema/migration.

---

## 7. Validation Plan

| # | Check | Metode |
|---|-------|--------|
| 1 | lint PASS | `npm run lint` |
| 2 | build PASS | `npm run build` (main/preload/renderer) |
| 3 | Create tahun (nonaktif) | UAT manual — tersimpan |
| 4 | Create tahun kedua AKTIF → tahun pertama nonaktif | UAT manual — guard AY-1a |
| 5 | Edit nama/tanggal/toggle | UAT manual |
| 6 | Delete tahun tanpa kelas | UAT manual — sukses |
| 7 | Delete tahun berkelas ditolak (pesan error) | UAT manual — 400 ditampilkan |
| 8 | Route + sidebar muncul | UAT manual + grep bundle renderer (`Tahun Ajaran`/`academic-years`) |
| 9 | Tidak ada perubahan backend/schema | `git status` sebelum commit |

---

## 8. Exit Criteria

1. Operator membuat, mengedit, menghapus, dan menandai aktif Tahun Ajaran **dari aplikasi**.
2. Guard 1-aktif berjalan dari UI (mengaktifkan tahun baru menonaktifkan tahun lain).
3. Delete tahun yang dipakai kelas diblokir dengan pesan yang jelas.
4. `npm run lint` + `npm run build` PASS.
5. Tidak ada perubahan di backend, schema, migration, atau modul lain (Curriculum/Class/Enrollment/Promotion).
6. Dokumentasi (AGENTS.md + laporan) konsisten.

---

## VERDICT

**READY FOR IMPLEMENTATION**

Alasan:
- Backend Academic Year (Repo/Service/IPC/Preload/env.d.ts/bootstrap) **sudah lengkap dan ter-wire** sejak WO-005 + guard AY-1a (WO-4) — tidak ada pekerjaan backend yang diperlukan.
- Scope murni renderer (3 file baru + 4 file UI), mengikuti pola eksisting (`MasterTable`, `AuthorForm`, `labels.ts`, `navigation.ts`, routing, sidebar).
- Tidak menyentuh schema/migration, Curriculum, Class, Enrollment, maupun Promotion.
- Satu-satunya penyimpangan jadwal WBS (AY-2 sebelum AY-1b) **tidak berdampak fungsional** dan didokumentasikan; tidak ada pelanggaran RFC/WBS pada desain.
