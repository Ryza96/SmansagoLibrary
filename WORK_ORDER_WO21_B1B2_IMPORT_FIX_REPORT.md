# WO-21: Import Buku — Fix B1 & B2 (Per-Baris Atomic + Hasil Per-Baris)

## 1. Konteks

Bug ditemukan pada UAT `SPRINT10_WO3_UAT_REPORT.md`:

- **B1 (MODERATE):** Baris gagal pipeline tidak tampil ke user. `imports:match` resolve tanpa throw, error tersembunyi di `matchingResult.errors`, UI hanya menampilkan status sukses.
- **B2 (LOW–MODERATE):** `AutoCreateService.apply()` berjalan untuk seluruh baris sebelum `importBooks()` memvalidasi/menulis per-baris → entitas (Author/Publisher/Category) dibuat walau baris akhirnya gagal (mis. ISBN duplikat) → **orphan**.

Keputusan user: perbaiki keduanya. Scope hanya pipeline import buku.

## 2. Desain Solusi

### B2 — Atomic transaction per baris
- `AutoCreateService.apply()` + cache `created` **dihapus**. API baru `resolveRow(row, tx)` menerima `Prisma.TransactionClient` dan menulis/mencari entity **dalam transaksi baris yang sama** (candidate cocok dipakai; entity baru dibuat; race `P2002` → fallback `findExactWithTx`; status `SKIPPED`/`AMBIGUOUS` → `resolvedEntity = null`).
- `BookImportService.createBookWithCopies()` membungkus **satu `runTransaction` per baris**: `resolveRow` → `book.createWithTx` → `InventoryAllocator.allocate(tx, copyCount)` → `createManyWithTx` (barcode = inventoryNumber; shelfLocation/acquisitionSource/acquisitionDate/acquisitionCost dipertahankan).
- Baris gagal (guard error) → transaksi rollback → **tidak ada tulisan DB** → tidak ada orphan.

### B1 — Hasil per-baris
- `imports:match` kini mengembalikan **`ImportResultDTO`**:
  ```
  { totalRows, importedBooks, importedCopies, failedRows: { rowNumber, messageKey }[] }
  ```
- Guard baru per baris: AMBIGUOUS, judul kosong (`titleMissing`), ISBN sudah ada (`isbnDuplicate`, pre-check via `existsByISBN`), `copyCount` non-integer/<1/>100 (`copyCreateFailed`), entity tidak dapat di-resolve (`entityMissing`), error lain (`createFailed`).
- Retry `P2002` inventory sequence 3× (race di dalam satu transaksi); kegagalan non-P2002 atau di luar retry → error baris.

## 3. Perubahan File

| File | Perubahan |
|------|-----------|
| `src/types/import.ts` | `+ImportResultDTO`, `+ImportFailedRow` |
| `src/main/services/auto-create.service.ts` | `apply`/`created` dihapus; `resolveRow(row, tx)` baru; ctor tetap (3 repos) |
| `src/main/services/book-import.service.ts` | `importBooks(): Promise<ImportResultDTO>`; per-baristransaction; guard baru; retry P2002 |
| `src/main/repositories/{author,publisher,category}.repository.ts` | `+createWithTx`, `+findExactWithTx` |
| `electron/ipc/book-import.ipc.ts` | handler 2 arg (matchingEngine, bookImportService); import AutoCreateService dihapus |
| `electron/ipc/index.ts` | wiring 2 arg |
| `electron/main/bootstrap.ts` | `new BookImportService(..., autoCreateService)` |
| `src/renderer/env.d.ts` | `imports.match` → `Promise<ImportResultDTO>` |
| `src/pages/BookImportPreviewPage.tsx` | render hasil dari `ImportResultDTO` (importedBooks/importedCopies/failedRows) |
| `src/utils/bookImport.ts` | `computeImportResultSummary` dihapus |

## 4. Validation

| Gate | Hasil |
|------|-------|
| Smoke `wo21_import_b1b2_smoke/smoke.ts` | **48/48 PASS** (fresh DB) |
| `npm run lint` | PASS |
| `npm run build` | PASS (main 1,818.41 kB · preload 9.02 kB · renderer 1,044.59 kB) |
| `prisma migrate diff` | "No difference detected" |

### Isi smoke (48 langkah)
- S1: copyCount 2 dihormati, barcode===inventoryNumber, entitas dibuat.
- S5b: 2 baris ISBN duplikat + entity baru → baris 1 sukses, baris 2 `isbnDuplicate`; **tidak ada orphan** entity baris gagal.
- S5: ISBN sudah ada di DB → `isbnDuplicate`, tanpa tulisan.
- S7: publisher kosong → `entityMissing`, tanpa tulisan.
- S6: judul kosong → `titleMissing`, tanpa tulisan.
- S10: multi-row reuse + buat entity baru (author/publisher/category=3).
- Default copyCount = 1.
- Invariant B1: `sum(importedBooks) == count(DB books)`, `sum(importedCopies) == count(DB copies)`, semua `failedRows` punya `rowNumber` (bukan `null`).

## 5. Keterbatasan (tech debt)
- Pesan per-baris di UI masih `messageKey` (mapping label di renderer); DTO tidak membawa pesan terformat.
- `uat_*` historis (obsolete) masih memakai API lama — di luar regression suite.

## Status: DONE — menunggu review PO.
