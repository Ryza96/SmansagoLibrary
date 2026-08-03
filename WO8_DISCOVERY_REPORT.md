# WO8_DISCOVERY_REPORT

**WO-8 — CL-2a: Class Master UI (CRUD per Tahun Ajaran + Kurikulum)**
**Mode: DISCOVERY ONLY — READ ONLY. Tidak ada kode yang diubah.**
**Tanggal: 2026-08-03**

> **Pemetaan penomoran:** WO-8 (urutan eksekusi sesi ini) = **WBS #9 CL-2a — Class Master UI (CRUD per tahun/kurikulum)**.
> Dependency WBS: **AY-2, C-1, CL-1** — ketiganya **selesai** (WO-5, WO-6, WO-7).
> CL-2b (clone ke tahun baru) adalah WO terpisah — **tidak disentuh** di WO ini.

---

## 1. Current Architecture

### 1.1 Backend `classes:*` — lengkap & ter-wire (0 konsumen UI saat ini)
| Layer | File | Keterangan |
|-------|------|-----------|
| Service | `src/main/services/class.service.ts` | `findMany/findById/create/update/delete`; pasca CL-1: `educationLevel` ternormalisasi+validasi (X/XI/XII via F1), `update` **tolak** `educationLevel`/`parallel` (400), `academicYearId`/`curriculumId` tetap bisa diubah; delete guard `member.countByClass` (legacy) |
| Repository | `src/main/repositories/class.repository.ts` | `findMany` **search hanya di `parallel` (`contains`)**; **TIDAK ada filter `academicYearId`/`curriculumId`**; `findByAcademicYear` ada tapi **tidak diekspos IPC** |
| IPC | `electron/ipc/class.ipc.ts` | 5 channel: `classes:findMany(search,page,limit) / findById / create / update / delete` |
| Preload | `electron/preload/class.preload.ts` | `api.classes.*` (create/update input `Record<string,unknown>`) |
| env.d.ts | `src/renderer/env.d.ts:162-174` | tipe penuh, DTO dari `src/shared/dto/academic` |
| DTO | `src/shared/dto/academic.ts:40-68` | `ClassDTO` (id, academicYearId, curriculumId, educationLevel, parallel, displayName, homeroomTeacher, isActive, timestamps) / `CreateClassDTO` / `UpdateClassDTO` |
| Bootstrap | `electron/main/bootstrap.ts:105` | `classService` di-inject; `electron/ipc/index.ts:80` `registerClassHandlers` |

**Kunci pagination:** `getPaginationParams` (`src/main/repositories/base/pagination.ts:3-9`) → `limit` **max 100**. `classes.findMany` mengembalikan paginated `{data,total,page,limit,totalPages}`.

### 1.2 Konsumen UI — kosong
Grep `api.classes`/`classes.*` di `src/` = 0 match; tidak ada route/komponen class. **UI Class adalah satu-satunya gap** yang ditutup CL-2a.

### 1.3 Pola UI Master eksisting (pola yang diikuti CL-2a)
| Pola | File | Dipakai untuk |
|------|------|---------------|
| List + search + delete + badge | `src/pages/master/AcademicYearListPage.tsx` (WO-5) | ClassListPage |
| List form create/edit | `src/pages/master/CurriculumFormPage.tsx` (WO-6) | ClassFormPage |
| Form satu bidang | `src/components/master/AuthorForm.tsx` / `AcademicYearForm.tsx` (grid, toggle, checkbox, error inline) | ClassForm |
| Tabel reusable | `src/components/master/MasterTable.tsx` (columns, search, add/edit/delete, loading) | ClassListPage |
| Select/dropdown native | `src/components/members/MembershipSection.tsx:47-57` (pola `<select>` + `<option>`) | ClassForm dropdown |
| Labels | `src/utils/labels.ts` blok `ACADEMIC_YEAR`/`CURRICULUM` | blok `CLASS` baru |
| Navigation | `src/utils/navigation.ts` `ROUTES.MASTER_*` + `xxxEditPath` | `ROUTES.MASTER_CLASSES*` + `classEditPath` |
| Routes | `src/routes/index.tsx:79-84` (pola `master/xxx[...]`) | 3 route `master/classes[...]` |
| Sidebar | `src/components/layout/Sidebar.tsx:33-39` (`masterSubItems`) | + item "Kelas" |
| Type re-export | `src/types/dtos/academic.ts` (termasuk `ClassDTO/CreateClassDTO/UpdateClassDTO`) | import UI |
| Config level | `src/shared/config/education-level.ts` `EDUCATION_LEVELS` (Set X/XI/XII) | dropdown tingkat (renderer boleh import — config leaf node) |

---

## 2. Files Impact Analysis

### DIBUAT (5 file renderer)
| File | Keterangan |
|------|-----------|
| `src/pages/master/ClassListPage.tsx` | List + **filter dropdown Tahun Ajaran & Kurikulum** + search + delete |
| `src/pages/master/ClassFormPage.tsx` | create/edit; backfill `findById`; submit `create`/`update` |
| `src/components/master/ClassForm.tsx` | form: dropdown AY, dropdown Kurikulum, dropdown Tingkat (F1), input Paralel, input Guru Kelas, toggle Aktif; **edit: Tingkat/Paralel disabled (immutable CL-1)** |
| `wo8_cl2a_smoke/smoke.ts` | smoke UAT payload yang dikirim UI → service (pola wo5/wo6/wo7) |
| Laporan: `WO8_DISCOVERY_REPORT.md`, `WORK_ORDER_8_IMPLEMENTATION_REPORT.md`, `WO8_FINAL_REVIEW.md`, `WO8_RELEASE_REPORT.md` | docs |

### DIMODIFIKASI (4 file renderer)
| File | Perubahan |
|------|-----------|
| `src/routes/index.tsx` | +3 route `master/classes`, `master/classes/new`, `master/classes/:id/edit` |
| `src/components/layout/Sidebar.tsx` | + item "Kelas" di `masterSubItems` (setelah "Kurikulum") |
| `src/utils/labels.ts` | + blok `CLASS` (TITLE/NEW/EDIT/SEARCH/CONFIRM_DELETE/CREATED/UPDATED/DELETED) |
| `src/utils/navigation.ts` | + `ROUTES.MASTER_CLASSES/MASTER_CLASS_NEW/MASTER_CLASS_EDIT` + `classEditPath(id)` |

### N/A (eksplisit — TIDAK disentuh, sesuai constraint PO)
Service, Repository, IPC, Preload, DTO, env.d.ts, Bootstrap, schema, migration, config (tidak diubah — hanya dibaca), MemberClassResolver, seluruh modul lain. CL-2b (clone), Enrollment, Promotion **tidak disentuh**.

---

## 3. Dependency Analysis

| Dependensi | Status | Catatan |
|-----------|--------|---------|
| WBS AY-2 (`academicYears.*`) | ✅ selesai (WO-5) | dropdown Tahun Ajaran di form & filter di list (`api.academicYears.findMany`) |
| WBS C-1 (`curricula.*`) | ✅ selesai (WO-6) | dropdown Kurikulum + lookup nama di list (`api.curricula.findMany`) |
| WBS CL-1 (immutability guard) | ✅ selesai (WO-7) | edit form menonaktifkan `educationLevel`/`parallel`; service tetap menolak bila field dikirim |
| `classes.*` IPC/preload/env.d.ts | ✅ sudah ada | **0 perubahan**; konsumsi langsung |
| `EDUCATION_LEVELS` (F1 config) | ✅ tersedia | dropdown tingkat (X/XI/XII) |
| `ClassDTO/CreateClassDTO/UpdateClassDTO` | ✅ re-export di `src/types/dtos/academic` | import UI |

**Tidak ada dependensi baru.** Tidak ada perubahan `package.json`.

---

## 4. Risk Analysis

| # | Risiko | Severity | Mitigasi / Keputusan |
|---|--------|----------|----------------------|
| R1 | **Tidak ada filter server-side per Tahun/Kurikulum** — `classes.findMany` hanya search `parallel`; `findByAcademicYear` ada di repo tapi **tidak diekspos IPC**; constraint PO melarang ubah Service/Repo/IPC/Preload | **Medium** | UI **fetch semua** via `findMany(undefined, page, 100)` dalam loop hingga `total` tercapai → filter **client-side** (AY + kurikulum + search) di renderer. Jumlah kelas per sekolah < 100 → 1-2 page. Ini keputusan teknis yang didokumentasikan; bila nanti data besar, solusi bersih = tambah channel filter (WO terpisah, di luar scope). |
| R2 | **Fetch data list membutuhkan lookup nama AY & Kurikulum** | Low | List page fetch paralel 3 API (`academicYears`, `curricula`, `classes`) → bangun `Map<id,name>`. |
| R3 | **Edit form: `educationLevel`/`parallel` immutable (CL-1)** | Low | Field di-`disabled` + keterangan "tidak dapat diubah" (RFC §13); payload `update` **tidak menyertakan** kedua field. |
| R4 | **Edit form: `academicYearId`/`curriculumId` tetap editable (WBS-strict CL-1)** | Medium | Mengikuti service (guard duplikat aktif → 400 bila pindah ke tahun/kurikulum yang sudah punya kelas sama, tampil via `alert`). Opsi lanjutan (readonly saat edit) bisa diusulkan ke PO — default = WBS-strict. |
| R5 | **Tingkat non-baku (`"ix"`/`"IX A"`) dikirim UI** | Low | Dropdown hanya menyediakan X/XI/XII; service tetap menormalkan + memvalidasi (double-layer). |
| R6 | **Delete kelas beranggota** (guard service) | Low | `confirm` sebelum hapus; error 400 ditampilkan `alert(err.message)`. |
| R7 | **Pagination limit 100** — kelas >100 di satu sekolah | Very Low | Loop fetch hingga `total`; acceptable untuk master kelas. |

---

## 5. Architecture Compliance

| Aturan (RFC/WBS/constraint PO) | Kepatuhan WO ini |
|---------------------------------|------------------|
| WBS CL-2a: menu + route + halaman list/form; pilih tahun+kurikulum; konsumsi `classes:*` | ✅ 100% |
| WBS CL-2a Dependency: AY-2, C-1, CL-1 | ✅ semua selesai |
| WBS §3 Flow: Preload → UI → Testing → PO Review (Repository/Service/IPC = N/A) | ✅ layer dilewati dinyatakan N/A eksplisit |
| WBS §4 Gate: lint, build, manual test, docs, PO approval | ✅ dipenuhi |
| **TIDAK mengubah** Service / Repository / IPC / Preload / DTO | ✅ 0 perubahan backend |
| **TIDAK membuat** Schema / Migration | ✅ |
| **TIDAK menyentuh** CL-2b (clone) / Enrollment / Promotion | ✅ |
| RFC §13 (immutability terlihat di UI) | ✅ edit form menonaktifkan level/paralel |

---

## 6. Implementation Plan

1. **`src/utils/navigation.ts`** — +`ROUTES.MASTER_CLASSES('/master/classes')`, `MASTER_CLASS_NEW`, `MASTER_CLASS_EDIT('/master/classes/:id/edit')`; +`classEditPath(id)`.
2. **`src/utils/labels.ts`** — +blok `CLASS` (`TITLE:'Kelas'`, `NEW:'Tambah Kelas'`, `EDIT:'Edit Kelas'`, `SEARCH:'Cari kelas...'`, `CONFIRM_DELETE`, `CREATED/UPDATED/DELETED`). Field reused: `FIELD.ACTIVE/INACTIVE`, `MASTER.SAVE/CANCEL`, `PLACEHOLDER.*`.
3. **`src/components/master/ClassForm.tsx`** — props `{ initial?: ClassDTO | null; academicYears: AcademicYearDTO[]; curricula: CurriculumDTO[]; onSubmit(input); onCancel }`.
   - Field: select Tahun Ajaran (wajib), select Kurikulum (wajib), select Tingkat (X/XI/XII dari `EDUCATION_LEVELS`, wajib), input Paralel (wajib), input Guru Kelas (opsional), checkbox Aktif.
   - Edit mode: Tingkat + Paralel `disabled` dengan hint immutable (RFC §13).
   - Validasi client: AY/kurikulum/tingkat/paralel wajib → `error` inline.
   - Submit: `onSubmit({ academicYearId, curriculumId, educationLevel, parallel, homeroomTeacher?, isActive })` — **update tidak menyertakan educationLevel/parallel**.
4. **`src/pages/master/ClassListPage.tsx`** —
   - Fetch paralel: `academicYears.findMany()`, `curricula.findMany()`, `classes.findMany(undefined, page, 100)` loop hingga `total`.
   - State: `classes`, `academicYears`, `curricula`, `filterYearId`, `filterCurriculumId`, `search`, `loading`.
   - Filter client-side: `year`, `curriculum`, `search` (cocok `displayName`/`parallel`).
   - Dropdown filter di atas `MasterTable` (di luar komponen, sebelum tabel).
   - Kolom: Kelas (`displayName`), Tahun Ajaran (lookup), Kurikulum (lookup), Guru Kelas (`homeroomTeacher ?? '—'`), Status (badge aktif).
   - Delete: `confirm` → `api.classes.delete(id)` → hapus lokal / refetch; error 400 via `alert`.
   - Add → `MASTER_CLASS_NEW`; Edit → `classEditPath(id)`.
5. **`src/pages/master/ClassFormPage.tsx`** — load `academicYears` + `curricula`; edit → `classes.findById(id)`; submit `classes.create` / `classes.update`; `navigate(-1)`.
6. **`src/routes/index.tsx`** + **`src/components/layout/Sidebar.tsx`** — 3 route + item "Kelas".
7. **`wo8_cl2a_smoke/smoke.ts`** — verifikasi payload yang dikirim UI → service (create per AY/kurikulum, duplicate 400, update homeroomTeacher/isActive, immutable level/paralel 400, delete beranggota 400, `findMany` fetch-all ≤100, filter manual simulasi).
8. `npm run lint` → `npm run build` → grep bundle.
9. Laporan (Implementation / Final Review / Release) + update `AGENTS.md`.
10. `git status` (hanya file WO-8) → ONE FINAL COMMIT → push → **BERHENTI menunggu review PO.**

---

## 7. Validation Plan

| # | Check | Cara |
|---|-------|------|
| 1 | lint PASS | `npm run lint` (tsc node + web) |
| 2 | build PASS | `npm run build` — renderer naik (baru page+component), main/preload **tidak berubah** (buktikan backend N/A) |
| 3 | UAT smoke | `wo8_cl2a_smoke/smoke.ts` pada fresh DB temp — create/duplicate/update/immutable/delete-guard/fetch-all |
| 4 | Grep bundle | `Kelas`, `master/classes` ter-render di bundle renderer |
| 5 | DB live dev tidak disentuh | smoke fresh DB temp + dibersihkan |
| 6 | Documentation | AGENTS.md + 3 laporan; env.d.ts/DTO tidak berubah |

---

## 8. Exit Criteria

1. Operator dapat membuka **Menu Master Data → Kelas** → melihat daftar kelas per **Tahun Ajaran + Kurikulum** (dropdown filter).
2. Operator dapat **membuat** kelas (pilih tahun, kurikulum, tingkat X/XI/XII, paralel, guru, status).
3. Operator dapat **mengedit** kelas — tingkat/paralel **tidak dapat diubah** (disabled, immutable CL-1); guru/status/tahun/kurikulum dapat diubah sesuai service.
4. Operator dapat **menghapus** kelas; kelas ber-anggota ditolak (error service ditampilkan).
5. lint + build PASS; smoke **PASS**; laporan + AGENTS.md di-update.
6. ONE FINAL COMMIT + push → **BERHENTI** menunggu review PO (tidak lanjut CL-2b).

---

## Verdict

# ✅ READY FOR IMPLEMENTATION

**Alasan:**
- Backend `classes:*` lengkap & ter-wire sejak WO-005 + CL-1 (immutability) — **0 perubahan backend** diperlukan; UI adalah satu-satunya gap.
- Dependency WBS (AY-2, C-1, CL-1) semua selesai → pola UI sudah terbukti 3× (WO-5/6) dan dapat direplikasi.
- Constraint PO terpenuhi penuh: hanya renderer; Service/Repository/IPC/Preload/DTO/schema/migration/CL-2b/Enrollment/Promotion tidak disentuh.
- Satu keputusan teknis terdokumentasi (R1): filter per tahun/kurikulum dilakukan **client-side** karena backend `findMany` tak punya filter AY dan IPC tak boleh diubah — acceptable untuk data master kelas.

**Catatan untuk PO:** bila kelak jumlah kelas per sekolah >100 atau ingin filter server-side, itu memerlukan WO terpisah (tambah channel/filter di backend) — di luar scope CL-2a.
