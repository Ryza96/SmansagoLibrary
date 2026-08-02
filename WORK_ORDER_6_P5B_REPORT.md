# WORK ORDER 6 — P5B: UI Import Integration

**Status:** DONE — menunggu review Product Owner
**Scope:** HANYA menghubungkan tombol Import ke `window.electronAPI.memberImport.import()`. Tidak ada perubahan backend / IPC / parser / validation / preview.
**Tidak commit.**

---

## Objective

- Klik **Import** → panggil IPC `memberImport.import` → `MemberImportService.import()`.
- Selama import → seluruh kontrol dialog di-disable.
- Setelah selesai → pakai `MemberImportResultDTO` langsung (tanpa DTO baru).
- Jika success → tampilkan jumlah `totalRows`, `created`, `failed`, `warnings`.
- Jika business error → pesan berasal dari `MemberImportResultDTO.errors` (messageKey → label).
- Jika system error → tampilkan dialog error.
- Setelah import berhasil → dialog tetap terbuka menampilkan hasil; ditutup user → `onClose()` → `fetchMembers()` (daftar refresh). **Sesuai RFC**: "Result tampil → tutup dialog → refresh daftar". Tidak ada perilaku baru.

## Files Modified

| File | Perubahan |
|------|-----------|
| `src/components/members/MemberImportDialog.tsx` | `handleImport()` async → `await window.electronAPI.memberImport.import(toMemberImportRows(parsedRows))`; state `importing` / `importResult` (`MemberImportResultDTO`) / `importSystemError`; helper `resultIssueMessage()`; panel sukses, business-error, system-error; kontrol di-disable saat `importing` |
| `src/utils/labels.ts` | Hapus `IMPORT_PLACEHOLDER`; tambah `IMPORTING`, `IMPORT_SUCCESS`, `IMPORT_SUCCESS_DESC`, `IMPORT_FAILED`, `IMPORT_SYSTEM_ERROR`, `RESULT_TOTAL`, `RESULT_CREATED`, `RESULT_FAILED`, `RESULT_WARNINGS`; MESSAGES tambah `importFailed`, `createFailed` |

**Tidak diubah:** `src/main/services/member-import.service.ts`, IPC (`electron/ipc/member.ipc.ts`), preload (`electron/preload/member.preload.ts`), `src/renderer/env.d.ts`, parser (`MemberExcelParserService`), validation (`MemberImportValidationService`), preview (`MemberPreviewService`).

## UI Flow

1. **Import** diklik (enabled hanya saat `previewResult.canImport === true` dan `previewError === ''`).
2. `importing = true` → semua kontrol di-disable: tombol **X** (header), **Close** (footer), klik-luar, **Download Template**, **Import**, dan dropzone file (wrapper `pointer-events-none opacity-60`). Tombol Import menampilkan spinner + label `IMPORTING` ("Memproses import...").
3. Hasil `MemberImportResultDTO` (resolve → `success` true/false; reject → system error):
   - **success:** panel hijau menampilkan `totalRows` / `created` / `failed` / `warnings` + pesan sukses.
   - **business error (`success:false`):** panel merah menampilkan pesan hasil mapping messageKey dari `result.errors` (`memberImport.importFailed`, `memberImport.createFailed`, `duplicateNisnInDb`, `duplicateEmailInDb`, `classNotFound`, `classAmbiguous`); untuk `rowNumber > 0` diberi prefiks `Baris N: ...`.
   - **system error (reject):** panel error dengan pesan dari `Error.message` (fallback `IMPORT_SYSTEM_ERROR`).
4. Setelah sukses, tombol Import di-disable (`importResult.success === true`) — mencegah import ulang duplikat.
5. User menutup dialog (X / Close / klik luar) → `handleClose()` → `onClose()` → `MemberListPage` menjalankan `setImportOpen(false)` + `fetchMembers()` (daftar refresh). Dialog tidak bisa ditutup selama `importing` (guard `if (importing) return`).

## Validation

| Check | Hasil |
|-------|-------|
| `npm run lint` | PASS |
| `npm run build` | PASS (main 1,774.00 kB · preload 7.68 kB · renderer `index-DVgzO9oo.js` 935.82 kB) |
| Artifact grep renderer | `memberImport.import` = 1; `Import Berhasil` = 1; `Import Gagal` = 1; `Memproses import` = 2; `Total Baris` = 1; `importFailed`/`createFailed` template key = 1/2 |
| Artifact grep main | `memberImport.importFailed` = 1; `memberImport.createFailed` = 1 (messageKey backend) |
| Grep sisa `IMPORT_PLACEHOLDER` / `importNotice` di `src/` | 0 match |
| Import berhasil (jalur resolve, `success:true`) | Termasuk — panel counts `totalRows/created/failed/warnings` |
| Import gagal (jalur resolve, `success:false`) | Termasuk — panel pesan dari `result.errors` |
| Business error | Termasuk — `importFailed`/`createFailed`/preflight messageKey dimapping label |
| System error (reject) | Termasuk — `catch` → `importSystemError` → dialog error |
| Tombol disabled | Termasuk — kontrol di-disable saat `importing` (X, Close, klik-luar, Download, Import, dropzone); Import juga di-disable setelah sukses |

> Catatan: P5B murni wiring UI. Jalur IPC passthrough, business-return (bukan throw), dan system-throw sudah diverifikasi pada P4D (`uat_wo5_p4d/ipc-contract.smoke.ts` 25/25). Kontrak DTO (`MemberImportResultDTO`) tidak berubah; `totalRows/created/failed/warnings/durationMs/errors` dibaca langsung tanpa DTO baru.

## Compatibility

- **Backward compatible:** tidak ada kontrak IPC/preload/env yang berubah; `memberImport.import` sudah tersedia sejak P4D.
- **Renderer:** hanya `MemberImportDialog.tsx` + `labels.ts`. Komponen lain (termasuk `FileUploadDropzone` yang dipakai modul Buku) tidak disentuh — dropzone di-disable via wrapper, bukan modifikasi komponen.
- **RFC compliance:** alur "Result tampil → tutup dialog → refresh daftar" dipertahankan persis; `onClose()` eksisting `MemberListPage` sudah memanggil `fetchMembers()` — tanpa tambahan callback baru.
- **Tech debt P4C (MAX_BOOKS / chunk 500):** tidak relevan di P5B (murni renderer).
