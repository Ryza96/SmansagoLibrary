# SPRINT7_REPORT.md — Domain Matching Engine (Contract First)

Work Order: **Sprint 7 — Domain Matching Engine (Contract First)**
Status: **COMPLETE — READY**
Date: 2026-07-31

---

## 1. File Baru

| File | Deskripsi |
|------|-----------|
| `src/services/MatchProviders.ts` | SPI (Service Provider Interface): `MatchProvider` + `IsbnMatchProvider`, `AuthorMatchProvider`, `PublisherMatchProvider`, `CategoryMatchProvider`. **Tanpa implementasi database.** |
| `src/services/DummyMatchProviders.ts` | Dummy provider in-memory: `DummyIsbnMatchProvider`, `DummyAuthorMatchProvider`, `DummyPublisherMatchProvider`, `DummyCategoryMatchProvider` + registry `dummyMatchProviders`. |

(Buatan smoke test `sprint7-smoke.ts` dihapus setelah bukti.)

## 2. File Diubah

| File | Perubahan |
|------|-----------|
| `src/types/import.ts` | Baru: `MatchStatus = 'FOUND' \| 'NOT_FOUND' \| 'AMBIGUOUS' \| 'SKIPPED'`, `MatchCandidate { id, label }`, `FieldMatch { field, provider, status, candidates[] }`. `MatchedRow` += `matches: FieldMatch[]`. |
| `src/services/MatchingEngineService.ts` | Engine kini **provider-driven**: konstruktor menerima `readonly MatchProvider[]` (default `dummyMatchProviders`); `match()` memanggil `provider.findMatches()` per field. `matchRow()` menetapkan status `SKIPPED` (field absen/nilai kosong), `NOT_FOUND` (0 kandidat), `FOUND` (1 kandidat), `AMBIGUOUS` (>1 kandidat). |

Tidak ada perubahan pada Validation Engine, template, context, hook, maupun halaman.

## 3. Provider Interface (SPI)

```ts
// src/services/MatchProviders.ts
export interface MatchProvider {
  readonly id: string
  readonly field: string
  readonly label: string
  findMatches(value: string): MatchCandidate[]
}

export interface IsbnMatchProvider extends MatchProvider { readonly field: 'isbn' }
export interface AuthorMatchProvider extends MatchProvider { readonly field: 'authors' }
export interface PublisherMatchProvider extends MatchProvider { readonly field: 'publisher' }
export interface CategoryMatchProvider extends MatchProvider { readonly field: 'category' }
```

- **ADR-011 (Matching Depends on Providers):** engine hanya bergantung pada interface ini. Database/Prisma/repository **tidak pernah** disebut; implementasi asli di sprint berikutnya tinggal `implements IsbnMatchProvider` dst. dan di-inject.
- **ADR-010 (Matching Engine Must Be Pure):** `match()` deterministik murni — tidak ada side effect, I/O, atau state mutable; hasil murni fungsi dari `ValidatedWorkbook` + provider.
- `field` dibatasi ke literal key template (`'isbn'`, `'authors'`, `'category'`) sehingga engine dan template tidak mungkin salah pemetaan. `publisher` disediakan sebagai kontrak walau kolom belum ada di template v2 (lihat bukti SKIPPED).

## 4. Dummy Provider (in-memory)

| Provider | id | field | Data (in-memory) |
|----------|----|-------|------------------|
| `DummyIsbnMatchProvider` | `dummy-isbn` | `isbn` | `9789793062792` → 1 kandidat; `9781234567890` → **2 kandidat (AMBIGUOUS)** |
| `DummyAuthorMatchProvider` | `dummy-author` | `authors` | `andrea hirata` → Andrea Hirata; `pramoedya ananta toer` → Pramoedya Ananta Toer |
| `DummyPublisherMatchProvider` | `dummy-publisher` | `publisher` | `gramedia` → Gramedia Pustaka Utama; `bentang pustaka` → Bentang Pustaka |
| `DummyCategoryMatchProvider` | `dummy-category` | `category` | `fiksi` → Fiksi; `sejarah` → Sejarah |

- Normalisasi minimal: `trim().toLowerCase()`.
- Semua data **hardcoded** — dibuktikan via smoke test hanya untuk membuktikan arsitektur (bukti bahwa Implementasi database Sprint 8 tinggal mengganti provider).

## 5. Arsitektur Akhir

```
BookImportPage / BookImportPreviewPage
        │
        └── useBookImportWorkflow()
                ├── WorkbookReaderService ── read-excel-file/browser
                └── ValidationEngineService ──→ ValidatedWorkbook { …, canonicalRows[], … }
                        ├── HeaderNormalizerService
                        ├── BookImportTemplate v2 (SSOT; BookImportColumnKey)
                        └── IMPORT_CONFIG

MatchingEngineService ──→ MatchedWorkbook { canonicalRows[], matchedRows[{ …, matches[] }], matchingResult }
        │  murni (ADR-010), DI provider (ADR-011)
        └── MatchProvider (SPI)
                └── DummyMatchProviders (in-memory, Sprint 7)
                        └── [Sprint 8]: DatabaseMatchProviders (ganti implementasi, kontrak sama)
```

Status per field: `FOUND` (1 kandidat) · `NOT_FOUND` (0) · `AMBIGUOUS` (>1) · `SKIPPED` (field tak ada di template / nilai kosong).

## 6. Bukti Matching (Smoke Test)

Driver `sprint7-smoke.ts` (bundle esbuild, **dihapus setelah bukti**) + file Excel **NYATA** (Excel COM v16, sheet `Data Buku`, 5×5, Tahun = angka, ISBN = teks):

```
PASS validate: 4 canonical rows
PASS match: 4 matched rows
PASS match: every row has 4 field matches (isbn, authors, publisher, category)
PASS row2 authors=Andrea Hirata -> FOUND author-andrea-hirata
PASS row3 authors=Pramoedya Ananta Toer -> FOUND author-pramoedya-ananta-toer
PASS row4 authors=James Clear -> NOT_FOUND
PASS row2 isbn=9789793062792 -> FOUND isbn-9789793062792
PASS row3 isbn=9789799731234 -> NOT_FOUND
PASS row2 category=Fiksi -> FOUND category-fiksi
PASS row5 category=Sejarah -> FOUND category-sejarah
PASS row4 category=Pengembangan -> NOT_FOUND
PASS all rows: publisher -> SKIPPED (field absent from template)
PASS crafted row: isbn=9781234567890 -> AMBIGUOUS with 2 candidates
PASS crafted row: authors="" -> SKIPPED
PASS crafted row: publisher=gramedia -> FOUND publisher-gramedia
PASS crafted row: category=fiksi -> FOUND
PASS null authors -> SKIPPED; unknown category -> NOT_FOUND
PASS purity: repeated match is deterministic (identical JSON)
PASS DI: engine with injected provider matches only injected field
PASS real excel: 4 data rows valid
PASS real excel: 4 matched rows
PASS real excel: row2 Andrea Hirata -> FOUND
PASS real excel: row4 James Clear -> NOT_FOUND
PASS real excel: row2 Fiksi -> FOUND
PASS real excel: all rows publisher -> SKIPPED
result: 25 passed, 0 failed
```

Poin yang dibuktikan:
- **Keempat Match Status aktif**: `FOUND` (Andrea Hirata/Fiksi/Sejarah/ISBN Laskar Pelangi), `NOT_FOUND` (James Clear/Pengembangan/ISBN tak dikenal), `AMBIGUOUS` (ISBN dummy 2 kandidat), `SKIPPED` (publisher tanpa kolom template; `authors` kosong/`null`).
- **`matches` per baris**: 4 `FieldMatch` (isbn, authors, publisher, category) — urutan sesuai registrasi provider.
- **Publisher contract**: `field='publisher'` tidak ada di template v2 → SKIPPED pada data nyata; dibuktikan FOUND saat canonical row membawa key `publisher` (crafted row) → kontrak siap dipakai begitu kolom publisher hadir.
- **Purity (ADR-010)**: `match()` dipanggil dua kali → JSON identik (deterministik).
- **DI (ADR-011)**: `new MatchingEngineService([customProvider])` hanya memproses field provider yang di-inject → engine bergantung interface, bukan implementasi.
- **End-to-end**: file Excel nyata → reader → validation → matching (Andrea Hirata & Fiksi FOUND, James Clear NOT_FOUND).

## 7. Bukti Build

```
> npm run lint   (tsc --noEmit node + web)      → PASS (exit 0)
> npm run build  (electron-vite build)           → PASS
    main 88.19 kB · preload 6.35 kB · renderer 880.99 kB (1913 modules)
```

## 8. Bukti Lint

```
> npx eslint src/types/import.ts src/services/MatchProviders.ts \
    src/services/DummyMatchProviders.ts src/services/MatchingEngineService.ts --max-warnings 0  → PASS (exit 0)
```

Grep `prisma|@prisma|repository|database` pada ketiga file matching → **0 match** (engine murni, tanpa akses DB).

## 9. Verifikasi "Tidak Ada Perubahan Database"

- `git diff prisma/schema.prisma` → hanya perubahan **WO13 yang sudah ada** (field procurement + realignment spasi); **tidak ada diff baru** dari Sprint 7.
- Tidak ada folder migration baru; matching code tidak mengimpor Prisma/repository.
- **Tidak diimplementasikan** (sesuai instruksi): Prisma, Repository, SQLite, Import Engine, Duplicate Detection, Insert/Update Book.

## 10. Risiko Sebelum Sprint 8

1. **`npm run lint:eslint` repo-wide tetap tidak hijau** (17 error + 42 warning pre-existing) — di luar scope.
2. **Dummy provider hanya mencocokkan exact (normalisasi trim+lowercase)** — belum ada strip hyphen ISBN, alias penulis, synonym kategori, atau fuzzy. Kebijakan normalisasi per-field menjadi tugas provider database (Sprint 8).
3. **`publisher` tanpa kolom di template v2** — kontrak sudah ada tapi data tidak pernah masuk canonical row; kolom `publisher` perlu ditambahkan ke template bila alur impor membutuhkan pencocokan penerbit.
4. **`matchingResult.valid` selalu `true`** — tidak ada kebijakan "kapan match dianggap gagal". Sprint berikutnya perlu menetapkan: apakah `AMBIGUOUS`/`NOT_FOUND` menghasilkan `MatchingIssue`/warning, dan kapan block import (ADR-008: validasi lengkap sebelum downstream — apakah mismatch memblokir?).
5. **`isbn` yang disimpan Excel sebagai angka** (cell teks biasa) → di-validation `IMP-014` (string diharapkan) sebelum matching; provider belum menangani koersi. Lihat risk Sprint 6.
6. **`MatchedWorkbook`/`matches` belum ditampilkan di UI** dan belum terhubung ke `useBookImportWorkflow` — integrasi direncanakan saat ada aksi nyata (preview hasil match / konfirmasi import).
7. **FieldMatch memakai `field: string`** (bukan literal) — tetap aman karena `MatchProvider.field` membatasi literal; konsumen boleh mempersempit bila perlu.
8. **Implementasi database Sprint 8 wajib menjaga kontrak `MatchProvider`** dan `MatchCandidate { id, label }` — id string cukup untuk kontrak; bila perlu entitas penuh, `MatchCandidate` dapat diperluas.

## Status

Provider Interface (4 domain) + Dummy Provider in-memory tersedia; Matching Engine murni (ADR-010) bergantung provider (ADR-011); `MatchStatus` (FOUND/NOT_FOUND/AMBIGUOUS/SKIPPED) dan `MatchedRow.matches[]` aktif — dibuktikan 25 smoke test + real Excel end-to-end. Build + lint PASS, **tidak ada perubahan database**. **READY untuk Sprint 8 (Database Matching Providers).**
