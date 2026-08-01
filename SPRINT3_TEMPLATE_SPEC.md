# SPRINT3_TEMPLATE_SPEC.md — Spesifikasi Template Excel Import Buku (Kontrak Permanen)

Status: **DRAFT — READ ONLY (audit & desain, belum implementasi)**
Tanggal: 2026-08-01
Peran: Software Architect · UX Architect · QA Reviewer (dibuat untuk review Product Owner)

---

## 1. Tujuan

Mendefinisikan **kontrak permanen** template Excel antara pengguna dan sistem Import Buku.
Template ini menjadi satu-satunya acuan resmi untuk:

- struktur file `.xlsx` yang diterima sistem,
- nama, urutan, dan tipe kolom,
- aturan wajib / boleh-kosong,
- perilaku validasi → matching → auto-create → penyimpanan.

Dokumen ini **tidak mengubah kode**. Seluruh isi adalah hasil audit terhadap pipeline yang
berjalan saat ini (`bookImport.template.ts` v3) + rekomendasi kontrak final.

---

## 2. Final Column Specification

### 2.1 Kontrak yang Berlaku Hari Ini (Template v3)

Sumber: `src/config/bookImport.template.ts` (`BOOK_IMPORT_TEMPLATE`, id `book-import-v3`).

| # | Header Final | Key (canonical) | Wajib Header | Wajib Nilai | Boleh Kosong | Tipe Data | Field DB Tujuan |
|---|--------------|-----------------|--------------|-------------|--------------|-----------|-----------------|
| 1 | **Judul** | `title` | Ya | **Ya** | Tidak | Teks (`string`) | `Book.title` |
| 2 | **Penulis** | `authors` | Ya | **Ya** | Tidak | Teks (`string`) | `Author.name` (relasi) |
| 3 | **Penerbit** | `publisher` | Ya | **Ya** | Tidak | Teks (`string`) | `Publisher.name` (relasi) |
| 4 | **Tahun** | `year` | Ya | Tidak | **Ya** | Angka (`number`) | *(tidak dipersist — lihat 2.3)* |
| 5 | **Kategori** | `category` | Ya | Tidak | **Ya** | Teks (`string`) | `Category.name`/`code` (relasi) |
| 6 | **ISBN** | `isbn` | Ya | Tidak | **Ya** | Teks (`string`) | `Book.isbn` (unique) |

Ringkasan:
- **6 kolom, urutan ketat** persis seperti tabel di atas. Header pada **baris 1**.
- Semua 6 kolom **wajib ada sebagai header** (`requiredColumn: true`). Tidak ada kolom opsional.
- Nilai wajib diisi hanya 3 kolom: **Judul, Penulis, Penerbit**.
- Tahun, Kategori, ISBN **boleh kosong**.

### 2.2 Satu Baris = Satu Buku = Satu Eksemplar

- Setiap baris data yang lolos menghasilkan **tepat 1 `Book`** dan **tepat 1 `BookCopy`**
  (nomor inventaris `INV-000001`, `INV-000002`, … ; `barcode === inventoryNumber`).
- **Tidak ada kolom "Jumlah Copy"** pada kontrak v3 → jumlah eksemplar selalu 1 per baris.
  Lihat §6.2 untuk roadmap penambahan.

### 2.3 Temuan Audit (Penting)

| Temuan | Detail |
|--------|--------|
| **Tahun tidak dipersist** | `BookImportService.importRow` membuat book hanya dengan `{ title, isbn, authorId, publisherId, categoryId }`. Nilai kolom `year` divalidasi (wajib angka) tetapi **tidak pernah disimpan** ke `Book.publicationYear`. |
| **Header "Tahun", bukan "Tahun Terbit"** | Normalizer tidak punya sinonim `tahun terbit` → `tahun`. Jika pengguna menulis "Tahun Terbit", validasi gagal (IMP-011/IMP-012). |
| **Jumlah Copy = 1 tetap** | `createBookCopy` selalu memanggil `bookCopyRepository.create` tepat satu kali. |

---

## 3. Validation Rule

### 3.1 Aturan Tingkat Workbook (Keseluruhan File)

| Kode | Aturan | Deteksi | Lokasi |
|------|--------|---------|--------|
| `IMP-004` | Gagal baca file | `read-excel-file` throw | file |
| `IMP-005` | Worksheet tidak ditemukan | `sheets.length === 0` | workbook |
| `IMP-006` | Workbook kosong (0 baris di semua sheet) | total baris `=== 0` | workbook |
| `IMP-007` | Worksheet target (`sheets[0]`) tanpa data | `target.rows.length === 0` | workbook |
| `IMP-008` | Jumlah kolom < minimum | `getColumnCount(rows) < minColumns (1)` | kolom |
| `IMP-009` | Hanya header, tanpa data | `rows.length === 1` | baris 2 |
| `IMP-010` | Jumlah header ≠ jumlah kolom wajib (6) | `normalizedHeaders.length !== 6` | baris 1 |
| `IMP-011` | Nama header tidak sesuai template | header selain 6 nama baku | baris 1, kolom |
| `IMP-012` | Header benar tetapi **urutan salah** | posisi header ≠ posisi template | baris 1, kolom |

Detail penting:
- **Hanya sheet pertama yang diproses.** Sheet lain diabaikan.
- **Header wajib ada** (tanpa header → `IMP-010`).
- **Kolom ekstra = gagal** (`IMP-010`/`IMP-011`). Kontrak v3 menolak file dengan 7 kolom.
- Normalisasi header: `trim() → lowercase → collapse spasi`, ditambah sinonim **hanya satu**:
  `publisher → penerbit` (`HeaderNormalizerService.ts:1-3`). Jadi `Publisher`/`PUBLISHER` diterima.

### 3.2 Aturan Tingkat Nilai (Per Kolom)

Validasi per baris berjalan **hanya jika struktur workbook valid** (header ok, ada data).

| Kolom | Wajib diisi | Tipe | Aturan |
|-------|-------------|------|--------|
| Judul | Ya | string | Kosong → `IMP-013` (`ERROR_REQUIRED_VALUE`). Angka/dates → `IMP-014`. |
| Penulis | Ya | string | Kosong → `IMP-013`. Angka/dates → `IMP-014`. |
| Penerbit | Ya | string | Kosong → `IMP-013`. Angka/dates → `IMP-014`. |
| Tahun | Tidak | number | Harus sel angka (`typeof number`, finite). Teks "2005" → `IMP-014`. |
| Kategori | Tidak | string | Boleh kosong. Angka/dates → `IMP-014`. |
| ISBN | Tidak | string | Boleh kosong. **Angka → `IMP-014`** (harus format teks). |

### 3.3 Jebakan Format Excel (Wajib Dicatat di Template)

| Jebakan | Dampak | Solusi |
|---------|--------|--------|
| ISBN ditulis sebagai angka | `IMP-014` (type mismatch) | Format sel ISBN = **Teks** (atau awali `'`) |
| Judul numerik (mis. buku "1984") | `IMP-014` | Format sel Judul = **Teks** |
| Tahun ditulis sebagai teks | `IMP-014` | Sel Tahun harus **Angka** (General/Number) |
| Judul/kolom teks berformat "Date" | `IMP-014` | Pastikan format sel Teks |

---

## 4. Example Data

### 4.1 Contoh File Valid (Header Baris 1)

| Judul | Penulis | Penerbit | Tahun | Kategori | ISBN |
|-------|---------|----------|-------|----------|------|
| Laskar Pelangi | Andrea Hirata | Bentang Pustaka | 2005 | Fiksi | 9789793062792 |
| Bumi Manusia | Pramoedya Ananta Toer | Hasta Mitra | 1980 | Sejarah | 9789794038230 |
| Filsafat Ilmu | Jujun S. Suriasumantri | Pustaka Sinar Harapan | 2010 | | |
| | | | | | |

Catatan pada contoh:
- Baris 3: Kategori dan ISBN **dibiarkan kosong** (boleh) — sistem akan auto-create kategori
  jika dibutuhkan dan buku tanpa ISBN tetap dibuat.
- Baris 4 sengaja kosong semua → **gagal validasi `IMP-013`** (Judul/Penulis/Penerbit wajib).

### 4.2 Contoh Nilai yang Perlu Dihindari

| Kolom | Nilai berisiko | Kenapa | Saran |
|-------|----------------|--------|-------|
| ISBN | `9789793062792` (sel angka) | `IMP-014` | Format Teks |
| Penulis | `Andrea Hirata; Tere Liye` | Tidak ada pemisah multi-penulis → `NOT_FOUND` → auto-create 1 entitas "Andrea Hirata; Tere Liye" | Satu nama per baris |
| Penulis | `Andrea` | Matching `contains` bisa `AMBIGUOUS` → baris dilewati | Gunakan nama lengkap persis |
| Penerbit | `Gramedia` | `contains` → bisa ambigu bila ada >1 kandidat | Gunakan nama lengkap |
| ISBN | `978-979-3062-79-2` | Pencocokan ISBN = **exact string** terhadap nilai DB | Pastikan identik dengan nilai di DB |
| Judul | `1984` (sel angka) | `IMP-014` | Format Teks |

---

## 5. Compatibility Analysis

Analisis dampak desain template final terhadap setiap komponen pipeline. Verdict: **KOMPATIBEL**
(hari ini berjalan) atau **PERLU PERUBAHAN** (bagian rekomendasi §6).

### 5.1 WorkbookReaderService — KOMPATIBEL
- `read-excel-file/browser` membaca file `.xlsx`. Kontrak v3 = `.xlsx` murni ✓.
- Batas: hanya ekstensi `.xlsx`; ukuran max 5 MB (`IMPORT_CONFIG`).
- Membaca **semua sheet** tetapi validasi hanya memakai `sheets[0]` → template harus
  meletakkan data di **sheet pertama**.
- Tipe sel dipertahankan apa adanya (angka tetap angka) → aturan format §3.3 berlaku.

### 5.2 HeaderNormalizerService — KOMPATIBEL (terbatas)
- Normalisasi `trim/lowercase/collapse` membuat header tak peka huruf besar/kecil dan spasi ganda.
- **Sinonim hanya `publisher → penerbit`.** Varian lain (mis. "Tahun Terbit", "Kategori Buku",
  "Nama Penulis") **tidak dikenal** → gagal `IMP-011`.
- Kontrak v3 memakai nama header persis: `Judul, Penulis, Penerbit, Tahun, Kategori, ISBN`.
- **Rekomendasi v4:** perbanyak sinonim (lihat §6.2).

### 5.3 ValidationEngineService — KOMPATIBEL
- Semua 6 kolom `requiredColumn: true` dan urutan diperiksa **posisional** (`IMP-010/011/012`).
  Template v3 persis cocok dengan engine ✓.
- Nilai wajib (Judul/Penulis/Penerbit) → `IMP-013`; tipe → `IMP-014`.
- **Batasan desain:** engine tidak mendukung kolom opsional di antara kolom wajib —
  jumlah header harus tepat `requiredColumnCount`. Menambahkan "Jumlah Copy" sebagai
  kolom ke-7 **mengharuskan** ubah logika hitung header (`ValidationEngineService.ts:185-193`).
- Kolom `year` divalidasi angka tetapi tidak dipersist (§2.3) — bukan error, hanya gap.

### 5.4 MatchingEngineService — KOMPATIBEL (dengan ekspektasi benar)
Strategi produksi (`src/main/strategies/index.ts`):

| Kolom | Strategi | Perilaku |
|-------|----------|----------|
| `isbn` | `ExactBookStrategy` → `PrismaBookMatchProvider.findByISBN` | Exact match string. Tidak ketemu → dianggap buku baru (ISBN opsional). |
| `authors` | `ContainsAuthorStrategy` → `findContains` | Substring. 0 → auto-create; 1 → FOUND; **>1 → AMBIGUOUS → baris dilewati**. |
| `publisher` | `ContainsPublisherStrategy` → `findContains` | Sama seperti di atas. |
| `category` | `ContainsCategoryStrategy` → `findContains` | Sama seperti di atas. |
| `title`, `year` | — (tidak ada strategi) | Tidak pernah dimatching. `title` dibaca langsung oleh import service. |

- Template v3 mengekspos `isbn/authors/publisher/category` — semuanya dimatching ✓.
- Risiko utama: nilai pendek/umum → `AMBIGUOUS` → baris dilewati (bukan dihapus, hanya skip).

### 5.5 AutoCreateService — KOMPATIBEL
- Entitas yang **bisa dibuat otomatis**: `authors`, `publisher`, `category` (kumpulan `CREATABLE_FIELDS`).
- `isbn` **tidak** auto-creatable → ISBN baru hanya berarti "buku baru dibuat".
- Kategori yang dibuat otomatis: `name` = nilai sel, `code` = derivasi
  `uppercase + non-alphanumeric → "_"` (fallback `CATEGORY`).
- Pengecekan duplikat via `P2002` + `recoverExisting` (findExact) → aman dari race dalam satu batch.
- **Catatan urutan IPC** (`book-import.ipc.ts:22-26`): `match → autoCreate.apply → importBooks`.
  Auto-create berjalan **sebelum** deteksi ISBN duplikat → untuk baris yang akhirnya gagal
  (ISBN duplikat), entitas baru bisa jadi **yatim** (bug B2 yang sudah tercatat di UAT WO-3).

### 5.6 BookImportService — KOMPATIBEL (dengan keterbatasan)
- Membuat `Book` + **1** `BookCopy` per baris (nomor inventaris `INV-######`, `barcode = inventoryNumber`).
- Deteksi duplikat ISBN: `existsByISBN` sebelum create + catch `P2002` → baris dilewati
  (`bookImport.isbnDuplicate`).
- `publicationYear` **tidak ditulis** (gap §2.3).
- Tidak ada dedup berbasis judul → dua baris judul sama tanpa ISBN = dua buku berbeda.

### 5.7 Kesimpulan Kompatibilitas

| Komponen | Template v3 (6 kolom) | Template v4 (7 kolom + Jumlah Copy) |
|----------|----------------------|--------------------------------------|
| WorkbookReader | KOMPATIBEL | KOMPATIBEL |
| HeaderNormalizer | KOMPATIBEL (sinonim terbatas) | PERLU sinonim `tahun terbit` + lainnya |
| Validation | KOMPATIBEL | PERLU ubah hitung header (opsional kolom) + tipe `quantity` |
| Matching | KOMPATIBEL | KOMPATIBEL (kolom baru tidak dimatching) |
| AutoCreate | KOMPATIBEL | KOMPATIBEL |
| BookImportService | KOMPATIBEL (tahun belum dipersist) | PERLU persist `publicationYear` + loop create copy |

---

## 6. Recommendation

### 6.1 Rekomendasi Utama — Terapkan Template v3 sebagai Kontrak Resmi

**Keputusan arsitektur:** jadikan **6 kolom v3** sebagai kontrak permanen tahap pertama.

```
Final Template Contract (v3):
  [1] Judul   (wajib)   [2] Penulis (wajib)   [3] Penerbit (wajib)
  [4] Tahun   (opsional) [5] Kategori (opsional) [6] ISBN (opsional)
```

Alasan:
1. **100% kompatibel hari ini** — nol perubahan kode; langsung dapat dipakai user.
2. Semua kolom yang diperlukan untuk membuat `Book` + relasi tersedia (title + 3 entity + ISBN).
3. Mengurangi risiko retur dari PO: fitur sudah berfungsi tanpa menunggu refactor.
4. Tata letak, nama header, dan aturan §3 dapat langsung dicetak ke template Excel.

### 6.2 Roadmap Kontrak v4 (Perlu Work Order Terpisah — DITANGGUHKAN)

Rekomendasi masa depan untuk memenuhi kebutuhan PO (kolom "Jumlah Copy" & "Tahun Terbit"):

| Item | Perubahan yang Diperlukan |
|------|---------------------------|
| Kolom opsional **`Jumlah Copy`** (angka, default 1, rentang 1–1000) | `bookImport.template.ts` + **logika hitung header** di `ValidationEngineService` (dukung kolom opsional) + `BookImportService` (loop `createBookCopy` sesuai quantity) + DTO/UI preview |
| Header **`Tahun Terbit`** | Tambah sinonim di `HeaderNormalizerService` (`tahun terbit` → `tahun`) ATAU rename header menjadi `Tahun Terbit` konsisten + persist `publicationYear` di `BookImportService` |
| ISBN/nomor tipe campur | Pertimbangkan konversi string dari angka untuk sel ISBN agar user tak perlu format teks manual (keputusan UX, bukan kontrak) |
| Multi-penulis | Tentukan format pemisah (mis. `;` ) + logika split sebelum matching (jauh lebih kompleks; di luar scope Sprint ini) |

### 6.3 Rekomendasi Penyusunan Template Excel (UX)

- Row 1 = header 6 kolom; row 2+ = data. Tidak ada baris judul/instruksi di atas header.
- Sheet pertama berisi data; sheet lain dihapus/dikosongkan.
- Format sel: kolom teks (Judul/Penulis/Penerbit/Kategori/ISBN) = **Teks**;
  kolom Tahun = **Angka**. Hindari format Date & General untuk ISBN.
- Berikan contoh baris + baris "contoh kosong" di baris terbawah, atau tempat terpisah,
  dengan instruksi menghapusnya sebelum upload.
- Batas ukuran file 5 MB; ekspor dari Excel/WPS/LibreOffice dengan format `.xlsx`.

### 6.4 Verifikasi yang Disarankan (sebelum rilis kontrak)

1. UAT: buat file `.xlsx` persis kontrak v3 → import 95/95 PASS (mengacu hasil Sprint 10 WO-3).
2. Kasus negatif: 7 kolom, urutan tertukar, ISBN sebagai angka, Tahun sebagai teks →
   pastikan pesan `IMP-010/011/012/013/014` tampil di UI preview.
3. Regresi: `npm run lint` + `npm run build` setelah perubahan kontrak (bila v4 dieksekusi).

---

## Lampiran — Asal Data Audit (read-only, untuk traceability)

| Fakta | Sumber |
|-------|--------|
| 6 kolom template v3 + flags | `src/config/bookImport.template.ts` |
| Normalisasi + sinonim `publisher→penerbit` | `src/services/HeaderNormalizerService.ts` |
| Aturan IMP-005..014 & hitung header | `src/services/ValidationEngineService.ts` |
| Strategi produksi (isbn/authors/publisher/category) | `src/main/strategies/index.ts`, `src/services/DummyMatchStrategies.ts` |
| AutoCreate field + kategori code | `src/main/services/auto-create.service.ts` |
| Create Book + 1 BookCopy, tahun tidak dipersist | `src/main/services/book-import.service.ts` |
| Urutan match → autoCreate → importBooks | `electron/ipc/book-import.ipc.ts` |
| Schema (Book.publicationYear, BookCopy, unique isbn) | `prisma/schema.prisma` |
| Label placeholder "Template akan tersedia di Sprint 3." | `src/utils/labels.ts` (`IMPORT.TEMPLATE_PLACEHOLDER`) |
