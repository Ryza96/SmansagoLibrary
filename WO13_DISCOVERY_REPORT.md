# WO13_DISCOVERY_REPORT.md

Feature: **Informasi Pengadaan (Procurement)**
Mode: READ ONLY — discovery & audit, no implementation.

---

## 1. UI

- **Lokasi placeholder:** `src/components/books/BookForm.tsx:234`
  ```tsx
  <Section title={LABELS.BOOK_SECTION.PROCUREMENT} placeholder>
  ```
- **Label:** `PROCUREMENT: 'Informasi Pengadaan'` di `src/utils/labels.ts:49`.
- **Komponen penampil:** `Section` — didefinisikan **lokal** di dalam `BookForm.tsx` (baris 371–387). Prop `placeholder` hanya memberi efek visual: border putus-putus + badge "Opsional".
- **Isi placeholder:** 4 field **disabled** (tidak dapat diisi): Tanggal Perolehan (`date`), Sumber Perolehan (`text`), Harga Beli (`text` dengan prefiks "Rp"), Catatan (`textarea`). Semua `disabled`, `bg-slate-50`, `cursor-not-allowed`.
- **Catatan:** Teks harfiah "Form Informasi Pengadaan segera aktifkan" **tidak ditemukan** di source code. Indikator aktualnya adalah section ber-border putus-putus dengan seluruh input disabled (grep "segera aktifkan" = 0 match). `BookForm` dirender oleh `BookFormPage.tsx` (rute `/books/new` dan `/books/:id/edit`).

## 2. Database

- **Tabel `procurement`:** TIDAK ADA.
- **Kolom procurement di tabel `book`:** TIDAK ADA.
- **Kolom terkait yang ADA:** `BookCopy.acquisitionDate DateTime?` (satu-satunya kolom perolehan). Kolom ini **belum** dipakai di form procurement — hanya ditampilkan read-only di `InventoryDetailPage.tsx:120` ("Tgl. Perolehan").
- **Tidak ada** kolom harga (`price`), sumber perolehan (`acquisitionSource`), atau vendor.

## 3. Prisma

- **Model `Procurement`:** TIDAK ADA.
- Total 14 model di `prisma/schema.prisma`: AcademicYear, Curriculum, Class, Author, Publisher, Category, Member, Book, BookCopy, AssetEvent, Borrow, BorrowDetail, InventorySequence, Setting.
- Satu-satunya jejak procurement: `BookCopy.acquisitionDate DateTime?` (schema.prisma:150).

## 4. Repository Layer

- **Repository procurement:** TIDAK ADA (`src/main/repositories/` dan `electron/main/repositories/`).
- Terkait parsial: `src/main/repositories/book-copy.repository.ts` mendukung `acquisitionDate` (optional pada tipe create, baris 9).

## 5. Service Layer

- **Service procurement:** TIDAK ADA (`src/main/services/` dan `electron/main/services/`).
- `book-copy.service.ts` ada (pelayanan eksemplar), tetapi tidak ada logika pengadaan.

## 6. IPC

- **Channel procurement:** TIDAK ADA.
- Channel terdaftar: `books:*`, `categories:*`, `authors:*`, `publishers:*`, `bookCopies:*`, `members:*`, `borrowings:*`, `returns:*`, `inventory:*`, `academic-years:*`, `curricula:*`, `classes:*`, `assetEvents:*`, `settings:*`, `printing:*`, `app:*`, `db:ping`.
- Tidak ada `procurements:*` di `electron/ipc/`, `electron/preload/`, maupun `src/renderer/env.d.ts`.

## 7. React

- **Form procurement:** BELUM pernah dibuat — hanya placeholder disabled di `BookForm.tsx:234`.
- Tidak ada state, handler, DTO, maupun hook procurement di renderer.
- `BookCopyDTO` (`src/shared/dto/book.ts:11`) tidak mengekspos `acquisitionDate`; namun `bookCopies.findById` (env.d.ts:57–77) mengembalikan `acquisitionDate` + `notes` untuk halaman Inventaris.

## 8. Dependency

Fitur ini, jika diaktifkan, bergantung pada:
- **Book / BookDetailDTO** — induk data buku (sudah ada).
- **Publisher** — sudah ada (bukan vendor).
- **BookCopy** — target kolom procurement (sudah ada, `acquisitionDate` siap).
- **Vendor/Supplier** — **BELUM ADA** model/tabel. `pemasok` = 0 match di seluruh codebase.
- **Invoice/Dokumen pengadaan** — belum ada entitas.
- Tidak ada dependency ke modul peminjaman, keanggotaan, atau akademik.

## 9. Rekomendasi

### A. Sudah tersedia
1. Label & struktur UI placeholder (`PROCUREMENT` di labels.ts, Section di BookForm.tsx).
2. Kolom `BookCopy.acquisitionDate` + tampilan read-only di InventoryDetailPage.
3. Infrastruktur lengkap untuk menambah fitur (repository base, service pattern, IPC pattern, preload aggregator, env.d.ts).

### B. Belum tersedia
1. Model/tabel `Procurement` (dan relasi dengan Book/BookCopy).
2. Kolom harga (`price`) & sumber perolehan (`acquisitionSource`) pada BookCopy/Procurement.
3. Entitas Vendor/Supplier (jika diperlukan).
4. ProcurementRepository, ProcurementService, IPC `procurements:*`, preload, tipe di env.d.ts.
5. DTO procurement (shared + renderer types).
6. Form procurement yang aktif (saat ini disabled placeholder).

### C. Yang harus dibuat (jika diimplementasikan)
1. **Schema:** model `Procurement` (atau kolom baru di `BookCopy`: `price`, `acquisitionSource`), opsional model `Vendor` — wajib diikuti migration baru.
2. **Backend:** repository, service, registrasi IPC, preload, bootstrap, env.d.ts.
3. **Frontend:** DTO baru, aktivasi field di BookForm (atau komponen form procurement terpisah), validasi, submit handler.
4. **Data:** strategi relasi harga per eksemplar vs per judul buku; alur isi data procurement saat tambah buku vs tambah eksemplar (Inventory).

---

**Kesimpulan:** Fitur "Informasi Pengadaan" sepenuhnya **belum diimplementasikan**. Yang ada hanyalah placeholder UI (disabled) di form buku dan 1 kolom DB (`BookCopy.acquisitionDate`). Tidak ada model, repository, service, IPC, maupun form yang berfungsi.
