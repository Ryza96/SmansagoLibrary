# WORK ORDER 7 — P7B: Fix F-2 File Validation (COMPLETE)

- **Status:** DONE — menunggu review Product Owner (STOP, tidak lanjut WO berikutnya)
- **Scope:** HANYA F-2 (validasi file sebelum parser). F-3 (trim NISN/email) dan technical debt **tidak** disentuh, sesuai instruksi.
- **Referensi:** `PRODUCTION_READINESS_FIX_PLAN.md` (F-2), `PRODUCTION_READINESS_AUDIT_MEMBER_IMPORT.md`.
- **No commit.**

---

## 1. Objective

Menghilangkan release blocker **F-2**: file upload import anggota tidak divalidasi ekstensi/ukuran sebelum parser dijalankan. Implementasi mengikuti **pola Import Buku** dan memakai **`IMPORT_CONFIG` yang sudah ada** (tanpa config baru).

## 2. Files Modified

| File | Perubahan |
|------|-----------|
| `src/components/members/MemberImportDialog.tsx` | Tambah gate validasi file sebelum parser (satu-satunya file kode yang berubah) |
| `uat_wo7_p7b/file-validation.smoke.ts` | Smoke test baru (READ-ONLY, dihapus setelah run) |

**Tidak diubah:** `IMPORT_CONFIG` (dipakai apa adanya), `bookImport.ts` (`validateImportFile`/`getImportErrorMessage` dipakai ulang apa adanya), `FileUploadDropzone.tsx`, parser, IPC, backend, schema, dependency.

## 3. Root Cause

`MemberImportDialog.handleFileChange()` memanggil `memberExcelParserService.parse(next)` **langsung** tanpa validasi ekstensi/ukuran. File `.csv`/`.txt`/file raksasa tetap masuk ke parser → kesalahan hanya muncul saat pembacaan/parse, tanpa pesan yang jelas, dan `IMPORT_CONFIG.maxFileSize` (5 MB) tidak pernah dikonsultasikan pada jalur anggota (audit F-2: `import.config.ts` mendefinisikan `maxFileSize` dan `allowedExtensions`, tetapi tidak ada yang membaca pada jalur ini).

## 4. Fix

Pada `MemberImportDialog.tsx`, sebelum `memberExcelParserService.parse(next)`:

```ts
const code = validateImportFile(next)   // reuse pola Import Buku
setFileErrorCode(code)
if (code) return                        // JANGAN memanggil parser
setParsing(true)
setPreviewChecking(true)
try {
  const rows = await memberExcelParserService.parse(next)
  ...
```

- `validateImportFile` (`src/utils/bookImport.ts:15`) memeriksa: **extension** (`.endsWith` terhadap `IMPORT_CONFIG.allowedExtensions` → `IMP-002`) lalu **ukuran** (`file.size > IMPORT_CONFIG.maxFileSize` → `IMP-003`); `null` file → `IMP-001`.
- Pesan error ditampilkan via `getImportErrorMessage(code)` (label `ERROR_REQUIRED`/`ERROR_EXTENSION`/`ERROR_SIZE`) tepat di bawah dropzone, pola identik `BookImportPage.tsx:69-73`.
- State `fileErrorCode` di-reset pada `handleClose`. File yang tidak valid tetap tampil di dropzone (user bisa Ganti/Hapus), konsisten dengan Import Buku.
- Karena preview/import hanya bisa dicapai setelah parse sukses, dan parse hanya berjalan bila validasi lolos → **file yang tidak valid tidak pernah sampai ke parser, previewCheck, maupun import**.

## 5. Validation

### 5.1 Smoke — `uat_wo7_p7b/file-validation.smoke.ts` (10/10 PASS)
Menguji gate yang sama persis yang dipakai dialog (`validateImportFile` + `getImportErrorMessage`), memakai objek `File` Node.js sungguhan.

| # | Kasus | Hasil |
|---|-------|-------|
| S1 | File valid `.xlsx` kecil → lolos (`null`) | PASS |
| S2 | Extension salah: `.csv` / `.txt` / tanpa extension → `IMP-002` | PASS (3/3) |
| S3 | `.xlsx` dengan ukuran `maxFileSize + 1` (5.242.881 B) → `IMP-003` | PASS |
| S3 | Ukuran tepat `maxFileSize` (5.242.880 B) → lolos (boundary) | PASS |
| S4 | `null` file → `IMP-001` | PASS |
| S5 | Pesan terisi untuk `IMP-001`/`IMP-002`/`IMP-003` | PASS (3/3) |

Karena `handleFileChange` me-`return` saat `code` non-null, hasil smoke (kode error untuk kasus tidak valid) membuktikan **parser tidak dipanggil** untuk file ekstensi salah / > max size.

### 5.2 Regression
- `npm run lint` PASS (tsconfig.node + tsconfig.web).
- `npm run build` PASS (out/main/index.js 1,774.11 kB; renderer `index-BcC_GeyD.js` 939.14 kB).
- Build artifact smoke dihapus setelah run; tidak ada DB yang terlibat.

## 6. Compatibility

- `validateImportFile` & `getImportErrorMessage` dipakai ulang **tanpa modifikasi** → tidak ada regresi pada jalur Import Buku (satu sumber kebenaran).
- `IMPORT_CONFIG.allowedExtensions` / `maxFileSize` tetap nilai tunggal yang dipakai kedua jalur.
- Tidak ada perubahan kontrak IPC, DTO, backend, atau skema → backward-compatible.

## 7. Sisa Gap (di luar scope P7B — untuk review PO)

- **F-3** (MEDIUM) trim NISN/email sebelum simpan — belum dikerjakan.
- **F-4** (MEDIUM UX) progress non-monotonic — direkomendasikan sebagai Technical Debt.
- B-1/B-6/B-7/B-8/B-9/B-10, TD-6/TD-7 — non-blocker (detail di fix plan).

## 8. Status

**P7B DONE.** Dua dari tiga release blocker (F-1, F-2) ditutup. Produk tetap **NOT READY** sampai F-3 selesai (P7C berikutnya, menunggu persetujuan PO). Tidak ada commit.
