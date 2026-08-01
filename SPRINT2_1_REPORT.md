# SPRINT2_1_REPORT.md — Foundation Cleanup

Work Order: **Sprint 2.1 — Foundation Cleanup**
Status: **COMPLETE — READY**
Date: 2026-07-31

---

## 1. File yang Dibuat

| File | Peran |
|------|-------|
| `src/services/WorkbookReaderService.ts` | **Satu-satunya lokasi yang mengenal library `read-excel-file`.** Class `WorkbookReaderService` dengan method `readWorkbookPreview(file)` + singleton `workbookReaderService`; memuat `ImportReaderError` (error ber-kode IMP-004/IMP-005). |
| `src/hooks/useBookImportWorkflow.ts` | Orchestration: `selectFile(file)` → validasi (`validateImportFile`) → baca workbook via `workbookReaderService` → update state context, dengan proteksi race (`parseSeq` ref). |

## 2. File yang Diubah

| File | Perubahan |
|------|-----------|
| `src/contexts/BookImportContext.tsx` | **Ditulis ulang menjadi pure state container.** Hanya menyimpan state (`file`, `errorCode`, `workbook`, `parsing`) + setter (`setFile`, `setErrorCode`, `setWorkbook`, `setParsing`, `reset`). Semua logika validasi & parsing dipindah ke hook. Tidak lagi mengimpor reader/validator. |
| `src/utils/bookImport.ts` | `getImportErrorMessage()` — **switch diganti lookup table** `IMPORT_ERROR_MESSAGES: Record<ImportErrorCode, string>` (ekshaustif, tanpa `default`/`ERROR_UNKNOWN`). |
| `src/utils/labels.ts` | Hapus `LABELS.IMPORT.ERROR_UNKNOWN` (mati — lookup table ekshaustif mencakup IMP-001..005). |
| `src/config/import.config.ts` | Hapus `maxPreviewRows` — **hanya** `allowedExtensions` + `maxFileSize` yang tersisa. |
| `src/pages/BookImportPreviewPage.tsx` | Konstanta lokal `PREVIEW_ROW_LIMIT = 50` — **halaman menentukan sendiri jumlah baris preview** (tidak lagi membaca dari `IMPORT_CONFIG`). |
| `src/pages/BookImportPage.tsx` | Pakai `useBookImportWorkflow().selectFile` untuk dropzone (bukan `setFile` context). |
| `tsconfig.web.json` | `include` += `src/services/**/*`, `src/hooks/**/*`. |
| `src/utils/excelReader.ts` | **DIHAPUS** — logika dipindah ke `WorkbookReaderService`. |

## 3. Arsitektur Hasil Refactor

```
BookImportPage / BookImportPreviewPage
        │
        ├── useBookImport() → BookImportContext (state SAJA — tanpa logika)
        │                          ▲
        └── useBookImportWorkflow() │  (validasi + orchestrasi + race guard)
                │
                └── WorkbookReaderService (SATU-SATUNYA yang tahu read-excel-file)
                        │
                        └── read-excel-file/browser
```

- **Context hanya menyimpan state** — semua orchestration (validasi → baca → set state) keluar dari provider, masuk ke `useBookImportWorkflow`.
- **`WorkbookReaderService` = satu-satunya referensi `read-excel-file`** — diverifikasi via grep seluruh `src/` (1 match, hanya di service).
- **Tipe library tidak bocor** — `BookImportContext`, hook, dan halaman hanya mengenal `WorkbookPreview`, `ImportErrorCode`, dan `ImportReaderError` (semua milik kita).

## 4. Bukti Smoke Test — File Excel NYATA

File `.xlsx` **dibuat oleh Microsoft Excel asli (Excel COM v16)** — bukan workbook sintetis buatan manual — di `C:\Users\hp\AppData\Local\Temp\opencode\real_import.xlsx` (8.396 byte), sheet `Data Buku`, 5 baris × 5 kolom (Judul, Penulis, Tahun, Kategori, ISBN).

**Test 1 — `read-excel-file/node` (path):**

```
sheets length: 1
sheetName: "Data Buku"
rowCount: 5
columnCount: 5
rows:
  ["Judul","Penulis","Tahun","Kategori","ISBN"]
  ["Laskar Pelangi","Andrea Hirata",2005,"Fiksi","978-979-3062-79-2"]
  ["Bumi Manusia","Pramoedya Ananta Toer",1980,"Sejarah","978-979-9731-23-4"]
  ["Filosofi Teras","Henry Manampiring",2018,"Nonfiksi","978-602-452-369-9"]
  ["Atomic Habits","James Clear",2018,"Self-Help","978-602-06-3185-5"]
SMOKE PASS: real Excel file read OK, sheet=Data Buku rows=5 cols=5
```

**Test 2 — `read-excel-file/browser` via `File` object (entry yang dipakai aplikasi):**

```
browser entry — sheetName: "Data Buku" rows: 5 cols: 5
BROWSER ENTRY SMOKE PASS: real Excel file via File object OK
```

Bukti lengkap: workbook terbaca, worksheet pertama ditemukan, nama worksheet benar, jumlah baris benar (5), jumlah kolom benar (5).

## 5. Bukti Build

```
> npm run lint           (tsc --noEmit node + web)
> tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit   → PASS (exit 0)

> npm run build          (electron-vite build)
> ✓ 61 modules → out/main/index.js (88.19 kB)
> ✓ 16 modules → out/preload/index.js (6.35 kB)
> ✓ 1909 modules → out/renderer/index-CCqAf1RN.js (862.02 kB JS + 34.03 kB CSS)
> built in 3.73s        → PASS
```

## 6. Bukti Lint

```
> npx eslint src/services/WorkbookReaderService.ts src/contexts/BookImportContext.tsx \
    src/hooks/useBookImportWorkflow.ts src/utils/bookImport.ts src/config/import.config.ts \
    src/pages/BookImportPage.tsx src/pages/BookImportPreviewPage.tsx src/utils/labels.ts \
    src/routes/index.tsx --max-warnings 0   → PASS (exit 0)
```

## 7. Verifikasi "Tidak Ada Perubahan Database"

- `git diff prisma/schema.prisma` → hanya perubahan **WO13 yang sudah ada** di working tree (6 baris `acquisition*`; ±47/−43). **Tidak ada diff baru dari Sprint 2.1.**
- Tidak ada folder migration baru (`git status` hanya menampilkan 2 folder migration WO13 yang sudah ada).
- Tidak ada import Prisma / repository / API baru di kode import.

## 8. Risiko Sebelum Sprint 3

1. **`npm run lint:eslint` repo-wide tetap tidak hijau** (17 error + 42 warning pre-existing di file lama — `react-hooks/set-state-in-effect`, `no-explicit-any`) — di luar scope.
2. **Belum ada validasi header/template/bisnis** — file non-template tetap lolos ke preview (sesuai scope Sprint 2.x).
3. **`IMP-004` adalah catch-all** — semua kegagalan baca (file rusak, bukan .xlsx, dan kasus TypeError library saat `xl/styles.xml` hilang dari file pihak ketiga) dipetakan ke satu pesan generik.
4. **Parsing membaca seluruh workbook di memory** — `PREVIEW_ROW_LIMIT = 50` hanya membatasi render, bukan parsing; evaluasi streaming (`read-excel-file` `getRows`/web-worker) bila file besar menjadi masalah.
5. **Bundling renderer +~134 kB** dari `read-excel-file` (862 kB total) — pantau saat packaging production; opsi code-splitting / dynamic import bila perlu.
6. **`ImportReaderError` dipakai hook** (`err instanceof ImportReaderError`) — error non-import di catch tetap dipetakan `'IMP-004'`; tidak ada path error yang lolos tanpa kode.

## Status

Workbook reader diverifikasi dengan **file Excel nyata** (PASS, sheet name + row + column count benar), arsitektur bersih (Context = state murni → `useBookImportWorkflow` → `WorkbookReaderService` → library), `maxPreviewRows` dihapus dari config (halaman menentukan sendiri), switch diganti lookup table, service menjadi satu-satunya pemilik library, build + lint PASS, **tidak ada perubahan database**. **READY untuk Sprint 3 (Validation Engine).**
