# WORK ORDER 1 — Import Anggota (Siswa): Foundation UI (COMPLETE — READY review PO)

> Source of Truth: `IMPORT_MEMBER_ARCHITECTURE_SPEC.md` v3.0 (REVISION FINAL, APPROVED).
> WO-1 scope: **UI foundation only** — button entry point, fullscreen dialog (UPLOAD step),
> working template download, file selection with state, full state cleanup on dialog close.
> **TIDAK ada** parsing/validasi/duplicate-check/preview/transaction/import/migration/dependency baru.

## Ringkasan
- Tombol **"Import Siswa"** muncul di Daftar Siswa (`memberType='student'`) di samping "+ Tambah Siswa",
  membuka **fullscreen dialog** `MemberImportDialog` (overlay, TANPA perpindahan halaman).
- Dialog berisi step **UPLOAD** saja: subtitle, `FileUploadDropzone` (reuse apa adanya), tombol
  **Download Template**, dan tombol **Tutup**. State lokal di-reset penuh saat dialog ditutup.
- **Download Template berfungsi end-to-end**: tombol → `memberImport.downloadTemplate` (preload) →
  `members:downloadTemplate` (IPC main) → save dialog OS → salin `templates/Template_Import_Anggota_v1.0.xlsx`.
- Template anggota dibuat baru: 1 sheet "Import Anggota", header-only, 9 kolom sesuai keputusan #4 RFC
  (Nama, Kelas, Jenis Kelamin, NISN, Tempat Lahir, Tanggal Lahir, Alamat, No. WhatsApp, Email),
  **tanpa** styling/contoh/sheet bantuan. Diverifikasi terbaca oleh `read-excel-file` (lib yang dipakai app).

## File Baru
| # | File | Keterangan |
|---|------|-----------|
| 1 | `src/components/members/MemberImportDialog.tsx` | Fullscreen dialog, step `upload`; props `{ onClose }`; state lokal `file`/`downloading`/`downloadStatus`; `handleClose()` reset penuh sebelum `onClose()` |
| 2 | `templates/Template_Import_Anggota_v1.0.xlsx` | 1 sheet header-only, 9 kolom; OOXML minimal (inline strings) + `styles.xml`/`sharedStrings.xml` minimal |

## File Dimodifikasi
| # | File | Perubahan |
|---|------|-----------|
| 1 | `electron/ipc/member.ipc.ts` | + handler `members:downloadTemplate` (mirror pola `book-import.ipc.ts`: `resolveTemplatePath` pakai `app.isPackaged ? process.resourcesPath : app.getAppPath()`; save dialog; `DownloadTemplateResult`) |
| 2 | `electron/preload/member.preload.ts` | + `memberImport.downloadTemplate` → `ipcRenderer.invoke('members:downloadTemplate')` |
| 3 | `src/renderer/env.d.ts` | + blok `memberImport` (typing `DownloadTemplateResult`) |
| 4 | `src/utils/labels.ts` | + blok `MEMBER_IMPORT` (TITLE, SUBTITLE, UPLOAD_STEP_TITLE/DESC, PICK_FILE, DOWNLOAD_TEMPLATE, DOWNLOAD_PROCESSING/SUCCESS/CANCELLED/ERROR, CLOSE) |
| 5 | `src/pages/MemberListPage.tsx` | + import `FileUp`/`MemberImportDialog`; state `importOpen`; tombol "Import Siswa" (conditional `memberType==='student'`); host dialog; `onClose` → `setImportOpen(false)` + `fetchMembers()` (refetch) |
| 6 | `electron-builder.yml` | `extraResources` templates filter + `Template_Import_Anggota_v1.0.xlsx` |

## Kepatuhan RFC FINAL (WO-1)
- [x] **AC-1 Entry point**: tombol "Import Siswa" di Daftar Siswa → fullscreen dialog. TIDAK ada route/menu/sidebar baru.
- [x] **§3.1**: TIDAK ada perubahan `routes/index.tsx`, `Sidebar.tsx`, `navigation.ts`.
- [x] **§3.2 step `upload`**: subtitle + tombol Download Template + `FileUploadDropzone` + tombol Tutup.
- [x] **§3.3 Lifecycle**: dibuka → state fresh; ditutup (X/klik luar/Tutup) → state di-reset penuh (keputusan #24, AC-16).
- [x] **§16 #6 template**: 1 sheet, header-only, 9 kolom, tanpa bantuan/contoh/styling.
- [x] **§16 modified #11/#12/#13/#4/#6/#15**: handler, preload, env.d.ts, labels, MemberListPage, electron-builder.
- [x] **§20 decision M**: `FileUploadDropzone` reuse apa adanya, tidak dimodifikasi.
- [x] **§20 decision D**: `read-excel-file` sudah ada; TIDAK ada dependency baru.
- [x] **TIDAK termasuk scope WO-1**: parsing, validation engine, header normalizer, duplicate checker, class resolver, preview, import service, DTO, migration, bootstrap wiring orchestrator, chunk config keys.

## Catatan Teknis
- Template di-generate dengan OOXML minimal (inline strings `t="inlineStr"`), memakai `fflate` (sudah jadi
  transitive dep `read-excel-file`) dalam skrip sekali-jalan di luar repo (tidak ada dependency baru).
- `read-excel-file` 9.3.5 mengembalikan non-Promise bila workbook tidak punya `styles.xml`/`sharedStrings.xml`
  (real Excel selalu punya) — template diberi minimal `styles.xml` + `sharedStrings.xml` kosong agar parser normal.
- Verifikasi template: `read-excel-file/node` membaca `[{ sheet: 'Import Anggota', data: [[9 header]] }]` — PASS.
- Validation: `npm run lint` PASS, `npm run build` PASS (main 1,760.11 kB · preload 7.26 kB · renderer 907.54 kB).

## Technical Debt
| TD | Deskripsi | Rencana |
|----|-----------|---------|
| TD-1 | Dialog hanya punya step `upload`; tombol Lanjut/Preview/Import belum ada (butuh backend WO-2) | WO-2+ (parse/validasi/preview/import) |
| TD-2 | `DOWNLOAD_PROCESSING`/`DOWNLOAD_CANCELLED` label belum ditampilkan (status sukses/error saja ditampilkan) | Saat polish UI |
| TD-3 | `PICK_FILE` label (`MEMBER_IMPORT`) tidak dipakai — pemilihan file via `FileUploadDropzone` | Saat polish UI |

## Status
**DONE — Architecture Gate BERHENTI**, menunggu review Product Owner. Tidak lanjut WO berikutnya.
