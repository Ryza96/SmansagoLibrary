# WORK ORDER MI-4 — Member Import UI (WO-20 MI-4)

**Status:** COMPLETE — READY review PO
**Scope:** UI Import Anggota wajib menentukan **Academic Year** (default: tahun aktif) + **Curriculum**; scope dikirim eksplisit ke `previewCheck`/`import`; fallback MI-1 dihapus.

---

## 1. Konteks & Keputusan

- **WO-19 MI-3** telah merilis strategi impor duplikat **A "Skip & Flag"** (`70d2e15`, pushed). Satu-satunya kekosongan setelahnya: **UI Import Anggota** belum pernah diaktifkan (produksi masih memakai alur lama yang bergantung fallback tahun aktif implicit).
- **Keputusan PO (MI-4):**
  1. Dialog **wajib meminta** Academic Year + Curriculum.
  2. Academic Year **default = tahun aktif**; user bisa mengganti.
  3. Scope `{ academicYearId, curriculumId }` **wajib** dikirim ke `previewCheck()` dan `import()`.
  4. **Hapus fallback MI-1**: resolver selalu menerima `academicYearId` + `curriculumId` eksplisit — tidak ada lagi resolusi "tahun aktif implicit" / "kurikulum opsional".
- **TIDAK diubah:** Promotion, Reporting, Bulk Operation, Schema, Migration.

---

## 2. Perubahan Kontrak (dari opsional ke WAJIB)

| Entitas | Sebelum | Sesudah |
|---------|---------|---------|
| `MemberImportScope` | `{ academicYearId: string, curriculumId: string \| null }` | `{ academicYearId: string, curriculumId: string }` |
| `MemberImportService.previewCheck(rows, scope?)` | scope opsional | `scope: MemberImportScope` **wajib** |
| `MemberImportService.import(rows, options?)` | options opsional | `options: { scope, onProgress? }` **wajib** |
| `MemberImportService.preflight` | fallback tahun aktif bila scope kosong | resolve `scope.academicYearId` / `scope.curriculumId` |
| `MemberImportPreflight.academicYearId` | `string \| null` | `string` |
| `writePhase` | param `academicYearId: string \| null` + guard | `string` (guard dihapus) |
| `MemberClassResolver` | ctor `(academicYearRepository, classRepository)`; `resolve(rows, year?, curriculum?)` | ctor `(classRepository)`; `resolve(rows, year, curriculum)` |
| `MemberClassResolutionResult.academicYearId` | `string \| null` | `string` |
| `ClassRepository.findByAcademicYearAndCurriculum` | `curriculumId: string \| null` (+ spread kondisional) | `curriculumId: string` |
| IPC `members:previewCheck` / `members:import` | `scope?` | `scope` wajib |
| Preload `memberImport.previewCheck/import` | `scope?` | `scope` wajib |
| Renderer `env.d.ts` `memberImport.*` | `scope?` | `scope` wajib |

Semua perubahan di atas adalah **pengetatan kontrak** (breaking hanya untuk pemanggil yang mengandalkan fallback), sesuai keputusan PO "hapus fallback MI-1".

---

## 3. Perubahan Source

### Backend (2 file dimodifikasi)
1. `src/main/services/member-import.service.ts`
   - `previewCheck(rows, scope)` — scope wajib.
   - `import(rows, { scope, onProgress })` — options wajib; `options.onProgress?.()`.
   - `preflight(rows, scope, onProgress?)` — resolve langsung `scope.academicYearId` / `scope.curriculumId`; cabang fallback + `else if` defensif null-tahun dihapus.
   - `writePhase(..., academicYearId: string, ...)` — guard `if (academicYearId === null) throw` dihapus (dead code).
   - Komentar header diperbarui (WO-20: tahun enrollment = `scope.academicYearId`).
2. `src/main/repositories/class.repository.ts`
   - `findByAcademicYearAndCurriculum(academicYearId, curriculumId: string)` — `curriculumId` wajib; spread kondisional dihapus.

### Frontend (2 file dimodifikasi)
3. `src/components/members/MemberImportDialog.tsx`
   - State baru: `academicYears`, `curricula`, `academicYearId`, `curriculumId`, `scopeLoading`, `scopeLoadError`, `scopeHint`.
   - `useEffect` mount: `Promise.all([academicYears.findMany(), curricula.findMany()])` → populates picker; `academicYearId` default = tahun aktif (`data.find(y => y.isActive)`); error → `SCOPE_LOAD_ERROR`.
   - `runPreview(rows, yearId, curriculumId)` — memanggil `previewCheck(rows, { academicYearId, curriculumId })`; menyetel ulang preview/import state.
   - `handleFileChange` — parse lalu preview **hanya bila scope lengkap**; bila belum, tampilkan hint `REQUIRE_SCOPE`.
   - `handleAcademicYearChange` / `handleCurriculumChange` — ubah scope → re-preview bila file sudah di-parse.
   - `handleImport` — `import(rows, { academicYearId, curriculumId })`.
   - UI: blok "Penempatan Kelas" (2 dropdown berlabel `*`) setelah subtitle; hint loading/error/amber; hasil sukses grid `grid-cols-5` (+ sel **Dilewati** dari `importResult.skipped`, MI-3).
4. `src/utils/labels.ts` — blok `MEMBER_IMPORT` + `SCOPE_TITLE`, `SCOPE_DESC`, `YEAR`, `CURRICULUM`, `SELECT_YEAR`, `SELECT_CURRICULUM`, `SCOPE_LOADING`, `SCOPE_LOAD_ERROR`, `REQUIRE_SCOPE`, `RESULT_SKIPPED`.

### Plumbing kontrak (3 file)
5. `electron/ipc/member.ipc.ts` — `members:previewCheck(rows, scope)` / `members:import(rows, scope)` scope wajib.
6. `electron/preload/member.preload.ts` — `previewCheck(rows, scope)` / `import(rows, scope)`.
7. `src/renderer/env.d.ts` — signature `memberImport.previewCheck/import` scope wajib.
8. `electron/main/bootstrap.ts` — `new MemberClassResolver(classRepository)` (1 arg).

---

## 4. Pembaruan Smoke (regresi)

`MemberClassResolver` sekarang butuh 2 argumen scope dan tidak ada jalur fallback → smoke lama yang menguji fallback disesuaikan:

- **`wo17_mi1_smoke/smoke.ts`** (44 → **43**):
  - Constructor 1 arg.
  - STEP 5: hapus `curriculum null -> ambiguous`; ganti jadi "scope wajib mempersempit": `(yearA,k1) → classA` & `(yearA,k2) → classC` keduanya unik.
  - STEP 6: hapus "fallback tahun aktif" & "fallback aktif tanpa kurikulum"; ganti jadi **tahun scope non-aktif dihormati** `(yearB,k1) → classD`.
  - STEP 7: hapus "tanpa tahun aktif -> classNotFound" (tidak ada fallback).
  - STEP 10: hapus "import backward-compat tanpa scope"; ganti jadi **import scope yearB → enrollment yearB + classD** (bukti bukan fallback ke tahun aktif).
- **`wo18_mi2_smoke/smoke.ts`** (37 tetap):
  - Constructor 1 arg; STEP 6 "backward-compat tanpa scope" → **import scope yearB → enrollment yearB + classD**.
- **`wo19_mi3_smoke/smoke.ts`** (38 tetap):
  - Constructor 1 arg (semua pemanggilan sudah membawa scope).
- **`wo20_mi4_smoke/smoke.ts`** (**baru, 24**): lihat §5.

Smoke historis di `uat_*` yang menguji perilaku lama (fallback null-scope) **tidak diubah** — artefak UAT WO lama di luar regression suite MI-4; perilakunya sudah obsolete oleh keputusan PO.

---

## 5. Smoke MI-4 (`wo20_mi4_smoke/smoke.ts`, 24/24)

| No | Kasus | Bukti |
|----|-------|-------|
| 1 | Kontrak dialog — `academicYears.findMany()` memberi default tahun aktif | `total==3`, `isActive` == seed yearA |
| 2 | Kontrak dialog — `curricula.findMany()` memberi daftar kurikulum (picker) | berisi `MERDEKA` & `KTSP` |
| 3 | Default aktif (simulasi pilihan dialog) → `previewCheck({yearA,k1})` VALID | `valid=true`, `errorCount=0` |
| 4 | Pilih kurikulum → preview di-scope kurikulum | `X B` di `(yearA,k2)` → `classNotFound`; di `(yearA,k1)` → valid |
| 5 | Preview pakai scope (tahun) — non-aktif dihormati, **tidak fallback** | `(yearB,k1)` `X A` valid; `(yearC,k1)` `X A` → `classNotFound` padahal yearA (aktif) punya `X A` |
| 6 | Import pakai scope (tahun non-aktif) | enrollment `academicYearId==yearB`, `classId==classD`, `member.classId==null` |
| 7 | Import scope kurikulum | `(yearA,k2)` → classC; `(yearA,k1)` → classA; kelas sama `X A` diselesaikan per kurikulum |
| 8 | Invariant satu-ACTIVE per (member, tahun) | tidak ada 2 ACTIVE |

> Catatan: perilaku murni renderer (default dropdown, hint `REQUIRE_SCOPE`, re-preview saat ganti scope) tidak dapat diuji via smoke node tanpa framework React; kontrak backend yang dipakai dialog (findMany, previewCheck, import, resolver tanpa fallback) dibuktikan penuh di atas + `npm run build` + grep bundle renderer.

---

## 6. Validasi

| Gate | Hasil |
|------|-------|
| `npm run lint` | PASS |
| `npm run build` | PASS (main 1,796.83 kB · preload 8.62 kB · renderer 1,006.72 kB) |
| Smoke MI-4 (wo20) | **24/24** PASS (fresh DB) |
| Regression MI-1 (wo17) | **43/43** PASS (fresh DB) |
| Regression MI-2 (wo18) | **37/37** PASS (fresh DB) |
| Regression MI-3 (wo19) | **38/38** PASS (fresh DB) |
| Regression E-1 (wo13) | **39/39** PASS (fresh DB) |
| Regression E-2 (wo14) | **36/36** PASS (fresh DB) |
| Regression E-3 (wo15) | **78/78** PASS (fresh DB) |
| Regression E-4 (wo16) | **45/45** PASS (fresh DB) |
| `prisma migrate diff` | "This is an empty migration." (no drift; schema tidak disentuh) |
| Grep bundle renderer | `Penempatan Kelas` / `Dilewati` / `Pilih Tahun Ajaran` ter-render (7 match) |
| Grep bundle main | `members:previewCheck` / `members:import` ada (3 match) |

DB smoke memakai fresh DB temp (`C:\Users\hp\AppData\Local\Temp\opencode\mi4-smoke\*.db`, `file:` absolute) dan dibersihkan setelah run — DB live dev tidak pernah disentuh.

---

## 7. Technical Debt / Catatan

- **`uat_*` smoke historis** (mis. `uat_wo5_p3`, `uat_wo8`) masih memakai konstruktor resolver 2-arg / scope null — artefak WO lama, obsolete oleh keputusan PO. Tidak diubah (di luar scope). Bila suatu saat dijalankan ulang, perlu migrasi manual.
- **`MemberImportScope`** dipakai renderer hanya melalui `window.electronAPI`; tidak ada state scope global di luar dialog.
- Label lama `FIELD.PRICE` ("Harga Beli") dan sejenisnya tetap di luar scope (key mati, pelajaran WO13-R1).

---

## 8. File Terlibat

| File | Perubahan |
|------|-----------|
| `src/main/services/member-import.service.ts` | scope wajib + writePhase string + hapus fallback |
| `src/main/repositories/class.repository.ts` | `findByAcademicYearAndCurriculum` curriculumId wajib |
| `src/components/members/MemberImportDialog.tsx` | picker tahun+kurikulum, scope pada preview/import, hasil +skipped |
| `src/utils/labels.ts` | +9 label scope + `RESULT_SKIPPED` |
| `electron/ipc/member.ipc.ts` | scope wajib |
| `electron/preload/member.preload.ts` | scope wajib |
| `src/renderer/env.d.ts` | scope wajib |
| `electron/main/bootstrap.ts` | ctor resolver 1 arg |
| `wo17_mi1_smoke/smoke.ts` | contract update (43) |
| `wo18_mi2_smoke/smoke.ts` | contract update (37) |
| `wo19_mi3_smoke/smoke.ts` | ctor update (38) |
| `wo20_mi4_smoke/smoke.ts` | **baru** (24) |
