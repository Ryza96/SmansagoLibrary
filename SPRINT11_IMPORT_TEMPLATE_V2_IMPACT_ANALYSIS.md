# SPRINT 11 — Import Template v2.0: Impact Analysis

> Status: **READ ONLY** — analisis dampak, belum implementasi.
> Tanggal: 2026-08-01
> Referensi: `SPRINT3_TEMPLATE_SPEC.md`, `SPRINT3_WO1_TEMPLATE_IMPLEMENTATION_REPORT.md`, `SPRINT10_WO3_UAT_REPORT.md`, `SPRINT9_WO8_DECISION_LOG.md`, `SPRINT10_WO2_INVESTIGATION.md`, `WO13_REVISION1_REPORT.md`.

---

## 1. Latar Belakang & Tujuan

Product Owner meminta **Template Import Buku v2.0** dengan 17 kolom (6 wajib + 11 opsional) untuk memperkaya data awal buku yang diimpor. Template v1.0 (6 kolom) telah disetujui dan dipakai pada Sprint 3.

Dokumen ini menganalisis dampak perubahan terhadap 12 komponen pipeline import dan memetakan setiap kolom v2.0 ke field database yang ada / yang perlu ditambahkan, plus mengusulkan work order implementasi yang **kecil, independen, dan dapat di-review/rollback sendiri-sendiri**.

---

## 2. Template v2.0 yang Diminta (17 Kolom)

| # | Kolom | Wajib/Opsional | Target Field | Status Schema |
|---|-------|----------------|--------------|---------------|
| 1 | Judul | WAJIB | `Book.title` | ✅ Ada |
| 2 | Penulis | WAJIB | `Book.author` (AutoCreate) | ✅ Ada |
| 3 | Penerbit | WAJIB | `Book.publisher` (AutoCreate) | ✅ Ada |
| 4 | Tahun Terbit | WAJIB | `Book.publicationYear` | ⚠️ Ada tapi **TIDAK dipersist** saat import |
| 5 | Kategori | WAJIB | `Book.category` (AutoCreate) | ✅ Ada |
| 6 | Jumlah Copy | WAJIB | `BookCopy` (jumlah row eksemplar) | ⚠️ Import saat ini hanya buat **1 copy** |
| 7 | ISBN | Opsional | `Book.isbn` (unique) | ✅ Ada |
| 8 | Bahasa | Opsional | `Book.language` | ❌ **TIDAK ada di schema** |
| 9 | Edisi | Opsional | `Book.edition` | ❌ **TIDAK ada di schema** |
| 10 | Jumlah Halaman | Opsional | `Book.pageCount` | ❌ **TIDAK ada di schema** |
| 11 | Deskripsi | Opsional | `Book.description` | ⚠️ Ada tapi **TIDAK dipersist** saat import |
| 12 | Lokasi Rak | Opsional | `BookCopy.shelfLocation` | ✅ Ada (default `''`) |
| 13 | Kondisi Awal | Opsional | `BookCopy.condition` | ✅ Ada (enum GOOD/LIGHT_DAMAGE/HEAVY_DAMAGE) |
| 14 | Sumber Perolehan | Opsional | `BookCopy.acquisitionSource` | ✅ Ada (enum PEMBELIAN/DONASI/HIBAH/BANTUAN_PEMERINTAH/LAINNYA) |
| 15 | Tanggal Perolehan | Opsional | `BookCopy.acquisitionDate` | ✅ Ada |
| 16 | Harga Perolehan | Opsional | `BookCopy.acquisitionCost` | ✅ Ada (Int, ≥ 0) |
| 17 | Kode Buku | Opsional | **? — OPEN DECISION** | ❌ Tidak ada field |

**Data otomatis (tidak diketik user):** Book ID (uuid), BookCopy ID (uuid), Barcode (= `inventoryNumber`, keputusan WO-8), Nomor Inventaris (`INV-######`), Status Copy (`AVAILABLE`), Created At, Updated At.

---

## 3. Ringkasan Fakta Pipeline Saat Ini (Hasil Audit)

| Komponen | File | Fakta Kunci |
|----------|------|-------------|
| Template Config | `src/config/bookImport.template.ts` | v3: 6 kolom; semua `requiredColumn: true`; Judul/Penulis/Penerbit `requiredValue: true`; `year` label **"Tahun"** dataType `number` |
| WorkbookReader | `src/main/services/workbook-reader.service.ts` | `read-excel-file` → `Sheet[]` (`{sheet, data}`); **tidak peduli jumlah kolom** → tidak berubah |
| HeaderNormalizer | `src/services/HeaderNormalizerService.ts` | Hanya sinonim `publisher → penerbit`; trim/lowercase/collapse |
| ValidationEngine | `src/services/ValidationEngineService.ts` | Header **strict posisional**: jumlah ≠ `requiredColumnCount` → IMP-010; nama berbeda → IMP-011; urutan salah → IMP-012; sel kosong → dilewati jika `requiredValue=false && nullable=true`; tipe sel → IMP-014 (`number` hanya jika `typeof value === 'number'`); **tidak ada cek rentang** (≥1, ≥0) |
| MatchingEngine | `src/main/services/matching-engine.service.ts` | Strategi: isbn (exact), authors, publisher, category (contains) → **tidak berubah** |
| AutoCreate | `src/main/services/auto-create.service.ts` | `CREATABLE_FIELDS = {authors, publisher, category}`; kategori code uppercase+underscore → **tidak berubah** |
| Import Service | `src/main/services/book-import.service.ts` | `importRow`: guard AMBIGUOUS/title/entity/ISBN-dup; `bookRepository.create({ title, isbn, authorId, publisherId, categoryId })` → **`publicationYear` & `description` DIBUANG**; lalu `createBookCopy` 1 eksemplar |
| Inventory Number | `src/main/services/book-import.service.ts:87-107` | `count()` + loop retry `P2002` (`INV-`, pad 6, retry 3); `InventorySequence` TIDAK dipakai di jalur import |
| InventorySequence | `electron/main/services/inventory-allocator.ts:12` | Upsert atomik `tx.inventorySequence` + increment; dipakai `BookCopyService` (legacy `electron/`), **butuh `Prisma.TransactionClient`**; tidak dipakai jalur import |
| Repository Book | `src/main/repositories/book.repository.ts` | `CreateBookData = Pick<Book,'title'> & { isbn?, authorId?, publisherId?, categoryId?, publicationYear?, description? }` → **sudah mendukung year & description**, belum edition/language/pageCount |
| Repository Copy | `src/main/repositories/book-copy.repository.ts` | `CreateBookCopyData` + condition/status/acquisition*/notes; `bookId/inventoryNumber/barcode/shelfLocation` wajib |
| Schema Book | `prisma/schema.prisma:121-140` | `id, isbn, title, authorId, publisherId, categoryId, publicationYear, description, createdAt, updatedAt` → **tidak ada edition/language/pageCount/coverImage** |
| Schema BookCopy | `prisma/schema.prisma:142-165` | `condition`(default GOOD), `status`(default AVAILABLE), `shelfLocation`, `acquisitionDate/Source/Cost/SourceDetail/Notes`, `notes` |
| DTO | `src/shared/dto/book.ts` | `BookDetailDTO` **sudah** punya `edition/language/pageCount/coverImage` (aspirational) |
| Service Buku (legacy) | `electron/main/services/book.service.ts:32-34` | `getBookById` me-return `edition/language/pageCount: null` (tidak persist) |
| Form Buku | `src/components/books/BookForm.tsx` | Form sudah punya input Edisi/Bahasa/Jumlah Halaman → **dibuang** saat simpan |
| Preview UI | `src/pages/BookImportPreviewPage.tsx` | Render kolom per `canonicalRow.values[key]` → harus diperluas untuk 17 kolom |
| Import Commit | `electron/ipc/book-import.ipc.ts` | `match` → `autoCreate.apply` → `importBooks`; **tidak pernah throw** untuk kegagalan baris (B1, WO-3 UAT) |

---

## 4. Analisis per Komponen (12)

### 4.1 Database — `Book` & `BookCopy`
- **Berubah (dibutuhkan):** migration untuk `Book.edition`, `Book.language`, `Book.pageCount` (opsional, nullable). BookCopy **tidak perlu** perubahan schema (semua kolom opsional v2 sudah ada).
- **Tidak berubah:** relasi, indeks, `BookCopy`, `InventorySequence`.
- **Mengapa:** kolom Bahasa/Edisi/Jumlah Halaman tidak punya tempat persist. Tanpa ini kolom opsional tsb wajib dibuang dari template.
- **Risiko:** SQLite migration — ikuti pola WO13 (folder migration baru harus **sort AFTER** `20260731_wo13_revision1_source_detail` lexicographically, verifikasi fresh-DB deploy).
- **Dependency:** legacy `BookService`/`BookRepository` (electron) + `src/main` repository harus ikut memilih/menulis field baru.
- **Kompleksitas:** M.

### 4.2 Workbook Reader
- **Tidak berubah.** `read-excel-file` mengembalikan semua kolom apa adanya; jumlah kolom 17 tidak masalah.
- **Kompleksitas:** tanpa kerja.

### 4.3 Header Normalizer
- **Berubah (kecil):** tambah sinonim untuk varian yang realistis, mis. `tahun → tahun terbit`, `jumlah → jumlah copy`, `penerbit → penerbit` (sudah ada).
- **Mengapa:** label template v2 memakai "Tahun Terbit" sedangkan config v3 memakai "Tahun"; user yang memakai header "Tahun" di file v2 akan kena IMP-011 tanpa sinonim ini.
- **Risiko:** rendah. Sinonim hanya dipakai header, bukan nilai.
- **Kompleksitas:** S.

### 4.4 Validation Engine
- **Berubah (kritis):**
  1. **Semua 17 kolom harus `requiredColumn: true`** (header wajib ada di file), `requiredValue` hanya Judul/Penulis/Penerbit. **Alasan:** `IMP-010` membandingkan `normalizedHeaders.length !== requiredColumnCount` — jika hanya 6 kolom ditandai required, file v2 17 kolom akan GAGAL IMP-010. Kolom opsional tetap harus hadir sebagai header (selnya boleh kosong).
  2. `validateRow` sudah melewati sel kosong untuk kolom `requiredValue=false && nullable=true` → **tidak perlu diubah** untuk dukungan opsional.
  3. **Perlu cek rentang baru:** `Jumlah Copy` integer ≥ 1, `Harga Perolehan` ≥ 0, `Tahun Terbit` rentang wajar (mis. 1000–tahun sekarang), `Jumlah Halaman` ≥ 0. Saat ini engine hanya cek tipe. Tambah sebagai issue baru (bukan mengubah kode IMP lama) atau guard di import service.
  4. `matchesDataType('number')` hanya menerima `typeof value === 'number'` → sel Excel bertipe teks ("2") kena IMP-014. Dokumentasikan sebagai perilaku.
- **Risiko:** IMP-010/011/012 bersifat **strict posisional** → urutan kolom file wajib persis urutan config. Template generator harus menulis kolom dalam urutan yang sama.
- **Kompleksitas:** M.

### 4.5 Matching Engine
- **Tidak berubah.** Matching hanya untuk authors/publisher/category; kolom baru tidak ikut matching.
- **Kompleksitas:** tanpa kerja.

### 4.6 Preview UI
- **Berubah:** `BookImportPreviewPage` + `labels.ts` harus merender 17 kolom (header + nilai) sesuai urutan config. Kolom opsional kosong harus ditampilkan sebagai kosong (atau disembunyikan per baris — putuskan: konsisten dengan daftar kolom).
- **Risiko:** UI sempit di layar kecil; pertimbangkan horizontal scroll / kolom yang bisa di-shrink.
- **Kompleksitas:** M.

### 4.7 Book Import Service
- **Berubah (besar):**
  1. **Persist `publicationYear` & `description`** dari `canonicalRow.values` → `bookRepository.create(...)` (repo sudah mendukung, tinggal di-pass). Ini juga **memperbaiki data loss diam-diam** pada v1 (WO-3 mencatat year tidak tersimpan).
  2. **Multi-copy:** jika `Jumlah Copy` (default 1) = N, buat N eksemplar. Semua copy berbagi `condition` (Kondisi Awal), `shelfLocation`, dan field `acquisition*`.
  3. **Alokasi N nomor inventaris:** pola `count()+retry` saat ini hanya 1. Untuk N copy, dua opsi:
     - (a) Pertahankan `count()` + loop retry N kali — sederhana, cukup untuk desktop single-user.
     - (b) Port pola `InventorySequence` upsert (dari `electron/main/services/inventory-allocator.ts`) ke `src/main` dengan batch create transaksional — lebih aman untuk N besar.
     - **Rekomendasi:** (a) untuk v2.0 awal; (b) dicatat sebagai technical debt WO terpisah.
  4. **Guard nilai copy:** jika `Jumlah Copy` invalid (0, negatif, non-integer, > batas mis. 100) → issue baris, jangan import.
  5. **Kode Buku** → keputusan terbuka (lihat §6), default EXCLUDE.
- **Kompleksitas:** L.

### 4.8 Repository
- **Berubah (kecil–M):**
  - `src/main/repositories/book.repository.ts`: `CreateBookData` + `edition?, language?, pageCount?` (jika schema diubah).
  - `src/main/repositories/book-copy.repository.ts`: **tanpa perubahan** (semua field sudah ada).
  - `electron/main/repositories/book.repository.ts` + `electron/main/services/book.service.ts`: ikut persist `edition/language/pageCount` di create/update agar konsisten dengan form (BookForm sudah punya input tsb).
- **Kompleksitas:** M.

### 4.9 Import Commit
- **Tidak berubah untuk v2.0.** `imports:match` tetap resolve tanpa throw; kegagalan baris tersimpan di `matchingResult.errors` (B1, WO-3). Perbaikan summary per-baris adalah WO terpisah (WO-3 B1/B2 follow-up), di luar scope template v2.
- **Kompleksitas:** tanpa kerja (untuk v2).

### 4.10 Template Generator (file XLSX v2.0)
- **Berubah:** file `templates/Template_Import_Buku_v2.0.xlsx` — 17 kolom urutan §2, sheet `Import Buku`, freeze row 1, tipe sel: `Tahun Terbit`=Number, `Jumlah Copy`=Number, `Jumlah Halaman`=Number, `Harga Perolehan`=Number, `Tanggal Perolehan`=Date, lainnya Text; baris petunjuk/legenda.
- **Backward compat:** file v1.0 (6 kolom) **sengaja tidak lagi valid** (IMP-010). Ini keputusan PO — v2 = kontrak baru, bukan upgrade in-place.
- **Kompleksitas:** S–M (dipakai pola Sprint 3 WO-1: generate + verifikasi via `read-excel-file` + screenshot).

### 4.11 Barcode / Inventory
- **Barcode:** keputusan WO-8 tetap berlaku → barcode = `inventoryNumber`; **tidak diganggu** oleh v2.
- **Inventory:** untuk multi-copy perlu N nomor unik `INV-######` (lihat 4.7 poin 3).
- **"Kode Buku"** (kolom opsional #17) berpotensi konflik dengan keputusan WO-8 bila dipetakan ke barcode → **butuh keputusan PO** (§6).
- **Kompleksitas:** S (jika opsi (a)); M (jika port InventorySequence).

### 4.12 Testing
- **Berubah:** tambah skenario:
  - Unit validation: file v2 17 kolom valid; kolom opsional kosong; IMP-014 tipe number; cek rentang Jumlah Copy/Harga/Tahun.
  - DB smoke (fresh DB): 1 baris dengan `Jumlah Copy=3` → 1 Book + 3 BookCopy `INV-…001/2/3` barcode===inventoryNumber, `publicationYear` & `description` tersimpan, `condition/shelfLocation/acquisition*` ter-persist ke semua copy, status `AVAILABLE`.
  - Regression: lint + build (pola WO13/WO-3).
- **Kompleksitas:** M.

---

## 5. Gap Matrix Ringkas

| Kolom v2.0 | Field | Persist saat ini? | Kerja Dibutuhkan |
|------------|-------|-------------------|------------------|
| Judul / Penulis / Penerbit / Kategori | Book.* | ✅ | — |
| Tahun Terbit | `publicationYear` | ❌ dibuang | WO-11-A |
| Jumlah Copy | `BookCopy[]` count | ❌ hanya 1 copy | WO-11-F |
| ISBN | `isbn` | ✅ | — |
| Bahasa / Edisi / Jumlah Halaman | Book.* | ❌ tidak ada field | WO-11-E (schema) + WO-11-A |
| Deskripsi | `description` | ❌ dibuang | WO-11-A |
| Lokasi Rak | `shelfLocation` | ❌ (hardcode `''`) | WO-11-F |
| Kondisi Awal | `condition` | ❌ (default GOOD) | WO-11-F + validasi |
| Sumber Perolehan / Tgl / Harga | `acquisition*` | ❌ | WO-11-F + validasi enum/int |
| Kode Buku | ? | — | OPEN DECISION |

---

## 6. Keputusan Terbuka (Open Decisions)

1. **"Kode Buku" (#17):** tidak ada field `bookCode`. Opsi:
   - (a) **EXCLUDE dari v2.0** (rekomendasi — tidak ada tempat persist; memetakan ke barcode melanggar WO-8: barcode = inventoryNumber).
   - (b) Tambah field baru `BookCopy.bookCode` + migration (perlu WO schema tersendiri).
   - (c) Petakan ke `barcode` eksemplar pertama (melanggar keputusan WO-8, tidak disarankan).
2. **Jumlah Copy opsional vs wajib di engine:** PO menandai wajib di template; disarankan **default 1 saat kosong** agar file v1-style tidak rusak dan behavior defensif. (Keputusan: wajib dengan default-1 saat kosong.)
3. **Header "Tahun" vs "Tahun Terbit":** v2 memakai "Tahun Terbit"; normalizer perlu sinonim `tahun → tahun terbit` agar file lama dengan "Tahun" tetap lolos IMP-011 (jika itu diinginkan).

---

## 7. Usulan Work Order (Independen, Bisa Review/Rollback Sendiri)

| WO | Deskripsi | Dependensi | Kompleksitas |
|----|-----------|-----------|--------------|
| **WO-11-A** | Persist `publicationYear` + `description` di `book-import.service` (repo sudah siap). Perbaiki data loss v1. | — | S |
| **WO-11-B** | Config template v2.0: 17 kolom, semua `requiredColumn:true`, `requiredValue` hanya 3; + file `Template_Import_Buku_v2.0.xlsx` + screenshot. | — | M |
| **WO-11-C** | HeaderNormalizer: sinonim `tahun→tahun terbit`, dsb. | — | S |
| **WO-11-D** | ValidationEngine: cek rentang baru (Jumlah Copy ≥1 int, Harga ≥0, Tahun wajar, Halaman ≥0). | WO-11-B | S–M |
| **WO-11-E** | Schema migration `Book.edition/language/pageCount` + repo (src & electron) + legacy `BookService` persist; ikuti pola WO13 (urut folder, fresh deploy, diff=no-difference). | — (paralel) | M |
| **WO-11-F** | `book-import.service` multi-copy: Jumlah Copy → N eksemplar; persist shelfLocation/condition/acquisition* ke semua copy; alokasi N `INV-`. | WO-11-B, WO-11-D | L |
| **WO-11-G** | Preview UI + `labels.ts`: render 17 kolom. | WO-11-B | M |
| **WO-11-H** | Testing: unit v2 + DB smoke multi-copy + regression lint/build. | WO-11-A…G | M |

**Urutan yang disarankan:** A → B/C → D → E (paralel, perlu PO) → F → G → H.

**Di luar scope (dicatat saja):** summary kegagalan per-baris (WO-3 B1/B2), port `InventorySequence` ke `src/main`, header synonyms lebih luas.

---

## 8. Risiko Utama

1. **Backward compat rusak secara sengaja:** file v1.0 tidak valid lagi (IMP-010). Perlu komunikasi ke user/PO bahwa file template harus diunduh ulang v2.0.
2. **Strict posisional:** salah urutan kolom di file → IMP-012. Template generator wajib sinkron dengan config.
3. **Migration SQLite:** nama folder migration harus sort setelah `20260731_wo13_revision1_source_detail`; wajib verifikasi fresh-DB deploy (pola WO13).
4. **Keputusan "Kode Buku"** — jika dipaksakan ke barcode akan melanggar WO-8 dan bisa merusak label/lookup eksisting.
5. **Multi-copy concurrency:** `count()+retry` cukup untuk desktop single-user; catat technical debt untuk batch besar.

---

## 9. Kesimpulan

Template v2.0 layak diimplementasikan dengan **1 perubahan schema kecil (Book.edition/language/pageCount)** dan **perluasan import service untuk multi-copy + persistensi field yang selama ini dibuang (publicationYear, description, shelfLocation, condition, acquisition*)**. Sebagian besar komponen pipeline (reader, matching, auto-create, commit, barcode) **tidak berubah**. Satu kolom — **Kode Buku** — tidak memiliki tempat persist dan berpotensi konflik dengan keputusan barcode WO-8; **disarankan dikecualikan dari v2.0** sampai ada keputusan PO.

Estimasi total: 8 WO kecil (2 S, 4 M, 2 L) yang dapat direview/di-rollback sendiri-sendiri. **Belum ada kode yang diubah.**
