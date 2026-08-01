# SPRINT6_REPORT.md — Canonical Mapping Engine (Matching Engine Foundation)

Work Order: **Sprint 6 — Canonical Mapping Engine**
Status: **COMPLETE — READY**
Date: 2026-07-31

---

## 1. Ringkasan

Validation Engine kini menghasilkan **data kanonik** (ADR-006/009) dan **Matching Engine** hadir sebagai lapisan baru (ADR-005) yang akan menampung seluruh logika lookup/match di sprint-sprint berikutnya:

```
Excel File → WorkbookReaderService → RawWorkbook → ValidationEngine → ValidatedWorkbook → MatchingEngine → MatchedWorkbook
                                                                      │  canonicalRows[] (hanya baris VALID)
                                                                      │  matching passthrough (Sprint 6)
```

- **`CanonicalRow { rowNumber, values }`** — nilai baris dipetakan ke `key` dari template (`Record<string, ImportCellValue>`); **tidak ada nama kolom hardcoded di engine** (ADR-006/007).
- **`ValidatedWorkbook.canonicalRows[]`** — diisi hanya untuk baris **valid** (bebas issue); baris invalid dan workbook dengan header invalid → TIDAK masuk.
- **`MatchingEngineService`** — input `ValidatedWorkbook`, output `MatchedWorkbook`. Sprint ini **passthrough**: setiap `CanonicalRow` menjadi `MatchedRow` tanpa issue; `MatchingResult.valid = true`, `errors/warnings` kosong. **Tidak ada** lookup, matching, duplicate detection, maupun akses database.
- **`BOOK_IMPORT_TEMPLATE`** diubah ke `as const satisfies BookImportTemplate` → kolom `readonly`, tipe literal dipertahankan, dan **`BookImportColumnKey`** diturunkan langsung dari SSOT (`(typeof BOOK_IMPORT_TEMPLATE.columns)[number]['key']`).
- Engine tetap **tidak menghasilkan string** — `MatchingIssue` hanya berisi `rowNumber` + `messageKey`.

## 2. File Baru

| File | Deskripsi |
|------|-----------|
| `src/services/MatchingEngineService.ts` | `match(validatedWorkbook): MatchedWorkbook` — passthrough; singleton `matchingEngineService`. |

(Buatan smoke test `sprint6-smoke.ts` + debug sementara dihapus setelah bukti.)

## 3. File Diubah

| File | Perubahan |
|------|-----------|
| `src/types/import.ts` | Baru: `CanonicalRow { rowNumber, values: Record<string, ImportCellValue> }`, `MatchingIssue { rowNumber, messageKey }`, `MatchingResult { valid, errors[], warnings[] }`, `MatchedRow { rowNumber, canonicalRow, issues[] }`, `MatchedWorkbook { canonicalRows[], matchedRows[], matchingResult }`. `ValidatedWorkbook` += `canonicalRows: CanonicalRow[]`. |
| `src/config/bookImport.template.ts` | `as const satisfies BookImportTemplate` (kolom readonly, tipe literal); export `BookImportColumnKey` (union `key` dari SSOT). Semantik kolom v2 TIDAK berubah. |
| `src/services/ValidationEngineService.ts` | Method baru `buildCanonicalRow` (nilai diambil via `column.key` — SSOT); `canonicalRows[]` diisi saat baris valid; semua early-return mengembalikan `canonicalRows: []`. |

## 4. Keputusan Desain

- **Canonical row hanya untuk baris valid.** Baris yang punya issue (`IMP-013`/`IMP-014`) tidak masuk kanonik — data yang salah tidak boleh diproses lebih jauh (ADR-008: validasi harus lengkap sebelum downstream).
- **Header invalid → `canonicalRows` kosong.** Tanpa header yang selaras, kolom tidak dapat dimaknai → tidak ada baris yang dipetakan (konsisten dengan gating row validation Sprint 5).
- **Kunci kanonik = `column.key` dari template.** `buildCanonicalRow` membaca `BOOK_IMPORT_TEMPLATE.columns`; perubahan kolom otomatis mengubah output kanonik tanpa edit engine.
- **Nilai `undefined` dinormalisasi ke `null`** (`row[index] ?? null`) agar sesuai kontrak `ImportCellValue`.
- **Passthrough murni.** `matchingResult.valid` selalu `true` pada passthrough (tidak ada error yang mungkin). Kontrak pipeline: MatchingEngine menerima `ValidatedWorkbook` yang sudah valid.

## 5. Arsitektur Akhir

```
BookImportPage / BookImportPreviewPage
        │
        ├── useBookImport() → BookImportContext (state SAJA)
        │        validatedWorkbook: ValidatedWorkbook | null
        └── useBookImportWorkflow()
                │  (validasi file → read → validate → set state, race guard)
                ├── WorkbookReaderService ── read-excel-file/browser
                └── ValidationEngineService ──→ ValidatedWorkbook { rawWorkbook, normalizedHeaders, rowResults[], canonicalRows[], validationResult }
                        ├── HeaderNormalizerService (normalizeHeader)
                        ├── BookImportTemplate v2 (SSOT — as const; BookImportColumnKey)
                        └── IMPORT_CONFIG

MatchingEngineService ──→ MatchedWorkbook { canonicalRows[], matchedRows[], matchingResult }
        │  passthrough (Sprint 6) — lookup/match database menyusul Sprint 7+
```

## 6. Bukti Canonical + Matching (Smoke Test)

Driver `sprint6-smoke.ts` (bundle esbuild, **dihapus setelah bukti**) + file Excel **NYATA** (Excel COM v16, sheet `Data Buku`, 5×5, Tahun = angka, ISBN = teks):

```
PASS valid workbook: validationResult.valid
PASS valid workbook: 4 canonical rows
PASS canonical rows: keys match template (SSOT, no hardcoded keys)
PASS canonical row 2: rowNumber=2 and values mapped by key
PASS canonical values assignable to Record<BookImportColumnKey, ImportCellValue>
PASS mixed rows: only valid rows become canonical (2 rows, rowNumbers 2 and 4)
PASS type mismatch row excluded from canonical rows (only row 3 remains)
PASS invalid header -> canonical rows empty
PASS matching passthrough: matchedRows.length === canonicalRows.length (4)
PASS matching passthrough: matchingResult.valid true with empty errors/warnings
PASS matching passthrough: each matchedRow keeps rowNumber and same canonicalRow reference
PASS matching passthrough: matchedRow issues empty
PASS matching passthrough on invalid workbook: empty matchedRows, valid result
PASS real excel: 4 data rows valid
PASS real excel: 4 canonical rows
PASS real excel: canonical keys match template
PASS real excel: canonical row 2 values via reader
PASS real excel: matching passthrough yields 4 matched rows
result: 18 passed, 0 failed
```

Poin yang dibuktikan:
- **Hanya baris valid yang kanonik**: file campuran (baris 3 Judul kosong) → `canonicalRows` berisi row 2 & 4 saja; baris Tahun `'bukan-angka'` → dikecualikan.
- **Gating**: header invalid (4 kolom) → `canonicalRows` kosong.
- **Kunci dari SSOT**: `Object.keys(values)` identik dengan `BOOK_IMPORT_TEMPLATE.columns[].key`; `values` assignable ke `Record<BookImportColumnKey, ImportCellValue>` (type check saat compile).
- **Matching passthrough**: `matchedRows` mencerminkan `canonicalRows` (referensi sama, `rowNumber` sama, issue kosong), `matchingResult.valid` true; workbook invalid → `matchedRows` kosong.
- **End-to-end**: file Excel nyata → reader → engine → 4 canonical rows + 4 matched rows.
- **Temuan fixture**: Excel COM menyimpan ISBN sebagai `number` bila ditulis tanpa penanda teks → `IMP-014` (string diharapkan). Itu perilaku engine yang **benar**; fixture disesuaikan (ISBN ditulis sebagai teks) agar mewakili input valid.

## 7. Bukti Build

```
> npm run lint   (tsc --noEmit node + web)      → PASS (exit 0)
> npm run build  (electron-vite build)           → PASS
    main 88.19 kB · preload 6.35 kB · renderer 880.99 kB (1913 modules)
```

## 8. Bukti Lint

```
> npx eslint src/types/import.ts src/config/bookImport.template.ts \
    src/services/ValidationEngineService.ts src/services/MatchingEngineService.ts --max-warnings 0  → PASS (exit 0)
```

## 9. Verifikasi "Tidak Ada Perubahan Database"

- `git diff prisma/schema.prisma` → hanya perubahan **WO13 yang sudah ada** (field procurement + realignment spasi); **tidak ada diff baru** dari Sprint 6.
- Tidak ada folder migration baru; tidak ada import Prisma/repository/API di kode import (`src/` murni renderer).

## 10. Risiko Sebelum Sprint 7 (Matching Engine — ISBN/Author/etc.)

1. **`npm run lint:eslint` repo-wide tetap tidak hijau** (17 error + 42 warning pre-existing) — di luar scope.
2. **Matching masih passthrough** — belum ada lookup database (ISBN), normalisasi, alias, atau fuzzy match. `MatchingIssue` siap dipakai tapi masih kosong.
3. **Type check ketat** — `number` menolak string numerik, `string` menolak angka (Sprint 5 risk tetap). Contoh nyata: **Excel menyimpan ISBN sebagai number** bila sel diformat umum → `IMP-014`. Perlu pertimbangan koersi/normalisasi kolom bertipe string-numerik (ISBN) di Matching Engine.
4. **Nilai kanonik masih mentah** (raw cell) — belum ada trim/parsing/normalisasi nilai (potensi kerja di Sprint 7+).
5. **`canonicalRows` berisi objek nilai baru** (bukan referensi ke baris raw) — konsumsi memori ~proporsional data; file sangat besar berisiko (evaluasi streaming/web-worker tetap relevan).
6. **Baris kosong yang ikut terbaca reader tetap diproses** (Judul/Penulis kosong → IMP-013 → baris tidak kanonik) — tidak ada "skip baris kosong total" (refinement potensial).
7. **dataType belum mendukung enum/regex/date/boolean** — sesuai scope minimal.
8. **MatchingEngineService tidak terpakai di UI** — belum diintegrasikan ke `useBookImportWorkflow`/context; integrasi direncanakan bersama fitur matching yang bermakna (Sprint 7+).

## Status

`CanonicalRow`, `ValidatedWorkbook.canonicalRows` (hanya baris valid, kunci dari SSOT `BookImportColumnKey`), `MatchingEngineService` (passthrough), `MatchedWorkbook`, `MatchingResult`, `MatchedRow` tersedia — dibuktikan 18 smoke test + real Excel end-to-end. Build + lint PASS, **tidak ada perubahan database**. **READY untuk Sprint 7 (Matching Engine).**
