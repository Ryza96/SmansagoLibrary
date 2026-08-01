# SPRINT9 — WO-6.1 Implementation Report
**Template Import + Publisher** — menambahkan kolom Penerbit ke Template Excel sehingga pipeline riil
(validation → canonical → matching → auto-create → book import) menghasilkan `publisherId`. Menutup **TD-1**
(blocker fungsional dari WO-6).

## 1. Ringkasan
Template Import dinaikkan ke **`book-import-v3`** dengan kolom **Penerbit** (kunci kanonik `publisher`)
di posisi 3: **Judul, Penulis, Penerbit, Tahun, Kategori, ISBN**. Header Normalizer diperluas agar
mengenali baik `Penerbit` (label resmi) maupun `Publisher` (sinonim, sesuai keputusan PO). Tidak ada
perubahan pada Matching Engine, AutoCreateService, BookImportService, Repository, IPC, preload, maupun
database — seluruh pipeline yang sudah ada kini terhubung ke kolom baru tersebut.

## 2. Perubahan Kode

### File dimodifikasi (2 file, minimal)
| File | Perubahan |
|------|-----------|
| `src/config/bookImport.template.ts` | `id` → `book-import-v3`; kolom `publisher` ditambahkan setelah `authors` (label `Penerbit`, `requiredColumn: true`, `requiredValue: true`, `dataType: 'string'`, `nullable: false`); `description` diperbarui menjadi "Judul, Penulis, Penerbit, Tahun, Kategori, ISBN". |
| `src/services/HeaderNormalizerService.ts` | `HEADER_SYNONYMS = { publisher: 'penerbit' }` — setelah lowercase/trim, `publisher`/`Publisher`/`PUBLISHER` dipetakan ke `penerbit` sehingga cocok dengan label template. |

Tidak ada perubahan: MatchingEngine, AutoCreate, BookImportService, seluruh Repository, IPC, preload,
`env.d.ts`, tsconfig, schema/migrasi DB, UI.

## 3. Detail Teknis

### 3.1 Aliran kolom baru (SSOT template → Book.publisherId)
1. **Template**: `column.key = 'publisher'` → `requiredColumnCount` menjadi **6** (semua kolom `requiredColumn`).
2. **Header Normalizer**: `Penerbit`/`Publisher`/`PENERBIT` → `penerbit` → cocok dengan `templateNormalized[2]`.
3. **Validation**: validasi per posisi (`row[i] ↔ columns[i]`); nilai kosong pada kolom publisher → `IMP-013`
   (karena `requiredValue: true`); header lama 5 kolom → `IMP-010` (expected 6, actual 5).
4. **CanonicalRow**: `values['publisher'] = row[2]` (kunci = `column.key`).
5. **Matching**: strategy `ContainsPublisherStrategy` (field `'publisher'`) kini menerima nilai → FOUND/NOT_FOUND/AMBIGUOUS.
6. **Auto Create**: NOT_FOUND → `publisherRepository.create({ name })` → `resolvedEntity`.
7. **Book Import**: `resolvedId(row, 'publisher')` → `publisherId` di `bookRepository.create(...)`.

### 3.2 Keputusan kolom wajib (`requiredValue: true`)
BookImportService menolak baris tanpa `publisherId` (`bookImport.entityMissing`). Dengan menjadikan nilai
publisher wajib di tahap validation, kesalahan dideteksi lebih awal dengan pesan lebih jelas (`IMP-013`
dengan metadata kolom "Penerbit") daripada muncul sebagai error generik saat import.

### 3.3 Perilaku migrasi template
- Template v3 hanya menerima file **6 kolom** dengan urutan Judul, Penulis, Penerbit, Tahun, Kategori, ISBN.
- File 5 kolom (format v2) kini ditolak `IMP-010` — perilaku disengaja (template baru supersede).

## 4. Verifikasi
| Gate | Hasil |
|------|-------|
| `npm run lint` (node + web `tsc --noEmit`) | PASS |
| `npm run build` (electron-vite build) | PASS (main 112.48 kB) |
| Smoke pipeline penuh (fresh DB, 24 kasus) | PASS 24/24 |

Kasus smoke (skrip sementara `scripts/smoke-wo61.ts`, di-bundle esbuild CJS `--packages=external`, dihapus setelah selesai):
- **Validation**: template 6 kolom → `valid` true; `canonicalRows = 2`; `values.publisher = "Republika"` / `"Bentang Pustaka"`.
- **Pipeline penuh** (match → auto-create → book import): publisher `Republika` + author `Ahmad Fuadi` dibuat
  via Auto Create, `resolvedEntity.id` cocok dengan id DB; Book **Negeri 5 Menara** dibuat dengan
  `publisherId` = id Republika & `authorId` = id Ahmad; Book **Laskar Pelangi** dibuat dengan
  `publisherId` = `publisher1` (existing, FOUND); total Book = 2; `matchingResult.errors` kosong.
- **Header Normalizer sinonim**: header `Publisher` (English) diterima; header `PENERBIT` (uppercase) diterima.
- **Negative**: file 5 kolom (tanpa Penerbit) ditolak — `IMP-010` expected 6 actual 5; baris tanpa nilai
  Penerbit ditolak — `IMP-013` di kolom 3, metadata header `Penerbit`.

DB uji = fresh SQLite temp (`prisma migrate deploy` 3 migrations), dibersihkan; DB dev tidak disentuh.

## 5. Status
**DONE — READY untuk review PO.**
