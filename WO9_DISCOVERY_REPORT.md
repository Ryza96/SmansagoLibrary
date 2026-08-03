# WO9 — Discovery Report: Class Clone ke Tahun Baru (CL-2b)

- **Source of Truth:** `MASTER_DATA_AKADEMIK_ARCHITECTURE_RFC.md` (LOCKED) + `MASTER_DATA_AKADEMIK_WBS.md` (LOCKED)
- **WBS Ref:** WO-10 CL-2b — "Clone kelas ke tahun baru (tanpa enrollment) — RFC §7 prasyarat promosi"
- **Dependency:** CL-2a (DONE, commit `9537eb7`)
- **Mode:** DISCOVERY ONLY (READ ONLY — tidak ada perubahan kode/commit)
- **Verdict:** **READY FOR IMPLEMENTATION**

---

## 1. Current Architecture

Alur Class saat ini (CL-2a + CL-1, dua-duanya sudah live):

| Layer | File | Status |
|-------|------|--------|
| Schema | `prisma/schema.prisma` — model `Class` | `academicYearId FK + curriculumId FK + educationLevel + parallel + homeroomTeacher + isActive`; unique komposit (`academicYearId`, `curriculumId`, `educationLevel`, `parallel`) |
| Repository | `src/main/repositories/class.repository.ts` | Sudah punya `findByAcademicYear(academicYearId)` (line 50), `findDuplicate(...)` (line 57, dengan `excludeId?`), `create(...)` (line 14), `countByAcademicYear` (line 75) — **semua yang dibutuhkan clone sudah tersedia** |
| Service | `src/main/services/class.service.ts` | `findMany/findById/create/update/delete`; `create` (line 48) punya guard: validasi `EDUCATION_LEVELS` + `findDuplicate` → 400 bila komposit duplikat |
| IPC | `electron/ipc/class.ipc.ts` | 5 channel `classes:findMany/findById/create/update/delete` |
| Preload | `electron/preload/class.preload.ts` | `api.classes.*` (5 method, `ipcRenderer.invoke`) |
| env.d.ts | `src/renderer/env.d.ts` (line 162) | blok `classes:` 5 method |
| UI | `src/pages/master/ClassListPage.tsx` | fetch-all (loop `limit 100`), filter client-side (tahun+kurikulum+search), `MasterTable`, tombol add → `ROUTES.MASTER_CLASS_NEW` |
| DTO | `src/shared/dto/academic.ts` | `ClassDTO`, `CreateClassDTO`, `UpdateClassDTO` (line 40-69) |
| Config | `src/shared/config/education-level.ts` | `EDUCATION_LEVELS` Set (X/XI/XII) |

RFC §7 (Prasyarat promosi, line 193): "tahun baru dibuat, tepat satu `isActive`, `EducationLevel` terdefinisi" — Mode A Automatic mencocokkan parallel (`X MERDEKA 1` → `XI MERDEKA 1`). Artinya: sebelum promosi, **struktur kelas tahun baru harus ada** — itulah CL-2b.

## 2. Files Impact Analysis

**TIDAK disentuh (constraint WO-9):** `AcademicYear`, `Curriculum`, `Enrollment`, `Promotion` (semua service/repo/IPC/preload/UI terkait), CRUD `classes:*` yang sudah ada, Repository `class.repository.ts` (method eksisting cukup), Schema + Migration.

**Akan diubah/ditambah (hanya untuk jalur clone):**

| File | Perubahan | Jenis |
|------|-----------|-------|
| `src/main/services/class.service.ts` | + method `cloneToYear(sourceAcademicYearId, targetAcademicYearId)` | modify |
| `electron/ipc/class.ipc.ts` | + channel `classes:cloneToYear` (handler baru; 5 channel lama utuh) | modify |
| `electron/preload/class.preload.ts` | + method `cloneToYear` di `classes` | modify |
| `src/renderer/env.d.ts` | + entry `classes.cloneToYear` | modify |
| `src/pages/master/ClassListPage.tsx` | + tombol "Clone ke Tahun Baru" (toolbar filter) + state/handler | modify |
| `src/components/master/ClassCloneModal.tsx` | **baru** — modal pilih tahun sumber + tahun target + tombol clone + hasil | create |
| `src/utils/labels.ts` | + blok `CLASS.CLONE_*` | modify |
| `src/utils/navigation.ts` | **opsional** — tidak wajib (modal, bukan route baru) | — |
| `src/shared/dto/academic.ts` | + `CloneClassResult` (opsional, bisa type inline) | modify |

**Keputusan PO (via question):** boleh tambah **satu** channel IPC baru + 1 method preload + 1 entry env.d.ts — channel CRUD `classes:*` yang ada tidak disentuh.

## 3. Dependency Analysis

- **CL-2a** (Class UI + fetch-all + filter client-side) — sudah ada, menjadi host tombol clone.
- **Repository**: `findByAcademicYear`, `findDuplicate`, `create`, `countByAcademicYear` — sudah ada, **tidak ada perubahan repo**.
- **Guard unik**: `findDuplicate(targetAY, curriculumId, level, parallel)` → 400 bila sudah ada (konsisten pesan `create` line 71) — reuse logic yang sama untuk blokir duplikat saat clone.
- **`AcademicYearService.existsById`** (via `academicYearRepository`) — validasi sumber & target ada, dan `source !== target`.
- **Curriculum** — kelas diclone memakai `curriculumId` yang sama (per komposit `(targetAY, curriculumId, level, parallel)`); tidak ada validasi kurikulum tambahan (FK sudah enforce).
- **Tidak bergantung** pada AY-1b (hook clone sisi CL-2b di WBS line 228 bersifat opsional/forward-looking — CL-2b berdiri sendiri via tombol UI).

## 4. Risk Analysis

| # | Risiko | Severity | Mitigasi |
|---|--------|----------|----------|
| 1 | Clone menciptakan duplikat bila dijalankan ulang | MEDIUM | **Idempotensi**: per kelas sumber, cek `findDuplicate` ke tahun target; sudah ada → skip (bukan error). Hasil `{ created, skipped }`. Sesuai Exit Criteria WBS "clone aman & idempoten per tahun". |
| 2 | Tujuan = sumber (loop ke diri sendiri) | LOW | Validasi `source === target` → AppError 400. |
| 3 | Tahun tidak ada | LOW | `existsById` kedua tahun → AppError 400 (gaya `create` line 56). |
| 4 | `homeroomTeacher`/`isActive` ikut diclone? | LOW | **Keputusan: ikut dicopy** (`homeroomTeacher`, `isActive`) — struktur kelas baru di tahun baru lazim membawa guru/status sama; tetap bisa diedit via CL-2a. |
| 5 | Kloning massal non-atomik (parsial) | LOW–MEDIUM | Bungkus loop dalam satu `$transaction` (pola `borrow.repository.ts:108`) → semua-or-tidak sama sekali. |
| 6 | Modal vs route — konsistensi pola UI | LOW | Pakai modal (pola `InlineAddModal`/`MemberImportDialog`), tanpa route baru → tidak menyentuh `navigation.ts`/routes. |
| 7 | P2812: banyak kelas, clone lambat | LOW | Loop `findDuplicate` per baris O(n); untuk data master kelas jumlah kecil — acceptable. |

## 5. Architecture Compliance

- **RFC §7 (prasyarat promosi)**: clone menyediakan struktur kelas tahun target yang dibutuhkan Mode A automatic — ✅ prasyarat terpenuhi tanpa menyentuh promotion.
- **RFC line 335 (rename di batas tahun)**: "buat `Class` baru di tahun baru" — clone adalah mekanisme otomatis pembuatan row kelas tahun baru; enrollment tahun lama tetap merujuk row lama — ✅.
- **WBS CL-2b Scope**: `class.service.cloneToYear(...)` + tombol UI + validasi unique komposit — ✅ persis.
- **WBS Flow**: Service → IPC → Preload → UI → Testing → PO Review — ✅ (dengan persetujuan PO menambah 1 channel).
- **Business rule di Service, eksekusi di Repository**: guard validasi/idempotensi di Service; repo tetap method sederhana — ✅ konsisten lesson WO-4.
- **Constrain WO-9**: tidak ada perubahan Schema/Migration/Repository; AcademicYear/Curriculum/Enrollment/Promotion untouched; CRUD `classes:*` tidak diubah — ✅.

## 6. Implementation Plan

1. **Service** — `class.service.ts`: `async cloneToYear(sourceAY: string, targetAY: string): Promise<{ created: number; skipped: number }>`:
   - Validasi: `sourceAY !== targetAY`; `existsById` keduanya → AppError 400.
   - `sourceClasses = await this.repository.findByAcademicYear(sourceAY)`.
   - `prisma.$transaction` (pola `borrow.repository.ts:108`): untuk tiap kelas sumber → `findDuplicate(targetAY, curriculumId, educationLevel, parallel)`; ada → `skipped++`; tidak ada → `repository.create({ academicYearId: targetAY, curriculumId, educationLevel, parallel, homeroomTeacher, isActive })` + `created++`.
   - Return `{ created, skipped }`.
2. **IPC** — `class.ipc.ts`: `ipcMain.handle('classes:cloneToYear', (_e, sourceAY: string, targetAY: string) => service.cloneToYear(sourceAY, targetAY))`.
3. **Preload** — `class.preload.ts`: `cloneToYear: (sourceAY: string, targetAY: string) => ipcRenderer.invoke('classes:cloneToYear', sourceAY, targetAY)`.
4. **env.d.ts** — blok `classes:` + `cloneToYear`.
5. **UI** — `ClassCloneModal.tsx` (baru): dropdown "Tahun Sumber" + "Tahun Target" (data dari `api.academicYears.findMany()`), tombol "Clone" (loading inline), menampilkan hasil `created`/`skipped`, error via `alert(err.message)`; tombol pemicu di toolbar `ClassListPage` (di samping filter tahun/kurikulum). Re-fetch daftar kelas setelah sukses.
6. **labels.ts** — `CLASS.CLONE`, `CLASS.CLONE_TITLE`, `CLASS.CLONE_SOURCE_YEAR`, `CLASS.CLONE_TARGET_YEAR`, `CLASS.CLONE_RUN`, `CLASS.CLONE_RESULT`, `CLASS.CLONE_NOTE`.
7. **Smoke** — `wo9_cl2b_smoke/smoke.ts` pada fresh DB temp (pola wo7/wo8).

## 7. Validation Plan

- **Smoke DB (`wo9_cl2b_smoke/smoke.ts`, fresh DB temp, dibersihkan setelah run):**
  1. Setup: AY-A (sumber) + AY-B (target) + 1 kurikulum + 3 kelas di AY-A (mis. X MERDEKA 1, X MERDEKA 2, XI MERDEKA 1) via payload UI `classes.create`.
  2. `cloneToYear(A, B)` → created=3, skipped=0; `countByAcademicYear(B)` = 3; field `educationLevel`/`parallel`/`curriculumId`/`homeroomTeacher`/`isActive` tersalin benar.
  3. Run ulang `cloneToYear(A, B)` → created=0, skipped=3 (idempoten, tanpa error).
  4. `cloneToYear(B, A)` → 3 kelas sudah ada di A → created=0, skipped=3 (tidak ada duplikat komposit).
  5. `cloneToYear(A, A)` → AppError 400 (sumber=target).
  6. `cloneToYear(A, <id-tidak-ada>)` → AppError 400; `cloneToYear(<tidak-ada>, B)` → AppError 400.
  7. Guard duplikat via jalur `create` tetap bekerja (regresi CL-1: update educationLevel/parallel ditolak).
- **`npm run lint`** PASS.
- **`npm run build`** PASS (main bertambah ~channel clone; renderer bertambah modal).
- **Grep bundle** (`classes:cloneToYear` di `out/main/index.js`, `Clone ke Tahun Baru` di bundle renderer) ter-render.

## 8. Exit Criteria

- Tombol "Clone ke Tahun Baru" tampil di halaman Kelas (CL-2a); operator memilih tahun sumber + tahun target → struktur kelas tercopy.
- Clone **aman & idempoten per tahun**: run ulang tidak membuat duplikat; komposit unik (targetAY, kurikulum, level, paralel) dijamin 1 baris.
- Validasi: tahun harus ada, sumber ≠ target; error → AppError 400 ditampilkan `alert(err.message)`.
- Tidak ada perubahan Schema/Migration/Repository; CRUD `classes:*`, AcademicYear, Curriculum, Enrollment, Promotion tidak tersentuh.
- Lint + build + smoke PASS.

---

**Verdict: READY FOR IMPLEMENTATION** — siap eksekusi WO-9 (CL-2b) setelah review PO.
