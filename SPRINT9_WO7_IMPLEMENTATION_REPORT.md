# SPRINT9 — WO-7 Implementation Report
**BookCopy Creation** — membuat 1 BookCopy otomatis untuk setiap Book yang berhasil diimport.

## 1. Ringkasan
`BookImportService` (main process) kini membuat **1 BookCopy** untuk setiap Book yang berhasil dibuat
dari hasil import, **hanya melalui `BookCopyRepository`** (`src/main/repositories/book-copy.repository.ts`).
Jika Book gagal dibuat, BookCopy **tidak** dibuat. Barcode dan Label tidak dibuat (di luar scope).
Renderer hanya menerima hasil akhir via handler `imports:match` yang sudah ada — tidak ada IPC/preload/UI baru.

## 2. Perubahan Kode

### File dimodifikasi (2 file, minimal)
| File | Perubahan |
|------|-----------|
| `src/main/services/book-import.service.ts` | Constructor menerima `bookCopyRepository` (kedua). Setelah `bookRepository.create` sukses → `createBookCopy(book.id)`. Metode privat `createBookCopy` mengalokasikan inventoryNumber (pola `count()+1`, retry P2002) dan memanggil `bookCopyRepository.create`. Gagal membuat copy → issue `bookImport.copyCreateFailed` (di `row.issues` + `matchingResult.errors`). |
| `electron/main/bootstrap.ts` | `new BookImportService(new NewBookRepository(), new NewBookCopyRepository())`. |

Tidak ada perubahan: MatchingEngine, Validation, AutoCreate, seluruh Repository (termasuk BookCopyRepository),
IPC, preload, `env.d.ts`, tsconfig, schema/migrasi DB, UI.

## 3. Detail Teknis

### 3.1 Alur per baris (di `importRow`)
```
validate syarat (ambiguous/title/entity/isbn-duplicate)     ← tidak berubah
  ↓ bookRepository.create({ title, isbn, authorId, publisherId, categoryId })
  ↓ (sukses) createBookCopy(book.id)
  ↓ (copy gagal) → issue bookImport.copyCreateFailed
catch (book gagal) → issue bookImport.isbnDuplicate | bookImport.createFailed
```

### 3.2 Invariant "Book gagal → BookCopy tidak dibuat" (requirement #4)
Terpenuhi **secara struktural**: `createBookCopy` hanya dipanggil di cabang sukses setelah
`bookRepository.create` mengembalikan Book. Bila create melempar (P2002 duplikat ISBN atau error lain),
tidak ada pemanggilan `createBookCopy` sama sekali — tidak ada copy yatim.

### 3.3 Data BookCopy (mengikuti aturan BookCopyRepository)
| Field | Nilai | Alasan |
|-------|-------|--------|
| `bookId` | `book.id` hasil create | terhubung ke Book |
| `inventoryNumber` | `INV-<count()+1, pad 6>` | pola `NumberGeneratorService` (new-stack, `count()+1`); prefix INV = default schema/allocator legacy; retry 3× pada P2002 untuk nomor yang bentrok (gap akibat baris terhapus) |
| `barcode` | `= inventoryNumber` (placeholder) | schema mewajibkan unik non-null; **pembuatan barcode dilarang di WO-7**, placeholder = inventoryNumber unik by construction; format barcode asli (BC-, label) di WO terpisah |
| `shelfLocation` | `''` | kolom required schema, tidak ada input lokasi rak pada impor; integrasi `Setting.defaultShelfLocation` dicatat di TD |
| `status` | default schema `AVAILABLE` | status default domain saat ini |
| `condition` | default schema `GOOD` | aturan BookCopyRepository |

### 3.4 Kegagalan pembuatan copy
Bila `createBookCopy` tetap gagal (bukan P2002 / habis retry): Book sudah tercipta, issue
`bookImport.copyCreateFailed` dicatat. Import non-transaksional (Book + copy bukan satu tx) adalah
warisan TD-4 WO-6 — konsistensi atomik penuh di luar scope WO-7.

### 3.5 Tidak mengubah komponen lain
Seluruh pipeline match → auto-create → book import tetap; hanya BookImportService yang menerima
integrasi BookCopy (izin eksplisit WO-7). BookCopyRepository dipakai apa adanya (SSOT).

## 4. Verifikasi
| Gate | Hasil |
|------|-------|
| `npm run lint` (node + web `tsc --noEmit`) | PASS |
| `npm run build` (electron-vite build) | PASS (main 113.60 kB) |
| Smoke BookCopy Creation (fresh DB, 25 kasus) | PASS 25/25 |

Kasus smoke (skrip sementara `scripts/smoke-wo7.ts`, bundle esbuild CJS `--packages=external`, dihapus setelah selesai):
- 4 baris workbook: 3 valid (2 auto-create, 1 semua-existing) + 1 ISBN duplikat (seeded book).
- 3 Book baru dibuat; **3 BookCopy** dibuat (satu per Book baru): `INV-000001`, `INV-000002`, `INV-000003`,
  barcode = inventoryNumber, `status=AVAILABLE`, `condition=GOOD`, `shelfLocation=''`, `bookId` benar.
- Baris ISBN duplikat: Book **tidak** dibuat **dan** tidak ada BookCopy untuk seeded book (`findByBook` = 0) —
  invariant requirement #4 terbukti.
- `matchingResult.errors` = 1 (`bookImport.isbnDuplicate`); inventoryNumber & barcode unik.

DB uji = fresh SQLite temp (`prisma migrate deploy` 3 migrations), dibersihkan; DB dev tidak disentuh.

## 5. Rollback
- `electron/main/bootstrap.ts`: kembalikan ke `new BookImportService(new NewBookRepository())`.
- `src/main/services/book-import.service.ts`: hapus param `bookCopyRepository`, metode `createBookCopy`,
  konstanta inventory, dan blok pemanggilan copy di `importRow` (kembali ke versi WO-6).
- Karena file import masih uncommitted di working tree, rollback bersifat manual (bukan `git revert`).

## 6. Status
**DONE — READY untuk review PO.**
