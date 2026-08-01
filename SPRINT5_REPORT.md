# SPRINT5_REPORT.md — Row Validation (Data Presence & Cell Validation)

Work Order: **Sprint 5 — Row Validation (Data Presence & Cell Validation)**
Status: **COMPLETE — READY**
Date: 2026-07-31

---

## 1. Ringkasan

Validation Engine kini memvalidasi **isi setiap baris data** (tanpa menyentuh database), sesuai ADR-005/006/007:

```
Excel File → WorkbookReaderService → RawWorkbook → ValidationEngine → ValidatedWorkbook
                                                     │  structural + header + ROW VALIDATION
                                                     │  (membaca SELURUH row data, mulai Row 2)
```

- **`BOOK_IMPORT_TEMPLATE` dievolusi ke v2** — setiap kolom kini membawa `key`, `label`, `requiredColumn`, `requiredValue`, `dataType`, `nullable`. **ADR-007: engine TIDAK membuat aturan sendiri — semua aturan dibaca dari template.**
- **Required Value Validation** (`IMP-013`) — kolom `requiredValue: true` wajib berisi nilai; kolom opsional boleh kosong.
- **Type Validation** (`IMP-014`) — memakai `dataType`; dukungan minimal `string` & `number` (belum enum/regex/date/boolean).
- **Metadata baru** `expectedType` & `actualType` pada `ValidationIssue.metadata`.
- **`ValidatedWorkbook.rowResults[]`** — `RowResult { rowNumber, valid, issues[] }`, satu per baris data (mulai Row 2).
- Engine tetap **tidak menghasilkan string** — hanya kode `IMP-xxx` + `messageKey`.

## 2. File Baru

Tidak ada file baru — seluruh perubahan adalah evolusi file Sprint 3/4. (Buatan smoke test dihapus setelah bukti.)

## 3. File Diubah

| File | Perubahan |
|------|-----------|
| `src/types/import.ts` | `ImportErrorCode` += `IMP-013` (nilai wajib), `IMP-014` (tipe data). Baru: `TemplateDataType = 'string' \| 'number'`, `CellType` (string/number/boolean/date/empty/unknown), `RowResult { rowNumber, valid, issues[] }`. `TemplateColumn` diperluas: `key`, `label`, `requiredColumn`, `requiredValue`, `dataType`, `nullable` (mengganti `required` lama). `ValidationMetadata` += `expectedType`, `actualType`. `ValidatedWorkbook` += `rowResults: RowResult[]`. |
| `src/config/bookImport.template.ts` | **v2**: `id: 'book-import-v2'`. Kolom: `title/Judul` (requiredColumn+requiredValue, string, non-nullable), `authors/Penulis` (requiredColumn+requiredValue, string, non-nullable), `year/Tahun` (requiredColumn, optional, number, nullable), `category/Kategori` (requiredColumn, optional, string, nullable), `isbn/ISBN` (requiredColumn, optional, string, nullable). |
| `src/services/ValidationEngineService.ts` | Header validation membaca `requiredColumn` (jumlah header ekspektasi = jumlah kolom `requiredColumn: true`; kolom opsional boleh absen). **Row validation baru**: jika header valid (bebas error), baca `target.rows[1..]` (Row 2+), setiap sel diuji terhadap template → isi `rowResults[]`. `validationResult.valid` = bebas error workbook DAN semua row valid. |
| `src/utils/bookImport.ts` | `IMPORT_ERROR_MESSAGES` += IMP-013/014. `VALIDATION_MESSAGES` += `ERROR_REQUIRED_VALUE`, `ERROR_TYPE_MISMATCH`. |
| `src/utils/labels.ts` | Baru: `ERROR_REQUIRED_VALUE` ('Kolom wajib diisi.'), `ERROR_TYPE_MISMATCH` ('Tipe data tidak sesuai.'), `VALIDATION_ROW_TITLE`, `VALIDATION_ROW_OK`, `VALIDATION_ROW_SUMMARY`, `VALIDATION_ROW_MORE`. |
| `src/pages/BookImportPreviewPage.tsx` | `ValidationIssueRow` kini menampilkan metadata tipe (`Diharapkan: number · Ditemukan: string`) dan konteks kolom (`Diharapkan: "Judul"`). Komponen baru `RowResultsSummary`: ringkasan "X dari Y baris bermasalah." + daftar baris invalid (maks 20, `VALIDATION_ROW_MORE` untuk sisa). |

## 4. Evolusi Template Specification (v1 → v2)

| key | label | requiredColumn | requiredValue | dataType | nullable | Semantik |
|-----|-------|----------------|---------------|----------|----------|----------|
| `title` | Judul | ✓ | ✓ | string | ✗ | wajib ada di header & wajib diisi |
| `authors` | Penulis | ✓ | ✓ | string | ✗ | wajib ada di header & wajib diisi |
| `year` | Tahun | ✓ | ✗ | number | ✓ | wajib ada di header; isi opsional; nilai harus angka |
| `category` | Kategori | ✓ | ✗ | string | ✓ | opsional |
| `isbn` | ISBN | ✓ | ✗ | string | ✓ | opsional |

Semantik aturan (ADR-007):
- `requiredColumn` → kolom harus hadir di header (dibaca header validation).
- `requiredValue` → sel harus berisi nilai (tidak kosong/null/whitespace) di setiap baris data.
- `nullable` → sel kosong diizinkan. Engine: kosong + (`requiredValue` **atau** `!nullable`) → `IMP-013`.
- `dataType` → tipe nilai sel non-kosong harus sesuai (`string` = `typeof string`; `number` = `typeof number` + finite).

## 5. Arsitektur Akhir

```
BookImportPage / BookImportPreviewPage
        │
        ├── useBookImport() → BookImportContext (state SAJA)
        │        validatedWorkbook: ValidatedWorkbook | null
        └── useBookImportWorkflow()
                │  (validasi file → read → validate → set state, race guard)
                ├── WorkbookReaderService ── read-excel-file/browser
                └── ValidationEngineService ──→ ValidatedWorkbook { rawWorkbook, normalizedHeaders, rowResults[], validationResult }
                        ├── HeaderNormalizerService (normalizeHeader)
                        ├── BookImportTemplate v2   (SSOT — seluruh aturan kolom)
                        └── IMPORT_CONFIG           (structural IMP-008 dst.)
```

## 6. Bukti Row Validation (Smoke Test)

Driver `sprint5-smoke.ts` (bundle esbuild, **dihapus setelah bukti**) + file Excel **NYATA** (Excel COM v16, sheet `Data Buku`, 5×5, Tahun sebagai angka):

```
template: book-import-v2 | columns: title:string, authors:string, year:number, category:string, isbn:string
PASS normalizer: trim + lowercase + collapse spaces
PASS structural rules IMP-005..009 tetap bekerja
PASS header valid: valid=true
PASS header valid dengan case/spasi tidak rata
PASS IMP-010 jumlah header (6 vs 5) + IMP-011 kolom ekstra
PASS IMP-010 jumlah header (4 vs 5) + IMP-011 kolom hilang
PASS IMP-011 nama header salah dengan metadata
PASS IMP-012 urutan header salah
PASS IMP-013 Judul kosong (row 2) dengan metadata expectedHeader/expectedColumn
PASS IMP-013 Penulis kosong/whitespace
PASS kolom optional (Tahun/ISBN) kosong tidak error
PASS IMP-014 Tahun="bukan-angka": expectedType=number actualType=string
PASS IMP-014 Judul=123: expectedType=string actualType=number
PASS multi-row: rowNumber 2,3,4; isu baris 4 = IMP-013 + IMP-014; valid keseluruhan false
PASS header invalid -> row validation di-skip (rowResults kosong)
PASS semua baris valid -> valid=true, rowResults semua valid
PASS real excel via reader: 4 baris data, semua valid
```

Poin yang dibuktikan:
- **Template v2** membaca seluruh aturan (requiredValue, nullable, dataType) — tidak ada aturan hardcoded di engine.
- **Required Value** (`IMP-013`): Judul kosong → error di Row 2 Kolom 1; Penulis whitespace `'   '` → error; Tahun/ISBN optional kosong → tidak error.
- **Type** (`IMP-014`): `'bukan-angka'` di kolom Tahun → `expectedType=number, actualType=string`; `123` di kolom Judul → `expectedType=string, actualType=number`.
- **rowResults**: `rowNumber` = baris Excel asli (2,3,4), `valid` per baris, isu teragregasi (baris 4 = `IMP-013` + `IMP-014`), `validationResult.valid` false bila ada row invalid.
- **Gating**: header invalid → row validation di-skip (`rowResults` kosong) — kolom tidak dapat dimaknai bila header tidak selaras (kolom semantics butuh template/header match, yang belum ada di posisi ini).
- **End-to-end**: file Excel nyata (Tahun = angka) → reader → engine → `valid=true`, 4 baris semua valid.

## 7. Bukti Build

```
> npm run lint   (tsc --noEmit node + web)      → PASS (exit 0)
> npm run build  (electron-vite build)           → PASS
    main 88.19 kB · preload 6.35 kB · renderer 880.52 kB (1913 modules)
```

## 8. Bukti Lint

```
> npx eslint src/types/import.ts src/config/bookImport.template.ts \
    src/services/HeaderNormalizerService.ts src/services/ValidationEngineService.ts \
    src/contexts/BookImportContext.tsx src/hooks/useBookImportWorkflow.ts \
    src/utils/bookImport.ts src/utils/labels.ts src/config/import.config.ts \
    src/pages/BookImportPage.tsx src/pages/BookImportPreviewPage.tsx --max-warnings 0  → PASS (exit 0)
```

## 9. Verifikasi "Tidak Ada Perubahan Database"

- `git diff prisma/schema.prisma` → hanya perubahan **WO13 yang sudah ada** di working tree (47 insertions / 43 deletions); **tidak ada diff baru** dari Sprint 5.
- Tidak ada folder migration baru; tidak ada import Prisma/repository/API di kode import.

## 10. Risiko Sebelum Sprint 6

1. **`npm run lint:eslint` repo-wide tetap tidak hijau** (17 error + 42 warning pre-existing) — di luar scope.
2. **Type check ketat** — `number` menolak string numerik (`'2020'` → IMP-014); `string` menolak angka. Tanpa koersi/alias (MatchingEngine). Nilai numerik sel Excel asli sudah bertipe number → aman.
3. **Kolom opsional yang hadir dengan nama salah di posisinya tetap error** — diperlukan MatchingEngine untuk toleransi urutan/alias (Sprint 6+).
4. **Row validation bergantung pada posisi kolom** (belum ada matching) — itulah kenapa di-skip saat header invalid; MatchingEngine akan memungkinkan pemetaan kolom fleksibel.
5. **Semua row divalidasi penuh di memory** — file sangat besar berisiko; evaluasi streaming/web-worker.
6. **Baris kosong yang ikut terbaca reader tetap divalidasi** (Judul/Penulis kosong → IMP-013); tidak ada "skip baris kosong total" (refinement potensial).
7. **`nullable` dan `requiredValue` bertumpang-tindih** — template v2 konsisten (wajib = non-nullable), tapi kombinasi `requiredValue=false, nullable=false` bermakna "opsional tapi tak boleh kosong" (didukung engine, kontradiktif secara desain).
8. **dataType belum mendukung enum/regex/date/boolean** — sesuai scope minimal.

## Status

Template v2 = SSOT lengkap (key, label, requiredColumn, requiredValue, dataType, nullable — ADR-007), Validation Engine membaca seluruh row (Row 2+) dengan Required Value (`IMP-013`) + Type (`IMP-014`) Validation, `rowResults[]` tersedia, metadata `expectedType`/`actualType` terpasang — dibuktikan 17 smoke test + real Excel end-to-end. Build + lint PASS, **tidak ada perubahan database**. **READY untuk Sprint 6 (Matching Engine).**
