# WORK_ORDER_TAHAP4_TEACHER_IMPORT_UI_IMPLEMENTATION.md

## Ringkasan
Implementasi **Tahap ④ — UI Import Data Guru/Staff**: dialog upload+preview+import `TeacherImportDialog`, gerbang tombol Import per tipe anggota, field NIP pada form Guru (create wajib / edit opsional), dan label navigasi "Guru/Staff". Diatas backend Tahap ③ (service/parser/validation/preview/duplicate-checker/IPC/preload/env.d.ts) yang sudah dirilis. **TIDAK** menyentuh student import pipeline (`MemberImportDialog.tsx`, member import services) dan **TIDAK** menyentuh Book Cover workstream.

## Deliverable Tahap ④

### 1. UI Import Guru — `src/components/members/TeacherImportDialog.tsx` (BARU)
- Alur: pilih file `.xlsx` → `teacherExcelParserService.parse` → `runPreview` (preview LOKAL sinkron `teacherPreviewService.preview(rows)` + merge issue backend `previewCheck(rows)` per `rowNumber` via `buildPreview`) → kartu ringkasan + tabel preview (Baris/Nama/NIP/Status/Keterangan) → tombol Import → hasil → progress via map `STAGE_LABEL` (stage = string).
- Merge rule: ERROR (lokal) menang; backend `teacherImport.duplicateNipInDb` → DUPLICATE; `canImport` = nol error lokal + nol issue backend.
- Helpers: `toTeacherImportRows`/`toGender`/`toDateString`/`validationMessage`/`backendIssueMessage`/`keterangan`/`resultIssueMessage`.
- **Fix double-reporting (final)**: issue lokal `teacherImport.duplicateNipInFile` di-skip di loop `keterangan` karena `duplicateNipRows` sudah merender "NIP duplikat dalam file: baris X" — tidak ada duplikat pesan.
- Helper `displayValue` yang tidak terpakai dihapus (lint `noUnusedLocals`).
- Template download (`teacherImport.downloadTemplate`) tersedia di dialog. Tanpa `open` prop — komponen di-mount bersyarat.

### 2. Gerbang tombol Import — `src/pages/MemberListPage.tsx`
- Tombol "Import Siswa"/"Import Guru" tampil hanya untuk `memberType` student ATAU teacher (label kondisional).
- **Conditional render dialog**: `MemberImportDialog` hanya saat `memberType === MEMBER_TYPES.student.code`; `TeacherImportDialog` hanya saat `memberType === MEMBER_TYPES.teacher.code` (dua dialog berbagi state `importOpen`, keduanya memanggil `fetchMembers()` saat close).

### 3. Field NIP pada form Guru
- `src/components/members/PersonalSection.tsx`: props opsional `nip?`/`setNip?`/`showNip?` (default false); input NIP dirender hanya saat `showNip && setNip`, label `NIP *`, placeholder "Masukkan NIP", dukungan `errors.nip`.
- `src/components/members/MemberForm.tsx`: state `nip`; `isTeacher = memberTypeCode === MEMBER_TYPES.teacher.code`; validasi `!isEditMode && isTeacher && !nip.trim()` → error "NIP wajib diisi." (**wajib hanya saat create guru**; edit tidak); payload create+update `nip: isTeacher ? (nip || undefined) : undefined`; `<PersonalSection ... nip={nip} setNip={setNip} showNip={isTeacher} />`.
- `src/pages/MemberEditPage.tsx`: `initialData` + `nip: member.nip ?? ''` (back-fill saat edit).

### 4. Label navigasi
- `src/components/layout/Sidebar.tsx`: `/members/teachers` label `'Guru'` → `'Guru/Staff'`.
- `src/routes/index.tsx`: route teacher → `title="Daftar Guru/Staff"`, `newButtonLabel="Tambah Guru/Staff"`.

## TIDAK diubah
- Backend Tahap ③ (service/parser/validation/preview/duplicate-checker/IPC/preload/env.d.ts) — hanya dikonsumsi.
- `MemberImportDialog.tsx`, member import pipeline (student), `CreateMemberDTO`/`UpdateMemberDTO` (sudah punya `nip?`).
- Book Cover workstream (`book-cover-*`, `asset.provider.ts`, `asset-restore.handler.ts`, `src/shared/dto/cover.ts`, dll).
- Schema/migration (`prisma migrate diff` = "This is an empty migration."), `labels.ts` (dialog memakai string inline).

## Validation
- `npm run lint` (tsc node + web): **PASS**.
- `npm run build`: **PASS** — main 2,419.77 kB · preload 12.46 kB · renderer 1,284.59 kB (`index-BW0GnXSS.js`).
- Grep bundle renderer: `Import Guru`=3, `Import Siswa`=1, `NIP sudah terdaftar di database`=1, `NIP duplikat dalam file`=2, `teacherImport`=20.
- Grep bundle main/preload: `teachers:previewCheck`=1/1, `teachers:import`=2/3, `teachers:downloadTemplate`=1/1.

## Status
**DONE — READY review PO.** Tidak lanjut Tahap ⑤ tanpa instruksi. Tidak di-commit (menunggu instruksi).
