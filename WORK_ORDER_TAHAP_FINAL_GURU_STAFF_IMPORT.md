# WORK_ORDER_TAHAP_FINAL_GURU_STAFF_IMPORT.md

## Ringkasan
Laporan AKHIR menyeluruh seluruh workstream **Import Data Guru/Staff** (Tahap ①–⑤): discovery, backend, UI, smoke test, dan finalisasi. Status keseluruhan: **SELURUH VALIDATION PASS** — lint PASS, build PASS, teacher smoke **47/47**, regression student smoke **142/142**, `git status` konsisten. **TIDAK di-commit (menunggu review PO).**

## Tahap ① — Discovery (PERENCANAAN)
- **Konteks:** import anggota siswa sudah ada (WO-17..WO-20 MI-1..MI-4); kebutuhan PO = jalur import **Guru/Staff** terpisah dengan kolom berbeda (NIP bukan NISN, tanpa kelas).
- **Keputusan kunci:**
  1. **Pemisahan pipeline** — student (`memberImport.*`) dan teacher (`teacherImport.*`) adalah dua kontrak IPC/preload/env terpisah; teacher TIDAK mereuse service student.
  2. **Arsitektur bertingkat** (sama pola student): parser+validation+preview **di renderer** (`src/services/`), duplicate-checker+import **di main** (`src/main/services/`).
  3. **NIP** = identitas unik guru (satu-satunya key duplikasi; email TIDAK diblokir untuk guru).
  4. Template Excel guru **terpisah** (`Template_Import_Guru_v1.0.xlsx`), 8 kolom: `Nama, Jenis Kelamin, NIP, Tempat Lahir, Tanggal Lahir, Alamat, WhatsApp, Email`.
  5. Kolom wajib: `Nama, Jenis Kelamin, NIP`; opsional: sisanya (keputusan PO — WhatsApp/Email opsional).

## Tahap ② — Template Excel (PERENCANAAN, diputar ke Tahap ③)
- Rencana awal: verifikasi kontrak template guru hasil transform dari template anggota.
- **Pelajaran:** template `.xlsx` TIDAK boleh dibuat dari nol di kode — transformasi dari template anggota eksisting + verifikasi kontrak via script (`verify-teacher-template.cjs`).

## Tahap ③ — Backend (COMPLETE — detail di `WORK_ORDER_TAHAP3_TEACHER_IMPORT_IMPLEMENTATION.md`)
- **Template:** `templates/Template_Import_Guru_v1.0.xlsx` (sheet "Import Guru" 8 kolom + sheet "PETUNJUK" versi guru 10 langkah).
- **Backend main (3 file baru):**
  - `src/main/services/teacher-duplicate-checker.service.ts` — `checkDatabase(rows)` → errors `teacherImport.duplicateNipInDb` (field `nip`, `existingMemberNumber`, `existingMemberName`) via `memberRepository.findManyByNIPs`; export `TEACHER_DUPLICATE_NIP_IN_DB_MESSAGE_KEY`.
  - `src/main/services/teacher-import.service.ts` — ctor `(teacherDuplicateChecker, numberGeneratorService, memberRepository)`; `previewCheck(rows)` → `{valid, errorCount, warningCount:0, errors, warnings:[]}`; `import(rows)` via `runTransaction` + `allocateMemberNumbers` (prefix `G-`) + `createManyWithTx`, key `teacherImport.createFailed`, guard `TEACHER_IMPORT_ALREADY_RUNNING_MESSAGE`, toleransi `isPrismaP2002`.
  - `src/main/repositories/member.repository.ts` (+`findManyByNIPs`) — satu-satunya file repository yang tersentuh.
- **Renderer (3 file baru):**
  - `src/services/TeacherExcelParserService.ts` — `parse(File)` → `ParsedTeacherRow[]` (read-excel-file v9 `Sheet[]`, header normalize, NIP leading-zero aman).
  - `src/services/TeacherImportValidationService.ts` — `validate(rows)` sinkron; keys `teacherImport.requiredValue` (label Nama), `teacherImport.invalidGender`, `teacherImport.invalidDate`; gender mapping `L/Laki-laki→male`, `P/Perempuan→female`.
  - `src/services/TeacherPreviewService.ts` — `preview(rows)` sinkron; key `teacherImport.duplicateNipInFile`, `TEACHER_PREVIEW_MAX_ROWS = 50`, status `VALID|ERROR|DUPLICATE`.
- **Config/DTO/plumbing:** `src/config/teacherImport.template.ts`, `src/shared/dto/teacher.ts` (`TeacherImportRowInput`/`TeacherImportPreviewDTO`/`TeacherImportResultDTO`), `src/utils/teacherImport.ts` (message map), `electron/ipc/teacher.ipc.ts` (4 channel), `electron/preload/teacher.preload.ts`, `electron/main/bootstrap.ts`, `electron/ipc/index.ts`, `electron/preload/index.ts`, `src/renderer/env.d.ts`, `electron-builder.yml` (extraResources guru template).

## Tahap ④ — UI (COMPLETE — detail di `WORK_ORDER_TAHAP4_TEACHER_IMPORT_UI_IMPLEMENTATION.md`)
- `src/components/members/TeacherImportDialog.tsx` (BARU) — upload+preview lokal (`teacherPreviewService.preview`) + merge issue backend (`previewCheck`) + import + progress + template download.
- `src/pages/MemberListPage.tsx` — gerbang tombol "Import Siswa"/"Import Guru" (conditional per memberType; dua dialog berbagi state `importOpen`).
- `src/components/members/PersonalSection.tsx` (+`nip?`/`setNip?`/`showNip?`), `src/components/members/MemberForm.tsx` (field NIP, wajib saat create guru / opsional saat edit), `src/pages/MemberEditPage.tsx` (back-fill NIP).
- `src/components/layout/Sidebar.tsx` (`Guru`→`Guru/Staff`), `src/routes/index.tsx` (title/label).
- **TIDAK diubah:** `MemberImportDialog.tsx`, student pipeline, Book Cover workstream, schema/migration.

## Tahap ⑤ — Smoke Test + Finalisasi (COMPLETE)
### Verifikasi gerbang `?type=teacher`
- `src/pages/MemberCreatePage.tsx` **diverifikasi benar — TIDAK perlu edit**: membaca `searchParams.get('type')` → `defaultMemberType={defaultMemberType ?? undefined}` → `<MemberForm mode="create">`; `/members/new?type=teacher` → `defaultMemberType='teacher'` → `isTeacher === MEMBER_TYPES.teacher.code` → `showNip` menampilkan field NIP.

### Smoke baru `wo_teacher_import_smoke/smoke.ts` — **47/47 PASS** (fresh DB temp, service/repo ASLI)
> **Penyesuaian skenario (sesuai arsitektur sebenarnya):** validasi Nama/Gender/duplikat-dalam-file hidup di **renderer** (`TeacherImportValidationService`/`TeacherPreviewService`), sedangkan duplikat-vs-DB + import hidup di **backend**. Tiap skenario diuji di layer yang benar, bukan meniru kasus student yang semuanya backend.

| # | Skenario | Layer | Hasil |
|---|----------|-------|-------|
| STEP 0 | Seed member existing ber-NIP (`G-000001`, NIP `1111111111`) | DB | PASS |
| STEP 1 | Nama kosong → `teacherImport.requiredValue` (label Nama) | RENDERER | PASS |
| STEP 2 | Gender invalid (`X`) → `invalidGender`; `L→male`, `perempuan→female` | RENDERER | PASS |
| STEP 3 | NIP duplikat **dalam file** → `teacherImport.duplicateNipInFile`, status DUPLICATE, `canImport=false`, `duplicateNipRows` | RENDERER | PASS |
| STEP 4 | Semua baris valid → `canImport=true` | RENDERER | PASS |
| STEP 5 | NIP duplikat **vs database** → `teacherImport.duplicateNipInDb` (field nip, existingMemberNumber/Name); NIP bebas → 0 error | BACKEND | PASS |
| STEP 6 | `previewCheck` valid true / duplikat false | BACKEND | PASS |
| STEP 7 | **Import sukses** (NIP terisi, WhatsApp/Email KOSONG) → success true, created 2, memberNumber `G-000002`/`G-000003`, memberType teacher, status INACTIVE, email/phone null | BACKEND | PASS |
| STEP 8 | Import dengan NIP duplikat DB → **BLOCKER** success false, created 0, failed 1, baris duplikat TIDAK tersimpan | BACKEND | PASS |

### Regression student — **142/142 PASS** (fresh DB per suite, suite TIDAK diubah)
- `wo17_mi1_smoke` **43/43** · `wo18_mi2_smoke` **37/37** · `wo19_mi3_smoke` **38/38** · `wo20_mi4_smoke` **24/24**.
- `git diff` keempat smoke suite student = **kosong** (pipeline & suite student tidak tersentuh).

### Lint & Build
- `npm run lint` (tsc node + web): **PASS**.
- `npm run build`: **PASS** — main 2,419.77 kB · preload 12.46 kB · renderer 1,284.59 kB (`index-BW0GnXSS.js`).

### `git status --short` — konsisten
- **File teacher (baru):** `electron/ipc/teacher.ipc.ts`, `electron/preload/teacher.preload.ts`, `src/components/members/TeacherImportDialog.tsx`, `src/config/teacherImport.template.ts`, `src/main/services/teacher-duplicate-checker.service.ts`, `src/main/services/teacher-import.service.ts`, `src/services/TeacherExcelParserService.ts`, `src/services/TeacherImportValidationService.ts`, `src/services/TeacherPreviewService.ts`, `src/shared/dto/teacher.ts`, `src/utils/teacherImport.ts`, `templates/Template_Import_Guru_v1.0.xlsx`, `wo_teacher_import_smoke/`, laporan Tahap 3/4/Final.
- **File teacher (modifikasi):** `src/main/repositories/member.repository.ts`, `src/components/members/MemberForm.tsx`, `src/components/members/PersonalSection.tsx`, `src/pages/MemberEditPage.tsx`, `src/pages/MemberListPage.tsx`, `src/components/layout/Sidebar.tsx`, `src/routes/index.tsx`, `src/renderer/env.d.ts`, `electron/ipc/index.ts`, `electron/main/bootstrap.ts`, `electron/preload/index.ts`, `electron-builder.yml`, `src/utils/labels.ts`.
- **File parallel-workstream (PRE-EXISTING, BUKAN sentuhan workstream guru):** Book Cover (`WORK_ORDER_BOOK_COVER_IMPLEMENTATION.md`, `wo_book_cover_smoke/`, `book-cover-config.ts`, `book-cover-resize.ts`, `asset.provider.ts`, `asset-restore.handler.ts`, `cover.ts`, `electron/ipc/book.ipc.ts`, `electron/main/services/book.service.ts`, `electron/preload/book.preload.ts`, `prisma/schema.prisma`, `prisma/migrations/20260810_wo_book_cover/`, `BookDetail.tsx`, `BookForm.tsx`, `bookImport.template.ts`, `book-import.service.ts`, `book.ts`) + smoke lama (`wo11e`, `wo21_import_b1b2_smoke`, `wo4_backup_smoke`, `wo5_restore_smoke`, `wo6_backup_restore_ui_smoke`) — sudah dilaporkan di work order masing-masing, TIDAK tersentuh Tahap ①–⑤.

## TIDAK diubah (keseluruhan Tahap ①–⑤)
- Student import pipeline (`MemberImportDialog.tsx`, member-import/validation/preview services, IPC `members:import*`).
- Smoke suite student (`wo17`–`wo20`) — bukti `git diff` kosong + regression 142/142.
- Book Cover workstream (seluruh file).
- Schema/migration — `prisma migrate diff` = "This is an empty migration." (Tahap ③), `nip` sudah ada di schema (`String? @unique`).
- Template siswa `Template_Import_Anggota_v1.0.xlsx`.
- Laporan kerja ini sendiri TIDAK di-commit (menunggu review PO).

## Validation Ringkas
| Gate | Hasil |
|------|-------|
| Teacher smoke `wo_teacher_import_smoke` | **47/47 PASS** |
| Regression student `wo17`–`wo20` | **142/142 PASS** (43+37+38+24) |
| `npm run lint` | **PASS** |
| `npm run build` | **PASS** (main 2,419.77 · preload 12.46 · renderer 1,284.59 kB) |
| `prisma migrate diff` | empty migration (Tahap ③) |
| `git status --short` | konsisten — hanya teacher-import + pre-existing parallel workstream |

## Status
**DONE — SELURUH TAHAP ①–⑤ COMPLETE, READY review PO.** Tidak di-commit, tidak di-push (menunggu instruksi review).
