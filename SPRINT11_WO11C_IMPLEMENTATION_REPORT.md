# SPRINT 11 — WO-11-C: Engine Import v2 (COMPLETE — READY review PO)

## Ringkasan
Pipeline impor kini membaca **Template Import Buku v2.0 (17 kolom)** sebagai satu kesatuan, dengan dukungan penuh kolom baru di **Validation Engine**, **Header Normalizer**, dan **Template Contract**. Backward compatible dengan **Template v1.0 (6 kolom)** — file v1 tetap lolos validasi dan canonical row-nya tanpa key `copyCount` (pipeline default = 1).

## Files Changed
| File | Perubahan |
|------|-----------|
| `src/config/bookImport.template.ts` | REWRITE: `BOOK_IMPORT_TEMPLATE` = v2 (17 kolom, id `book-import-v2`, `Tahun Terbit` bukan `Tahun`); `LEGACY_BOOK_IMPORT_TEMPLATE` = v1 (6 kolom, id `book-import-v1`, urutan persis `title,authors,publisher,year,category,isbn`); `detectBookImportTemplate(normalizedHeaders)` → pilih template berdasarkan prefix header (v2 duluan, fallback v2). `BookImportColumnKey` kini 17 key. |
| `src/services/ValidationEngineService.ts` | Deteksi template (`detectBookImportTemplate`) → kolom v1/v2 dipakai per file; `validateRow`/`buildCanonicalRow` menerima `columns` parameter; header count check `!==` → `<` (boleh ada kolom petunjuk trailing); loop header hanya sampai `templateColumns.length`; baris data kosong (semua kolom template null) di-skip sebagai valid tanpa IMP-013; `matchesDataType` dukung `'date'` (Date instance). |
| `src/services/HeaderNormalizerService.ts` | Synonym baru: `tahun` → `tahun terbit`, `jumlah` → `jumlah copy`, `jumlah eksemplar` → `jumlah copy` (legacy v1/v3). |
| `src/types/import.ts` | `TemplateDataType` + `'date'`. |
| `wo11c/smoke.ts` | Smoke script (validation only, tanpa DB). |

## Behavior Changed
1. **Template v2 (17 kolom):** kolom baru dibaca & divalidasi — `copyCount`, `language`, `edition`, `pageCount`, `description`, `shelfLocation`, `initialCondition`, `acquisitionSource`, `acquisitionDate` (Date), `acquisitionCost`, `bookCode`. Wajib diisi: Judul, Penulis, Penerbit, Tahun Terbit, Kategori, Jumlah Copy.
2. **Backward compat v1 (6 kolom):** file v1 terdeteksi via `detectBookImportTemplate` → validasi lolos, canonical row hanya 6 key lama (tanpa `copyCount` → pipeline default 1, di luar scope WO-11-C).
3. **Kolom petunjuk trailing (`PETUNJUK PENGGUNAAN`) diabaikan:** header count check `normalizedHeaders.length < requiredColumnCount` (bukan `!==`), loop header berhenti di jumlah kolom template. Baris data kosong (contoh: baris petunjuk di template) tidak menghasilkan IMP-013.
4. **Header `Tahun` lama ternormalisasi ke `tahun terbit`** lewat synonym (file era v3 tetap bisa).
5. TIDAK berubah: schema/migrasi, repository, BookImportService, MatchingEngine, WorkbookReaderService (sudah melempar semua kolom apa adanya), Preview UI, IPC/preload/env.d.ts.

## Validation
- **Smoke `wo11c/smoke.ts`: 30/30 PASS** (fresh compile tsc commonjs, `read-excel-file/node` baca file asli):
  - Template contract: v2=17 kolom & 11 field baru ada; v1=6 kolom urutan persis; 6 kolom WAJIB v2 benar.
  - **V1 parsing PASS** (file asli `Template_Import_Buku_v1.0.xlsx`): valid, 2 canonical rows, key legacy tanpa `copyCount`, year=2005, kolom petunjuk diabaikan.
  - **V2 parsing PASS** (file asli `Template_Import_Buku_v2.0.xlsx`): valid, 2 canonical rows, 17 key, seluruh 11 field baru terisi benar (copyCount=1, language, pageCount=529, description, shelfLocation, initialCondition, acquisitionSource=PEMBELIAN, acquisitionDate=Date, acquisitionCost=85000, bookCode=null), isbn tetap string (regresi), baris 2 DONASI + cost null lolos.
  - **V2 minimal (6 kolom WAJIB saja):** PASS — kolom opsional boleh tidak ada, canonical row tetap 17 key dengan opsional null, copyCount terisi.
- **`npm run lint` PASS** (tsc node + web).
- **`npm run build` PASS** (main 1,746.61 kB · preload 6.59 kB · renderer 891.64 kB).

## Backward Compatibility
- Template v1.0 (file asli) → validasi PASS, canonical tanpa `copyCount` (pipeline default 1 — di luar scope).
- File v2 yang dipangkas ke 6 kolom wajib → PASS, opsional null.
- Header `Tahun`/`Jumlah`/`Jumlah Eksemplar` (legacy) → ternormalisasi via synonym.
- `BookImportPreviewPage` merender per `getColumnCount` dinamis, bukan per template key → tidak rusak oleh perluasan template.

## Rollback
```powershell
git checkout -- src/config/bookImport.template.ts src/services/ValidationEngineService.ts src/services/HeaderNormalizerService.ts src/types/import.ts
Remove-Item -Recurse -Force wo11c
```

## Architecture Checklist
| Kriteria | Status |
|----------|--------|
| Template contract v2 terpusat di config | PASS |
| Deteksi template per-file (v1/v2) | PASS |
| CanonicalRow membawa seluruh field v2 | PASS |
| Validasi type Date (Tanggal Perolehan) | PASS |
| Kolom opsional boleh kosong/absen | PASS |
| Baris petunjuk/blank tidak jadi error | PASS |
| Backward compat v1 (default copyCount=1) | PASS (di pipeline, out of scope) |
| Zero perubahan schema/repository/service/main | PASS |
| Minimal file changes | PASS (4 kode + 1 smoke) |
| Lint + Build PASS | PASS |

**Status: DONE — Architecture Gate BERHENTI**, menunggu review Product Owner (tidak lanjut WO berikutnya).
