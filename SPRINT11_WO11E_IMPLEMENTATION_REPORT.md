# SPRINT 11 — WO-11-E: Multi BookCopy Import — `Jumlah Copy = N` (COMPLETE — READY review PO)

## Ringkasan
Template v2 (`Jumlah Copy = N`) kini membuat **1 Book + N BookCopy** dalam satu transaksi atomik per Book. `copyCount` 1..100 divalidasi oleh **Validation Engine** (kode baru `IMP-015`); pipeline hanya punya guard defensif tanpa rule bisnis sendiri. Nomor inventori dialokasikan via **`InventoryAllocator`** (diport dari Stack Legacy `electron/main/services/inventory-allocator.ts`), barcode = inventoryNumber, dan v1 (tanpa `copyCount`) default = 1 copy.

## 1. Files Changed
| File | Perubahan |
|------|-----------|
| `src/main/services/inventory-allocator.ts` | **BARU** — port `InventoryAllocator` (Stack Legacy): `SEQUENCE_ID='default'`, `PREFIX='INV'`, `PAD_LENGTH=6`, `tx.inventorySequence.upsert` increment + rangkaian nomor kontigu; menerima `Prisma.TransactionClient`. |
| `src/main/services/book-import.service.ts` | Refactor: baca `values['copyCount']` (default 1 untuk v1); guard defensif `1..100` integer; hapus pola `count()+1` + `create()` loop; ganti dengan **1 `$transaction` per Book** (`book.createWithTx` → `allocator.allocate` → `bookCopy.createManyWithTx`), retry P2002 (tiap attempt adalah transaksi baru → rollback penuh termasuk sequence). |
| `src/main/repositories/book.repository.ts` | `createWithTx(tx, data)` — varian transaksional `create`. |
| `src/main/repositories/book-copy.repository.ts` | `createManyWithTx(tx, data[])` — `tx.bookCopy.createMany`. |
| `src/services/ValidationEngineService.ts` | Range check generic pada `validateRow`: jika kolom punya `min`/`max` → nilai di luar rentang **atau bukan integer** (saat `min` ada) → `IMP-015` (`ERROR_VALUE_RANGE`). |
| `src/config/bookImport.template.ts` | Kolom `copyCount` ditambah `min: 1, max: 100`. |
| `src/types/import.ts` | `ImportErrorCode` + `'IMP-015'`; `TemplateColumn` + `min?: number`, `max?: number`. |
| `src/utils/labels.ts` | `IMPORT.ERROR_VALUE_RANGE: 'Nilai berada di luar rentang yang diizinkan.'`. |
| `src/utils/bookImport.ts` | `IMPORT_ERROR_MESSAGES['IMP-015']` + `VALIDATION_MESSAGES['ERROR_VALUE_RANGE']`. |
| `wo11e/smoke.ts` | Smoke script (fresh DB, jalur produksi penuh: validation → matching → autoCreate → import). |

TIDAK ada perubahan: schema, migration, preview, UI, barcode format, inventory format, Header Normalizer, IPC/preload/env.d.ts.

## 2. Behavior Changed
- **Sebelum:** setiap row impor membuat **tepat 1** BookCopy; `inventoryNumber` dihitung `count()+1` (rentan race + tidak sinkron dengan tabel sequence); pembuatan Book dan BookCopy **tidak atomik** (copy gagal → Book tetap tersimpan).
- **Sesudah:**
  - v2 `copyCount=N` → 1 Book + **N** BookCopy (`createMany`) dalam **1 transaksi atomik**; kegagalan copy → seluruh Book + copies rollback.
  - v1 / tanpa `copyCount` → default **1** copy.
  - `inventoryNumber` dialokasikan dari `inventorySequence` (`InventoryAllocator`), kontigu & unik; `barcode = inventoryNumber`.
  - Validasi: `copyCount` non-integer atau di luar **1..100** → `IMP-015` (row tidak menjadi canonical).
  - Pipeline guard defensif: nilai langsung `copyCount` di luar 1..100 (panggilan IPC tanpa validasi) → row ditolak (`bookImport.copyCreateFailed`), tidak menulis apa pun.

## 3. Validation
- **Smoke `wo11e/smoke.ts`: 31/31 PASS** (fresh DB, `migrate deploy` 3 migration, jalur produksi penuh).
- **`npm run lint` PASS.**
- **`npm run build` PASS** (main 1,748.71 kB · preload 6.59 kB · renderer 892.44 kB).
- Tidak ada perubahan schema → tidak ada migration baru, tidak ada drift.

## 4. Smoke Test
| Bukti | Hasil |
|-------|-------|
| V1–V5: range validation | `copyCount=5` valid; `150`→IMP-015; `0`→IMP-015; `2.5` (non-integer)→IMP-015; `100` (batas atas) valid |
| V6: v1 tanpa kolom copyCount | valid (regresi) |
| P1: `copyCount=1` | 1 copy, `INV-000001`, barcode=inventoryNumber |
| P2: `copyCount=10` | 10 copy berurutan `INV-000002..000011`, barcode unik = inventoryNumber |
| P3: v1 (tanpa `copyCount`) | 1 copy (default), `INV-000012` |
| P4: guard defensif `copyCount=150` (langsung IPC) | ditolak `bookImport.copyCreateFailed`; Book tidak dibuat; sequence tidak berubah (12) |
| P5: **rollback** | 30 copy seed `INV-000013..000042` menempati rentang → import `copyCount=10` bentrok createMany pada 3 retry → `bookImport.createFailed`; Book ABSEN, total copy tetap 42, sequence rollback ke 12 |
| P6–P7: unik global | seluruh 42 `inventoryNumber` unik; seluruh 42 `barcode` unik |

## 5. Build PASS
`npm run build` PASS — main 1,748.71 kB · preload 6.59 kB · renderer 892.44 kB.

## 6. Lint PASS
`npm run lint` PASS (tsc node + tsc web).

## 7. Rollback
```powershell
git checkout -- src/main/services/book-import.service.ts
Remove-Item -Recurse -Force src/main/services/inventory-allocator.ts wo11e
# file lain (repo, validation, types, config, labels, bookImport) untracked — hapus manual jika perlu
```
Semua file yang diubah WO-11-E adalah untracked (belum ada commit); rollback mengembalikan pipeline ke perilaku `count()+1` + 1 copy.

## 8. Architecture Checklist
| Kriteria | Status |
|----------|--------|
| 1 `$transaction` per Book (bukan per workbook) | PASS |
| Book + seluruh BookCopy ATOMIC (copy gagal → semua rollback) | PASS |
| Gunakan `InventoryAllocator` port, bukan `count()+1` / allocator baru | PASS |
| `createMany`, bukan `create()` dalam loop | PASS |
| barcode = inventoryNumber | PASS |
| Rule `1..100` hanya di Validation Engine; pipeline guard defensif tanpa rule bisnis sendiri | PASS |
| v1 → copyCount default 1 | PASS |
| Retry P2002 tanpa membocorkan sequence (tiap attempt transaksi baru) | PASS |
| Zero schema change / zero migration | PASS |
| Template, preview, UI, barcode/inventory format, Header Normalizer tidak disentuh | PASS |
| Smoke fresh DB 31/31 + Lint + Build PASS | PASS |

## 9. Decision Implemented
Keputusan D1–D8 pada `SPRINT11_WO11E_DESIGN_REVIEW.md` seluruhnya diimplementasikan: kombinasi transaction + createMany + allocator, atomic per Book, reservasi awal via `inventorySequence.upsert increment`, barcode=inventoryNumber, limit 1..100 (Validation Engine), per-Book transaction, zero schema change, v1 default 1. Kode error baru `IMP-015` ditambahkan ke kontrak (`ImportErrorCode` + label + map) sebagai konsekuensi keputusan D6.

**Status: DONE — Architecture Gate BERHENTI**, menunggu review Product Owner (tidak lanjut WO berikutnya).
