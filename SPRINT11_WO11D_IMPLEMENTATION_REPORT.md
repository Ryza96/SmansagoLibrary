# SPRINT 11 — WO-11-D: Persist Existing Schema (Template v2) (COMPLETE — READY review PO)

## Ringkasan
Setelah Template v2 berhasil diparsing (WO-11-C), WO-11-D mempersist seluruh field yang **SUDAH didukung schema** ke database. **TIDAK ada migration baru.** Field yang belum ada di schema (`initialCondition`) hanya dilaporkan, tidak di-workaround.

## 1. Files Changed
| File | Perubahan |
|------|-----------|
| `src/main/services/book-import.service.ts` | `createBookCopy(bookId, values)` — menerima canonical values dari row; mempersist `shelfLocation`, `acquisitionSource`, `acquisitionDate`, `acquisitionCost` pada saat BookCopy dibuat. Helper baru `valueToDate()`. |
| `wo11d/smoke.ts` | Smoke script (fresh DB, jalur produksi penuh). |

TIDAK ada perubahan lain: schema, migration, repository, matching, template, validation, normalizer, IPC, preload, UI, env.d.ts.

## 2. Behavior Changed
- **Sebelum:** BookCopy di-persist hanya dengan `shelfLocation: ''`; field operasional `shelfLocation`, `acquisitionSource`, `acquisitionDate`, `acquisitionCost` dari Template v2 **dibuang**.
- **Sesudah:** seluruh field operasional BookCopy yang didukung schema kini dipersist sesuai nilai canonical:
  - `shelfLocation` → string (kosong jika tidak diisi)
  - `acquisitionSource` → string / null
  - `acquisitionDate` → Date / null
  - `acquisitionCost` → number / null
- Field Book (`title`, `authors`, `publisher`, `category`, `isbn`, `publicationYear`, `description`) sudah dipersist sejak WO-11-A — tidak berubah.

## 3. Validation
- **Smoke `wo11d/smoke.ts`: 20/20 PASS** (fresh DB, `migrate deploy` 3 migration, jalur produksi: matching → autoCreate → import):
  - **B1 (field lengkap):** Book tersimpan `title`, `publicationYear=2005`, `description`, `isbn`; BookCopy tersimpan `shelfLocation='Rak A-1'`, `acquisitionSource='PEMBELIAN'`, `acquisitionDate=2005-07-01`, `acquisitionCost=85000`; regresi `barcode===inventoryNumber` PASS.
  - **B2 (opsional kosong):** `description` kosong → null; `shelfLocation` kosong → `''`; `acquisitionSource`/`acquisitionDate`/`acquisitionCost` kosong → null. Tidak ada error.
  - **B3 (tanpa meta, backward v1-style):** tanpa `year`/`description` → null (default), tidak ada error.
- **`migrate diff --from-migrations` = "empty migration"** (no schema drift; tidak ada migration baru).
- **`npm run lint` PASS.**
- **`npm run build` PASS** (main 1,747.13 kB · preload 6.59 kB · renderer 891.64 kB).

## 4. Schema Verification
| Field (Template v2) | Di schema? | Field schema | Status |
|---------------------|-----------|--------------|--------|
| **Book** | | | |
| title | YA | `Book.title` | PERSIST |
| authors | YA | `Book.authorId` | PERSIST |
| publisher | YA | `Book.publisherId` | PERSIST |
| category | YA | `Book.categoryId` | PERSIST |
| isbn | YA | `Book.isbn` | PERSIST |
| publicationYear | YA | `Book.publicationYear` | PERSIST |
| description | YA | `Book.description` | PERSIST |
| **BookCopy** | | | |
| shelfLocation | YA | `BookCopy.shelfLocation` | PERSIST (baru) |
| acquisitionSource | YA | `BookCopy.acquisitionSource` | PERSIST (baru) |
| acquisitionDate | YA | `BookCopy.acquisitionDate` | PERSIST (baru) |
| acquisitionCost | YA | `BookCopy.acquisitionCost` | PERSIST (baru) |
| **initialCondition** | **TIDAK** | — (schema punya `BookCopy.condition`, default "GOOD") | **DILAPORKAN, TIDAK dipersist** |

**Tidak ada lagi field yang dibaca pipeline, sudah ada di schema, tetapi dibuang.**

## 5. Build PASS
`npm run build` PASS — main 1,747.13 kB · preload 6.59 kB · renderer 891.64 kB.

## 6. Lint PASS
`npm run lint` PASS (tsc node + tsc web).

## 7. Rollback
```powershell
git checkout -- src/main/services/book-import.service.ts
Remove-Item -Recurse -Force wo11d
```
File ini adalah untracked hasil sprint sebelumnya (WO-11-A menciptakannya); rollback mengembalikan ke versi `createBookCopy(bookId)` yang mem-persist hanya `shelfLocation: ''`.

## 8. Architecture Checklist
| Kriteria | Status |
|----------|--------|
| Verifikasi schema sebelum implementasi | PASS |
| Zero migration baru | PASS |
| Book: seluruh field yang ada di schema dipersist | PASS |
| BookCopy: field operasional yang ada dipersist | PASS |
| Field tanpa schema (`initialCondition`) hanya dilaporkan | PASS |
| Tidak ada workaround / kolom baru | PASS |
| Tidak keluar scope (template/normalizer/validation/multi-copy/copyCount/language/edition/pageCount/bookCode/barcode/inventory/preview tidak disentuh) | PASS |
| Minimal file changes (1 file kode + 1 smoke) | PASS |
| Smoke fresh DB + Lint + Build PASS | PASS |

**Status: DONE — Architecture Gate BERHENTI**, menunggu review Product Owner (tidak lanjut WO berikutnya).
