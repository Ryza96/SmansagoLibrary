# WORK_ORDER_TAHAP3_TEACHER_IMPORT_IMPLEMENTATION.md

## Ringkasan
Implementasi **Tahap ③ — Import Data Guru/Staff**: template Excel, wiring backend end-to-end (service/parser/validation/preview/duplicate-checker/IPC/preload/env.d.ts), verifikasi kontrak template, dan perbaikan sheet **PETUNJUK** ke versi guru (keputusan PO). **TIDAK** mencakup Tahap ④ (UI upload/preview dialog) — di luar scope.

## Deliverable Tahap ③

### 1. Template Excel
- File: `templates/Template_Import_Guru_v1.0.xlsx` (ditransformasi dari `templates/Template_Import_Anggota_v1.0.xlsx`).
- **Sheet 1 "Import Guru":** 8 kolom persis `TEACHER_IMPORT_TEMPLATE`:
  `Nama, Jenis Kelamin, NIP, Tempat Lahir, Tanggal Lahir, Alamat, WhatsApp, Email`.
  - Wajib: `Nama, Jenis Kelamin, NIP`; Opsional: `Tempat Lahir, Tanggal Lahir, Alamat, WhatsApp, Email`.
  - Header row 1, frozen; 200 baris kosong terformat di bawah (C/E/G styled).
  - 2 sample rows (Budi Santoso / Siti Nurhaliza) — NIP `0123456789` tetap string dengan leading zero (bukti smoke).
- **Sheet 2 "PETUNJUK":** ditulis ulang versi GURU (10 langkah berurutan):
  1. Jangan menghapus atau mengubah nama header.
  2. Kolom wajib: Nama, Jenis Kelamin, NIP
  3. Kolom opsional: Tempat Lahir, Tanggal Lahir, Alamat, WhatsApp, Email
  4. Urutan kolom boleh berubah.
  5. Kolom tambahan diperbolehkan.
  6. Jenis Kelamin yang diterima: L, Laki-laki, P, Perempuan
  7. Tanggal Lahir diisi dengan format YYYY-MM-DD. (Contoh: 2009-07-27 / Boleh dikosongkan.)
  8. NIP disarankan bertipe Text agar angka nol di depan tidak hilang.
  9. WhatsApp disarankan bertipe Text agar angka nol di depan tidak hilang.
  10. Simpan file dalam format .xlsx.
  - Perubahan: judul "IMPORT ANGGOTA SISWA" → "IMPORT GURU / STAFF"; blok "Kelas" (wajib, opsional contoh, poin 6) dihapus total; "NISN" → "NIP"; "No. WhatsApp" → "WhatsApp"; penomoran di-renumber 1–10; 3 shared string baru ditambahkan (indeks 63/64/65), indeks eksisting dipertahankan (additive-safe untuk sheet1).

### 2. Backend (wiring selesai)
- `src/shared/dto/teacher.ts` — `TeacherImportRowInput` (rowNumber, fullName, gender 'male'|'female', nip?, birthPlace?, birthDate?, address?, phone?, email?), `TeacherImportPreviewDTO`, `TeacherImportResultDTO`.
- `src/config/teacherImport.template.ts` — `TEACHER_IMPORT_TEMPLATE` (8 kolom + required set).
- `src/services/TeacherExcelParserService.ts` — membaca workbook (read-excel-file v9 `Sheet[]` → `sheets[0].data`), header normalization + sinonim, NIP leading-zero aman.
- `src/services/TeacherImportValidationService.ts` — validasi per-baris (wajib Nama/Jenis Kelamin/NIP, gender mapping, tanggal, dll).
- `src/services/TeacherPreviewService.ts` — preview row DTO.
- `src/main/services/teacher-duplicate-checker.service.ts` — deteksi duplikat NIP existing.
- `src/main/services/teacher-import.service.ts` — pipeline import (create Teacher + status, progress stage string).
- IPC/preload: `electron/ipc/teacher.ipc.ts`, `electron/preload/teacher.preload.ts` — channel `teachers:downloadTemplate`, `teachers:previewCheck`, `teachers:import`, `teachers:importProgress`.
- Wiring: `electron/main/bootstrap.ts`, `electron/ipc/index.ts`, `electron/preload/index.ts`.
- `src/renderer/env.d.ts` — blok `teacherImport` (mirror preload; DTO via `../../src/shared/dto/teacher`; `onProgress: (cb: (stage: string) => void) => () => void`).
- `electron-builder.yml` — extraResources filter menyertakan `Template_Import_Guru_v1.0.xlsx`.

## Validation
- `npm run lint` (tsc node + web): **PASS**.
- Verifikasi template `verify-teacher-template.cjs`: **CONTRACT PASS** — sheets `["Import Guru","PETUNJUK"]`, 8 header benar, 2 sample rows utuh, NIP leading-zero string.
- Dump sheet PETUNJUK (`dump-petunjuk.cjs`): 26 baris versi guru, penomoran 1–10 urut, tidak ada sisa teks member ("Kelas", "ANGGOTA SISWA", "NISN").

## Status
**DONE — READY review PO.** Tidak lanjut Tahap ④ (UI) tanpa instruksi. Tidak di-commit (menunggu instruksi).
