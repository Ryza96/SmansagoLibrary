# SPRINT9 — WO-6 Implementation Report
**Book Import** — membuat entity Book dari hasil Auto Create.

## 1. Ringkasan
`BookImportService` (main process) memproses `MatchedWorkbook` pasca-Auto-Create dan membuat entity **Book**
untuk setiap baris yang memenuhi syarat. Semua persistensi lewat **`BookRepository`** (SSOT) — tanpa query
Prisma langsung. BookCopy dan Barcode **tidak** dibuat. Baris yang gagal dicatat sebagai issue per baris.

## 2. Perubahan Kode

### File baru
| File | Isi |
|------|-----|
| `src/main/services/book-import.service.ts` | `BookImportService.importBooks(workbook)` — iterasi baris, validasi syarat, create Book via `BookRepository`, catat issue. |

### File dimodifikasi
| File | Perubahan |
|------|-----------|
| `electron/ipc/book-import.ipc.ts` | Handler `imports:match` kini: `engine.match(...)` → `autoCreate.apply(...)` → `bookImport.importBooks(...)` → hasil akhir ke renderer. |
| `electron/ipc/index.ts` | `bookImportService: BookImportService` ditambahkan ke signature `registerAllHandlers`. |
| `electron/main/bootstrap.ts` | `bookImportService = new BookImportService(new NewBookRepository())` ditambahkan ke `Container`. |

Tidak ada perubahan tsconfig, preload, `env.d.ts`, tipe `import.ts`, maupun Auto Create / Engine / Strategy.

## 3. Detail Teknis

### 3.1 Syarat pembuatan Book (per baris)
| # | Syarat | Implementasi |
|---|--------|--------------|
| 1 | Tidak ada field `AMBIGUOUS` | `row.matches.some(status === 'AMBIGUOUS')` → issue `bookImport.ambiguous`, skip |
| 2 | Judul wajib ada | `values['title']` non-blank → issue `bookImport.titleMissing`, skip |
| 3 | Seluruh entity tersedia via `resolvedEntity` | `authorId` (field `authors`), `publisherId` (field `publisher`), `categoryId` (field `category`) dari `match.resolvedEntity.id`; salah satu null → issue `bookImport.entityMissing`, skip |
| 4 | ISBN belum ada | `bookRepository.existsByISBN(isbn)` → issue `bookImport.isbnDuplicate`, skip (isbn blank → dianggap belum ada) |
| 5 | Create sukses | `bookRepository.create({ title, isbn, authorId, publisherId, categoryId })`; error P2002 → duplicate, selainnya → `bookImport.createFailed` |

### 3.2 Sumber data
- `title`, `isbn` diambil dari `row.canonicalRow.values` (`title`/`isbn` — key template).
- `authorId/publisherId/categoryId` diambil dari `match.resolvedEntity.id` (hasil FOUND / NOT_FOUND Auto Create).
- `publicationYear` (`year` di template) **tidak** masuk Book di WO-6 — di luar daftar field yang ditetapkan PO; dikatalogkan di TD.

### 3.3 Issue aggregation
Issue per baris dicatat di `matchedRow.issues` **dan** di-agregasi ke `matchingResult.errors` (book gagal = error
tingkat workbook). `matchingResult.valid` tidak disentuh (milik engine, out of scope).

### 3.4 Tidak mengubah komponen lain
Matching Engine, Strategy, Validation, WorkbookReader, AutoCreate, dan tipe output **tidak diubah**.

## 4. Verifikasi
| Gate | Hasil |
|------|-------|
| `npm run lint` (node + web `tsc --noEmit`) | PASS |
| `npm run build` (electron-vite build) | PASS (main 112.48 kB) |
| Smoke Book Import (fresh DB, 15 kasus) | PASS 15/15 |

Kasus smoke (skrip sementara `scripts/smoke-wo6-book-import.ts`, dihapus setelah selesai):
- Baris valid (isbn baru + author/publisher baru + category existing) → Book dibuat, semua FK benar.
- ISBN duplikat → book tidak dibuat, issue `bookImport.isbnDuplicate`.
- Baris AMBIGUOUS → book tidak dibuat, issue `bookImport.ambiguous`.
- Publisher blank (resolvedEntity null) → book tidak dibuat, issue `bookImport.entityMissing`.
- Judul blank → book tidak dibuat, issue `bookImport.titleMissing`.
- DB: 1 Book baru (total 2), 0 BookCopy, author/publisher hasil Auto Create tetap ada, 4 error di `matchingResult.errors`.

DB uji = fresh SQLite temp (`prisma migrate deploy`), dibersihkan; DB dev tidak disentuh.

## 5. Status
**DONE — READY untuk review PO.**
