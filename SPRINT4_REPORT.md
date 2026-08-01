# SPRINT4_REPORT.md — Template Specification & Header Validation

Work Order: **Sprint 4 — Template Specification & Header Validation**
Status: **COMPLETE — READY**
Date: 2026-07-31

---

## 1. Ringkasan

Pipeline ADR-005 diperluas dengan **Template Specification (SSOT)** + **Header Validation**. `WorkbookValidationService` di-rename menjadi **`ValidationEngineService`** (sesuai terminologi ADR-005) dan kini mengembalikan **`ValidatedWorkbook`** (data kanonik ADR-006):

```
Excel File → WorkbookReaderService → RawWorkbook → ValidationEngine → ValidatedWorkbook → MatchingEngine → ImportEngine
                                                          │  (structural + header)
                                                          └─ HeaderNormalizerService · BookImportTemplate (SSOT)
```

- **`BookImportTemplate` = Single Source of Truth** — seluruh definisi kolom (label, urutan, required) hanya ada di satu tempat. Tidak ada header hardcoded di file lain.
- **Header Normalizer** — `trim` → `lowercase` → collapse multiple spaces (belum ada alias, sesuai instruksi).
- **Validation Engine** memvalidasi **jumlah**, **urutan**, dan **nama** header terhadap template.
- **`ValidatedWorkbook`** berisi `rawWorkbook`, `normalizedHeaders`, `validationResult`.
- **`ValidationIssue.metadata`** baru: `expectedHeader`, `actualHeader`, `expectedColumn`, `actualColumn`. Engine **tidak pernah menghasilkan string** — hanya kode `IMP-xxx` + `messageKey`; UI memetakan ke label.

## 2. File Baru

| File | Peran |
|------|-------|
| `src/config/bookImport.template.ts` | **SSOT.** `BOOK_IMPORT_TEMPLATE` (`book-import-v1`): kolom Judul (required), Penulis (required), Tahun, Kategori, ISBN — dalam urutan ini. |
| `src/services/HeaderNormalizerService.ts` | Class `HeaderNormalizerService.normalizeHeader(value)` → `trim().toLowerCase().replace(/\s+/g, ' ')` + singleton `headerNormalizerService`. Satu-satunya pemilik logika normalisasi. |
| `src/services/ValidationEngineService.ts` | Pengganti `WorkbookValidationService` (file lama **dihapus**). Class `ValidationEngineService.validate(rawWorkbook): ValidatedWorkbook` + singleton `validationEngineService`. |

## 3. File Diubah

| File | Perubahan |
|------|-----------|
| `src/types/import.ts` | `ImportErrorCode` += `IMP-010` (jumlah header), `IMP-011` (nama header), `IMP-012` (urutan header). Baru: `ValidationMetadata`, `ValidationIssue.metadata: ValidationMetadata` (required, nullable field), `TemplateColumn { label, required }`, `BookImportTemplate { id, name, description, columns }`, `ValidatedWorkbook { rawWorkbook, normalizedHeaders, validationResult }`. |
| `src/services/WorkbookValidationService.ts` | **DIHAPUS** — diganti `ValidationEngineService.ts`. |
| `src/contexts/BookImportContext.tsx` | State `rawWorkbook` + `validationResult` → **satu** `validatedWorkbook: ValidatedWorkbook | null` (ADR-006: data kanonik tunggal; `rawWorkbook` ada di dalamnya). |
| `src/hooks/useBookImportWorkflow.ts` | Panggil `validationEngineService.validate(rawWorkbook)` → `setValidatedWorkbook`. Race guard `parseSeq` tetap. |
| `src/pages/BookImportPreviewPage.tsx` | Baca dari `validatedWorkbook`. Baris **Header ternormalisasi** (join `·`) ditampilkan. `ValidationIssueRow` kini menampilkan **metadata**: `Diharapkan: "X" · Ditemukan: "Y"` (nama header) atau `Diharapkan: 5 · Ditemukan: 4` (jumlah header); lokasi memakai label `Baris N · Kolom M` / `Seluruh workbook`. |
| `src/pages/BookImportPage.tsx` | Pesan "File siap diproses." kini saat `validatedWorkbook` tersedia. |
| `src/utils/bookImport.ts` | `IMPORT_ERROR_MESSAGES` += IMP-010/011/012 (Record ekshaustif — tsc memaksa). `VALIDATION_MESSAGES` += `ERROR_HEADER_COUNT`, `ERROR_HEADER_NAME`, `ERROR_HEADER_ORDER`. |
| `src/utils/labels.ts` | Baru: `ERROR_HEADER_COUNT`, `ERROR_HEADER_NAME`, `ERROR_HEADER_ORDER`, `VALIDATION_ROW`, `VALIDATION_COLUMN`, `VALIDATION_WHOLE_WORKBOOK`, `VALIDATION_EXPECTED`, `VALIDATION_FOUND`, `VALIDATION_NORMALIZED_HEADERS`. |

## 4. Template Specification (SSOT)

```
BOOK_IMPORT_TEMPLATE = {
  id: 'book-import-v1',
  name: 'Template Import Buku v1',
  columns (berurutan):
    1. Judul     — required
    2. Penulis   — required
    3. Tahun     — optional
    4. Kategori  — optional
    5. ISBN      — optional
}
```

- Alasan pemilihan kolom: menyelaras dengan data smoke Sprint 2.1/3 (Judul, Penulis, Tahun, Kategori, ISBN) dan field inti model `Book` (title, authors, publicationYear, category, isbn).
- `required` adalah **data** template — akan dipakai Sprint 5 (business validation), bukan untuk header validation (semua kolom template wajib hadir di header).

## 5. Header Normalizer & Aturan Header Validation

**Normalizer** (belum ada alias): `'  JUDUL '` → `'judul'`, `'Tahun   Terbit'` → `'tahun terbit'`.

Engine membandingkan **header ternormalisasi** vs **label template ternormalisasi** (normalizer yang sama untuk kedua sisi — satu sumber kebenaran).

| Kode | Aturan | Deteksi | metadata |
|------|--------|---------|----------|
| `IMP-010` | Jumlah header ≠ jumlah kolom template | `normalizedHeaders.length !== columns.length` | `expectedColumn` = jumlah template, `actualColumn` = jumlah aktual |
| `IMP-011` | Nama header salah / tidak dikenal / hilang / ekstra | per posisi, nama ≠ label template pada posisi yang sama DAN nama tsb bukan kolom template mana pun | `expectedHeader`, `actualHeader`, `expectedColumn`, `actualColumn` |
| `IMP-012` | Urutan header salah | per posisi, nama ≠ label template pada posisi tsb TAPI nama tsb ada di template (posisi salah) | `expectedHeader`, `actualHeader`, `expectedColumn`, `actualColumn` |

Detail engine:
- Header validation berjalan bila `target.rows[0].length > 0` (ada sel header). Untuk workbook header-only (IMP-009), header tetap divalidasi.
- `IMP-005/006/007` tetap early-return; pada jalur itu `normalizedHeaders = []`.
- Aturan struktural Sprint 3 (IMP-005..009) **tidak dihapus** — `IMP-008` (min columns) dipertahankan (overlap dengan IMP-010 hanya pada kasus degeneratif 0 kolom).

## 6. Arsitektur Akhir

```
BookImportPage / BookImportPreviewPage
        │
        ├── useBookImport() → BookImportContext (state SAJA)
        │        validatedWorkbook: ValidatedWorkbook | null
        └── useBookImportWorkflow()
                │  (validasi file → read → validate → set state, race guard)
                ├── WorkbookReaderService ── read-excel-file/browser
                └── ValidationEngineService ──→ ValidatedWorkbook
                        ├── HeaderNormalizerService (normalizeHeader)
                        ├── BookImportTemplate      (SSOT: kolom/urutan/required)
                        └── IMPORT_CONFIG           (structural: IMP-008, dst.)
```

## 7. Bukti Header Validation (Smoke Test)

Driver `sprint4-smoke.ts` (bundle esbuild, dihapus setelah bukti) + file Excel **NYATA** (Excel COM v16, sheet `Data Buku`, 5×5):

```
template columns: Judul, Penulis, Tahun, Kategori, ISBN
PASS normalizer: trim + lowercase + collapse spaces
PASS structural rules IMP-005..009 masih bekerja
PASS header valid (exact): valid=true normalizedHeaders=judul,penulis,tahun,kategori,isbn
PASS header valid dengan case/spasi tidak rata: normalisasi mencocokkan template
PASS IMP-010 jumlah header (6 vs 5) + IMP-011 kolom ekstra dengan metadata
PASS IMP-010 jumlah header (4 vs 5) + IMP-011 kolom hilang dengan metadata
PASS IMP-011 nama header salah (Judal vs Judul) dengan metadata lengkap
PASS IMP-012 urutan header salah (Penulis di posisi Judul) dengan metadata
PASS IMP-011 header tidak dikenal (Harga)
PASS real excel via reader: sheet="Data Buku" valid=true normalized=judul,penulis,tahun,kategori,isbn
```

Kasus yang dibuktikan:
- **Normalizer** mencocokkan header dengan case/spasi tidak rata terhadap template.
- **Jumlah**: 6 kolom → IMP-010 (expected 5 / actual 6) + kolom ekstra IMP-011 (`actualHeader='Edisi'`); 4 kolom → IMP-010 + kolom hilang IMP-011 (`expectedHeader='ISBN'`).
- **Nama**: `Judal` → IMP-011 dengan `expectedHeader='Judul'`, `actualHeader='Judal'`, `expectedColumn=1`, `actualColumn=1`; header tidak dikenal `Harga` → IMP-011.
- **Urutan**: `Penulis` di posisi 1 → 2× IMP-012 (hanya urutan, tidak ada IMP-011) — membuktikan engine membedakan "nama salah" vs "nama valid di posisi salah".
- **End-to-end**: file Excel nyata → reader → engine → `valid=true`, `normalizedHeaders` cocok template.

## 8. Bukti Build

```
> npm run lint   (tsc --noEmit node + web)      → PASS (exit 0)
> npm run build  (electron-vite build)           → PASS
    main 88.19 kB · preload 6.35 kB · renderer 874.02 kB (1913 modules)
```

## 9. Bukti Lint

```
> npx eslint src/types/import.ts src/config/bookImport.template.ts \
    src/services/HeaderNormalizerService.ts src/services/ValidationEngineService.ts \
    src/contexts/BookImportContext.tsx src/hooks/useBookImportWorkflow.ts \
    src/utils/bookImport.ts src/utils/labels.ts src/config/import.config.ts \
    src/pages/BookImportPage.tsx src/pages/BookImportPreviewPage.tsx --max-warnings 0  → PASS (exit 0)
```

## 10. Verifikasi "Tidak Ada Perubahan Database"

- `git diff prisma/schema.prisma` → hanya perubahan **WO13 yang sudah ada** di working tree (47 insertions / 43 deletions); **tidak ada diff baru** dari Sprint 4.
- Tidak ada folder migration baru; tidak ada import Prisma/repository/API di kode import.

## 11. Risiko Sebelum Sprint 5

1. **`npm run lint:eslint` repo-wide tetap tidak hijau** (17 error + 42 warning pre-existing) — di luar scope.
2. **Belum ada alias** — `'Pengarang'`, `'Judul Buku'`, dll. tidak dikenali sampai MatchingEngine (Sprint 5+).
3. **Template v1 baru 5 kolom** — kolom lain model `Book` (Penerbit, Bahasa, Edisi, Halaman, Deskripsi) belum didukung; penambahan = versi template baru + migration engine.
4. **Ambang `minColumns = 1` (config) dan IMP-008 kini redundan secara semantik** terhadap IMP-010 (jumlah header) — dipertahankan agar aturan struktural Sprint 3 tidak berubah; evaluasi penghapusan saat template final.
5. **Header non-string di baris header di-`String()`-kan** (mis. angka) — kebijakan perbandingan masih permissive.
6. **Semua sheet tetap dibaca penuh ke memory** — evaluasi streaming untuk file besar.
7. **Per-cell red/highlight belum ada** — isu ditampilkan sebagai daftar, bukan disorot di tabel.

## Status

Template Specification jadi SSOT, Header Normalizer (trim/lowercase/collapse) bekerja, Validation Engine memvalidasi jumlah/urutan/nama header terhadap template, `ValidatedWorkbook` tersedia, `ValidationIssue` punya metadata lengkap — semua dibuktikan smoke test (10 kasus + real Excel end-to-end). Build + lint PASS, **tidak ada perubahan database**. **READY untuk Sprint 5 (Matching Engine).**
