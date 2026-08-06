# APLibrary â€” Session Summary

## Completed Work Orders

### WO-001: Project Restructuring
- Restructured to `electron/` + `src/` layout
- IPC split into 9 domain files; `any` removed; `bootstrap.ts` created
- Preload split into 9 domain files; `index.ts` as aggregator

### WO-002: Prisma Schema
- 11 models; rejected initial version (PO objected to removing Author/Publisher/Category)
- Restored all removed models

### WO-003: Repository Infrastructure
- Base repository + 11 domain repositories

### WO-004: Member Service Layer
- Service, NumberGeneratorService, DTO, IPC, preload, bootstrap, env.d.ts
- Business rules: status INACTIVE default, borrow history check before delete, uniqueness

### WO-005: Academic Service Layer
- AcademicYear, Curriculum, Class services; IPC; preload; bootstrap; env.d.ts

### WO-006: Borrow Service Layer (New Stack)
- `borrow.service.ts`, `borrow.repository.ts` (with `createWithItems` transactional), `borrow-detail.repository.ts`
- IPC, preload, bootstrap updates
- MAX_BOOKS=20 hardcoded (Technical Debt)

### WO-006A: Member UI Integration
- MembersPage, MemberForm, MemberEditPage
- Server-side pagination, search, delete with borrow-history check

### WO-006B: Fix Member Create (BLOCKER)
- Root cause: schema/DB column mismatch (`memberNumber`â†’`number`, `birthPlace`â†’`birthplace`)
- Fixed with `@map` + `prisma db push`

### Schema Normalization Audit
- Full drift analysis: 6 orphaned migrations, 5 `db push` tables, `@map` bridges
- Two-migration plan: M7 (baseline record) + M8 (remove `@map`)

### WO-006C: Member Navigation Redesign
- Collapsible Anggota sidebar (Siswa/Guru/Umum), 3 routes, MemberListPage
- Filtering moved from React â†’ backend (Repository/Service/IPC)
- STAFFâ†’GENERAL rename across all layers
- Case bug fixed (STUDENTâ†’student) in route props

### WO-007: Borrowing Module Audit (COMPLETE)
See full report below.

---

## WO-007: Borrowing Module â€” Discovery & Architecture Audit â€” LENGKAP

## 1. RUANG LINGKUP
Audit menyeluruh terhadap Borrowing Module: Prisma schema, Repository, Service, IPC, Preload, UI Pages, Routes, Sidebar, DTO, env.d.ts.

## 2. ARSITEKTUR â€” DUA STACK PARALEL

### STACK A (BARU â€” `src/main/`)
| Layer | File | Model Prisma |
|-------|------|-------------|
| Service | `src/main/services/borrow.service.ts` | `Borrow`, `BorrowDetail` |
| Repository | `src/main/repositories/borrow.repository.ts` | `Borrow` |
| Repository | `src/main/repositories/borrow-detail.repository.ts` | `BorrowDetail` |

### STACK B (LEGACY â€” `electron/main/`)
| Layer | File | Model Prisma |
|-------|------|-------------|
| Service | `electron/main/services/borrowing.service.ts` | `Borrowing`, `BorrowingItem`, `Return` |
| Service | `electron/main/services/return.service.ts` | `Borrowing`, `BorrowingItem`, `Return` |
| Service | `electron/main/services/print.service.ts` | `Borrowing` |
| Repository | `electron/main/repositories/borrowing.repository.ts` | `Borrowing` |
| Repository | `electron/main/repositories/borrowing-item.repository.ts` | `BorrowingItem`, `Borrowing` |
| Repository | `electron/main/repositories/return.repository.ts` | `Return`, `BorrowingItem`, `Borrowing` |

**CRITICAL:** Stack B mereferensi model Prisma (`Borrowing`, `BorrowingItem`, `Return`) yang **TIDAK ADA** di `schema.prisma` saat ini. Hanya `Borrow` dan `BorrowDetail` yang ada.

## 3. PRODUCTION FLOW STATUS

| Feature | Status | Root Cause |
|---------|--------|------------|
| Create Borrow | **WORKING** | Stack A (baru) |
| Barcode Scan (create) | **WORKING** | Akses `BookCopy` yang ADA di schema |
| Member Search (create) | **BROKEN** | Tidak ada IPC handler `members:search` |
| Member Stats (create) | **BROKEN** | Legacy reference ke `borrowingItem`/`borrowing` |
| Borrow Listing | **NO UI** | Handler ada, page tidak ada |
| Borrow Detail | **NO UI** | Handler ada, page tidak ada |
| Return by Barcode | **BROKEN** | Legacy reference ke `borrowingItem`/`borrowing` |
| Return Book | **BROKEN** | Legacy reference ke `borrowingItem`/`borrowing`/`return` |
| Print Borrow Receipt | **BROKEN** | Legacy reference ke `borrowing` |
| Print Return Receipt | **BROKEN** | Legacy reference ke `borrowing` |

## 4. LEGACY AUDIT

### BorrowService (`src/main/services/borrow.service.ts`)
- **Digunakan:** YA â€” Production flow (create, findMany, findById)
- **Duplicate:** Ya â€” BorrowingService (legacy) adalah duplikat dengan schema salah
- **Rekomendasi: PERTAHANKAN**

### BorrowingService (`electron/main/services/borrowing.service.ts`)
- **Digunakan:** SEBAGIAN â€” hanya `findBookCopyByBarcode()` dipakai
- **Dead code:** Method `getAll`, `getById`, `create` tidak dipanggil
- **Duplicate:** Ya â€” BorrowService adalah pengganti
- **Rekomendasi: HAPUS** â€” pindahkan `findBookCopyByBarcode` ke service lain

### BorrowRepository (`src/main/repositories/borrow.repository.ts`)
- **Digunakan:** YA â€” oleh BorrowService (baru)
- **Duplicate:** Ya â€” BorrowingRepository
- **Rekomendasi: PERTAHANKAN**

### BorrowingRepository (`electron/main/repositories/borrowing.repository.ts`)
- **Digunakan:** YA â€” oleh BorrowingService, ReturnService, PrintService
- **Akan RUNTIME ERROR** karena model `Borrowing` tidak ada di schema
- **Rekomendasi: HAPUS**

### BorrowDetailRepository (`src/main/repositories/borrow-detail.repository.ts`)
- **Digunakan:** YA â€” oleh BorrowService (baru)
- **Rekomendasi: PERTAHANKAN**

### BorrowingItemRepository (`electron/main/repositories/borrowing-item.repository.ts`)
- **Digunakan:** YA â€” oleh ReturnService, BorrowingService, langsung dari IPC (`getMemberBorrowingStats`)
- **Akan RUNTIME ERROR** karena model `BorrowingItem`/`Borrowing` tidak ada
- **Rekomendasi: HAPUS** â€” pindahkan method yang diperlukan ke BorrowDetailRepository

### ReturnService (`electron/main/services/return.service.ts`)
- **Digunakan:** YA â€” Return flow (`findByBarcode`, `returnBook`)
- **Akan RUNTIME ERROR**
- **Rekomendasi: HAPUS** â€” buat ReturnService baru di `src/main/services/`

### ReturnRepository (`electron/main/repositories/return.repository.ts`)
- **Digunakan:** YA â€” oleh ReturnService
- **Akan RUNTIME ERROR**
- **Rekomendasi: HAPUS** â€” buat ReturnRepository baru di `src/main/repositories/`

## 5. TEMUAN TAMBAHAN

### 5.1 `members:search` â€” Missing IPC Handler
- `BorrowingsPage.tsx:53` memanggil `window.electronAPI.members.search(query)`
- Tidak ada handler, preload method, atau type definition
- Runtime error saat user mencari anggota di form peminjaman

### 5.2 `PrintService` â€” Dual Dependency
- Bergantung pada `BorrowingRepository` (legacy, broken)
- Perlu diport ke Stack A menggunakan `BorrowRepository`

### 5.3 Legacy `MemberRepository` (`electron/main/repositories/member.repository.ts`)
- Hanya punya `findById`, `update`, `search`
- Digunakan oleh `BorrowingService` (legacy) â€” akan ikut terhapus saat Stack B dibersihkan

## 6. REKOMENDASI WORK ORDER

### Prioritas 1 (BLOCKER)
| WO | Deskripsi |
|----|-----------|
| WO-007A | Buat `members:search` IPC handler, preload, env.d.ts |
| WO-007B | Buat `ReturnService` + `ReturnRepository` baru di `src/main/`, port return flow |
| WO-007C | Port `getMemberBorrowingStats` ke `BorrowDetailRepository` |
| WO-007D | Port `PrintService` ke `BorrowRepository` (baru) |

### Prioritas 2 (Fungsional)
| WO | Deskripsi |
|----|-----------|
| WO-007E | Buat Borrow Listing page |
| WO-007F | Buat Borrow Detail page |
| WO-007G | Pindahkan `findBookCopyByBarcode` ke `BookCopyService`/`BorrowService` |

### Prioritas 3 (Housekeeping)
| WO | Deskripsi |
|----|-----------|
| WO-007H | Hapus Stack B: seluruh legacy borrowing services + repositories |
| WO-007I | Hapus legacy `member.repository.ts` jika sudah tidak digunakan |
| WO-007J | Cleanup `bootstrap.ts` â€” hapus instantiasi legacy borrowing classes |

## 7. KESIMPULAN
**Module tidak production-ready.** 9 production flows: 2 bekerja, 3 broken, 1 partial broken, 2 tanpa UI. Root cause: Stack B mempertahankan referensi ke model Prisma yang sudah dihapus dari schema.

---

## WO-PV-01: ADR-002 Migration Recovery Implementation (COMPLETE)

### Ringkasan
- ADR-002 disetujui (Strategi C+D: squash baseline + governance) menggantikan Strategi A yang sempat diimplementasikan.
- **Pekerjaan 1 â€” Migration Recovery (DONE):**
  - 11 migration lama (termasuk 2 no-op REPAIR + `20260731_pv01_schema_baseline`) di-archive ke `prisma/migrations_archive/` sebagai dokumentasi.
  - Baseline tunggal `prisma/migrations/20260731_adr002_initial/migration.sql` (296 baris) di-generate resmi via `prisma migrate diff --from-empty --to-schema-datamodel --script`.
  - Fresh DB `migrate deploy` PASS; `migrate diff` = "No difference detected" (replay & datasource); `migrate status` = up to date.
  - Dev DB di-reconcile hanya via mekanisme resmi `prisma migrate resolve --applied` â€” TIDAK ada perubahan manual checksum `_prisma_migrations`. Checksum baseline baru match dengan file (hash dihitung Prisma). 11 record lama tetap ada sebagai riwayat (folder sudah tidak aktif).
- **Pekerjaan 2 â€” Member Detail (DONE):** `src/pages/MemberDetailPage.tsx` memakai data real (`api.members.findById`, `api.borrowings.findMany`, `api.borrowings.getMemberBorrowingStats`); `MOCK_MEMBER` 0 match di seluruh `src/`.
- **Validation:** `npm run lint` PASS, `npm run build` PASS.
- **Regression:** seeded smoke test pada fresh baseline DB PASS (findById+classInfo, borrowings search/findById/stats, returns findByBarcode/returnBook, stats turun ke 0). DB uji dibersihkan.
- **Status: READY.**

### Pelajaran (retain)
- Field Prisma ter-map: `memberNumber`/`borrowNumber` (bukan `number`); smoke seed wajib pakai `memberNumber`.
- `prisma/migrations/` di-gitignore; `prisma/migrations_archive/` TIDAK tercakup pola gitignore (jika nanti commit, perlu pola tambahan).
- Squash baseline: arsipkan folder lama â†’ generate `--from-empty` baseline â†’ `migrate resolve --applied` (dev yang sudah ada schema final) â†’ status hijau. Fresh deploy hanya 1 migration.

---

## WO13: Procurement Information Activation (COMPLETE)

### Ringkasan
- Feature "Informasi Pengadaan" diaktifkan: kolom procurement ditambahkan ke `BookCopy` (bukan model `Procurement` terpisah): `acquisitionSource String?`, `acquisitionPrice Int?`, `acquisitionNotes String?` â€” reuse `acquisitionDate` yang sudah ada.
- **Schema & Migration (DONE):** `prisma/migrations/20260731_wo13_procurement_fields/` (3 ALTER). Baseline `20260731_adr002_initial` TIDAK dimodifikasi.
- **Backend (DONE):** `electron/main/services/book-copy.service.ts` `addCopies` validasi harga (integer non-negatif) + persist 4 field via `executeAddCopiesTransaction`; `src/main/repositories/book-copy.repository.ts` `CreateBookCopyData` + 3 field; `src/shared/dto/book.ts` `CreateBookCopiesDTO` + 4 field opsional; `src/renderer/env.d.ts` `bookCopies.findById` + 3 field. TIDAK ada perubahan IPC/preload/bootstrap (channel `bookCopies:addCopies` sudah ada).
- **Frontend (DONE):** dialog "Tambah Eksemplar" di `BookDetail.tsx` kini punya form procurement aktif (Tanggal, Sumber dropdown + "Lainnya", Harga, Catatan); placeholder disabled dihapus dari `BookForm.tsx` (helper `Section` hilang prop `placeholder`); `InventoryDetailPage.tsx` menampilkan Sumber/Harga/Catatan Pengadaan; `labels.ts` + `ACQUISITION_SOURCES`, `FIELD.ACQUISITION_*`.
- **Validation:** `npm run lint` PASS, `npm run build` PASS, fresh DB `migrate deploy` PASS (urutan baselineâ†’WO13 benar), `migrate status` hijau (dev & fresh), `migrate diff` = "No difference detected", smoke test Prisma client (insert+baca 4 field procurement) PASS.
- **Status: READY.** Perubahan WO13 ada di working tree di atas 194 perubahan staged WO-BR-99 (belum commit).

### Pelajaran (retain)
- **Urutan folder migration Prisma = sort lexicographic.** `20260731094204_...` (`'0'`=0x30) mengurut SEBELUM `20260731_adr002_initial` (`'_'`=0x5F) â†’ fresh deploy menerapkan ALTER sebelum baseline â†’ P3018. Fix: nama folder `20260731_wo13_procurement_fields` (urut setelah `adr002`). **SELALU verifikasi fresh-DB deploy setelah menambah migration**, bukan hanya dev DB (dev DB menyembunyikan masalah urutan karena baseline sudah applied).
- Reconcile dev DB setelah rename folder: `prisma migrate resolve --applied <nama-baru>` + `prisma db execute` DELETE record stale dari `_prisma_migrations` (bukan edit checksum).
- Smoke test env: `$env:DATABASE_URL` di-override akan menang atas `.env`; relative SQLite path diselesaikan oleh Prisma â€” pakai absolute `file:C:/...` untuk DB uji. Script import `@prisma/client` harus berada di dalam repo (node resolve dari lokasi script).
- WO13 adalah WO pertama yang menyentuh schema setelah baseline squash â€” alur baku: edit schema â†’ `prisma migrate diff --from-migrations --to-schema-datamodel --script` â†’ tulis folder `prisma/migrations/<ts>_<name>/migration.sql` â†’ `prisma migrate deploy` â†’ `prisma generate` â†’ lint+build+smoke.

---

## WO13-R1: Procurement Revision 1 (COMPLETE)

### Ringkasan
- **Rename:** `acquisitionPrice` â†’ `acquisitionCost` (kolom, DTO, repository, service, env.d.ts). Label UI: **"Harga Perolehan"** (bukan "Harga Beli").
- **`acquisitionSource` = enum ketat:** `PEMBELIAN`, `DONASI`, `HIBAH`, `BANTUAN_PEMERINTAH`, `LAINNYA` â€” free text tidak lagi disimpan; validasi enum ditambahkan di `book-copy.service.ts` (`VALID_ACQUISITION_SOURCES`).
- **Field baru `acquisitionSourceDetail String?`:** textbox "Jelaskan Sumber Perolehan" hanya tampil saat source=`LAINNYA`; disimpan ke field ini.
- **Inventory Detail:** tampilkan "Sumber Perolehan: Lainnya" + blok "Detail" saat `LAINNYA`; blok Detail disembunyikan untuk source lain bila kosong.
- **Migration baru:** `prisma/migrations/20260731_wo13_revision1_source_detail/` â€” ditulis manual `RENAME COLUMN` (mengawetkan data; Prisma diff akan DROP+ADD). Migration lama & baseline TIDAK diedit.
- **Validation:** `prisma generate`, `migrate deploy`, `migrate status`, `migrate diff` = "No difference detected" â€” semua PASS; fresh DB deploy urutan benar (baselineâ†’WO13â†’R1); `npm run lint` PASS; `npm run build` PASS; smoke test (insert LAINNYA+detail, kolom lama ditolak client) PASS.
- **Status: READY.** Laporan: `WO13_REVISION1_REPORT.md`. Belum commit (menunggu instruksi).

### Pelajaran (retain)
- **Rename kolom SQLite** = tulis migration manual `ALTER TABLE ... RENAME COLUMN` (Prisma diff menghasilkan DROP+ADD â†’ data hilang). Verifikasi: akses kolom lama via Prisma client harus error.
- **Nama folder migration baru wajib sort AFTER folder WO13:** `revision1` (`r` > `p`) benar; tetap verifikasi fresh deploy karena ini WO ke-2 yang menyentuh `BookCopy` setelah baseline.
- Istilah UI harga perolehan: **"Harga Perolehan"** â€” `FIELD.PRICE` (labels.ts) adalah key mati lama yang masih berisi "Harga Beli" (tidak dipakai, di luar scope).

---

## WO-8: Barcode & Label (COMPLETE â€” READY review PO)

### Ringkasan
- **Keputusan PO:** (1) nilai barcode di DB = `inventoryNumber` (bukan `BC-XXXX`); (2) simbol **Code128**; (3) gambar barcode **TIDAK disimpan** â€” dirender saat cetak; (4) `Setting.barcodeFormat` dibiarkan (tidak dikonsumsi).
- **File baru:** `src/main/services/barcode.service.ts` (`generateBarcodeSvg` Code128 via `bwip-js/node`), `src/main/services/label.service.ts` (`generateLabelsHtml` A4 2-kolom, `.label` 50%Ã—63mm, escapeHtml, fallback `item.barcode || item.inventoryNumber`), DTO `BookLabelData`/`BookLabelItemData` di `src/shared/dto/print.ts`.
- **Modifikasi:** `electron/main/services/print.service.ts` (`printBookLabels` + `printHtml(html, printOptions?)` opsional non-breaking), `electron/ipc/print.ipc.ts` (`printing:bookLabels`), `electron/preload/print.preload.ts` (`print.bookLabels`), `src/renderer/env.d.ts`, `electron/main/services/book-copy.service.ts` (**Decision #1:** `barcode: invNum`, `generateBarcodes` dihapus, `crypto.randomUUID` tetap), `src/components/books/BookDetail.tsx` (tombol "Cetak Label"), `src/utils/labels.ts` (`COPY.PRINT_LABELS`), `package.json`+`package-lock.json` (`bwip-js@^4.11.2`).
- **TIDAK diubah:** Matching/Validation/AutoCreate/BookImportService/BookCopyRepository; schema+migrasi DB; `Setting.barcodeFormat`; backfill.
- **Validation:** `npm run lint` PASS, `npm run build` PASS (main 1,746.12 kB), smoke unit 16/16 (SVG Code128, HTML label, escaping, fallback), smoke DB `addCopies` asli 16/16 (fresh DB 3 migration: barcode===inventoryNumber tiap row, unik `INV-`, `findByBarcode` bekerja). DB uji dibersihkan.
- **Laporan:** `SPRINT9_WO8_IMPLEMENTATION_REPORT.md`, `SPRINT9_WO8_ARCHITECTURE_CHECKLIST.md`, `SPRINT9_WO8_DECISION_LOG.md`, `SPRINT9_WO8_TECHNICAL_DEBT.md`.
- **Status: DONE â€” Architecture Gate BERHENTI**, menunggu review Product Owner (tidak lanjut WO berikutnya).

### Pelajaran (retain)
- **`bwip-js` wajib import `bwip-js/node`** (bukan `bwip-js`) â€” paket memakai conditional exports (`node`/`browser`/`electron`); dengan `moduleResolution: bundler` import default tidak resolve. Untuk menjalankan smoke JS yang mengimpor `bwip-js/node` di luar bundle, set `NODE_PATH=<repo>\node_modules`.
- **Smoke DB service legacy:** `electron/main/database.ts` memakai singleton `prisma` yang hanya terisi setelah `initDatabase()`; repo/service mengimpor `prisma` via binding modul (live) â€” jangan destructure `const { prisma } = require(...)` saat require (tertangkan `undefined`), akses `db.prisma` setelah `await initDatabase()`.
- **Compile terpisah service legacy utk smoke:** `npx tsc --module commonjs --target es2022 --moduleResolution node --esModuleInterop --skipLibCheck --outDir <temp>` daftar file ts â†’ jalankan hasil `.js` dengan `$env:DATABASE_URL` absolute `file:C:/...` temp DB (fresh `prisma migrate deploy`).
- Nilai barcode kini seragam `= inventoryNumber` di kedua jalur (manual + import); nilai `INV-...` valid sebagai input Code128 â†’ label eksisting render tanpa backfill.
- **DB smoke WAJIB fresh DB per run:** assertion `sequential inventory numbers` mengharapkan `INV-000001...`; bila DB temp masih menyimpan baris dari run sebelumnya, `InventorySequence` berlanjut ke `004+` dan smoke FAIL padahal kode benar. Prosedur: hapus file `.db`/`-wal`/`-shm` â†’ `prisma migrate deploy` â†’ run.

### Revisi (Review PO â€” DB Smoke blocker, DONE)
- Blocker: DB smoke FAIL (`TypeError reading 'book'` + `sequential inventory numbers`). Root cause **bukan kode aplikasi**: (1) smoke destructure `prisma` sebelum `initDatabase()`; (2) DB temp stale dari run sebelumnya.
- Fix: smoke akses `db.prisma` setelah init; fresh DB per run. Kode aplikasi **tidak berubah** (tidak ada fitur/refactor/scope creep).
- Re-run PASS: lint, build (main 1,746.12 kB), HTML Smoke 16/16, DB Smoke 16/16.
- **Status: DONE â€” menunggu review PO.**

---

## Sprint 10 WO-2: Import Commit (COMPLETE â€” READY review PO)

### Ringkasan
- Audit WO-1 menemukan dead-end: `BookImportPreviewPage` tanpa tombol commit; `api.imports.match` 0 panggilan di `src/`. WO-2 menutupnya.
- **Modifikasi (3 file renderer; TIDAK ada perubahan backend):** `src/pages/BookImportPreviewPage.tsx` (state `committing`/`importError`/`importSuccess`; `handleCommit()` â†’ `await window.electronAPI.imports.match(validatedWorkbook.canonicalRows)` â†’ pesan sukses/gagal; action bar "Import Buku" + loading `Hourglass` inline; tombol "Kembali" â†’ "Kembali ke Daftar Buku" setelah sukses), `src/utils/labels.ts` (6 label baru blok `IMPORT`: IMPORT_ACTION, IMPORT_PROCESSING, IMPORT_SUCCESS, IMPORT_ERROR, COMMIT_HINT, BACK_TO_BOOKS). `src/utils/bookImport.ts` TIDAK ditambah (revisi).
- **Revisi (Review PO):** iterasi awal memakai `buildImportSummary()` di renderer untuk menghitung statistik (Book/BookCopy/Author/Publisher/Category) dari messageKey â€” **DITOLAK PO** (business logic import & dependensi string `bookImport.*` tidak boleh di renderer). Dihapus total; UI kini menampilkan **status sukses tanpa statistik** karena backend tidak menyediakan summary resmi.
- **TIDAK diubah:** Validation/Matching/AutoCreate/BookImportService/BookCopyRepository; IPC/preload/env.d.ts (channel `imports:match`); schema+migrasi; dependency; tidak pakai Modal/Stepper/ProgressBar/Toast.
- **Validation:** `npm run lint` PASS, `npm run build` PASS (main 1,746.12 kB; preload 6.59 kB; renderer 887.52 kB); grep sisa `buildImportSummary|ImportSummary|BOOK_FAILURE_MESSAGE_KEYS|SUMMARY_*` di `src/` = 0 match.
- **Laporan:** `SPRINT10_WO2_IMPLEMENTATION_REPORT.md`, `SPRINT10_WO2_ARCHITECTURE_CHECKLIST.md`, `SPRINT10_WO2_DECISION_LOG.md`, `SPRINT10_WO2_TECHNICAL_DEBT.md` (semua revisi).
- **Status: DONE â€” Architecture Gate BERHENTI**, menunggu review Product Owner (tidak lanjut WO berikutnya).

### Pelajaran (retain)
- **Renderer tidak boleh punya business logic import.** Statistik hasil import (Book/BookCopy/Author/Publisher/Category dibuat) hanya boleh datang dari backend sebagai kontrak IPC formal; renderer cukup menunggu resolve/reject promise dan menampilkan status.
- **messageKey (`bookImport.*`, `autoCreate.*`) bukan kontrak sistem** â€” jangan parsing di renderer.
- Jika backend belum menyediakan summary resmi, tampilkan status sukses saja; jangan derivasi sendiri.

---

## WO-2 Investigation: Import Buku tidak muncul di aplikasi PO (DONE â€” READ ONLY)

### Ringkasan
- PO membuka Menu Buku di aplikasi â†’ **tidak ada tombol "Import Buku"**, tidak ada akses pipeline import.
- **Root cause = artifact build basi, BUKAN bug source.** Aplikasi yang PO jalankan adalah `dist/win-unpacked/` (electron-builder, dibuild **31/07 10:24**) dari kode sebelum fitur import ada. Grep `app.asar`: `Import Buku`/`BOOK_IMPORT`/`books/import`/`imports:match` = **0 kemunculan**.
- Commit terakhir `437b50a "release: v1.0 release candidate"` (31/07 16:01) **TIDAK memuat fitur import sama sekali** (`git ls-tree` 0 file import; routes/labels/navigation/BooksPage versi commit tanpa import). Seluruh Sprint 5â€“10 (termasuk WO-2/WO-3/WO-8/WO-13) ada di **working tree yang belum di-commit**.
- Build source terkini `out/` (01/08 12:37) **benar & lengkap**: `index-DiqpmWbM.js` memuat `Import Buku`Ã—6, `BOOK_IMPORT`Ã—11, `books/import`Ã—3; `out/main/index.js` memuat `imports:match`Ã—1.
- **Bukan** feature flag / permission / conditional rendering / route berbeda / layout berbeda (diverifikasi). File implementasi sudah benar.
- **Perbaikan (belum dieksekusi):** rebuild `npm run build` â†’ repackage electron-builder â†’ verifikasi `app.asar` memuat string import â†’ commit seluruh working tree â†’ aturan baku "WO selesai = build+repackage+verifikasi artifact sebelum review PO".
- **Laporan:** `SPRINT10_WO2_INVESTIGATION.md` (Root Cause, Active UI File, Mengapa PO tidak melihat perubahan, Rencana perbaikan).
- **Status: DONE â€” menunggu review PO.**

### Pelajaran (retain)
- **Verifikasi review PO = uji ARTIFACT (`dist/`), bukan source.** `npm run build` menghasilkan `out/` yang benar, tetapi aplikasi yang diinstal PO berasal dari `dist/` (electron-builder) yang harus di-rebuild & di-repackage ulang terpisah.
- **Grep string di `app.asar`** adalah cara cepat memastikan fitur masuk package: `Import Buku`/`BOOK_IMPORT`/`books/import` di bundle renderer, `imports:match` di `out/main/index.js`.
- **Git repo hanya 3 commit**; seluruh kerja Sprint 5+ belum di-commit. Commit `437b50a` = baseline release yang belum punya import. Jangan asumsikan working tree = apa yang dirilis.

---

## Sprint 10 WO-3: Import UAT (COMPLETE â€” READY review PO)

### Ringkasan
- End-to-End User Acceptance Test alur produksi `Buku â†’ Import Buku â†’ Pilih File â†’ Validasi â†’ Preview â†’ Import Buku â†’ Matching â†’ Auto Create â†’ Book â†’ BookCopy (Barcode) â†’ Selesai`. **READ ONLY** â€” tanpa perubahan kode, tanpa commit.
- **Hasil: 95/95 PASS** + static UI review PASS.
  - Reader real: `uat_wo3/reader.check.cjs` 3/3 (file `.xlsx` OOXML dibuat via .NET ZipArchive, dibaca `read-excel-file`; return `Sheet[] {sheet, data}` cocok persis mapping `WorkbookReaderService`).
  - E2E rantai penuh: `uat_wo3/e2e.smoke.ts` 20/20 (xlsx â†’ reader â†’ `validationEngineService.validate` â†’ pipeline produksi `createProductionStrategies` â†’ DB; 2 Book, 2 BookCopy `INV-000001`/`-2` barcode===inventoryNumber, entitas & relasi benar).
  - Validation layer: `uat_wo3/validation.smoke.ts` 22/22 (S1 normal; S2/S3/S4 entity baru; S5 ISBN dup tetap valid â€” cek duplikat ada di pipeline; S6 judul kosong `IMP-013`; S7 publisher kosong `IMP-013`; S8 header "Penerbit"; S9 header "Publisher" â†’ normalized `penerbit`; S10 3 baris).
  - Import pipeline: `uat_wo3/import.smoke.ts` 50/50 pada fresh DB (S1 + S2/S3/S4 + S10 reuse entitas + S5 `isbnDuplicate` baris dilewati + S5b 1 dibuat 1 gagal + S7 `entityMissing` + S6 `titleMissing`; tally books=6 copies=6 authors=4 publishers=3 categories=3).
- **Bug Found (tidak diperbaiki, dicatat di laporan):** B1 (MODERATE) baris gagal pipeline tidak tampil ke user â€” `imports:match` resolve tanpa throw, error tersembunyi di `matchingResult.errors`, UI hanya status sukses (konsekuensi keputusan WO-2); B2 (LOWâ€“MODERATE) `AutoCreateService.apply` berjalan sebelum `importBooks` â†’ entitas yatim untuk baris yang gagal ISBN duplikat dengan entitas baru; B3 (LOW) tidak ada pesan per-baris; B4 (INFO) header synonyms terbatas (`publisher`â†’`penerbit`).
- **Regression:** lint PASS, build PASS (main 1,746.12 kB Â· preload 6.59 kB Â· renderer 887.52 kB), migrate deploy fresh PASS, diff = no difference.
- **Laporan:** `SPRINT10_WO3_UAT_REPORT.md` (format: Test Matrix, Test Result, Bug Found, Regression Check, Recommendation).
- **Status: DONE â€” Architecture Gate BERHENTI**, menunggu review Product Owner (rekomendasi: fitur LULUS jalur utama; B1/B2 diajukan follow-up sebelum rilis).

### Pelajaran (retain)
- **`read-excel-file` v9 return `Sheet[]` (`{sheet, data}`)**, bukan array row langsung â€” mapping di `WorkbookReaderService` (`sheet.sheet`â†’name, `sheet.data`â†’rows) adalah satu-satunya tempat kontrak shape. Uji reader Wajib menebak shape ini (header row = `data[0]`).
- **`imports:match` TIDAK pernah throw untuk kegagalan baris** â€” error dikumpulkan ke `matchedWorkbook.matchingResult.errors` (messageKey `bookImport.*`); renderer tidak bisa tahu baris mana gagal tanpa summary dari backend.
- **AutoCreate berjalan SEBELUM deteksi ISBN duplikat** (`book-import.ipc.ts:24`): entitas untuk baris yang akhirnya gagal tetap dibuat â†’ risiko orphan bila nama entitas baru. Dalam alur UI normal judul/penerbit kosong sudah disaring validasi (IMP-013 â†’ bukan canonical), jadi S6/S7 jarang sampai pipeline; S5 (ISBN dup) tetap bisa membuat orphan.
- **Validasi UI (renderer) vs guard pipeline (main) adalah dua lapis terpisah:** validasi menyaring baris kosong (IMP-013); pipeline punya guard sendiri (`titleMissing`/`entityMissing`/`isbnDuplicate`) yang aktif bila input canonical di-IPC langsung (mis. smoke).
- UAT headless dapat meniru alur produksi penuh tanpa Electron dengan: generate file `.xlsx` nyata (OOXML Zip) â†’ `read-excel-file/node` â†’ objek identik IPC â†’ `createProductionStrategies()` (bukan dummy) â†’ fresh DB `migrate deploy`. **Jalankan lint+build di akhir sebagai regression karena WO-3 read-only.**

---

## WO-1 (F1): Shared Domain Config (COMPLETE â€” READY review PO)

### Ringkasan
- Source of Truth: `MASTER_DATA_AKADEMIK_ARCHITECTURE_RFC.md` (LOCKED) + `MASTER_DATA_AKADEMIK_WBS.md` (LOCKED) + `WO1_DISCOVERY_REPORT.md` (APPROVED). **Tidak ada perubahan schema/migration/DB; tidak ada perubahan perilaku; refactor preservasi nilai.**
- **File baru (2):** `src/shared/config/member-type.ts` (definisi tunggal `MemberType`: `code/label/memberNumberPrefix/borrowRights/hasAcademicRecord`; struktur `as const satisfies` extensible â€” tambah properti domain tanpa refactor besar; **primitive** `getMemberType()` = satu-satunya tempat guard null/invalid â†’ mengembalikan value object utuh; **thin projections** `isMemberTypeCode`/`memberTypeLabel`/`memberNumberPrefix`/`memberBorrowRights` mendelegasi ke primitive; default prefix = STUDENT `S` untuk tipe tak dikenal/undefined), `src/shared/config/education-level.ts` (`EDUCATION_LEVELS` Set + `levelOrder(level)` â†’ X/XI/XII = 1/2/3, invalid â†’ NaN).
- **Config = leaf node** (nol import) â†’ aman dipakai main (`tsconfig.node.json`) + renderer (`tsconfig.web.json`), keduanya include `src/shared/**/*`.
- **Refactor 11 konsumen (preservasi nilai):** `number-generator.service.ts` (hapus `MEMBER_TYPE_PREFIX`+`DEFAULT_PREFIX` â†’ `memberNumberPrefix()`), `member-class-resolver.service.ts` (hapus Set lokal â†’ `EDUCATION_LEVELS` config), `member-import.service.ts` (`'student'` Ã—2 â†’ `MEMBER_TYPES.student.code`), `labels.ts` (derive `MEMBER_TYPES`/`MEMBER_RIGHTS` dari config), `MemberForm.tsx` (hapus `MEMBER_TYPES`/`type MemberType` lokal; `memberBorrowRights()` + `isMemberTypeCode()`; payload pakai `memberTypeCode` ter-narrow), `MembersPage`/`MemberListPage`/`MemberDetailPage` (hapus `MEMBER_TYPE_LABEL` lokal â†’ `memberTypeLabel()`), `RightsSidebar.tsx` (hapus `interface RightsData` â†’ `type MemberBorrowRights`), `routes/index.tsx` (literal â†’ `MEMBER_TYPES.*.code`).
- **DTO:** `src/shared/dto/member.ts` `CreateMemberDTO.memberType`/`UpdateMemberDTO.memberType` â†’ `MemberTypeCode` (input ter-validasi domain); `MemberDTO.memberType` tetap `string | null` (faithful ke kolom string bebas DB).
- **Validation:** `npm run lint` PASS, `npm run build` PASS (main 1,775.48 kB Â· preload 7.68 kB Â· renderer 940.40 kB), smoke config `wo1_config_smoke/config.smoke.ts` **46/46 PASS** (levelOrder, tabel MemberType lengkap, prefix S/G/U + default, rights 2/7 & 5/30 & 10/90, hasAcademicRecord, konsistensi label vs config, `getMemberType` primitive, kesetaraan proyeksiâ‰¡primitive). Grep: literal `'student'/'teacher'/'general'` = 0 di `src/` di luar config; `MEMBER_TYPE_LABEL`/`MEMBER_TYPE_PREFIX`/`MEMBER_RIGHTS[...]` = 0.
- **ESLint (`lint:eslint`) â€” pre-existing:** error `react-hooks/set-state-in-effect` (MembersPage:34, MemberListPage:42) + warnings exhaustive-deps/TAB_IDS di baris yang TIDAK disentuh WO-1 (pola `useEffect(() => fetchMembers())` lama). Gate resmi WO-1 hanya `npm run lint` (tsc) â€” PASS.
- **Laporan:** `WORK_ORDER_1_F1_IMPLEMENTATION_REPORT.md`. Status: **DONE â€” Architecture Gate BERHENTI**, menunggu review Product Owner (tidak lanjut WO berikutnya, AY-1a).

### Pelajaran (retain)
- **Config domain di `src/shared/config/` = leaf node tanpa import** â€” kontrak cross-boundary main/renderer (terbukti pola `src/shared/dto`); `as const satisfies Record<string, MemberTypeDefinition>` memberi literal type penuh + konformansi skema.
- **Jangan mengubah tipe DTO baca (`MemberDTO.memberType`) ke union domain** â€” kolom DB string bebas; union hanya di tipe INPUT (Create/Update) yang sudah tervalidasi, helper menerima `string | null` dan men-narrow.
- **Nama file laporan WO-1 bentrok** dengan `WORK_ORDER_1_IMPLEMENTATION_REPORT.md` lama (sprint Import Anggota) â†’ laporan baru diberi suffix `_F1_`; jangan overwrite laporan WO lama.
- Verifikasi sisa hardcode pakai grep tool (bukan `rg` â€” tidak ada di Windows env ini).

---

## WO-2 (F2a): Schema + Migration Master Data Akademik (COMPLETE â€” APPROVED & RELEASED)

### Ringkasan
- Source of Truth: `MASTER_DATA_AKADEMIK_ARCHITECTURE_RFC.md` (LOCKED) + `MASTER_DATA_AKADEMIK_WBS.md` (LOCKED) + `WO2_DISCOVERY_REPORT.md` (APPROVED). Scope: **Schema + Migration saja** â€” TIDAK ada Repository/Service/IPC/Preload/UI, TIDAK ada backfill, `Member.classId` tidak disentuh.
- **Schema (`prisma/schema.prisma`):** 3 model baru â€” `MemberEnrollment` (SSOT penempatan per tahun ajaran), `PromotionRun` (audit operasi massal/promosi), `PromotionRunItem` (detail per-anggota); 4 back-relation (`AcademicYear.memberEnrollments` + `promotionRunsFrom`/`promotionRunsTo` named `PromotionRunFromYear`/`PromotionRunToYear`, `Class.memberEnrollments`, `Member.memberEnrollments` + `promotionRunItems`). FK semuanya `ON DELETE RESTRICT`.
- **Desain kunci: business rule TIDAK pindah ke DB** â€” `MemberEnrollment.status` (ACTIVE/PROMOTED/REPEATED/REDISTRIBUTED/TRANSFERRED/DROPPED/GRADUATED), `PromotionRun.mode` (AUTOMATIC/MAPPING/BULK_EDIT) & `status` (SUCCESS/PARTIAL/FAILED), `PromotionRunItem.outcome` = `TEXT NOT NULL` **tanpa DEFAULT** (Service yang menentukan). Kombinasi `(memberId, academicYearId, classId)` **tidak unique** â€” mendukung REDISTRIBUTED (2 baris setahun); "1 kelas aktif" adalah rule Service.
- **Migration:** `prisma/migrations/20260803_wo2_f2a_master_data_akademik/` â€” murni additive (3 CREATE TABLE + 11 CREATE INDEX, tanpa ALTER). Sort order benar setelah `20260731_wo13_revision1_source_detail`. Baseline & WO13 tidak dimodifikasi. 11 index punya business purpose terdokumentasi (`WORK_ORDER_2_F2A_IMPLEMENTATION_REPORT.md` Â§3).
- **Validation:** `prisma validate` PASS, dev deploy + status PASS (4 migrations), fresh DB deploy PASS (urutan baselineâ†’WO13â†’R1â†’F2a), `migrate diff` = "No difference detected", `prisma generate` PASS (setelah dev server dihentikan), smoke `wo2_f2a_smoke/smoke.ts` **35/35 PASS** (relasi include, semua index-query, 2 baris setahun, FK RESTRICT P2003, no-DB-default dibuktikan 2 lapis: client validation + raw SQL `NOT NULL constraint failed`), `npm run lint` PASS, `npm run build` PASS (main tidak berubah â€” schema hanya).
- **Laporan:** `WORK_ORDER_2_F2A_IMPLEMENTATION_REPORT.md`, `WO2_FINAL_REVIEW.md`, `WO2_RELEASE_REPORT.md`. Status: **APPROVED & RELEASED** (FINAL APPROVAL 2026-08-03, commit `1397e47` + final release commit; tidak lanjut WO berikutnya). Status: **DONE â€” menunggu review PO** (tidak lanjut WO berikutnya).

### Pelajaran (retain)
- **`prisma generate` gagal EPERM saat dev server berjalan** â€” `npm run dev` (electron-vite) memuat `query_engine-windows.dll.node` ke memori sehingga file tidak bisa di-rename. Prosedur: hentikan dev server (dengan izin PO) sebelum `prisma generate`; jangan abaikan error EPERM.
- **Smoke DB wajib fresh DB per run** (ulang pelajaran WO-8): fixture unique (`AcademicYear.name`) bertabrakan bila DB temp menyimpan baris run sebelumnya â€” hapus `.db` lalu `migrate deploy` ulang.
- **Uji "no DB default" butuh 2 lapis:** (1) panggilan Prisma client yang omit kolom â†’ PrismaClientValidationError tanpa `.code` (bukan P2011) karena validasi client-side mendahului DB; (2) `$executeRaw` INSERT omit kolom â†’ error `Code: 1299 ... NOT NULL constraint failed` (bukti di level DB). Jangan assert P2011 untuk omit kolom wajib via client.
- **tsc single-file outDir:** input `dir/file.ts` dengan `--outDir` menghasilkan `<outDir>/file.js` (rootDir diinfer dari input), bukan `<outDir>/dir/file.js`.
- **Kolom workflow (status/mode/outcome) bebas string tanpa default** â€” konsisten pola schema existing; validasi enum ada di Service layer, bukan DB. Uniqueness semantik ("satu kelas aktif per anggota") juga domain Service.
- **Cek bentrok nama laporan SEBELUM menulis file:** `WORK_ORDER_2_IMPLEMENTATION_REPORT.md` sudah dipakai laporan sprint Import Anggota (commit `a7adf66`) â€” laporan F2a diberi suffix `_F2A_` (`WORK_ORDER_2_F2A_IMPLEMENTATION_REPORT.md`). Jangan `git checkout` lalu `Move-Item -Destination` ke file baru di satu perintah â€” gunakan nama baru langsung agar isi tidak tertimpa.

---

## WO-3 (F2b): Backfill + Reconciliation (COMPLETE â€” READY review PO)

### Ringkasan
- Source of Truth: `MASTER_DATA_AKADEMIK_ARCHITECTURE_RFC.md` (LOCKED) + `MASTER_DATA_AKADEMIK_WBS.md` (LOCKED) + `WO3_DISCOVERY_REPORT.md` (APPROVED). Scope: **backfill idempoten** `Member.classId â†’ MemberEnrollment(ACTIVE)` memakai `class.academicYearId` (RFC Â§15 F1). **TIDAK** mengubah schema/migration/Repository/Service/IPC/UI; `Member.classId` tetap ada.
- **Deliverable (2 file):** `scripts/backfill-member-enrollment.ts` (ekspor `runBackfillEnrollment(prisma)` â€” skip bila ACTIVE sudah ada, orphan dilaporkan+dilewati, satu `$transaction` via `runTransaction`, CLI dengan guard `require.main === module`) + `wo3_f2b_smoke/smoke.ts` **28/28 PASS** (seed gaya skema lama: M1/M2 ber-classId, M3 tanpa classId, M4 orphan via raw SQL `PRAGMA foreign_keys=OFF`).
- **Validation 6/6 PASS:** (1) fresh DB deploy + smoke; (2) idempotensi run-2 = 0 created, total tetap 2; (3) orphan dilaporkan tanpa insert; (4) empty DB no-op â€” CLI di DB dev (0 member) exit 0; (5) `npm run lint`; (6) `npm run build`.
- **Laporan:** `WORK_ORDER_3_F2B_IMPLEMENTATION_REPORT.md`, `WO3_FINAL_REVIEW.md`, `WO3_RELEASE_REPORT.md`. Status: **DONE â€” menunggu review PO** (tidak lanjut WO berikutnya, AY-1a).

### Pelajaran (retain)
- **Orphan (`classId` menggantung) praktis mustahil di DB normal** â€” FK `Member.classId â†’ Class` di-enforce SQLite (`FOREIGN KEY constraint failed`). Seed orphan untuk smoke: `$executeRawUnsafe('PRAGMA foreign_keys = OFF')` lalu raw INSERT di **koneksi Prisma yang sama** (Prisma SQLite memakai satu koneksi â€” pragma bertahan), lalu `PRAGMA ... = ON`. **`PRAGMA foreign_keys` adalah no-op di dalam `$transaction`** (SQLite) â€” harus di luar transaction.
- **Raw SQL tabel `Member` wajib kolom fisik `number`/`birthplace`** (bukan `memberNumber`/`birthPlace`) karena `@map` (pelajaran WO-006B). Error `table Member has no column named memberNumber` = petunjuk kolom ter-map.
- **Prisma SQLite satu koneksi:** `$executeRawUnsafe('PRAGMA ...')` memengaruhi query berikutnya pada instance yang sama (bukan pooled terpisah).
- **Script one-time di `scripts/`**: TS + `PrismaClient` langsung, tanpa tsx/ts-node â€” compile `npx tsc --module commonjs ... --outDir <temp>` lalu `node` dengan `DATABASE_URL` + `NODE_PATH`. `require.main === module` untuk CLI guard agar fungsi bisa di-import smoke.

---

## WO-4 (AY-1a): AcademicYear exclusive-active guard (COMPLETE â€” READY review PO)

### Ringkasan
- Source of Truth: `MASTER_DATA_AKADEMIK_ARCHITECTURE_RFC.md` (LOCKED, Â§2.4/Â§17) + `MASTER_DATA_AKADEMIK_WBS.md` (LOCKED, WO-4 AY-1a) + `WO4_DISCOVERY_REPORT.md` (READY FOR IMPLEMENTATION). Scope: **guard service + repo transaksional + smoke + docs**. **TIDAK** mengubah schema/migration/IPC/Preload/UI/DTO; repo sudah ada (WBS Repo/UI = N/A).
- **Deliverable (2 file source + 1 smoke):** `src/main/repositories/academic-year.repository.ts` +2 metode transaksional `createExclusiveActive`/`updateExclusiveActive` (`$transaction`: `updateMany(isActive:trueâ†’false)` lalu create/update target `isActive:true`); `src/main/services/academic-year.service.ts` guard decision â€” `isActive===true` â†’ metode exclusive-active, selainnya `create`/`update` biasa (perilaku lama); `wo4_ay1a_smoke/smoke.ts` **21/21 PASS** pada fresh DB.
- **Logika:** deaktivasi **semua** tahun aktif (tanpa exclude target) lalu target di-set aktif dalam satu transaksi â€” net "hanya target aktif"; gagalnya create/update target â†’ rollback deaktivasi (tidak ada window "nol aktif").
- **Validation 3/3 PASS:** (1) fresh DB deploy (4 migrations) + smoke 21/21 (create B aktif nonaktifkan A, update A aktif nonaktifkan B&C, create/update nonaktif tak menyentuh tahun aktif, count `isActive=true`===1 di tiap langkah, duplikat/404 tetap ditolak); (2) `npm run lint`; (3) `npm run build` (main 1,776.61 kB Â· preload 7.68 kB Â· renderer 940.40 kB).
- **Laporan:** `WORK_ORDER_4_AY1A_IMPLEMENTATION_REPORT.md`, `WO4_FINAL_REVIEW.md`, `WO4_RELEASE_REPORT.md`. Status: **DONE â€” menunggu review PO** (tidak lanjut WO berikutnya, AY-1b).

### Pelajaran (retain)
- **Guard = keputusan bisnis di Service, eksekusi atomik di Repository** â€” pola `$transaction` meniru `borrow.repository.createWithItems`/`processReturn`. Guard mengikat jalur service saja; caller yang memanggil repository langsung bisa bypass (konsisten RFC: guard hidup di service).
- **Deaktivasi menyeluruh tanpa exclude target** lebih sederhana daripada `where: { id: { not: targetId } }` â€” target langsung di-set aktif di operasi berikutnya dalam transaksi yang sama.
- **Rollback otomatis** melindungi invarian "tepat satu aktif": bila create/update target gagal, deaktivasi ikut dibatalkan.
- Smoke WO-4 memakai fresh DB temp (`file:C:/Users/hp/AppData/Local/Temp/opencode/...`) dan dibersihkan setelah run â€” DB live dev tidak pernah disentuh.
- Nama laporan WO-4 wajib suffix `_AY1A_` (`WORK_ORDER_4_IMPLEMENTATION_REPORT.md` sudah dipakai laporan sprint lama â€” jangan ditimpa).

---

## WO-5 (AY-2): Academic Year Master UI (COMPLETE â€” READY review PO)

### Ringkasan
- Source of Truth: `MASTER_DATA_AKADEMIK_ARCHITECTURE_RFC.md` (LOCKED) + `MASTER_DATA_AKADEMIK_WBS.md` (LOCKED) + `WO5_DISCOVERY_REPORT.md` (APPROVED). Scope: **renderer-only Academic Year CRUD UI**. **TIDAK** mengubah Repository/Service/IPC/Preload/Schema/Migration; Curriculum/Class/Enrollment/Promotion tidak disentuh.
- **Deliverable (3 file baru + 4 file UI):** `src/pages/master/AcademicYearListPage.tsx` (list + search `.data` dari paginated `findMany` + delete + badge status), `src/pages/master/AcademicYearFormPage.tsx` (create/edit via `findById`/`create`/`update`), `src/components/master/AcademicYearForm.tsx` (nama + date mulai/selesai + toggle aktif + warning guard + validasi tanggal); modified: `src/routes/index.tsx` (+3 route `master/academic-years[...]`), `src/components/layout/Sidebar.tsx` (+item "Tahun Ajaran" di grup Master Data), `src/utils/labels.ts` (blok `ACADEMIC_YEAR`), `src/utils/navigation.ts` (+`ROUTES.MASTER_ACADEMIC_YEAR*` + `academicYearEditPath`).
- **Catatan sequencing:** WBS menaruh AY-1b (Buka/Tutup) sebelum AY-2, tapi AY-2 hanya mengonsumsi API yang sudah ada (Flow AY-2: Preloadâ†’UIâ†’Testing; Repo/Service/IPC = N/A) â€” "tandai aktif" via `update(isActive:true)` sudah ter-guard AY-1a; AY-1b tetap WO terpisah.
- **Validation PASS:** (1) `npm run lint`; (2) `npm run build` (main 1,776.61 kB Â· preload 7.68 kB Â· renderer 952.31 kB); (3) UAT smoke `wo5_ay2_smoke/smoke.ts` **14/14 PASS** pada fresh DB (create nonaktif, create aktif â†’ nonaktifkan tahun lain, edit + toggle aktif â†’ guard tetap, delete tahun berkelas ditolak 400, delete tanpa kelas sukses, findMany list, duplikat nama ditolak); (4) grep bundle renderer (`Tahun Ajaran`, `master/academic-years`) ter-render.
- **Laporan:** `WORK_ORDER_5_IMPLEMENTATION_REPORT.md`, `WO5_FINAL_REVIEW.md`, `WO5_RELEASE_REPORT.md`. Status: **DONE â€” menunggu review PO** (tidak lanjut WO berikutnya, C-1).

### Pelajaran (retain)
- **Renderer tidak perlu pagination manual** untuk list master â€” `academicYears.findMany(search)` mengembalikan paginated `{data, total, ...}`; List page memakai `.data` (server-side search, pola eksisting), total dipakai utk verifikasi.
- **Input `type="date"` memberi `YYYY-MM-DD`** â€” konversi ke ISO (`new Date(v).toISOString()`) saat submit; value input di-backfill dari ISO via `iso.slice(0,10)`.
- **Guard 1-aktif tampil sebagai UX**: toggle aktif menampilkan `ACTIVATE_WARNING` ("Mengaktifkan akan menonaktifkan tahun ajaran lain") â€” ekspektasi user dijaga sebelum submit.
- **Delete Guard (service) mengembalikan AppError 400** saat tahun dipakai kelas â€” List page menampilkan `err.message` via `alert`, tanpa redirect/loading error UI.
- Smoke WO-5 memakai fresh DB temp dan dibersihkan; DB live dev tidak pernah disentuh (ulang pola WO-4).

---

## WO-6 (C-1): Curriculum Master UI (COMPLETE â€” READY review PO)

### Ringkasan
- Source of Truth: `MASTER_DATA_AKADEMIK_ARCHITECTURE_RFC.md` (LOCKED) + `MASTER_DATA_AKADEMIK_WBS.md` (LOCKED, WO-7 C-1) + `WO6_DISCOVERY_REPORT.md` (APPROVED). Scope: **renderer-only Curriculum CRUD UI**. **TIDAK** mengubah Repository/Service/IPC/Preload/Schema/Migration; AcademicYear/Class/Enrollment/Promotion tidak disentuh.
- **Deliverable (3 file baru + 4 file UI):** `src/pages/master/CurriculumListPage.tsx` (list + search `.data` + delete), `src/pages/master/CurriculumFormPage.tsx` (create/edit), `src/components/master/CurriculumForm.tsx` (satu field nama â€” `CurriculumDTO` hanya `name`); modified: `src/routes/index.tsx` (+3 route `master/curricula[...]`), `src/components/layout/Sidebar.tsx` (+item "Kurikulum"), `src/utils/labels.ts` (blok `CURRICULUM`), `src/utils/navigation.ts` (+`ROUTES.MASTER_CURRICULUM_*` + `curriculumEditPath`).
- **Backend sudah lengkap sejak WO-005** termasuk delete guard `countByCurriculum > 0`; C-1 hanya konsumen preload `curricula.*` (WBS C-1: Dependency `â€”`, Flow Preloadâ†’UIâ†’Testingâ†’PO Review, LOW).
- **Validation PASS:** (1) `npm run lint`; (2) `npm run build` (main 1,776.61 kB Â· preload 7.68 kB Â· renderer 959.90 kB); (3) UAT smoke `wo6_c1_smoke/smoke.ts` **10/10 PASS** (create, duplikat nama ditolak 400, edit + rename-ke-nama-sendiri no-op, rename-ke-nama-lain ditolak, delete berkelas ditolak 400, delete tanpa kelas sukses, list + search); (4) grep bundle renderer (`Kurikulum`, `master/curricula`) ter-render.
- **Laporan:** `WORK_ORDER_6_IMPLEMENTATION_REPORT.md`, `WO6_FINAL_REVIEW.md`, `WO6_RELEASE_REPORT.md`. Status: **DONE â€” menunggu review PO** (tidak lanjut WO berikutnya, CL-1).

### Pelajaran (retain)
- **Master satu-field (Curriculum) mengikuti persis pola `AuthorForm`** â€” tidak perlu grid tanggal/toggle; reuse `MasterTable` + `confirm` + `alert(err.message)` untuk guard service.
- **Guard duplikat nama dua jalur di service:** create & update sama-sama cek `existsByName`; update mengecualikan nama sendiri (`name !== existing.name`) sehingga rename-ke-nama-sendiri no-op â€” smoke memastikan tidak error.
- **Delete Guard service (400, `countByCurriculum`)** â€” UI cukup menampilkan `err.message`; tidak ada redirect/loading error UI.
- **`findMany(search)` paginated** (`{data,total,...}`) â€” list memakai `.data` (server-side search), `total` utk verifikasi; pola sama WO-5.
- Smoke WO-6 memakai fresh DB temp dan dibersihkan; DB live dev tidak pernah disentuh.

---

## WO-7 (CL-1): Class Immutability Guard (COMPLETE â€” READY review PO)

### Ringkasan
- Source of Truth: `MASTER_DATA_AKADEMIK_ARCHITECTURE_RFC.md` (LOCKED, Â§13) + `MASTER_DATA_AKADEMIK_WBS.md` (LOCKED, WO-8 CL-1) + `WO7_DISCOVERY_REPORT.md` (APPROVED). Keputusan PO: **WBS-strict** â€” hanya `educationLevel` + `parallel` immutable; `academicYearId`/`curriculumId` tetap bisa diubah. Scope: ClassService + Smoke + Docs saja.
- **Modifikasi (1 file source):** `src/main/services/class.service.ts` â€” `create` normalisasi `educationLevel` (`trim().toUpperCase()`) + validasi via F1 `EDUCATION_LEVELS` (X/XI/XII) â†’ AppError 400 bila invalid; nilai ternormalisasi dipakai untuk `findDuplicate` & persist; `update` **blokir** `educationLevel`/`parallel` (AppError 400 "immutable â€” buat kelas baru untuk rename"), payload `repository.update` kini hanya `academicYearId`/`curriculumId`/`homeroomTeacher`/`isActive`; `comboChanged` (AY/curriculum) tetap ada.
- **TIDAK diubah:** Repository, IPC, Preload, UI, DTO (`UpdateClassDTO` masih punya `educationLevel`/`parallel` â€” sengaja dibiarkan, ditolak di service), Schema, Migration, Bootstrap, env.d.ts, resolver; delete guard tetap `Member.classId` legacy (pindah ke enrollment di E-2).
- **Validation PASS:** (1) `npm run lint`; (2) `npm run build` (main 1,776.84 kB Â· preload 7.68 kB Â· renderer 959.90 kB â€” renderer tidak berubah); (3) smoke `wo7_cl1_smoke/smoke.ts` **16/16 PASS** (create valid, level IX/kosong ditolak 400, lowercase `" xi "`â†’XI, duplikat komposit 400, update educationLevel ditolak 400 + tetap X, update parallel ditolak 400 + tetap, regression: homeroomTeacher/isActive sukses, findById, findMany list/search, delete tanpa anggota sukses, delete beranggota 400); (4) grep bundle main (`educationLevel/parallel immutable`, `Tingkat pendidikan`) = True.
- **Laporan:** `WO7_DISCOVERY_REPORT.md`, `WORK_ORDER_7_IMPLEMENTATION_REPORT.md`, `WO7_FINAL_REVIEW.md`, `WO7_RELEASE_REPORT.md`. Status: **DONE â€” menunggu review PO** (tidak lanjut CL-2a).

### Pelajaran (retain)
- **Guard immutability = Service layer, DTO tidak diubah.** `UpdateClassDTO` tetap menyertakan `educationLevel`/`parallel`; service menolak (AppError 400). Ini mencegah breaking change kontrak sebelum CL-2a dibangun.
- **Normalisasi level wajib sebelum validasi & persist** (`trim().toUpperCase()`): mencegah `"x"` vs `"X"` jadi 2 row komposit â†’ yang membuat `MemberClassResolver` (key uppercase) mendeteksi `classAmbiguous`. Nilai ternormalisasi harus dipakai konsisten di `findDuplicate` DAN `repository.create`.
- **Delete guard kelas masih `memberRepository.countByClass` (legacy `Member.classId`)** â€” per RFC F2, cutover ke `enrollment.count` adalah WO E-2, bukan CL-1. Jangan "perbaiki" di WO yang salah scope.
- Smoke seed Member wajib `memberNumber`/`fullName` (bukan `number`/`name`) â€” pelajaran WO-006B (`@map`).
- Pola `expectRejected(fn, messagePart)` memeriksa `e.message.includes` â€” AppError message adalah kontrak smoke (bukan `.statusCode`).

---

## WO-8 (CL-2a): Class Master UI (COMPLETE â€” READY review PO)

### Ringkasan
- Source of Truth: `MASTER_DATA_AKADEMIK_ARCHITECTURE_RFC.md` (LOCKED) + `MASTER_DATA_AKADEMIK_WBS.md` (LOCKED, WO-9 CL-2a) + `WO8_DISCOVERY_REPORT.md` (APPROVED). Keputusan PO: **fetch-all + client-side filtering**. Scope: **renderer-only Class CRUD UI**; backend `classes:*` (sudah ada sejak WO-005 + CL-1) TIDAK diubah.
- **Deliverable (3 file baru + 4 file UI):** `src/pages/master/ClassListPage.tsx` (fetch paralel AY+kurikulum+classes, fetch-all loop `limit 100`, **filter client-side** tahun+kurikulum+search, kolom lookup nama AY/kurikulum via Map, delete), `src/pages/master/ClassFormPage.tsx` (create/edit; **payload update TANPA educationLevel/parallel** â€” immutable CL-1), `src/components/master/ClassForm.tsx` (dropdown Tahun/Kurikulum/Tingkat X/XI/XII via `EDUCATION_LEVELS`, input Paralel + Guru Kelas, checkbox Aktif; **Tingkat/Paralel disabled saat edit** + hint immutable); modified: `src/routes/index.tsx` (+3 route `master/classes[...]`), `src/components/layout/Sidebar.tsx` (+item "Kelas"), `src/utils/labels.ts` (blok `CLASS`), `src/utils/navigation.ts` (+`ROUTES.MASTER_CLASS*` + `classEditPath`).
- **Keputusan teknis R1:** `classes.findMany` tidak punya filter Tahun/Kurikulum & IPC dilarang diubah â†’ UI fetch-all (`findMany(undefined, page, 100)` loop sampai `total`) lalu filter client-side; acceptable untuk data master kelas.
- **Validation PASS:** (1) `npm run lint`; (2) `npm run build` (main 1,776.84 kB Â· preload 7.68 kB Â· renderer **978.36 kB** â€” main/preload tidak berubah = bukti backend N/A); (3) smoke `wo8_cl2a_smoke/smoke.ts` **16/16 PASS** (create payload UI, fetch-all, filter client-side tahun/kurikulum/search, update guru+isActive, immutable regresi CL-1, duplicate guard, delete beranggota 400, delete sukses); (4) grep bundle renderer (`Kelas`, `master/classes`, `Tambah Kelas`, `classEditPath`) = True.
- **Laporan:** `WO8_DISCOVERY_REPORT.md`, `WORK_ORDER_8_IMPLEMENTATION_REPORT.md`, `WO8_FINAL_REVIEW.md`, `WO8_RELEASE_REPORT.md`. Status: **DONE â€” menunggu review PO** (tidak lanjut CL-2b).

### Pelajaran (retain)
- **`CreateClassDTO.homeroomTeacher` = `string | undefined` (bukan `null`)** â€” form mengirim `string | null | undefined`; saat create harus di-map `?? undefined` (`ClassFormPage`), update menerima `null` (clear field). Tipe strict tsconfig.web menjebak bila kirim `null` ke create.
- **Fetch-all pattern:** `findMany(undefined, page, 100)` di-loop `while (all.length < result.total) page++` karena `limit` max 100 (`getPaginationParams` `Math.min(100, ...)`) dan IPC tak boleh diubah.
- **Client-side filter:** renderer memegang `yearFilter`/`curriculumFilter`/`search` + `useMemo` filter pada dataset; lookup nama AY/kurikulum via `Map<id,name>` dibangun dari fetch paralel `Promise.all([academicYears, curricula, classes])`.
- **Immutable CL-1 di UI:** field Tingkat/Paralel `disabled` saat edit (hint amber) + payload update tidak mengirim keduanya â†’ double-layer dengan guard service (WO-7).
- Smoke wo8 memakai fresh DB temp dan dibersihkan; DB live dev tidak pernah disentuh.

---

## WO-9 (CL-2b): Class Clone ke Tahun Baru (COMPLETE - READY review PO)

### Ringkasan
- Source of Truth: `MASTER_DATA_AKADEMIK_ARCHITECTURE_RFC.md` (LOCKED, RFC Â§7 prasyarat promosi) + `MASTER_DATA_AKADEMIK_WBS.md` (LOCKED, WO-10 CL-2b) + `WO9_DISCOVERY_REPORT.md` (APPROVED). Keputusan PO: **Clone HANYA menyalin `curriculumId`, `educationLevel`, `parallel`; `homeroomTeacher = null`, `isActive = true`**. Scope: 1 Service method + 1 IPC channel + 1 preload method + 1 env.d.ts entry + UI Clone.
- **Modifikasi (3 source + 1 DTO + 1 UI baru):** `src/main/services/class.service.ts` (+`cloneToYear(sourceAY, targetAY)` - validasi `source !== target` + `existsById` kedua tahun; loop kelas sumber `findByAcademicYear`; SATU `$transaction` via `runTransaction(getPrisma(), ...)`; per kelas cek duplikat komposit `(targetAY, curriculumId, educationLevel, parallel)` - ada -> skip, belum -> `create` dgn `homeroomTeacher: null`, `isActive: true`; return `{ created, skipped }`), `electron/ipc/class.ipc.ts` (+`classes:cloneToYear`), `electron/preload/class.preload.ts` (+`classes.cloneToYear`), `src/renderer/env.d.ts` (+entry), `src/shared/dto/academic.ts` (+`CloneClassResult`), `src/components/master/ClassCloneModal.tsx` (**baru** - modal Tahun Sumber + Tahun Target + hasil created/skipped), `src/pages/master/ClassListPage.tsx` (+tombol "Clone ke Tahun Baru" di toolbar filter + render modal + re-fetch `onCloned`), `src/utils/labels.ts` (+blok `CLASS.CLONE_*`).
- **TIDAK diubah:** Repository, Schema, Migration, CRUD `classes:*` eksisting, Academic Year, Curriculum, Enrollment, Promotion. Service import `getPrisma` + `runTransaction` dari base (pola transaction base, bukan repo baru).
- **Validation PASS:** (1) `npm run lint`; (2) `npm run build` (main 1,778.91 kB Â· preload 7.84 kB Â· renderer 985.76 kB); (3) smoke `wo9_cl2b_smoke/smoke.ts` **26/26 PASS** pada fresh DB (clone 3 row baru copy curriculumId/level/parallel, homeroomTeacher null + isActive true, idempotency run ulang created=0 skipped=3, duplicate skip clone balik, source=target ditolak 400, tahun tak ditemukan ditolak 400, regresi CRUD update guru + immutable CL-1); (4) grep bundle `classes:cloneToYear` (main) & `Clone ke Tahun Baru` (renderer) = ter-render.
- **Laporan:** `WO9_DISCOVERY_REPORT.md`, `WORK_ORDER_9_IMPLEMENTATION_REPORT.md`, `WO9_FINAL_REVIEW.md`, `WO9_RELEASE_REPORT.md`. Status: **DONE - menunggu review PO** (tidak lanjut WO berikutnya).

### Pelajaran (retain)
- **Clone struktur kelas = service method, bukan repository.** Semua kebutuhan sudah ada di repo (`findByAcademicYear`), sehingga batch create dalam transaksi dilakukan langsung via `runTransaction(getPrisma(), ...)` + `tx.class.findFirst`/`tx.class.create` - tanpa menyentuh Repository (constraint WO).
- **Idempotensi clone**: cek duplikat komposit per-baris lalu SKIP (bukan throw) - hasil `{ created, skipped }`; run ulang = created 0. Guard `source === target` -> AppError 400 "tidak boleh sama" dipisah dari guard tahun tidak ditemukan.
- **Keputusan PO domain**: clone hanya menyalin identitas kelas (curriculumId/educationLevel/parallel); `homeroomTeacher` dikosongkan & `isActive=true` (guru/status adalah kepemilikan tahun berjalan, bukan struktur). Jangan menyalin field non-struktur.
- **UI modal tanpa route baru**: tombol di toolbar ClassListPage membuka `ClassCloneModal` (reuse data `academicYears` yang sudah di-fetch page) - tidak perlu sentuh `navigation.ts`/routes.
- Smoke wo9 memakai fresh DB temp dan dibersihkan; DB live dev tidak pernah disentuh.

---

## WO-19 MI-3: Import Duplicate Strategy â€” Skip & Flag (COMPLETE - READY review PO, ter-release)

### Ringkasan
- Keputusan PO: **strategi A "Skip & flag"** (RFC Â§12.2) â€” member existing tidak lagi diblokir; baris yang SUDAH ACTIVE di tahun target **dilewati** (`skipped`), member existing yang belum terdaftar tahun target mendapat **enrollment-only** (PO #5); member baru â†’ create Member + Enrollment ACTIVE. Email hanya diblokir untuk member BARU.
- **File diubah (3 source + 1 DTO):** `member-duplicate-checker.service.ts` (NISN existing â†’ `existingByRow: Map<rowNumber, ExistingMemberInfo>` routing, email blocker hanya baris NISN baru; `continue` di baris existing), `enrollment.repository.ts` (+`findMemberIdsActiveInYear(memberIds, year)` batch lookup Set<memberId> â€” bukan query per baris), `member-import.service.ts` (`RowRouting` = `'create-member'|'enrollment-only'|'skip'`; routing di preflight dengan 1 batch query ACTIVE-per-tahun; `writePhase(rows, routingByRow, existingMemberIdByRow, classIdByRow, academicYearId)` split 3 jalur dalam SATU `$transaction`; `allocateMemberNumbers` hanya utk create-member (count-0 aman); result +`skipped`), `member.ts` (`MemberImportResultDTO` +`skipped: number` aditif).
- **TIDAK diubah:** UI Import, IPC `members:previewCheck/import(rows, scope?)`, preload, env.d.ts (format fix di env.d.ts dikembalikan identik â€” tidak ada perubahan), Schema, Migration, `EnrollmentService`, `Member.status` sync (E-3), Promotion, Reporting.
- **Validation PASS:** lint; build (main 1,797.87 kB Â· preload 8.62 kB Â· renderer 999.83 kB); smoke MI-3 **38/38** (baru/enrollment-only/skip/email-blocker-hanya-baru/email-tak-blokir-existing/campuran 1+2/invariant satu-ACTIVE/rollback batch campuran); regression MI-1 44, MI-2 37, E-1 39, E-2 36, E-3 78, E-4 45; `migrate diff` = no drift (schema tidak disentuh).
- **Commit:** `70d2e15` "feat: import duplicate strategy skip & flag for existing members (WO-19 MI-3)" â€” di-push (`1855568..70d2e15`, 8 files, +638/âˆ’49). Working tree bersih.
- **Laporan:** `WORK_ORDER_MI3_IMPLEMENTATION_REPORT.md`, `MI3_FINAL_REVIEW.md`, `MI3_RELEASE_REPORT.md`.
- **Status: DONE â€” menunggu review PO** (tidak lanjut WO berikutnya).

### Pelajaran (retain)
- **Migrasi smoke:** `npx prisma migrate deploy --skip-generate` GAGAL dengan "Specify a schema" di Prisma 5.22 setup ini; `prisma migrate deploy` (tanpa `--skip-generate`) dari `workdir=prisma` selalu berhasil. Bila `--skip-generate` dibutuhkan, jalankan dari folder `prisma/` (schema ter-resolve; generate client aman selama dev server mati).
- **`existingByRow` routing memakai MapIterator** â€” `duplicateResult.existingByRow.values()` adalah `MapIterator`, bukan array; konversi via `Array.from(map.values(), fn)` (bukan `.map()`).
- **Strategi A flag = `skipped` count agregat** di `MemberImportResultDTO` (aditif, non-breaking IPC); renderer tidak menurunkan business logic (konsisten WO-2) â€” field list per-baris tidak ditambahkan.
- **Prisma `file:` URL** di smoke: gunakan absolute `file:C:/...`; `migrate deploy` sukses memakai `.env` repo root (relative ke schema dir) bila DATABASE_URL tidak diset.
- **Rollback batch campuran terbukti** â€” stub `EnrollmentRepository` melempar saat `createManyWithTx` setelah Member createMany â†’ 0 Member + 0 Enrollment tersimpan (all-or-nothing).

---

## WO-20 MI-4: Member Import UI â€” Scope Wajib (COMPLETE - READY review PO)

### Ringkasan
- Keputusan PO: **hapus fallback MI-1** â€” dialog Import Anggota WAJIB meminta Academic Year (default tahun aktif) + Curriculum; scope `{academicYearId, curriculumId}` dikirim eksplisit ke `previewCheck()`/`import()`; resolver tidak pernah lagi memakai "tahun aktif implicit" / "kurikulum opsional".
- **Kontrak dikencangkan (opsional â†’ WAJIB):** `MemberImportScope` dua field `string`; `previewCheck(rows, scope)`; `import(rows, options:{scope,onProgress?})`; `preflight` resolve `scope.*`; `MemberImportPreflight.academicYearId: string`; `writePhase(..., academicYearId: string)` + guard null dihapus; `MemberClassResolver` ctor hanya `(classRepository)` (dependensi AcademicYearRepository dihapus), `resolve(rows, year, curriculum)`; `ClassRepository.findByAcademicYearAndCurriculum` `curriculumId: string` (spread kondisional dihapus); IPC/preload/env.d.ts scope wajib.
- **UI (`MemberImportDialog.tsx`):** state `academicYears`/`curricula`/`academicYearId`/`curriculumId`; mount â†’ `Promise.all([academicYears.findMany(), curricula.findMany()])`, default `academicYearId = data.find(y => y.isActive)?.id`; blok "Penempatan Kelas" (2 dropdown `*`); `runPreview(rows, year, curriculum)`; `handleFileChange`/scope onChange re-preview (hint `REQUIRE_SCOPE` bila scope belum lengkap); `handleImport` kirim scope; hasil sukses grid-cols-5 (+ sel **Dilewati** dari `result.skipped` MI-3). `labels.ts` + `SCOPE_*`/`YEAR`/`CURRICULUM`/`SELECT_*`/`RESULT_SKIPPED`.
- **Smoke:** baru `wo20_mi4_smoke/smoke.ts` **24/24** (kontrak dialog findMany default aktif, picker kurikulum, preview default aktif valid, preview di-scope kurikulum, preview tahun non-aktif dihormati + `yearC` tanpa kelas â†’ classNotFound BUKAN fallback, import scope yearB â†’ enrollment yearB+classD, import scope kurikulum â†’ classC vs classA, invariant satu-ACTIVE). Smoke MI-1 di-update ke kontrak baru (44â†’43): STEP 5 hapus null-curriculum ambiguous â†’ scope mempersempit unik; STEP 6 hapus fallback â†’ tahun scope non-aktif dihormati; STEP 7 hapus no-active-year; STEP 10 ganti backward-compat â†’ import scope yearB. MI-2 (37) STEP 6 ganti backward-compat â†’ scope yearB. MI-3 (38) hanya ctor.
- **Validation PASS:** lint; build (main 1,796.83 kB Â· preload 8.62 kB Â· renderer 1,006.72 kB); smoke MI-4 24/24 + regression MI-1 43, MI-2 37, MI-3 38, E-1 39, E-2 36, E-3 78, E-4 45 (fresh DB); `prisma migrate diff` = empty (schema tidak disentuh); grep bundle renderer (`Penempatan Kelas`/`Dilewati`) & main (`members:previewCheck`) ter-render.
- **Laporan:** `WORK_ORDER_MI4_IMPLEMENTATION_REPORT.md`, `MI4_FINAL_REVIEW.md`, `MI4_RELEASE_REPORT.md`. Status: **DONE - menunggu review PO** (tidak lanjut WO berikutnya).

### Pelajaran (retain)
- **UI dialog = kontrak backend; smoke service adalah bukti kontrak itu.** Default tahun aktif, picker kurikulum, dan hint scope adalah logika renderer (tak ada framework test React di repo) â€” dibuktikan via `Promise.all(findMany)` contract + `npm run build` + grep bundle; logika backend yang dipakai dialog (findMany/paginated, previewCheck, import, resolver) diuji penuh di smoke.
- **Kencangkan tipe, jangan hapus fungsionalitas di tengah.** Penghapusan fallback dilakukan bertahap: tipe scope â†’ service â†’ resolver â†’ repository â†’ plumbing IPC/preload/env â†’ smoke; `npm run lint` (tsc node+web) adalah gate cepat antar langkah.
- **Smoke lama yang menguji perilaku yang dihapus = di-edit, bukan dibuang** â€” ganti tiap kasus fallback dengan kasus baru yang membuktikan non-fallback (mis. "tahun non-aktif dihormati", "yearC tanpa kelas â†’ classNotFound padahal tahun aktif punya kelas itu").
- **Smoke historis `uat_*`** masih memakai konstruktor/scope lama dan TIDAK di-upgrade (obsolete oleh keputusan PO, di luar regression suite) â€” didokumentasikan sebagai tech debt di laporan.
- Compile & run smoke batch: `npx tsc --module commonjs --target es2022 --moduleResolution node --esModuleInterop --skipLibCheck --rootDir . --outDir <tmp>\out <list smoke.ts>` â†’ fresh DB per smoke (`Remove-Item *.db*` â†’ `npx prisma migrate deploy` dari workdir `prisma/`) â†’ `node <tmp>\out\<wo>_smoke\smoke.js` dgn `$env:DATABASE_URL` absolute + `$env:NODE_PATH=<repo>\node_modules`.

---

## E-1 (Enrollment Core): EnrollmentRepository + EnrollmentService (COMPLETE - READY review PO)

### Ringkasan
- Source of Truth: `MASTER_DATA_AKADEMIK_ARCHITECTURE_RFC.md` (LOCKED, Â§1.2/Â§1.3/Â§2.1/Â§4/Â§6.1/Â§6.2/Â§11) + `MASTER_DATA_AKADEMIK_WBS.md` (LOCKED, WO-13 E-1) + `MILESTONE_B_DISCOVERY_REPORT.md` (APPROVED, Gap #1-#4 HIGH blocker). Scope: **fondasi Enrollment** â€” repo + service + DTO + config status akademik + IPC `enrollments:*` + preload + env.d.ts + bootstrap. **TIDAK** mengubah schema/migration/`Member.classId`/MemberService/BorrowService/ClassService/Import/UI; `Member.status` sync = E-3 (scope discipline).
- **File baru (7):** `src/shared/config/academic-status.ts` (`ACADEMIC_STATUS` as const 7 nilai + `isAcademicStatus` + `isTerminalAcademicStatus` â€” leaf node, pola config F1), `src/shared/dto/enrollment.ts` (`EnrollmentDTO` + `CreateEnrollmentDTO`/`CloseEnrollmentDTO`/`RepointEnrollmentDTO`), `src/main/repositories/enrollment.repository.ts` (`create`/`findById`/`findActiveByMember` [status=ACTIVE + leftAt=null]/`countActiveByMember`/`close`; `CreateEnrollmentData.status` **wajib** karena no-DB-default), `src/main/services/enrollment.service.ts` (`enroll` [member ada 404 + `hasAcademicRecord` siswa saja 400 + class milik tahun 400 + satu-ACTIVE 400], `close` [ACTIVE saja + `isTerminalAcademicStatus` 400; set status/leftAt/note; tidak pernah DELETE], `repoint` [close REDISTRIBUTED + enroll target dalam SATU `runTransaction(getPrisma(),...)`, tahun = tahun enrollment lama, guard target ada/sama-tahun/tidak-sama-kelas], `findActiveByMember` â†’ DTO|null), `electron/ipc/enrollment.ipc.ts` (+4 channel `enrollments:enroll/close/repoint/findActiveByMember`), `electron/preload/enrollment.preload.ts` (+`enrollments.*`), `wo13_e1_smoke/smoke.ts`.
- **Dimodifikasi (4):** `electron/preload/index.ts` (+`enrollmentAPI`), `src/renderer/env.d.ts` (+entry `enrollments`), `electron/main/bootstrap.ts` (+`EnrollmentService`/`EnrollmentRepository` di Container), `electron/ipc/index.ts` (+`registerEnrollmentHandlers` + tipe).
- **Validation PASS:** (1) `npm run lint`; (2) `npm run build` (main 1,788.10 kB Â· preload 8.49 kB Â· renderer 987.29 kB); (3) smoke `wo13_e1_smoke/smoke.ts` **39/39 PASS** pada fresh DB (enroll ACTIVE + label, satu-ACTIVE ditolak, guru/umum ditolak, member/kelas 404, kelas tahun lain 400, close status non-terminal ditolak/GRADUATED valid, close ulang ditolak, repoint REDISTRIBUTED+baru ACTIVE histori 2 baris, guard repoint 4 kasus, findActive null, invariant groupBy aktif<=1); (4) `prisma migrate diff` = no drift (empty migration); (5) grep bundle main+preload `enrollments:*` = 4/4.
- **Laporan:** `WORK_ORDER_E1_IMPLEMENTATION_REPORT.md`, `E1_FINAL_REVIEW.md`, `E1_RELEASE_REPORT.md`. Status: **DONE - menunggu review PO** (tidak lanjut E-2).

### Pelajaran (retain)
- **`status` di MemberEnrollment wajib** (no DB default) â€” `CreateEnrollmentData.status: string` REQUIRED di repository; membuatnya optional memicu TS2322 karena `undefined` tak assignable. DTO input `CreateEnrollmentDTO` TIDAK punya `status` (Service yang menetapkan `ACADEMIC_STATUS.active`).
- **Satu-ACTIVE = guard Service, bukan DB** â€” schema tanpa `@@unique([memberId, academicYearId])` (REDISTRIBUTED 2-baris setahun valid). `enroll` MEMBLOKIR bila ada ACTIVE (tidak auto-close; auto-close = keputusan E-2/MI-2); `repoint` adalah jalur eksplisit mutasi tengah tahun.
- **`repoint` pakai pola WO-9** â€” close+enroll dalam satu `runTransaction(getPrisma(), ...)` langsung `tx.memberEnrollment.*`, tanpa Repository (pola transaction base). Tahun ajaran baru = `existing.academicYearId`.
- **Definisi "aktif"** = `status=ACTIVE` AND `leftAt=null` (RFC Â§1.3) â€” dipakai `findActiveByMember`/`countActiveByMember`; guard E-1 tidak menyentuh `Member.status` (scope E-3).
- **Pesan AppError adalah kontrak smoke** â€” `expectRejected(fn, messagePart)` memeriksa `msg.includes`; konsisten pola WO-4/5/6/7.
- Smoke E-1 memakai fresh DB temp (`file:C:/.../e1-smoke/smoke.db`) dan dibersihkan; DB live dev tidak pernah disentuh.
- Compile smoke multi-file dengan struktur terjaga: `npx tsc ... --rootDir . --outDir <tmp>\out wo13_e1_smoke/smoke.ts` (rootDir "." â†’ emit mempertahankan relatif path sehingga import antar file tetap valid); jalankan `node <tmp>\out\wo13_e1_smoke\smoke.js` dengan `$env:DATABASE_URL` absolute + `$env:NODE_PATH=<repo>\node_modules`.

---

## P-1 (Promotion Foundation): decide() Single Decision Engine + PromotionPreviewService (COMPLETE - READY Final Review, revisi Review PO)

### Ringkasan
- Source of Truth: `MASTER_DATA_AKADEMIK_ARCHITECTURE_RFC.md` (LOCKED, Â§7/Â§7.1/Â§8/Â§9) + `MASTER_DATA_AKADEMIK_WBS.md` (LOCKED, WO-21 P-1) + `P1_DISCOVERY_REPORT.md` (APPROVED). Keputusan arsitektur PO: **`decide()` = Single Decision Engine** â€” P-2 WAJIB memakai fungsi yang sama, dilarang ada logika keputusan kedua. Scope: **fondasi keputusan + preview read-only**. **TIDAK** menyentuh Repository/IPC/Preload/UI/Bootstrap/Schema/Migration/Executor (keputusan JANGAN PO).
- **File baru (2 source + 2 smoke):** `src/shared/dto/promotion.ts` (`PromotionPreviewDTO` persis RFC Â§8: mode + counts {promoted,repeated,graduated,redistributed,noTarget,error} + items {memberId,memberName,sourceClassId,sourceLabel,targetClassId?,targetLabel?,outcome,message}; `PromotionDecision`; `PromotionDecideInput` [member, sumber lengkap, targetClasses, repeat?]; `PromotionTargetClassInput` [id, educationLevel, parallel, curriculumId]; `AutomaticPromotionPreviewInput`), `src/main/services/promotion-preview.service.ts` (`decide()` MURNI: invalid level â†’ ERROR; **XII â†’ GRADUATED MENANG atas repeat** (RFC Â§7 tanpa syarat); X/XI + repeat â†’ REPEATED; X/XI â†’ levelOrder+1 cocok parallel+kurikulum â†’ PROMOTED; tanpa target â†’ NO_TARGET; diexport utk P-2; `PromotionPreviewService.preview()` read-only **via `EnrollmentRepository.findActiveByClasses`** â€” Service TIDAK akses Prisma langsung (revisi Review PO), validasi mode AUTOMATIC / tahun ada / tahun â‰  / fromClassId milik tahun sumber, tanpa tulis apa pun), `p1_decide_smoke/decide.unit.ts`, `p1_preview_smoke/smoke.ts`.
- **Dimodifikasi (revisi PO):** `src/main/repositories/enrollment.repository.ts` (+`findActiveByClasses(classIds, academicYearId)` â€” guard emptyâ†’[], filter status=ACTIVE + leftAt=null, ordered level/parallel/nama, include member+class), `p1_preview_smoke/smoke.ts` (injeksi `EnrollmentRepository`). **TIDAK diubah lainnya:** schema, migration, IPC, preload, bootstrap, UI, Repository lain (bundles identik: main 1,796.83 Â· preload 8.62 Â· renderer 1,006.72 kB).
- **Validation PASS:** (1) `npm run lint`; (2) `npm run build`; (3) unit `decide()` **30/30** (Xâ†’XI, XIâ†’XII, XIIâ†’GRADUATED, NO_TARGET parallel/kurikulum beda, REPEATED, repeat-no-target, **XII+repeat â†’ GRADUATED**, level invalid IX â†’ ERROR, determinisme, pure); (4) smoke preview fresh DB **33/33** (counts, items, per-kelas, read-only [enrollment/run/item/member.status tidak berubah], guard 5 kasus, deterministik); (5) regression E-1 39 Â· E-2 36 Â· E-3 78 Â· E-4 45 Â· MI-1 43 Â· MI-2 37 Â· MI-3 38 Â· MI-4 24; (6) `prisma migrate diff` = empty; (7) grep bundle `promotions:`/`Promotion` = 0 (bukti tidak ada wiring IPC/preload/UI).
- **Revisi Review PO (2 poin):** (1) Service TIDAK boleh akses Prisma langsung â†’ refactor ke `EnrollmentRepository.findActiveByClasses`; (2) analisis RFC menyimpulkan "XII â†’ GRADUATED" tanpa syarat (klausul "kecuali dinyatakan REPEATED" melekat pada validasi "tidak ada yang dipromosikan ke tingkat sama" = anti Xâ†’X/XIâ†’XI, BUKAN XII; Â§6.1 `REPEATED` = "(Xâ†’X)") â†’ GRADUATED menang atas repeat; unit STEP 8 dikembalikan ke ekspektasi GRADUATED (perbaiki implementasi agar mengikuti RFC, jangan ubah test agar mengikuti implementasi).
- **Laporan:** `WORK_ORDER_P1_IMPLEMENTATION_REPORT.md`, `P1_FINAL_REVIEW.md`, `P1_RELEASE_REPORT.md`. Status: **DONE - READY Final Review** (tidak lanjut P-2).

### Pelajaran (retain)
- **`decide()` murni = kontrak P-2.** Input lengkap via `PromotionDecideInput`; tidak boleh membaca DB/state global. Unit "pure" membuktikan determinisme lintas run. P-2 cukup `import { decide }` + jalankan ulang di dalam `$transaction` (RFC Â§7.1 re-validate) â€” jangan pernah re-implement keputusan.
- **XII â†’ GRADUATED menang atas repeat.** "XII â†’ GRADUATED" (RFC Â§7 Mode A) tanpa syarat; REPEATED hanya tinggal kelas di tingkat sama (Xâ†’X, XIâ†’XI, Â§6.1). Urutan decide: invalid â†’ **GRADUATED (order===3)** â†’ repeat â†’ promote. JANGAN ditaruh repeat dulu (hasil analisis Review PO).
- **Pencocokan otomatis parallel+kurikulum:** `findTarget` menyamakan `levelOrder(expected)`, `parallel`, DAN `curriculumId` â€” unique komposit `Class (academicYearId, curriculumId, educationLevel, parallel)` menjamin maksimal 1 match â†’ deterministik tanpa tie-breaker.
- **Service TIDAK boleh akses Prisma langsung** â€” preview baca via `EnrollmentRepository.findActiveByClasses` (pola WO-007C/borrow.service); `getPrisma` hanya untuk transaksi di Repository/base. Buktikan read-only dengan smoke yang membandingkan count sebelum/ sesudah preview.
- **Mode di-preview dikunci AUTOMATIC** untuk P-1 (MAPPING/BULK_EDIT â†’ AppError 400 "belum didukung"); jangan implementasikan resolusi mode lain secara siluman di WO yang salah scope.
- **Review PO bisa mengubah keputusan teknis** â€” dokumentasikan analisis RFC + alasan balik arah di laporan; verifikasi ulang seluruh gate setelah revisi (unit+smoke+regression+lint+build+diff).
- Smoke P-1: compile `p1_decide_smoke/decide.unit.ts` + `p1_preview_smoke/smoke.ts` sekaligus (import `../src/main/services/promotion-preview.service`); unit tanpa DB, preview pakai fresh DB temp `file:C:/...` + `migrate deploy` dari workdir `prisma/`, dibersihkan setelah run.

---

## P-2 (Promotion Execute): executor Mode A SATU transaksi + audit run (COMPLETE - READY Final Review)

### Ringkasan
- Source of Truth: `MASTER_DATA_AKADEMIK_ARCHITECTURE_RFC.md` (LOCKED, Â§7/Â§7.1/Â§8/Â§9) + `MASTER_DATA_AKADEMIK_WBS.md` (LOCKED, WO-22 P-2) + `P2_DISCOVERY_REPORT.md` (APPROVED). Keputusan PO: **eksekusi Mode A satu transaksi all-or-nothing + audit**; WAJIB pakai `decide()` P-1 (dilarang logika keputusan kedua). **TIDAK** IPC/Preload/UI/Reporting/Bulk Operation/Schema/Migration (WBS `promotions:run` di-trim PO â†’ executor saja).
- **File baru (3 source + 1 smoke):** `src/main/services/promotion-execute.service.ts` (`executeAutomatic(input)` â€” validasi mode/tahun/fromClassId; dalam `runTransaction(getPrisma(), ...)` re-validate state TERBARU via `EnrollmentRepository.findActiveByClassesWithTx` + `ClassRepository.findByAcademicYearWithTx`; keputusan via `decide()` (repeat:false); tulis per item â€” PROMOTED/REPEATED: `closeWithTx`â†’`updateStatusWithTx`(ACTIVE)â†’`createActiveWithTx`; GRADUATED: closeâ†’INACTIVE; NO_TARGET/ERROR/REDISTRIBUTED: TANPA mutasi (tetap ACTIVE = retry-able RFC Â§9); lalu `PromotionRepository.createRunWithTx` (run SUCCESS + summary=JSON(counts) + items); return `PromotionRunDTO` via runService), `src/main/services/promotion-run.service.ts` (`findById` â†’ `PromotionRunDTO` 404; `findMany` list + itemCount), `src/main/repositories/promotion.repository.ts` (`createRunWithTx(tx,run,items)` â€” tulis dlm tx service; `findById` run+items; `findMany` paginated).
- **Dimodifikasi (4 source):** `src/shared/dto/promotion.ts` (+`AutomaticPromotionExecuteInput` [mode/fromYearId/toYearId/fromClassId?/runBy?], `PromotionRunDTO`, `PromotionRunItemDTO`, `PromotionRunStatus` SUCCESS/PARTIAL/FAILED), `src/main/repositories/enrollment.repository.ts` (+`findActiveByClassesWithTx`, `closeWithTx` [terminal+leftAt+note], `createActiveWithTx` [status ACTIVE]), `src/main/repositories/class.repository.ts` (+`findByAcademicYearWithTx`), `src/main/repositories/member.repository.ts` (+`updateStatusWithTx` [ACTIVE/INACTIVE]). **TIDAK diubah:** schema, migration, IPC, preload, bootstrap, env.d.ts, UI, EnrollmentService (rule sama dijalankan repo tx methods â€” tidak bisa ikut transaksi execute karena transaksi terpisah), preview, P-1.
- **Validation PASS:** (1) lint; (2) build (main 1,799.72 kB Â· preload 8.62 kB Â· renderer 1,006.72 kB â€” preload/renderer identik = N/A layer lain); (3) smoke P-2 fresh DB **87/87** (Preview==Execute item-identik; re-validate hanya ACTIVE â€” DROPPED tak diproses; mutasi PROMOTED/GRADUATED/NO_TARGET; Member.status sync; invarian satu-ACTIVE; konsistensi run+items; **rollback all-or-nothing** via injeksi gagal `createRunWithTx` setelah close+create â†’ 0 run/0 item + state tak berubah; guard 5 kasus; run ulang hanya proses ACTIVE tanpa duplikasi); (4) regression 10 suite: P-1 decide 30 Â· P-1 preview 33 Â· E-1 39 Â· E-2 36 Â· E-3 78 Â· E-4 45 Â· MI-1 43 Â· MI-2 37 Â· MI-3 38 Â· MI-4 24 (total 490); (5) `prisma migrate diff` = empty; (6) grep `promotions:`/execute/run di renderer+electron = 0.
- **Laporan:** `WORK_ORDER_P2_IMPLEMENTATION_REPORT.md`, `P2_FINAL_REVIEW.md`, `P2_RELEASE_REPORT.md`. Status: **DONE - READY Final Review** (tidak lanjut WO berikutnya, menunggu review PO).

### Pelajaran (retain)
- **Transaksi execute di-orkestrasi Service; Repository menerima `tx`** â€” pola `createManyWithTx`/`findLastMemberNumberByPrefix(tx)`. Service TIDAK akses Prisma langsung; `getPrisma()` hanya untuk `runTransaction`. Re-validate `decide()` HARUS di dalam `$transaction` (RFC Â§7.1/Â§8: keputusan basi tidak pernah dieksekusi â€” baca ulang ACTIVE + kelas target via metode `*WithTx`).
- **Preview == Execute = engine tunggal `decide()`, bukan membandingkan output.** Smoke membuktikan item per item outcome+targetClassId identik. Jangan pernah re-implement keputusan di executor.
- **NO_TARGET/ERROR TIDAK menulis apa pun** â€” enrollment sumber tetap ACTIVE (RFC Â§9 state-based eligibility) sehingga run ulang hanya memproses sisa ACTIVE (terbukti smoke: run2 = sX3+sNoTarget, tanpa duplikasi).
- **`summary` = JSON string counts** (`PromotionPreviewCounts`) di kolom `PromotionRun.summary`; `PromotionRunService` mem-parse ke DTO. Summary hanya dari backend (konsisten WO-2).
- **EnrollmentService tidak bisa dipakai untuk menulis di execute** (tiap method buka transaksi sendiri, Prisma interaktif tak nested) â€” jalankan rule SAMA via repo tx methods (`closeWithTx`/`createActiveWithTx`). Invarian satu-ACTIVE dijaga karena sumber ditutup pada transaksi yang sama sebelum dibuka yang baru.
- **Pitfall smoke:** jangan membuat kelas target tahun-TARGET dengan parallel yang bertepatan dengan kelas sumber paralel "tanpa target" â€” itu secara diam-diam membuat NO_TARGET jadi PROMOTED (STEP 8 guard memakai parallel MERDEKA 7, bukan MERDEKA 9). Hitung ulang total enrollment = seed + ACTIVE baru (enrollment ditutup via UPDATE, tidak pernah DELETE â€” "total 8" bukan 7).
- Smoke P-2: compile `p2_execute_smoke/smoke.ts` + regression bersamaan (`--rootDir . --outDir <tmp>\out <list>`), fresh DB per suite (`migrate deploy` dari workdir `prisma/`), `NODE_PATH=<repo>\node_modules`; bukti rollback via `PromotionRepository.prototype.createRunWithTx` di-override throw lalu dikembalikan (restore di `finally`).

---

## P-3 (Promotion Run History): history READ-ONLY + UI (COMPLETE - READY Final Review)

### Ringkasan
- Source of Truth: `MASTER_DATA_AKADEMIK_ARCHITECTURE_RFC.md` (LOCKED, Â§2.2/Â§9) + `MASTER_DATA_AKADEMIK_WBS.md` (LOCKED) + P-1/P-2 reports. **Catatan:** WBS WO-23 P-3 = "Mapping mode" (beda); WO ini = run history (audit). Keputusan PO: **history READ ONLY** â€” semua data dari `PromotionRun` + `PromotionRunItem` (summary JSON counts); **DILARANG hitung ulang via `decide()`** (history = audit, bukan preview). Kolom 8 counts sesuai Business Rule: Promoted, Graduated, Repeated, Redistributed, **Transferred, Dropped** (default 0 utk AUTOMATIC), No Target, Error.
- **File baru (5 source + 1 smoke):** `src/shared/dto/promotion.ts` (+`PromotionRunSummaryCounts` [8 kolom], `PromotionRunListItemDTO`; `PromotionRunDTO`/`PromotionRunItemDTO` diperluas â€” `fromYearName`/`toYearName`/`memberName`/`sourceClassLabel`/`targetClassLabel`/`counts`), `src/main/repositories/promotion.repository.ts` (`findById` + include `fromYear`/`toYear`/`items.member.fullName` + **batch** lookup class via `in: classIds` â†’ label `"LEVEL PARALLEL"` â€” item TIDAK punya relation ke Class, dilarang query per baris; `findMany` + include tahun + `_count.items`), `src/main/services/promotion-run.service.ts` (mapping audit ke DTO history â€” `parseRunCounts` default 0 per kolom, READ-ONLY tanpa decide()), `electron/ipc/promotion.ipc.ts` (`promotions:findMany`/`promotions:findById`), `electron/preload/promotion.preload.ts`, `src/pages/promotion/PromotionHistoryPage.tsx` (list 13 kolom + badge status + navigate detail), `src/pages/promotion/PromotionRunDetailPage.tsx` (meta run + kartu 8 counts + tabel item), `p3_promotion_history_smoke/smoke.ts`.
- **Dimodifikasi (11):** `electron/ipc/index.ts` (+import +`registerPromotionHandlers` + tipe), `electron/main/bootstrap.ts` (+`PromotionRepository`/`PromotionRunService` â€” **sebelumnya TIDAK ter-wire** karena P-2 di-trim IPC), `electron/preload/index.ts` (+`promotionAPI`), `src/renderer/env.d.ts` (+blok `promotions`), `src/utils/navigation.ts` (+`ROUTES.PROMOTIONS`/`PROMOTION_DETAIL` + `promotionDetailPath`), `src/utils/labels.ts` (+blok `PROMOTION`; typo `STATUS_SUCCCESS`â†’`STATUS_SUCCESS`), `src/components/layout/Sidebar.tsx` (+item "Riwayat Promosi" ikon `TrendingUp`), `src/routes/index.tsx` (+route `/promotions` + `/promotions/:id`). **TIDAK diubah:** schema, migration, `decide()`/preview, `PromotionExecuteService`, `EnrollmentService`, business rule, `MasterTable` (history tidak pakai â€” READ-ONLY tanpa aksi add/edit/delete).
- **Validation PASS:** (1) lint; (2) build (main 1,805.61 kB Â· preload 8.86 kB Â· renderer 1,028.69 kB); (3) smoke P-3 fresh DB **75/75** (list = data run bukan recompute; counts 8 kolom dgn transferred/dropped=0; itemCount=_count.items; urutan startedAt desc; pagination; detail label dari relasi â€” memberName/fullName, sourceClassLabel/targetClassLabel `"LEVEL PARALLEL"`; konsistensi audit groupBy outcome DB == counts; guard 404 AppError; run ke-2 â†’ 2 run urutan terbaru dulu); (4) regression 12 suite fresh DB total **565 PASS** (P-1 decide 30 Â· P-1 preview 33 Â· P-2 87 Â· **P-3 75** Â· E-1 39 Â· E-2 36 Â· E-3 78 Â· E-4 45 Â· MI-1 43 Â· MI-2 37 Â· MI-3 38 Â· MI-4 24); (5) `prisma migrate diff` = "No difference detected" (schema tidak disentuh); (6) grep bundle: main `promotions:findMany`/`promotions:findById`, renderer `Riwayat Promosi`/`Detail Run Promosi` = True.
- **Laporan:** `WORK_ORDER_P3_IMPLEMENTATION_REPORT.md`, `P3_FINAL_REVIEW.md`, `P3_RELEASE_REPORT.md`. Status: **DONE - READY Final Review** (tidak lanjut WO berikutnya, menunggu review PO).

### Pelajaran (retain)
- **History = audit, bukan preview.** Jangan pernah memanggil `decide()` di layer history; seluruh angka diambil dari `summary` (JSON counts yang ditulis P-2) + jumlah baris item. "Preview == Execute" sudah dibuktikan P-2; P-3 cukup membuktikan label/angka BERASAL dari relasi & kolom.
- **`PromotionRunItem` TIDAK punya relation ke `Class`** â€” label kelas harus lewat **batch lookup** (`in: classIds` lalu Map idâ†’`"${educationLevel} ${parallel}"`); dilarang query per baris. Label hanya display; keputusan tetap `outcome`/`targetClassId`.
- **Counts P-3 â‰  kontrak P-2 `PromotionPreviewCounts`** â€” `PromotionRunSummaryCounts` menambah transferred/dropped (default 0) untuk memenuhi 8 kolom Business Rule PO; nilai hanya terisi bila mode lain menuliskannya ke summary. `summary` (kontrak P-2) dipertahankan apa adanya di DTO.
- **`PromotionRunService`/`PromotionRepository` belum ter-wire di bootstrap** pasca P-2 (IPC di-trim PO) â€” WO dengan IPC harus memeriksa bootstrap, bukan menganggap service sudah terdaftar.
- **History UI tidak memakai `MasterTable`** (komponen add/edit/delete); pakai tabel langsung + badge status/outcome, pola `EnrollmentHistoryPage`.
- Smoke P-3: fresh DB per run; run ulang (STEP 5) memproses sisa ACTIVE â€” sNoTarget (NO_TARGET, tetap ACTIVE) + sX3 (PROMOTED) = **2 item**, bukan 1 (pitfall yang sama dgn P-2 STEP 9).

## P-4 (Promotion Operator UI): Preview â†’ Execute â†’ Redirect (COMPLETE - READY Final Review, ter-release)

### Ringkasan
- Scope: workflow operator penuh â€” pilih tahun sumber â†’ tahun tujuan â†’ kelas sumber (opsional, "Semua Kelas") â†’ **Preview** â†’ kartu counts + tabel hasil â†’ **Execute** â†’ **redirect otomatis ke Promotion Run Detail**. Renderer TIDAK punya business rule: payload `{mode:'AUTOMATIC', fromYearId, toYearId, fromClassId?}` diteruskan apa adanya ke channel; seluruh keputusan via `decide()` (engine tunggal P-1).
- **File baru (2):** `src/pages/promotion/PromotionPage.tsx` (dropdown tahun/kelas dari `academicYears.findMany` + `classes.findMany` fetch-all loop 100 + filter client-side per tahun sumber; default tahun sumber = aktif; preview/execute â†’ `api.promotions.*`; hasil = 6 kartu counts + tabel items `sourceLabel`/`targetLabel`/`outcome`/`message`; execute sukses â†’ `navigate(promotionDetailPath(run.id))`; error â†’ `alert(err.message)`), `p4_operator_ui_smoke/smoke.ts` (37/37).
- **Modifikasi (9):** `electron/ipc/promotion.ipc.ts` (+`promotions:preview`â†’`previewService.preview`, +`promotions:execute`â†’`executeService.executeAutomatic`; signature â†’ objek `{runService, previewService, executeService}`), `electron/preload/promotion.preload.ts` (+`preview`/`execute`), `electron/ipc/index.ts` + `electron/main/bootstrap.ts` (**wiring** â€” instantiasi `PromotionPreviewService`/`PromotionExecuteService` yang SEBELUMNYA belum ter-wire pasca P-2 di-trim IPC), `src/renderer/env.d.ts` (+2 channel), `src/routes/index.tsx` (+route `promotions/run`), `src/components/layout/Sidebar.tsx` (+"Promosi" ikon `PlayCircle` di atas "Riwayat Promosi"), `src/utils/navigation.ts` (+`PROMOTION_RUN`), `src/utils/labels.ts` (+blok `PROMOTION_OPERATOR`).
- **TIDAK diubah:** `decide()`, `PromotionPreviewService`, `PromotionExecuteService`, `EnrollmentService`, business rule, schema, migration (service hanya di-instantiasi & dipanggil lewat IPC).
- **Validation PASS:** lint; build (main 1,817.22 kB Â· preload 9.02 kB Â· renderer 1,045.33 kB); smoke P-4 **37/37** fresh DB (preview semua kelas 4 items [promoted 2/graduated 1/noTarget 1/error 0], preview per-kelas `fromClassId` â†’ 1 item + sourceLabel `"X MERDEKA 1"`, **Preview==Execute** item-identik outcome+target + `run.summary==preview.counts`, detail run + muncul di riwayat, guard 400/404 AppError 3 kasus, re-execute â†’ 1 item NO_TARGET); regression 13 suite **602 PASS** (p1-30 p1prev-33 p2-87 p3-75 **p4-37** e1-39 e2-36 e3-78 e4-45 mi1-43 mi2-37 mi3-38 mi4-24); `prisma migrate diff` no-drift; grep bundle main/preload `promotions:preview`/`promotions:execute` + renderer `Eksekusi Promosi`/`Tahun Ajaran Sumber`/`Semua Kelas`; grep business-rule di `src/pages/promotion` = 0 (satu match = komentar).
- **Commit:** `2624aee..<HEAD>` (satu commit final P-4, di-push). Working tree bersih.
- **Laporan:** `WORK_ORDER_P4_IMPLEMENTATION_REPORT.md`, `P4_FINAL_REVIEW.md`, `P4_RELEASE_REPORT.md`.
- **Status: DONE - READY Final Review** (tidak lanjut WO berikutnya).

### Pelajaran (retain)
- **IPC handler promotion menjadi 3 service** (`runService`/`previewService`/`executeService`) â€” signature `registerPromotionHandlers(services)`; pembungkus `preview`/`execute` MURNI (validasi input type-aman lewat DTO shared, lalu langsung panggil service). Renderer kirim `{mode:'AUTOMATIC', ...}` â€” mode adalah konstanta kontrak (satu-satunya mode didukung P-1/P-2), bukan keputusan UI.
- **Preview == Execute = engine tunggal `decide()`, dibuktikan dengan membandingkan output item per item** (outcome + targetClassId) dan `run.summary == preview.counts` â€” bukan dengan membandingkan kode.
- **Redirect pasca execute** ke `promotionDetailPath(run.id)` (P-3) menghubungkan operator UI â†’ history detail; `execute` mengembalikan `PromotionRunDTO` (id), renderer tidak menghitung apa pun.
- **Bootstrap & IPC adalah dua hal terpisah yang wajib di-cek**: P-2 di-trim IPC sehingga `PromotionRunService`/`PromotionRepository` hanya ter-wire di P-3; P-4 menambah `PromotionPreviewService`/`PromotionExecuteService` â€” verifikasi `Services` type + objek return + handler map sekaligus.
- **Class list filter client-side** (bukan keputusan akademik): `classes.findMany` fetch-all loop 100, filter `academicYearId === fromYearId` untuk dropdown; `fromClassId` di-omit saat "Semua Kelas" (kontrak service: opsional = seluruh kelas tahun sumber).
- **Smoke P-4 seed berbeda dari P-3** (4 member, kelas src X/XI/XII/X9) â†’ re-execute hanya sisa ACTIVE (sNoTarget NO_TARGET) = **1 item**; jangan copy ekspektasi P-3 (2 item) â€” pitfall serupa P-2 STEP 9 / P-3 STEP 5.
- Grep bundle vs source: di bundle minified, properti API bisa berubah nama â€” gunakan **string channel** (`promotions:preview`), bukan bentuk `promotions.preview`; source grep tetap memakai bentuk properti.

## P-5 (Promotion Finalization): Audit FINAL + Milestone Promotion DITUTUP (COMPLETE - APPROVED & RELEASED)

### Ringkasan
- WO P-5 = audit final **DISCOVERY ONLY / READ ONLY** atas seluruh Promotion Module (Mode A) â€” **tidak ada fase implementation**. `P5_DISCOVERY_REPORT.md` **disetujui Product Owner**; hasil menyatakan Mode A production-ready, tidak perlu implementasi tambahan.
- **Verifikasi 6 mandat (semua PASS):** (1) **Single Decision Engine** â€” `decide()` didefinisikan persis 1Ã— di `promotion-preview.service.ts:25`, dipakai preview (`:161`) & execute (`:115`, re-validate dlm `$transaction`); history (`PromotionRunService`) TIDAK memanggil decide â€” baca kolom `summary` (by-design RFC Â§8/Â§9); (2) **tanpa business rule di renderer** â€” grep simbol domain di `src/pages/promotion` = 1 komentar; (3) **tanpa akses Prisma langsung dari service Promosi** â€” 0 `\.prisma\.` di `src/main/services`; `getPrisma()` hanya utk `runTransaction`; (4) **tanpa duplicate decision logic** â€” satu-satunya komputasi outcome = `decide()` (`OUTCOME_COUNT_KEY` = pemetaan counts, bukan keputusan); (5) **PromotionRun/Item immutable audit** â€” satu-satunya tulis = `PromotionRepository.createRunWithTx` (create+createMany); 0 update/delete di source; FK RESTRICT tanpa `@updatedAt`; (6) **dependency P-1..P-4 terpenuhi** (regression 13 suite 602 PASS).
- **Debt dicatat (bukan blokir):** single-flight guard eksekusi (RFC Â§9 #5) belum ada di IPC (UI sudah mencegah; SQLite serial); duplikasi agregasi counts (preview switch vs `OUTCOME_COUNT_KEY`); `DatabaseReconciliationService` akses Prisma langsung (pre-existing, luar module Promosi); Mode MAPPING/BULK_EDIT + UI mapping (WBS P-3/P-5b) = WO masa depan (saat ini ditolak AppError 400).
- **Validation:** 13 suite fresh DB 602 PASS Â· lint PASS Â· build PASS (main 1,817.22 Â· preload 9.02 Â· renderer 1,045.33 kB) Â· `prisma migrate diff` no-drift Â· working tree bersih.
- **Commit:** `<HEAD>` (SATU FINAL COMMIT dokumentasi â€” hanya AGENTS.md + P5 laporan; TANPA perubahan source), di-push.
- **Laporan:** `P5_DISCOVERY_REPORT.md`, `P5_FINAL_REVIEW.md`, `P5_RELEASE_REPORT.md`.
- **Status: APPROVED & RELEASED. Milestone Promotion (Mode A: P-1â†’P-2â†’P-3â†’P-4â†’P-5) DITUTUP.** Berpindah ke **Integration Testing**.

### Pelajaran (retain)
- **Audit final (P-5) = bukti silang mandat, bukan hanya smoke.** Verifikasi mandat memakai grep source (`decide(` = 1 implementasi; `\.prisma\.` = 0 di services; `promotionRun*.update/delete` = 0 di app source) + inspeksi alur (preview/execute share `decide()`; history baca `summary`) + regression. Grep membuktikan ketiadaan, bukan hanya kehadiran.
- **History promosi TIDAK boleh memanggil `decide()`** â€” history = audit (baca `summary`/items yang ditulis execute). "Preview == Execute = engine tunggal" dibuktikan di P-2/P-4; P-3/P-5 hanya membuktikan angka BERASAL dari kolom audit.
- **Immutability audit record**: cek kode (hanya `createRunWithTx`) DAN schema (tanpa `@updatedAt`, FK default RESTRICT â†’ hapus Member/AcademicYear yang dirujuk run diblokir). Tidak ada update/delete path di layer mana pun.
- **WO audit-readonly selesai tanpa fase implementation** â†’ rilis = SATU FINAL COMMIT dokumentasi (laporan + AGENTS.md saja), TIDAK menyentuh source. Ini menjaga riwayat git bersih per WO.
- **Penutupan milestone**: P-5 menutup rantai P-1..P-5 (Mode A). WO masa depan untuk Mode B/C (MAPPING/BULK_EDIT) + single-flight guard tercatat sebagai backlog, bukan bagian milestone ini.

---

## WO-21 (B1/B2 Import Fix): Import Buku â€” Per-Baris Atomic + Hasil Per-Baris (COMPLETE - READY review PO)

### Ringkasan
- Keputusan user: perbaiki bug UAT `SPRINT10_WO3_UAT_REPORT.md` â€” **B1** (baris gagal tidak tampil ke user) & **B2** (orphan AutoCreate: entitas dibuat walau baris import gagal).
- **B2 fix â€” atomic per baris:** `AutoCreateService.apply()` + cache `created` **dihapus**; API baru `resolveRow(row, tx)` menerima `Prisma.TransactionClient` (candidate cocok dipakai; entity baru dibuat dlm tx; race `P2002` â†’ fallback `findExactWithTx`; SKIPPED/AMBIGUOUS â†’ `resolvedEntity = null`). `BookImportService.createBookWithCopies()` = SATU `runTransaction` per baris: `resolveRow` â†’ `book.createWithTx` â†’ `InventoryAllocator.allocate(tx, copyCount)` â†’ `createManyWithTx` (barcode=inventoryNumber; shelfLocation/acquisitionSource/acquisitionDate/acquisitionCost dipertahankan). Baris gagal â†’ rollback â†’ **0 tulisan DB** â†’ tidak ada orphan.
- **B1 fix â€” hasil per-baris:** `imports:match` kini mengembalikan **`ImportResultDTO`** `{totalRows, importedBooks, importedCopies, failedRows: {rowNumber, messageKey}[]}`; renderer me-render langsung dari DTO. Guard baru: AMBIGUOUS, `titleMissing`, `isbnDuplicate` (pre-check `existsByISBN`), `copyCreateFailed` (copyCount non-integer/<1/>100, default 1), `entityMissing`, `createFailed`. Retry `P2002` inventory 3Ã— (retry transaksi baris penuh).
- **File:** `src/types/import.ts` (+DTO), `auto-create.service.ts` (rewrite), `book-import.service.ts` (rewrite), `author/publisher/category.repository.ts` (+`createWithTx`/`findExactWithTx`), `electron/ipc/book-import.ipc.ts` (handler 2 arg: matchingEngine, bookImportService), `electron/ipc/index.ts`, `electron/main/bootstrap.ts` (`new BookImportService(..., autoCreateService)`), `src/renderer/env.d.ts`, `BookImportPreviewPage.tsx`, `utils/bookImport.ts` (`computeImportResultSummary` dihapus).
- **TIDAK diubah:** schema, migration, `InventoryAllocator`, matching/validation engine, import UI dialog flow, member import.
- **Validation PASS:** lint; build (main 1,818.41 kB Â· preload 9.02 kB Â· renderer 1,044.59 kB); smoke `wo21_import_b1b2_smoke/smoke.ts` **48/48 PASS** fresh DB (S1 copyCount 2, S5b/s5 isbnDuplicate tanpa orphan, S7 entityMissing, S6 titleMissing, S10 reuse+baru, default copy 1, invariant `sum importedBooks==DB books` & `sum importedCopies==DB copies`, semua failedRows punya rowNumber); `prisma migrate diff` = "No difference detected"; grep `.apply(`/`computeImportResultSummary`/cache `created` di src+electron = 0.
- **Laporan:** `WORK_ORDER_WO21_B1B2_IMPORT_FIX_REPORT.md`, `WO21_FINAL_REVIEW.md`, `WO21_RELEASE_REPORT.md`. Status: **DONE â€” menunggu review PO** (tidak lanjut WO berikutnya).

### Pelajaran (retain)
- **Orphan AutoCreate = penulisan entity di luar transaksi baris.** Solusi: seluruh AutoCreate/Book/BookCopy dalam SATU `runTransaction` per baris; API `resolveRow(row, tx)` menggantikan `apply()`; **jangan cache `created` antar-baris** â€” pembacaan transaksi terkini (commit per baris) mencegah duplikasi entity.
- **`imports:match` TIDAK pernah throw utk kegagalan baris** â€” kembali dikonfirmasi; kini DTO memuat `failedRows` per-baris (`rowNumber` selalu non-null; error ber-rowNumber null diabaikan di aggregasi).
- **Guard `copyCount` pindah ke service** (1..100, default 1, error `copyCreateFailed`) â€” renderer tidak menghitung business logic; DTO `importedCopies` = jumlah copy DB yang benar-benar dibuat (bukan baris Ã— count).
- **Retry P2002 inventory** = retry SELURUH transaksi baris (bukan hanya `allocate`); non-P2002 â†’ throw â†’ baris gagal (bukan crash seluruh import).
- **Pola `createWithTx`/`findExactWithTx`** (repo menerima `tx`) = perluasan dari `createManyWithTx`/`createRunWithTx` (P-2) â€” Service memegang orkestrasi transaksi, repo hanya eksekusi per-kolom tx.
- Smoke wo21 memakai fresh DB temp + `prisma migrate deploy` (workdir `prisma/`) dan dibersihkan; DB live dev tidak pernah disentuh.

---

## IT-1 (Borrow/Return Transaction Integrity): Single Status Authority + Atomic Guards (COMPLETE - READY review PO)

### Ringkasan
- Source of Truth: `IT1_DISCOVERY_REPORT.md` (APPROVED) + 5 keputusan PO. Scope: **transisi status `BookCopy` disatukan ke satu otoritas**, `HILANGâ†’LOST`, `BORROWEDâ†’REMOVED` ditolak, seluruh mutasi status pindah ke stack baru (`src/main/`, satu PrismaClient).
- **File baru (4):** `src/shared/config/book-copy-status.ts` (SATU otoritas: `BOOK_COPY_STATUS` 4 nilai + `ALLOWED_STATUS_TRANSITIONS` matriks + `canTransitionStatus()` â€” leaf node, pola config F1), `electron/main/shared/book-copy-status.ts` (shim backward-compat untuk legacy `addCopies`), `src/main/services/book-copy.service.ts` (`BookCopyService` baru: `findByBarcode()` + `decommissionCopy()` dengan guard BORROWEDâ†’REMOVED ditolak + canTransitionStatus + delete/REMOVED logic), `it1_borrow_return_smoke/smoke.ts` (**34/34 PASS**: double-borrow atomic, decommission guards, HILANGâ†’LOST, no-resurrection, matriks transisi).
- **Dimodifikasi (5):** `src/main/repositories/book-copy.repository.ts` (+`findByIdWithHistory()`, +`updateStatusIf(id, fromStatus, toStatus)` guarded write via `updateMany` berpredikat), `src/main/repositories/borrow.repository.ts` (`createWithItems`: atomic guard AVAILABLEâ†’BORROWED via `updateMany` berpredikat + count check â†’ all-or-nothing rollback; `processReturn`: guarded status transition via `canTransitionStatus` + predikat status â€” HILANGâ†’LOST, selainnyaâ†’AVAILABLE, REMOVED tidak pernah kembali AVAILABLE), `electron/main/services/book-copy.service.ts` (hapus `ALLOWED_TRANSITIONS`, `validateStatusTransition`, `updateStatus`, `updateCondition`; `decommissionCopy` jadi throwing stub), `electron/ipc/book-copy.ipc.ts` (rewire `decommissionCopy` â†’ `newBookCopyService`), `src/components/books/BookDetail.tsx` (error surfacing `try/catch` + `window.alert(message)`).
- **Validation PASS:** (1) `npm run lint` (tsc node+web); (2) `npm run build` (main 1,819.24 kB Â· preload 9.02 kB Â· renderer 1,044.75 kB); (3) `prisma migrate diff --exit-code` = "No difference detected"; (4) `it1_borrow_return_smoke` **34/34 PASS** (fresh DB): double-borrow service guard, atomic in-tx rollback all-or-nothing, decommission BORROWED rejected, return normalâ†’AVAILABLE, HILANGâ†’LOST + conditionBack HILANG, decommission LOSTâ†’REMOVED, decommission AVAILABLE no-historyâ†’DELETE, decommission AVAILABLE with-historyâ†’REMOVED, return REMOVED no-respiration, return not-borrowed rejected, 10 transition matrix unit cases; (5) `wo14_e2_smoke` **36/36 PASS** (unmodified regression).
- **Laporan:** `IT1_FINAL_REVIEW.md`, `IT1_RELEASE_REPORT.md`. Status: **DONE â€” menunggu review PO** (tidak lanjut WO berikutnya).

### Pelajaran (retain)
- **Atomic borrow guard di dalam transaksi**: `createWithItems` memindahkan `updateMany` berpredikat `status: AVAILABLE` ke SETELAH `borrow.create + detail.createMany`. Bila `count !== items.length`, throw â†’ Prisma rollback seluruh tx â†’ tidak ada Borrow/Detail parsial, tidak ada resurrection REMOVED/LOST. Pre-tx `findById` (service) tetap ada sebagai fast-fail advisory.
- **Decommission policy**: AVAILABLE tanpa history â†’ `delete`; AVAILABLE/LOST dengan history â†’ `updateStatusIf(REMOVED)`; BORROWED â†’ AppError 400 "sedang dipinjam". Pola `delete` vs `updateStatusIf` = reuse perilaku legacy yang benar.
- **No-resurrection**: `processReturn` hanya menulis status bila `canTransitionStatus(current, target)` TRUE â†’ REMOVED tidak pernah kembali AVAILABLE (REMOVEDâ†’AVAILABLE tidak ada di matriks). Guard predikat `updateMany({ where: { id, status: currentCopy.status } })` concurrent-safe tanpa lock.
- **Config leaf node** (`src/shared/config/book-copy-status.ts`) = pattern konsisten dengan `academic-status.ts`, `member-type.ts`, `education-level.ts`. Importable dari `src/main/` (tsconfig.node) dan `src/renderer/` (tsconfig.web) tanpa cyclic.
- **Cross-boundary import `AppError`** dari `electron/main/errorHandler` ke `src/main/repositories/borrow.repository.ts` â€” pola existing, bukan baru. `AppError` adalah class murni (tanpa import Electron) sehingga aman dijalankan di smoke node.
- **Smoke atomic guard**: bypass pre-tx service check dengan memanggil `borrowRepository.createWithItems` langsung â€” satu-satunya cara menguji rollback all-or-nothing (pre-tx guard memblokir sebelum tx).
- **Smoke no-resurrection**: simulasi legacy dirty data via `prisma.bookCopy.update({ status: REMOVED })` langsung pada copy yang punya active detail, lalu `returnBook` â†’ status tetap REMOVED.

---

## IT-1 HOTFIX: Borrow Member Status Eligibility (COMPLETE - READY review PO)

### Ringkasan
- **Root Cause:** `BorrowService.create` memakai `member.status !== 'ACTIVE'` sebagai guard peminjaman, tetapi `Member.status` bukan sumber otoritas eligibility peminjaman â€” SISWA eligibility ditentukan oleh `MemberEnrollment.status=ACTIVE`.
- **Business Rules (PO Approved):** SISWA â†’ wajib punya Enrollment ACTIVE; GURU/UMUM â†’ tidak butuh enrollment; Unknown MemberType â†’ DITOLAK (Validation Error, bukan dianggap General).
- **Modifikasi (2 source):** `src/main/services/borrow.service.ts` (ganti `member.status` check â†’ `getMemberType()` + `enrollmentService.findActiveByMember()`; unknown type â†’ AppError 400), `src/pages/BorrowingsPage.tsx` (`'active'` â†’ `'ACTIVE'` badge fix).
- **Regression Updated:** `wo14_e2_smoke/smoke.ts` (STEP 9: teacher dgn classId legacy; STEP 10: message baru), `it1_borrow_return_smoke/smoke.ts` (seed tambah enrollment untuk student).
- **Validation PASS:** (1) smoke 7/7 (7 mandatory cases: ACTIVE/GRADUATED/TRANSFERRED/DROPPED/teacher/general/unknown); (2) regression wo14_e2 36/36 + it1 34/34 = **77 PASS total**; (3) lint PASS; (4) build PASS (main 1,819.55 kB Â· preload 9.02 kB Â· renderer 1,044.75 kB); (5) `prisma migrate diff` = "No difference detected".
- **Laporan:** `IT1_BORROW_ELIGIBILITY_FINAL_REVIEW.md`, `IT1_BORROW_ELIGIBILITY_RELEASE_REPORT.md`. Status: **DONE â€” menunggu review PO**.

### Pelajaran (retain)
- **`Member.status` bukan otoritas eligibility peminjaman.** SISWA eligibility = `MemberEnrollment.status=ACTIVE` (enrollment-based). Guru/Umum tidak membutuhkan enrollment.
- **Unknown `MemberType` harus ditolak eksplisit** â€” `getMemberType()` mengembalikan `null`; BorrowService menolak sebelum cek enrollment.
- **Case-sensitive badge UI** â€” `BorrowingsPage.tsx` harus pakai `'ACTIVE'` (bukan `'active'`).
- **Regression yang pakai `BorrowService` wajib seed enrollment untuk student** â€” dua regression smoke harus di-update.

---

## WO 22A: Backfill Execution ï¿½ Development Database (COMPLETE - READY review PO)

### Ringkasan
- **Eksekusi scripts/backfill-member-enrollment.ts pada Development Database** prisma/aplibrary.db (WO 3 F2b dibuat di commit 195cd5, ikut rilis Milestone A 521824, TIDAK PERNAH dijalankan). Menutup gap migrasi: 0 MemberEnrollment ? 395.
- **Hasil PERSIS prediksi plan:** membersWithClassId 395, enrollmentsCreated **395**, skippedAlreadyActive **0**, orphanMembers **0**, totalEnrollments 395. Semua status='ACTIVE', leftAt=null, cademicYearId konsisten dengan kelas (tahun 2026/2027). Duplicate (ACTIVE>1 per member) = 0. Invarian satu-ACTIVE = 0 pelanggaran.
- **Preflight:** app Electron/node repo di-stop (persetujuan PO); DATABASE_URL absolute ile:D:/.../prisma/aplibrary.db; preflight read-only 395/395 classId, 13/13 kelas resolve, 0 orphan, 0 enrollment.
- **Backup:** ackup/backfill-20260804/aplibrary.db (integrity_check=ok; hanya .db ï¿½ tanpa -wal/-shm karena app mati).
- **Eksekusi:** compile 
px tsc --module commonjs --target es2022 --moduleResolution node --esModuleInterop --skipLibCheck --outDir <tmp>/out scripts/backfill-member-enrollment.ts; run dgn DATABASE_URL + NODE_PATH=<repo>\node_modules; output created 395 / skipped 0 / orphan 0.
- **Member.classId & Member.status TIDAK berubah** ï¿½ fingerprint SHA-256 (id|classId|status) backup vs live IDENTIK (eb5392aï¿½). Status tetap 395ï¿½ INACTIVE (ekspektasi: Membership ? Academic; alignment = Architecture Backlog).
- **Blocker teratasi:** S-000140 Finza kini enrollment XI Merdeka 4 / 2026/2027 (ACTIVE) ? guard borrow eligibility (IT-1) lolos.
- **Validation PASS:** (1) data validation (395/0/0/0); (2) smoke regression 11 suite fresh temp DB = **488/488 PASS** (Borrow: it_borrow_eligibility 7 + it1_borrow_return 34 + wo14_e2 36; Promotion: p1 33 + p2 87 + p3 75 + p4 37; Import: wo19_mi3 38 + wo20_mi4 24; Enrollment: wo13_e1 39 + wo15_e3 78); (3) 
pm run lint PASS; (4) 
pm run build PASS (main 1,819.55 kB ï¿½ preload 9.02 kB ï¿½ renderer 1,044.75 kB ï¿½ identik baseline IT-1, TANPA perubahan kode); (5) prisma migrate diff --from-migrations & --from-url (dev DB) = "No difference detected" (exit 0); (6) migrate status up to date (4 migrations).
- **Laporan:** BACKFILL_EXECUTION_REPORT.md, BACKFILL_FINAL_REVIEW.md, BACKFILL_RELEASE_REPORT.md. AGENTS.md + .gitignore (+ackup/).
- **Status: DONE ï¿½ menunggu review PO.** Selanjutnya per PO: Validation ? ? Integration Test ? UAT ? kembali ke Member.status Alignment (backlog).

### Pelajaran (retain)
- **Eksekusi migrasi satu-kali ? rilis kode.** Script backfill sudah di-commit & dirilis sejak Milestone A, tetapi DB tidak pernah di-backfill (0 enrollment) sampai WO 22A. Rilis kode tidak menjamin data ter-migrasi.
- **Eksekusi backfill:** 1) stop app; 2) preflight read-only (bandingkan dengan prediksi plan); 3) backup DB + PRAGMA integrity_check; 4) compile script (--outDir temp) + run SATU proses dengan DATABASE_URL absolute + NODE_PATH=<repo>\node_modules; 5) validasi dengan **fingerprint** tabel yang HARUS tidak berubah (backup vs live) ï¿½ bukti definitif, bukan sekadar hitung ulang.
- **Fingerprint field tak-terubah:** SHA-256 dari (id|classId|status) seluruh member, dihitung pada backup dan live, dibandingkan identik ? membuktikan backfill hanya menambah baris dan tidak menyentuh kolom yang dilarang.
- **Smoke suite fresh DB per run:** compile batch --rootDir . --outDir <tmp>\out (struktur $out\<wo>_smoke\smoke.js), fresh DB per suite (Remove-Item *.db* ? prisma migrate deploy workdir prisma/), run dgn DATABASE_URL absolute + NODE_PATH.
- **Backup DB berisi data personal** ? jangan commit; tambahkan ackup/ ke .gitignore.
- **Verifikasi member "eligible" setelah backfill** via sampling service-level (enrollment ACTIVE ada), bukan hanya count baris.

---

## WO-1 (Borrow Card): Template & Data Contract (COMPLETE - READY review PO)

### Ringkasan
- Source of Truth: `BORROW_RECEIPT_DESIGN_AMENDMENT.md` (FINAL DESIGN DECISION) + Discovery/Architecture/Wireframe. WO berdiri sendiri **tanpa wiring** (belum ada Preview/Print/PDF â€” itu WO-2..4).
- **File baru (3 source + 1 smoke):** `src/shared/config/borrow-status.ts` (`BORROW_STATUS` config leaf: ACTIVEâ†’AKTIF/badge-active, RETURNEDâ†’DIKEMBALIKAN/badge-returned, OVERDUEâ†’TERLAMBAT/badge-overdue; `borrowStatusConfig` fallback label-raw+badge-neutral; `deriveBorrowStatus(returnDate, dueDate, now)` pure â€” D9), `src/shared/dto/borrow-card.ts` (`BorrowCardData` = header/member/borrow/books[]/footer; semua string siap-render â€” D5), `src/main/services/borrow-card.service.ts` (**engine**: layout 110Ã—60mm, `escapeHtml`, `initialsOf`, `generateAvatarPlaceholderSvg` (D6), `generateLogoMonogramSvg`+`generateBookIconSvg` (D13), `paginateBorrowCard`/`generateBorrowCardPages` (D10/R4), template TUNGGAL `generateBorrowCardHtml` (D2/D4), assembler `buildBorrowCardData` (D5)), `borrow_card_wo1_smoke/smoke.ts` (**101/101 PASS** murni, tanpa DB/Electron).
- **Dimodifikasi (1):** `src/main/services/barcode.service.ts` (+`generateQrCodeSvg` bcid `qrcode` bwip-js, scale 4, no text, padding 4, viewBox 264Ã—264 â€” D8). **TIDAK diubah:** BorrowService/Repository/schema/migration/IPC/preload/bootstrap/env.d.ts/UI.
- **Keputusan desain kunci:** QR payload = `borrowing.id` UUID (D7, bukan borrowNumber); **auto pagination tanpa "+N lainnya"** â€” kapasitas baris buku halaman 1 = `floor((60âˆ’6âˆ’42)/3.4)` = **3**, lanjutan = `floor((60âˆ’6âˆ’18)/3.4)` = **10** (memenuhi MAX_BOOKS=20 â†’ 1 kartu utama + 2 lanjutan); halaman lanjutan header ringkas + label "LANJUTAN" + footer diulang (setiap halaman dokumen sah, R4); avatar = inisial SVG (Member TIDAK punya kolom foto di schema, D6); logo = data URI â†’ monogram â†’ ikon buku (D13); tanggal format DD-MM-YYYY.
- **Separasi arsitektur:** assembler (baca relasi/fetch data, lookup memberTypeLabel, fallback snapshot memberName/memberNumber/bookTitle, logo via dependency-injected `readFileAsDataUri`) â†’ `BorrowCardData` â†’ template PURE `dataâ†’HTML` (tidak menyentuh DB/Electron). Template adalah satu-satunya sumber Preview/Print/PDF.
- **Validation PASS:** smoke WO-1 101/101; regression borrow fresh DB `it1_borrow_return` 34/34 + `it_borrow_eligibility` 7/7 + `wo14_e2` 36/36 = **77 PASS**; `npm run lint` PASS; `npm run build` PASS (**bundle IDENTIK baseline IT-1** main 1,819.55/preload 9.02/renderer 1,044.75 kB = bukti tanpa wiring); `prisma migrate diff` = "No difference detected".
- **Laporan:** `WORK_ORDER_BORROW_WO1_IMPLEMENTATION_REPORT.md`, `BORROW_WO1_FINAL_REVIEW.md`, `BORROW_WO1_RELEASE_REPORT.md`. Status: **DONE - menunggu review PO** (tidak lanjut WO-2 Preview).

### Pelajaran (retain)
- **Compile smoke yang mengimpor `bwip-js`:** pakai `--module node16 --moduleResolution node16` (bukan `node`) karena paket memakai conditional exports (TS2307 "could not be resolved"); jalankan hasil `.js` dengan `NODE_PATH=<repo>\node_modules` karena output di temp di luar repo. Ini MELENGKAPI pola `commonjs+node` yang dipakai smoke lain yang tidak menyentuh bwip-js.
- **Kapasitas baris buku = fungsi murni layout mm** â€” pagination deterministik karena CSS pakai mm yang sama (`bookRowHeightMm 3.4`); jangan hardcode jumlah baris.
- **QR = `borrowing.id` (UUID)**, bukan borrowNumber; nilai QR bergantung pada payload (smoke: dua payload â†’ SVG berbeda).
- **Config status badge** (`BORROW_STATUS`) = pola config leaf yang sama dengan `academic-status`/`member-type`/`book-copy-status`; template memetakan label+class via config, unknown code â†’ fallback label-raw + badge-neutral (tidak pernah crash).
- **Assembler murni dengan deps di-inject** (`readFileAsDataUri`) â†’ logo gagal baca = fallback monogram; logoPath kosong = fallback; relasi member kosong = fallback snapshot kolom â€” seluruhnya diuji smoke.
- **WO berdiri sendiri = bukti bundle identik**: jika suatu fitur tidak me-wire IPC/preload/UI, bundle main/preload/renderer harus BYTE-identik dengan baseline â€” jangan sampai ada perubahan siluman.
- WO-1 adalah pondasi: Preview (WO-2), Cetak (WO-3), PDF (WO-4) akan memanggil `generateBorrowCardHtml`/`buildBorrowCardData` TANPA modifikasi template.

---

## WO-2 (Borrow Card Preview): Preview UI + Print + PDF (COMPLETE - READY review PO)

### Ringkasan
- Source of Truth: `BORROW_PREVIEW_DESIGN_AMENDMENT.md` (FINAL PREVIEW DESIGN DECISION F1â€“F13) + Discovery/Wireframe/Architecture. Scope: **Preview UI + wiring 3 channel print/PDF**. **TIDAK** mengubah `BorrowCardService` (engine WO-1), `BorrowService`, Repository, schema/migration.
- **File baru (2 + 1 smoke):** `src/pages/BorrowReceiptPreviewPage.tsx` (route `borrowings/:id/receipt-preview`; zoom `clampZoom` MIN 0.5/MAX 2.0/step 0.1; **Fit Width** `min(1,(viewportWâˆ’48px)/sheetW)` + re-fit saat resize + `fitModeRef`; **Ctrl+Wheel** `addEventListener('wheel',â€¦,{passive:false})`+`preventDefault()` Â±0.1/notch; scroll-based active page tanpa IntersectionObserver; chip `Halaman {x} / {y}` + chevron prev/next hanya bila `totalPages>1`; tombol Cetak (system dialog non-silent, halaman tetap terbuka, sukses silent/error alert); Simpan PDF (`PDF_SAVED` + path); Tutup â†’ `navigate(-1)`; `dangerouslySetInnerHTML` pada `.preview-sheet`), `wo2_borrow_card_preview_smoke/smoke.ts` (**21/21 PASS** fresh DB).
- **Dimodifikasi (7):** `electron/main/services/print.service.ts` (**+5 metode**: `buildBorrowCardHtml(borrowingId)` Promise.all findById+settings â†’ 404 AppError "Data peminjaman tidak ditemukan." â†’ `buildBorrowCardData(â€¦,{readFileAsDataUri})`+`generateBorrowCardHtml`; `getBorrowCardPreviewHtml`; `printBorrowCard` â†’ `printHtml(html,{margins:{marginType:'none'}})`; `saveBorrowCardPdf` â†’ `renderPdf` (hidden BrowserWindow `contextIsolation:true,nodeIntegration:false`, `printToPDF({printBackground:true})`, did-fail-load reject) â†’ `dialog.showSaveDialog` defaultPath documents â†’ `writeFile` â†’ `{saved,filePath}`/`{saved:false}`; **+helper murni** `buildBorrowCardPdfFilename` sanitize `/[<>:"/\\|?*\u0000-\u001f]/g` + collapse spasi + fallback `'PEMINJAMAN'`/`'Anggota'` + truncate 40; `readFileAsDataUri` map `IMAGE_MIME`), `electron/ipc/print.ipc.ts` (+`printing:borrowCardPreview`/`borrowCard`/`borrowCardPdf`), `electron/preload/print.preload.ts` (+`print.borrowCardPreview`/`borrowCard`/`borrowCardPdf`), `src/renderer/env.d.ts`, `src/utils/labels.ts` (+blok `RECEIPT_PREVIEW`), `src/utils/navigation.ts` (+`BORROW_RECEIPT_PREVIEW` + `receiptPreviewPath`), `src/routes/index.tsx` (+route), `src/pages/BorrowingsPage.tsx` (navigate ke preview setelah `create()` sukses; kotak hijau legacy tetap).
- **TIDAK diubah:** schema/migration, `BorrowCardService`/template, `BorrowService`/`ReturnService`, Repository, DTO, config, channel print legacy.
- **Validation PASS:** smoke WO-2 21/21; regression borrow fresh DB `borrow_card_wo1` 101/101 + `it1_borrow_return` 34/34 + `it_borrow_eligibility` 7/7 + `wo14_e2` 36/36 = **199 PASS**; lint PASS; build PASS (main 1,837.03 kB Â· preload 9.34 kB Â· renderer 1,059.12 kB `index-DQyuiP9T.js`); `prisma migrate diff` = "No difference detected"; grep bundle main 3Ã—`printing:borrowCard*` + renderer `receipt-preview`/`Pratinjau Kartu Peminjaman`/`Fit Width`/`Halaman` = ter-render.
- **Laporan:** `WORK_ORDER_BORROW_WO2_IMPLEMENTATION_REPORT.md`, `BORROW_WO2_FINAL_REVIEW.md`, `BORROW_WO2_RELEASE_REPORT.md`. Status: **DONE - menunggu review PO** (tidak lanjut WO-3 Cetak).

### Pelajaran (retain)
- **Preview/Cetak/PDF memakai engine WO-1 TANPA modifikasi template** â€” `PrintService` (electron) hanya orkestrasi: `buildBorrowCardHtml` menggabungkan `BorrowRepository.findById` + `SettingService.get` â†’ `buildBorrowCardData(â€¦,{readFileAsDataUri})` â†’ `generateBorrowCardHtml`. Widget UI (zoom/Fit Width/Ctrl+Wheel/chip halaman) murni renderer.
- **PDF filename di-generate di MAIN** (F5) â€” renderer tidak pernah membangun nama file; `buildBorrowCardPdfFilename` murni (sanitize karakter ilegal Windows + collapse spasi + fallback + truncate 40) sehingga bisa diuji headless.
- **`webContents.print` (non-silent) tidak bisa diuji headless** â€” smoke menguji preview HTML (string murni), filename generator, dan kontrak IPC/preload via grep bundle; `printBorrowCard`/`saveBorrowCardPdf` memerlukan runtime Electron.
- **Template menampilkan judul dari RELASI `bookCopy.book.title`**, bukan snapshot `borrowDetail.bookTitle` (prioritas relasi > snapshot, WO-1). Smoke awal salah assert snapshot â€” ubah assertion, bukan kode.
- **Smoke WO-2 import `bwip-js` transitif** (via `print.service` â†’ `borrow-card.service` â†’ `barcode.service`) â†’ compile `--module node16 --moduleResolution node16` (pola WO-1); fresh DB `file:C:/...` + migrate deploy workdir `prisma/` + `NODE_PATH=<repo>\node_modules`.

---

## FINAL UAT â€” Borrow Card (COMPLETE - BUGFIX ONLY, FEATURE COMPLETED)

### Ringkasan
- Mode **UAT / bug-fix only** atas seluruh alur Borrow Card (WO-1 engine + WO-2 Preview/Print/PDF). TIDAK ada discovery/refactor/fitur baru/arsitektur.
- **Hasil: BORROW CARD FEATURE COMPLETED â€” TIDAK ADA BUG source.**
- **Smoke baru `borrow_card_uat_smoke/smoke.ts` 29/29 PASS** (fresh DB): alur penuh createâ†’findByIdâ†’preview (`BorrowService.create` DTO id+borrowingNumber â†’ `PrintService.getBorrowCardPreviewHtml`), 1 bukuâ†’1 sheet, 20 bukuâ†’3 sheet (3+10+7, 20 baris, `Jumlah: 20`, LANJUTAN), badge AKTIF (`badge-active`), QR payload `borrowing.id` (dibuktikan `html.includes(generateQrCodeSvg(id))`), avatar placeholder inisial AU, logo fallback monogram SN tanpa `data:image` (logoPath kosong), nama file PDF F5 (`Kartu Peminjaman - PJ2026080001 - Anggota Umum.pdf`, tanpa `/`), 404 AppError.
- **Regression Borrow 228/228 PASS** (fresh DB per suite): wo1 101 Â· eligibility 7 Â· it1 34 Â· e2 36 Â· wo2 21 Â· uat 29. lint PASS Â· build PASS (main 1,837.03 Â· preload 9.34 Â· renderer 1,059.12 kB) Â· `prisma migrate diff` no-drift.
- **4 item UI memerlukan runtime Electron** (zoom/Fit Width/Ctrl+Wheel, dialog printer, dialog save PDF, navigasi balik) â€” diverifikasi code review + grep bundle (`addEventListener("wheel"`, `webContents.print`, `printToPDF`, `showSaveDialog`, `navigate(-1)`); konfirmasi visual manual PO direkomendasikan.
- **2 FAIL awal pada smoke = kesalahan assertion fixture, BUKAN bug:** (1) QR payload di-encode ke path SVG, bukan teks UUID â†’ bukti `generateQrCodeSvg(id)` substring; (2) `logo-img` yang muncul adalah selector CSS `.logo-img`, bukan `<img class="logo-img">`. Assertion dikoreksi, source TIDAK diubah.
- **Laporan:** `BORROW_CARD_UAT_REPORT.md`, `BORROW_CARD_BUGFIX_REPORT.md`. Commit final + push. Status: **FEATURE COMPLETED** (berhenti, tidak buka WO baru).

### Pelajaran (retain)
- **Uji "QR payload benar" lewat kesetaraan blok**: `html.includes(generateQrCodeSvg(borrowing.id))` â€” QR value di-encode ke path SVG, jangan cari teks UUID literal di HTML.
- **Grep string yang menjadi selector CSS bisa false-positive**: `.logo-img` ada di `<style>` walau tidak ada elemen `<img class="logo-img">`; assert dengan awalan elemen (`<img class="logo-img"`) atau negasi `data:image`.
- **UAT service-level = tiru jalur IPC persis** (createâ†’findByIdâ†’preview) dengan service nyata + settings DB nyata; widget UI/dialog yang butuh Electron dibuktikan code review + grep bundle, bukan dijalankan headless.
- **Mode bugfix**: 2 FAIL smoke dianalisis dulu â€” konfirmasi apakah assertion atau source yang salah; hanya source yang terbukti cacat yang diperbaiki.

---

## DASHBOARD PHASE 1: Data Activation (COMPLETE - READY review PO)

### Ringkasan
- Scope = **HIGH-priority** `DASHBOARD_AUDIT_REPORT.md`: `DashboardService` SSOT (T1) + KPI Aktivitas Hari Ini (T2) + Sedang Dipinjam penuh (T7/B1) + Aktivitas Terbaru (T4) + Perlu Perhatian (T5). **DILARANG** ubah layout/UI/desain, tanpa chart, tanpa widget/menu baru, tanpa migration/schema.
- **File baru (5 source + 1 smoke):** `src/shared/dto/dashboard.ts` (`DashboardOverviewDTO` = summary {totalBooks,totalInventories,totalMembers,activeBorrowings} + today {borrowed,returned,overdue,dueToday} + recentActivity[] {id,type BORROW|RETURN,message,occurredAt} + alerts[] {id,severity danger|warning,type,message}), `src/main/repositories/dashboard.repository.ts` (**COUNT langsung** `countBooks/countBookCopies/countMembers/countActiveBorrows`, `countBorrowedBetween/countReturnedBetween/countOverdueBefore/countDueBetween`, `findRecentBorrows/findRecentReturns`, `findOverdueBorrows/findDueTodayBorrows/findLostCopies`), `src/main/services/dashboard.service.ts` (`getOverview()` 7 query paralel via `Promise.all`; boundary hari `startOfDay/endOfDay`; recentActivity merge borrow+return sort desc slice 8; alerts OVERDUE danger + DUE_TODAY/COPY_LOST warning, limit 50/kategori), `electron/ipc/dashboard.ipc.ts` (`dashboard:overview`), `electron/preload/dashboard.preload.ts`, `dashboard_phase1_smoke/smoke.ts` (**30/30 PASS**).
- **Modifikasi (5):** `electron/main/bootstrap.ts` (+DashboardService/Repository di Container), `electron/ipc/index.ts` (+registerDashboardHandlers), `electron/preload/index.ts` (+dashboardAPI), `src/renderer/env.d.ts` (+dashboard.overview), `src/pages/DashboardPage.tsx` (**HANYA data binding** â€” state `stats` â†’ `overview`; 4 kartu KPI & 4 kartu Ringkasan diisi `overview.today.*`/`overview.summary.*`; Total Inventaris keluar dari "â€”"; Aktivitas Terbaru & Perlu Perhatian render list saat ada data, empty-state lama dipertahankan).
- **TIDAK diubah:** schema/migration (`prisma migrate diff` = no drift), BorrowService/ReturnService, repository lain, UI/routes/sidebar/labels, layout & styling DashboardPage.
- **Validation PASS:** smoke dashboard_phase1 **30/30** (STEP 0 DB kosong; STEP 6 **bulk 120 peminjaman â†’ activeBorrowings = 123** = bukti B1 fix, bukan potongan clamp 100; KPI hari ini & overdue tidak terpengaruh); regression borrow fresh DB **228/228** (wo1 101 Â· eligibility 7 Â· it1 34 Â· e2 36 Â· wo2 21 Â· uat 29); lint PASS; build PASS (main **1,844.45** Â· preload **9.47** Â· renderer **1,060.86** kB `index-CGR9uyxv.js`); grep bundle main+preload `dashboard:overview` + renderer `window.electronAPI.dashboard.overview()` + marker UI; pola bug lama `borrowings.findMany(undefined, 1, 1000)` = 0.
- **Laporan:** `WORK_ORDER_DASHBOARD_PHASE1_IMPLEMENTATION_REPORT.md`, `DASHBOARD_PHASE1_FINAL_REVIEW.md`, `DASHBOARD_PHASE1_RELEASE_REPORT.md`. Status: **DONE â€” menunggu review PO** (tidak lanjut WO berikutnya).
- **Commit:** satu final commit + push (file discovery WO lain yang belum ter-commit TIDAK diikutkan). Working tree menyisakan file untracked milik WO lain (BORROW_ENROLLMENT_DISCOVERY, INTEGRATION_TEST_PHASE1_DISCOVERY, IT1_DISCOVERY_REPORT, MEMBER_STATUS_ALIGNMENT_PLAN, MEMBER_STATUS_FINAL_AUDIT).

### Pelajaran (retain)
- **Dashboard = COUNT, bukan fetch+hitung.** B1 root cause = `borrowings.findMany(limit 1000)` terpotong clamp `getPaginationParams` (max 100) â†’ maksimal 100. Fix: `prisma.borrow.count(returnDate=null)`. Semua angka Ringkasan (`totalBooks/totalInventories/totalMembers/activeBorrowings`) wajib `count()`.
- **Definisi "aktif"** konsisten stack baru: `returnDate === null` (komentar `status = returnDate ? 'COMPLETED' : 'ACTIVE'`). `returned` dihitung per **detail** `BorrowDetail.returnedAt` (1 peminjaman 2 buku = 2); `borrowed` per transaksi `Borrow.borrowDate`.
- **Alerts hanya kategori yang didukung data**: OVERDUE (danger, `returnDate=null && dueDate<startOfDay`), DUE_TODAY (warning), COPY_LOST (warning, `status=BOOK_COPY_STATUS.LOST`) â€” dilarang membuat alert baru. Limit 50/kategori.
- **Renderer TIDAK menurunkan angka** (konsisten WO-2/P-4): satu IPC `dashboard:overview` â†’ DTO; renderer hanya memformat waktu display. Service membangun pesan activity/alert.
- **RecentActivity id = prefix + primary key** (`borrow-<id>`/`return-<id>`) agar unik lintas dua tabel saat digabung; merge sort desc + slice 8.
- **Boundary hari di Service** (repo terima Date bounds) â€” murni & deterministic, diuji smoke; jangan simpan timezone di repo.
- Smoke dashboard: fresh DB temp per run + `prisma migrate deploy` (workdir `prisma/`) + DATABASE_URL absolute + NODE_PATH; bukti B1 pakai `createMany` bulk 120 peminjaman dengan `borrowDate`/`dueDate` jauh dari hari ini agar tidak mengganggu KPI/alerts/recentActivity.

---

## MEMBERSHIP STATUS FIRST BORROW ACTIVATION (COMPLETE - READY review PO)

### Ringkasan
- Bug "Semua anggota NONAKTIF" ditutup (root cause = design gap: tidak ada jalur otomatis INACTIVEâ†’ACTIVE). Keputusan PO: **Membership Status â‰  Academic Status â‰  Borrow Eligibility**; anggota baru INACTIVE â†’ **peminjaman pertama yang BERHASIL mengaktifkan** keanggotaan â†’ ACTIVE; status **tidak pernah kembali INACTIVE** hanya karena buku dikembalikan.
- **Modifikasi (1 file source):** `src/main/services/borrow.service.ts` â€” blok "FIRST BORROW ACTIVATION" di `create()` **SETELAH** `borrowRepository.createWithItems(...)` sukses, **SEBELUM** `return toDTO(created)`: `if (member.status === 'INACTIVE') await this.memberRepository.update(member.id, { status: 'ACTIVE' })`. `memberRepository` sudah ada di constructor; `member` sudah dimuat `.status`; eligibility tetap enrollment-based (guard tidak disentuh).
- **TIDAK diubah:** Enrollment, Promotion, Dashboard, Borrow Eligibility, ReturnService, UI, schema/migration, IPC/preload/bootstrap, repository lain; **tidak ada backfill** (dev DB tetap 395 INACTIVE â€” aktivasi organik per pinjam).
- **Validation PASS:** smoke baru `membership_first_borrow_smoke` **20/20** (5 mandat: INACTIVEâ†’pinjam1â†’ACTIVE; pinjam2 tetap ACTIVE; return semua tetap ACTIVE; eligibility enrollment â€” siswa ACTIVE tanpa enrollment ditolak; guru INACTIVE tanpa enrollment suksesâ†’ACTIVE; dashboard berjalan); regression **253/253** (it1 34 Â· eligibility 7 Â· wo14_e2 36 Â· borrow_card_uat 29 Â· dashboard_phase1 30 Â· wo13_e1 39 Â· wo15_e3 78); lint PASS; build PASS (main **1,844.57** kB +0.12 dari guard Â· preload 9.47 Â· renderer 1,060.86 **identik baseline**); `prisma migrate diff` empty (from-migrations & from-url); `migrate status` up to date (4 migrations).
- **Laporan:** `WORK_ORDER_MEMBERSHIP_FIRST_BORROW_REPORT.md`, `MEMBERSHIP_FIRST_BORROW_FINAL_REVIEW.md`, `MEMBERSHIP_FIRST_BORROW_RELEASE_REPORT.md`. Status: **DONE â€” menunggu review PO** (tidak lanjut WO berikutnya).
- **Commit:** satu final commit + push (fix + smoke + laporan + AGENTS.md). File untracked WO lain (BORROW_ENROLLMENT_DISCOVERY, INTEGRATION_TEST_PHASE1_DISCOVERY, IT1_DISCOVERY_REPORT, MEMBERSHIP_STATUS_BUG_REPORT, MEMBER_STATUS_ALIGNMENT_PLAN, MEMBER_STATUS_FINAL_AUDIT) TIDAK diikutkan.

### Pelajaran (retain)
- **Aktivasi status harus berada SETELAH transaksi yang menentukan sukses**, bukan sebelum â€” menempatkan `update` setelah `await createWithItems(...)` menjamin hanya peminjaman berhasil yang mengaktifkan (tidak ada aktivasi parsial/gagal).
- **`Member.status` dan eligibility adalah dua domain berbeda**: eligibility (siswa) = `MemberEnrollment.status=ACTIVE` (IT-1 HOTFIX); `Member.status` = status keanggotaan yang kini dipicu by-borrow. Jangan pernah menyambungkan keduanya.
- **"Status tidak revert saat return" dijamin secara arsitektur** (ReturnService tidak menulis `Member.status`), bukan via guard tambahan â€” buktikan lewat smoke (return semua buku â†’ tetap ACTIVE), bukan kode berlebihan.
- **Fix bug data-driven (bukan regresi kode) cukup smoke baru + regression lintasan terkait** â€” regression di-scope ke Borrow (it1/eligibility/e2/uat) + Dashboard + Enrollment; domain lain (Promotion/Import) tidak menyentuh `Member.status` jalur borrow.
- **Tidak ada backfill siluman**: mengubah 395 INACTIVEâ†’ACTIVE massal dilarang; aktivasi organik per peminjaman nyata adalah perilaku yang disetujui PO.
- Smoke compile: suite tanpa bwip-js pakai `--module commonjs --moduleResolution node`; suite yang transitif memuat `barcode.service`/`print.service` (borrow-card uat) pakai `--module node16 --moduleResolution node16`. Jalankan dengan `DATABASE_URL` absolute + `NODE_PATH=<repo>\node_modules`; `migrate deploy` dari workdir `prisma/`; template DB di-copy per suite untuk hemat waktu generate client.

---

## MEMBER CLASS DISPLAY (Daftar Siswa kolom "Kelas") (COMPLETE - READY review PO)

### Ringkasan
- Bug: kolom **"Kelas"** di **Anggota â†’ Siswa** selalu `-` padahal 395 enrollment ACTIVE + 13 kelas ada. Investigasi read-only `STUDENT_CLASS_DISPLAY_BUG_REPORT.md` (no-commit) menemukan root cause = **defect read model list**: `MemberService.findMany` hardcode `classInfo: null` (member.service.ts:73) dan `MemberRepository.findMany` tanpa `include` relasi. Data & jalur `findById` sehat.
- **Fix (2 file source, BUG FIX ONLY):** `src/main/repositories/member.repository.ts` â€” `findMany` + `include.memberEnrollments` (filter identik `findActiveByMember`: `status=ACADEMIC_STATUS.active` + `leftAt=null`, include `class{curriculum}` + `academicYear`, order `enrolledAt desc`); import `ACADEMIC_STATUS` dari config. `src/main/services/member.service.ts` â€” helper murni **`classInfoFrom(enrollment)`** â†’ `MemberDTO['classInfo']`; dipakai `toDTO` (detail, preservasi nilai) dan `findMany` (`classInfoFrom(m.memberEnrollments?.[0])` menggantikan hardcode null).
- **Constraint:** SSOT kelas = `MemberEnrollment` ACTIVE; `Member.classId` TIDAK dipakai sebagai label. **TIDAK diubah:** Import Siswa, Enrollment, Promotion, Borrow, Dashboard, UI (renderer identik), Schema, Migration, DTO public.
- **Validation PASS:** smoke baru `member_class_display_smoke` **18/18** (enrollment ACTIVEâ†’label; classId legacy terisi tanpa enrollmentâ†’null; enrollment DROPPEDâ†’null; 2 enrollmentâ†’ACTIVE menang; guruâ†’label; list==detail label/curriculum/academicYear; search & pagination tetap bawa classInfo); regression **431/431** (Import wo17 43 Â· wo18 37 Â· wo19 38 Â· wo20 24; Enrollment wo13 39 Â· wo15 78 Â· wo16 45; Member/Borrow/Dashboard it1 34 Â· eligibility 7 Â· wo14 36 Â· membership 20 Â· dashboard 30); lint PASS; build PASS (main **1,845.29** kB +0.72 Â· preload 9.47 Â· renderer 1,060.86 **identik**); `prisma migrate diff` empty (from-migrations & from-url); `migrate status` up to date (4 migrations).
- **Laporan:** `WORK_ORDER_MEMBER_CLASS_DISPLAY_REPORT.md`, `MEMBER_CLASS_DISPLAY_FINAL_REVIEW.md`, `MEMBER_CLASS_DISPLAY_RELEASE_REPORT.md`. Status: **DONE â€” menunggu review PO** (tidak lanjut WO berikutnya).
- **Commit:** satu final commit + push (fix + smoke + laporan + AGENTS.md). File investigasi/untracked WO lain (STUDENT_CLASS_DISPLAY_BUG_REPORT, BORROW_ENROLLMENT_DISCOVERY, INTEGRATION_TEST_PHASE1_DISCOVERY, IT1_DISCOVERY_REPORT, MEMBERSHIP_STATUS_BUG_REPORT, MEMBER_STATUS_ALIGNMENT_PLAN, MEMBER_STATUS_FINAL_AUDIT) TIDAK diikutkan.

### Pelajaran (retain)
- **Read model list vs detail bisa berbeda implementasi**: `findById` sudah benar sejak dulu (`toDTO` + `findActiveByMember`), tapi `findMany` (list) meng-hardcode `classInfo: null` â€” bug tampilan tidak selalu berarti data kosong; periksa query endpoint list, bukan hanya data DB.
- **SSOT penempatan kelas = `MemberEnrollment` (status ACTIVE + leftAt null)**, bukan kolom legacy `Member.classId` (import MI-2+ tidak lagi menulis kolom itu). Definisi ACTIVE satu sumber = `ACADEMIC_STATUS.active` dari config, dipakai juga di filter `include` repository.
- **Satu helper label (pola `classInfoFrom`) untuk list & detail** mencegah dua sumber label kelas; `findMany` memakai `memberEnrollments[0]` (order `enrolledAt desc` â€” enrollment ACTIVE terbaru).
- **Nested include dengan filter** (`include.memberEnrollments: { where: {...} }`) aman untuk pagination/count dan tetap `orderBy memberNumber` pada query utama.
- Bukti "tidak pakai Member.classId": smoke seed member dengan `classId` legacy TERISI tapi tanpa enrollment â†’ `classInfo null`; dan `classId null` dengan enrollment ACTIVE â†’ `classInfo terisi`.
- Smoke compile: `--module commonjs --moduleResolution node` (tanpa bwip-js) + fresh DB temp (`file:C:/...` + `migrate deploy` workdir `prisma/`) + `NODE_PATH=<repo>\node_modules`; template DB di-copy per suite; `--rootDir .` mempertahankan struktur `$out\<suite>_smoke\smoke.js`.

---

## R-1 (Report Module Foundation): ReportDTO + ReportRepository (COMPLETE - READY review PO)

### Ringkasan
- Source of Truth: `REPORT_MODULE_DISCOVERY.md` (APPROVED) + WBS R-1..R-9. Keputusan PO: **K1** - kolom Petugas DIHAPUS dari desain laporan v1.0 (tidak ada sistem user; `Setting.librarianName`/`reportSigner` hanya untuk tanda tangan laporan, bukan data transaksi); **K2** - keterlambatan TANPA nominal denda (hanya status + jumlah hari). Scope R-1: **DTO kontrak + ReportRepository saja** - TANPA wiring IPC/preload/UI/bootstrap, TANPA perubahan schema/migration/repository domain.
- **File baru (2 source + 1 smoke):** `src/shared/dto/report.ts` (kontrak 5 laporan: `BorrowingReportDTO` [filter from/to/status ACTIVE|COMPLETED|OVERDUE; row + summary total/active/completed/overdue], `ReturnReportDTO` [1 baris = 1 buku kembali; `lateDays: number | null`; summary BAIK/RUSAK/HILANG], `OverdueReportDTO` [category ACTIVE|RETURNED; `lateDays: number`; summary active/returned], `MemberReportDTO` [filter memberType/academicYearId/classId/search; className dari SSOT enrollment; summary student/teacher/general], `CollectionReportDTO` [filter categoryId/search; summary totalTitles/totalCopies/totalAssetValue + byStatus/byCondition]), `src/main/repositories/report.repository.ts` (`ReportRepository extends BaseRepository` [getPrisma stack baru] - `findBorrowingsBetween` + `countBorrowStatusSummary`, `findReturnedDetailsBetween` + `countReturnedConditionSummary`, `findActiveOverdue` + `findReturnedLateBetween` [SQL join eksplisit karena perbandingan dua kolom returnedAt vs dueDate tak bisa Prisma relation filter], `findMembersReport` + `countMembersByType`, `findBookReportRows` + `getCollectionSummary` [SUM acquisitionCost]), `report_r1_smoke/smoke.ts` (**46/46 PASS** fresh DB).
- **Keputusan teknis:** SATU ReportRepository terpisah dari repository domain (anti-kontaminasi CRUD + regression); status turunan (ACTIVE/COMPLETED/OVERDUE) dihitung dari returnDate/dueDate bukan kolom; ringkasan via count/groupBy/aggregate BUKAN fetch-all (anti-pola bug B1 clamp 100); SSOT kelas = MemberEnrollment ACTIVE; `lateDays`/label status dihitung R-2 (Service) - repo menyediakan tanggal mentah.
- **Validation PASS:** smoke 46/46 (6 skenario peminjaman + filter status 3 jalur + summary; pengembalian 4 detail + kondisi; keterlambatan 2 kategor terpisah; anggota filter 4 jalur + groupBy; koleksi summary asset/status/kondisi + filter kategori; **skala 111 baris** page2/limit100 → 11 rows tanpa clamp); lint PASS; build PASS (**bundle IDENTIK baseline** main 1,845.29 / preload 9.47 / renderer 1,060.86 kB = bukti tanpa wiring); `prisma migrate diff` empty + `migrate status` 4 migration up to date.
- **Laporan:** `REPORT_MODULE_DISCOVERY.md` (APPROVED), `WORK_ORDER_R1_IMPLEMENTATION_REPORT.md`, `R1_FINAL_REVIEW.md`, `R1_RELEASE_REPORT.md`. Status: **DONE - menunggu review PO** (tidak lanjut R-2).

### Pelajaran (retain)
- **Perbandingan dua kolom (`returnedAt > dueDate`) tidak bisa diekspresikan sebagai Prisma relation filter** - `where: { borrow: { dueDate: { lt: <nilai-fixed> } } }` hanya membandingkan vs konstanta, bukan kolom baris. Solusi: `` + `Prisma.sql` join eksplisit + query COUNT terpisah; import `Prisma` sebagai VALUE (bukan `import type`) agar `Prisma.sql` tersedia (TS1361).
- **Repository laporan WAJIB terpisah dari repository domain** - method laporan (date-range/groupBy/aggregate) tidak boleh masuk ke `borrow.repository`/`member.repository`; mencegah perubahan perilaku yang sudah diuji smoke domain + kontrak CRUD terkontaminasi.
- **Anti-pola B1 berulang**: angka ringkasan laporan wajib `count()`/`groupBy()`/`aggregate()`; daftar pakai pagination mandiri (`getPaginationParams`). Smoke wajib membuktikan **>100 baris** (bulk 105 + page 2 limit 100 → 11 rows) - bukan hanya asumsi.
- **Keputusan PO mengurangi kebutuhan schema**: menghapus kolom Petugas (K1) & nominal denda (K2) membuat 6 laporan v1.0 TANPA migration - discovery yang menanyakan kebutuhan (bukan menebak) menghindari over-engineer schema.
- **Status turunan tidak disimpan sebagai kolom** - ACTIVE/COMPLETED/OVERDUE dihitung pada saat query (`returnDate:null` / `returnDate not null` / `returnDate:null && dueDate<now`); konsisten Dashboard Phase 1.
- Smoke compile R-1: `--module commonjs --moduleResolution node` (tanpa bwip-js) + fresh DB temp + `migrate deploy` workdir `prisma/` + `NODE_PATH=<repo>\node_modules` + `--rootDir .` (struktur `\\report_r1_smoke\smoke.js`); bukti no-drift: `prisma migrate diff --from-migrations --to-schema-datamodel --script` → "This is an empty migration".
---

## R-1 (Report Module) FULL: ReportService + Wiring IPC/Preload/env/Bootstrap (COMPLETE - READY review PO, ter-release)

### Ringkasan
- Kelanjutan R-1 foundation (DTO + ReportRepository) menjadi **R-1 PENUH**: Service + wiring end-to-end. Keputusan PO tetap **K1** (tanpa kolom Petugas; `Setting.librarianName`/`reportSigner` hanya utk tanda tangan) & **K2** (keterlambatan TANPA nominal denda, hanya status + `lateDays`). Laporan Promosi (ke-6) memakai `PromotionRunService` existing (P-3/P-4) — TIDAK diduplikasi.
- **File baru (4 source + 1 smoke):** `src/main/services/report.service.ts` (`ReportService` — `getBorrowingReport` [status turunan `deriveBorrowStatus` per baris buku; summary active/completed/overdue; boundary `startOfDay/endOfDay` via `parseRange`], `getReturnReport` [1 baris = 1 buku; `lateDays = diffDays(returnedAt, dueDate)` hanya bila telat], `getOverdueReport` [gabung active (lateDays from now vs due) + returned (lateDays from returnedAt)], `getMemberReport` [className dari `memberEnrollments[0]`; summary via `countMembersByType` + `MEMBER_TYPES`], `getCollectionReport` [copyCount + relasi + summary asset/status/kondisi]; `diffDays` normalisasi tengah malam → deterministik), `electron/ipc/report.ipc.ts` (5 channel `reports:borrowings/returns/overdues/members/collections`), `electron/preload/report.preload.ts` (`reportAPI.reports.*` invoke), `report_r1_service_smoke/smoke.ts` (**52/52 PASS**).
- **Dimodifikasi (4):** `electron/preload/index.ts` (+`...reportAPI`), `src/renderer/env.d.ts` (+blok `reports` tipe penuh via `import('../../src/shared/dto/report')`), `electron/main/bootstrap.ts` (+`ReportService(new ReportRepository())` di Container + interface), `electron/ipc/index.ts` (+import `registerReportHandlers` + `reportService` di signature + pemanggilan).
- **TIDAK diubah:** schema/migration, repository domain (borrow/member/dashboard/promotion), UI/routes/sidebar/labels, renderer.
- **Validation PASS:** smoke Service **52/52** + regression Repository **46/46** (fresh DB per suite); lint PASS; build PASS (main **1,862.60 kB** +17.31 · preload **9.95 kB** +0.48 · renderer **1,060.86 kB IDENTIK baseline**); `prisma migrate diff` = "This is an empty migration." (exit 0); grep bundle main 5Ã—`reports:*`, preload `reports:` + `invoke("reports:*")`, renderer `reports` = 0 (backend-only).
- **Laporan:** `REPORT_MODULE_DISCOVERY.md` (APPROVED), `WORK_ORDER_REPORT_R1_IMPLEMENTATION.md`, `REPORT_R1_FINAL_REVIEW.md`, `REPORT_R1_RELEASE.md` (3 laporan foundation prior-phase di-rename ke nama resmi WO). Status: **DONE - READY review PO** (tidak lanjut R-2 UI).
- **Commit:** satu final commit + push. File untracked WO lain TIDAK diikutkan.

### Pelajaran (retain)
- **Service = satu-satunya komputasi business** (status turunan, `lateDays`, summary, boundary tanggal); renderer tidak menurunkan angka (konsisten WO-2/P-4/Dashboard). `ReportRepository` hanya query + count/groupBy/aggregate; mapping ke DTO di Service.
- **`diffDays` wajib normalisasi `startOfDay` kedua tanggal** — lateDays/overdue deterministic lintas waktu; jangan hitung selisih `Date` mentah (mengandung jam).
- **Unit summary Peminjaman = transaksi (borrow), rows = baris buku** (borrow 2 buku → 2 baris). Ini kontrak DTO yang disetujui; UI (R-2) harus menampilkan "total transaksi" di header, bukan menurunkan dari rows.length.
- **Preload minifier menulis objek key tanpa titik** (`reports: { borrowings: ... }`) → grep `reports.` di bundle preload = false negative; verifikasi dengan `reports:` + string channel `reports:borrowings` di dalam `invoke(...)`.
- **Smoke Service pakai seed deterministik berbasis `dayFromNow(n)`** (relatif hari ini) + assert `lateDays` eksplisit (null/4/5/20) — derivasi Service dibuktikan sama dengan helper `daysBetween` (baris terakhir suite).
- **Wiring = 4 file terpisah**: preload/index.ts (spread), env.d.ts (tipe), bootstrap.ts (Container), ipc/index.ts (signature + pemanggilan). Verifikasi `registerAllHandlers(container, ...)` menerima Container penuh (`electron/main/index.ts:41`) — tambah field di Container, interface, DAN handler.
- Compile smoke Service sama pola repo: `--module commonjs --moduleResolution node` + fresh DB temp (`file:C:/...`) + `migrate deploy` workdir `prisma/` + `NODE_PATH=<repo>\node_modules`; `migrate diff` no-drift pakai `--from-migrations .\migrations --to-schema-datamodel .\schema.prisma --script` (jalankan dari workdir `prisma/`, path relatif tanpa prefix `prisma/`).

---

## R-2 (Laporan Peminjaman UI): Borrowing Report Page + Search server-side (COMPLETE - READY review PO)

### Ringkasan
- WO UI pertama modul Report. **Keputusan PO:** (1) tabel **7 kolom** — Tanggal (= `borrowDate`, kolom "Tanggal Pinjam" DIBATALKAN) + Nomor Transaksi + Nama Anggota + Kelas + Judul Buku + Jatuh Tempo + Status; (2) **Search server-side** disetujui sebagai perubahan **ADITIF non-breaking** ke kontrak R-1 (`BorrowReportFilter.search?` — belum ada di R-1).
- **Backend (aditif, 3 file):** `src/shared/dto/report.ts` (`BorrowReportFilter` +`search?: string`), `src/main/repositories/report.repository.ts` (`BorrowReportQuery` +`search?`; `buildBorrowReportWhere` +`OR` [borrowNumber, `member.memberNumber`, `member.fullName`, `details.bookCopy.book.title` `contains`]; `countBorrowStatusSummary(from, to, search?)` memakai `buildBorrowReportWhere` sehingga **ringkasan ikut terfilter search**), `src/main/services/report.service.ts` (`getBorrowingReport` pass-through `search` ke list + summary).
- **Renderer (5 file):** `src/pages/report/BorrowingReportPage.tsx` (**baru** — filter Periode `date`/Status/Search; 4 kartu statistik dari `summary`; tabel 7 kolom; pagination 20/halaman; badge status; footer "Total {n} transaksi" dari `pagination.total`), `src/pages/ReportsPage.tsx` (stub → landing kartu "Laporan Peminjaman"), `src/routes/index.tsx` (+`reports/borrowings`), `src/utils/navigation.ts` (+`REPORT_BORROWINGS`), `src/utils/labels.ts` (+blok `REPORT`).
- **TIDAK diubah:** `ReportService` derivasi status/`lateDays`/mapping (hanya pass-through), laporan lain, `BorrowService`/`BorrowRepository`, schema/migration (diff = empty), `src/shared/config/borrow-status.ts`, preload/env.d.ts/IPC (channel `reports.borrowings` reused).
- **Kontrak status (R-1, dikonfirmasi):** filter **ACTIVE = returnDate null** (belum dikembalikan, MENCANGKUP yang terlambat — badge per-baris tetap OVERDUE); **OVERDUE = subset ACTIVE** (dueDate<now); **COMPLETED = returnDate set**. `summary.total` = transaksi, **rows = per buku** (2 buku → 2 baris). Kelas = snapshot `className` di `Borrow` (ditulis BorrowService dari SSOT enrollment saat pinjam).
- **Validation PASS:** smoke `report_r2_smoke` **35/35** (fresh DB; 6 VALIDASI PO: periode server-side + boundary `to`, status, statistik==tabel, search 5 skenario + kombinasi status + summary ikut terfilter, kelas SSOT, status turunan; pagination+skala bulk 12 → total 16); regression R-1 repo **46/46** + service **52/52** (search opsional tidak memutus kontrak lama); lint PASS; build PASS (main **1,863.01 kB** +0.41 [search aditif] · preload **9.95 kB identik** · renderer **1,078.43 kB** +17.57 [UI baru]); `prisma migrate diff` = "This is an empty migration."; grep bundle main `reports:borrowings`=1, renderer `Laporan Peminjaman`/`reports/borrowings`/`Total Transaksi`/placeholder search ter-render.
- **Laporan:** `WORK_ORDER_REPORT_R2_IMPLEMENTATION.md`, `REPORT_R2_FINAL_REVIEW.md`, `REPORT_R2_RELEASE.md`. Status: **DONE - READY review PO** (tidak lanjut R-3..R-9).
- **Commit:** satu final commit + push. File untracked WO lain TIDAK diikutkan.

### Pelajaran (retain)
- **Filter status laporan ≠ status per-baris.** Kontrak R-1: filter `ACTIVE` = `returnDate null` (belum kembali) yang **mencakup** terlambat; badge per-baris tetap OVERDUE. Smoke wajib assert keduanya (filter total 2 = br1-overdue + br4-active). Jangan "perbaiki" menjadi ACTIVE eksklusif tanpa keputusan PO (perubahan kontrak R-1).
- **`rows` ≠ `summary.total`** — 1 baris per `BorrowDetail` (buku), `summary.total`/`pagination.total` = transaksi. Bulk borrow tanpa detail → menambah total tapi 0 baris (smoke membuktikan page2 = 0 baris). Footer UI memakai `pagination.total`, bukan `rows.length`.
- **Search di laporan = OR lintas relasi di repo** (bukan per baris di renderer): `{ OR: [borrowNumber contains, member:{OR:[memberNumber, fullName]}, details:{some:{bookCopy:{book:{title}}}}] }`. Renderer cukup kirim `search` — tidak menurunkan filter (konsisten WO-2/Dashboard).
- **Ringkasan ikut filter search**: `countBorrowStatusSummary(from, to, search?)` dipanggil dengan search yang sama sehingga 4 kartu konsisten dengan hasil pencarian; `...base` spread mempertahankan `OR`.
- **Konversi input `type=date`**: kirim ISO berbasis **tengah malam lokal** (`new Date(v + 'T00:00:00').toISOString()`) — `new Date('YYYY-MM-DD')` mentah di-parse UTC lalu startOfDay lokal bisa bergeser hari di zona minus. `''` → fallback `now` (parseRange).
- **Perubahan aditif ke DTO fondasi yang sudah dirilis aman bila field opsional** — regression R-1 (repo+service) tetap hijau; buktikan "non-breaking" dengan menjalankan smoke lama, bukan hanya tsc.
- Smoke R-2: compile `--module commonjs --moduleResolution node` (tanpa bwip-js) + fresh DB temp per suite + `NODE_PATH`; assert boundary `to` dengan periode presisi ([60,26] hari) untuk membuktikan eksklusi tanggal.

---

## R-3 (Laporan Pengembalian UI): Return Report Page + Search server-side + Lama Pinjam + Status Waktu (COMPLETE - READY review PO)

### Ringkasan
- WO UI kedua modul Report. **Keputusan PO:** (1) filter minimal **Periode + Search** (search **server-side**, pola aditif non-breaking R-2); (2) kolom tabel **7** — Tanggal Kembali + Nomor Transaksi + Nama Anggota + Kelas (enrollment snapshot) + Judul Buku + **Lama Pinjam (dalam hari)** + **Status (Tepat Waktu / Terlambat)**; (3) statistik minimal **Total Pengembalian · Tepat Waktu · Terlambat**; (4) **tanpa kolom Petugas (K1)** & **tanpa nominal denda (K2)**; (5) status ditentukan dari `returnDate` vs `dueDate` per detail.
- **Backend (aditif, 3 file):** `src/shared/dto/report.ts` (`ReturnReportFilter` +`search?: string`; `ReturnReportRowDTO` +`durationDays: number` +`status: ReturnStatus` [`'ON_TIME' | 'LATE'`]; `ReturnReportSummaryDTO` +`onTime: number` +`late: number` — `onTime + late === total`), `src/main/repositories/report.repository.ts` (`ReturnReportQuery` +`search?`; `buildReturnReportWhere` +`OR` [borrowNumber / `memberNumber` / `memberName` snapshot + `bookTitle` snapshot `contains`]; `findReturnedDetailsBetween` pakai builder; `countReturnedConditionSummary(from, to, search?)`; **baru** `countReturnedTimingSummary` [total via Prisma count + late via raw SQL join `returnedAt > dueDate` — perbandingan dua kolom tak bisa relation filter, pola R-1]), `src/main/services/report.service.ts` (`getReturnReport` pass-through `search`; per baris `durationDays = diffDays(returnedAt, borrowDate)` + `status` LATE/ON_TIME; summary `onTime = timing.total - timing.late`).
- **Renderer (5 file):** `src/pages/report/ReturnReportPage.tsx` (**baru** — filter Periode `date`/Search; 3 kartu statistik; tabel 7 kolom; badge status; pagination 20/halaman; footer "Total {n} pengembalian"), `src/pages/ReportsPage.tsx` (+kartu "Laporan Pengembalian"), `src/routes/index.tsx` (+`reports/returns`), `src/utils/navigation.ts` (+`REPORT_RETURNS`), `src/utils/labels.ts` (+`REPORT.RETURNS/RETURNS_DESC/TOTAL_RETURNS/ON_TIME/LATE/COL_RETURN_DATE/COL_DURATION/DAYS`).
- **TIDAK diubah:** IPC/preload/env.d.ts/bootstrap (**channel `reports:returns` reused** — DTO aditif auto-flow, tidak ada wiring baru), schema/migration (diff = empty), `BorrowService`/`ReturnService`/Enrollment/Dashboard/Promotion, `ReportService` mapping `lateDays`/kondisi, laporan lain.
- **Kontrak data (R-1, dikonfirmasi):** **1 baris = 1 buku kembali** (`BorrowDetail.returnedAt != null`); `summary.total == pagination.total == rows.length` (buku, bukan transaksi); **status = TEPAT WAKTU `returnedAt <= dueDate` / TERLAMBAT `returnedAt > dueDate`**; Kelas = snapshot `className` di `Borrow` (ditulis BorrowService dari SSOT enrollment saat pinjam); search memakai **snapshot** (borrowNumber/memberNumber/memberName di `Borrow` + `bookTitle` di `BorrowDetail`) — persis nilai kolom ditampilkan; ringkasan mengikuti filter (periode + search), pagination murni view.
- **Validation PASS:** smoke `report_r3_smoke` **41/41** (fresh DB; VALIDASI PO: data-DB `rows == count(returnedAt not null)`, lama-pinjam durationDays 13/19/12/7/4 + konsisten `daysBetween`, status ON_TIME/LATE + lateDays, search 5 skenario + summary ikut terfilter [onTime 1/late 1/kondisi], periode boundary [60,15]→1 & [14,now]→5, statistik==tabel `total==pagination==rows` & `onTime+late==total` & kondisi BAIK4/RUSAK1/HILANG1, pagination+skala bulk 12 → total 18 page1 10/page2 8 summary stabil); regression R-1 repo **46/46** + service **52/52** + Borrow `it1` **34/34** + `eligibility` **7/7** + `e2` **36/36** (search opsional tidak memutus kontrak lama); lint PASS; build PASS (main **1,864.98 kB** +1.97 [backend return] · preload **9.95 kB identik** · renderer **1,091.50 kB** +13.07 [UI baru]); `prisma migrate diff` = "This is an empty migration."; grep bundle main `reports:returns`=1, renderer `Laporan Pengembalian`/`reports/returns`/`Total Pengembalian` ter-render.
- **Laporan:** `WORK_ORDER_REPORT_R3_IMPLEMENTATION.md`, `REPORT_R3_FINAL_REVIEW.md`, `REPORT_R3_RELEASE.md`. Status: **DONE - READY review PO** (tidak lanjut R-4..R-9).
- **Commit:** satu final commit + push. File untracked WO lain TIDAK diikutkan.

### Pelajaran (retain)
- **Search laporan memakai SNAPSHOT kolom baris, bukan relasi** — return report cocok di `Borrow.borrowNumber`/`Borrow.memberNumber`/`Borrow.memberName` + `BorrowDetail.bookTitle` (persis nilai yang ditampilkan), berbeda R-2 borrow report yang pakai relasi `member`/`book`. Pilih sumber sesuai kolom yang tampil agar list == search == raw-SQL count konsisten.
- **`summary.total` Laporan Pengembalian = BUKU (baris detail), bukan transaksi** — `findReturnedDetailsBetween` menghitung `BorrowDetail`; `onTime + late === total` dan `total == pagination.total == rows.length`. Jangan menurunkan "transaksi" dari rows (pola R-2 borrow report TIDAK berlaku di sini).
- **late count wajib raw SQL join** (`bd.returnedAt > b.dueDate` = dua kolom lintas baris) — pola R-1 `findReturnedLateBetween`; total via Prisma count dengan builder yang sama → `onTime = total - late` dijamin konsisten dengan filter search.
- **`durationDays`/`status` dihitung Service, renderer tidak menurunkan** — kolom "Lama Pinjam (N hari)" & badge Tepat Waktu/Terlambat datang dari DTO; renderer hanya format tanggal + badge (konsisten WO-2/P-4/Dashboard).
- **Backend aditif aman**: field baru (search/durationDays/status/onTime/late) semuanya opsional/baru — regression R-1 (repo+service) dan Borrow tetap hijau; buktikan dengan menjalankan smoke lama, bukan hanya tsc.
- Smoke R-3: compile `--module commonjs --moduleResolution node` (tanpa bwip-js) + fresh DB temp per suite + `NODE_PATH`; bukti "data sesuai DB" via `borrowDetail.count(returnedAt not null)` vs `rows.length`; bukti boundary periode dengan dua rentang presisi ([60,15] vs [14,now]) yang memisahkan rt5 (returnedAt 23 hari lalu).

---

## R-4 (Laporan Keterlambatan UI): Overdue Report Page + Search server-side + Hari Terlambat + pagination gabungan (COMPLETE - RELEASED 2026-08-05)

### Ringkasan
- WO UI ketiga modul Report. **Keputusan PO:** (1) filter minimal **Periode + Search** (search **server-side**, pola aditif R-2/R-3); (2) kolom tabel **8** — Tanggal Pinjam + Nomor Transaksi + Nama Anggota + Kelas (enrollment snapshot) + Judul Buku + Jatuh Tempo + **Hari Terlambat** + **Status (Masih Terlambat / Sudah Dikembalikan Terlambat)**; (3) statistik minimal **Total Terlambat · Belum Dikembalikan · Sudah Dikembalikan Terlambat**; (4) **tanpa kolom Petugas (K1)** & **tanpa nominal denda (K2)** — `Setting.lateFee` TIDAK dikonsumsi; (5) status hanya 2 nilai — **MASIH TERLAMBAT** = `returnDate null` + `dueDate < now` (category `ACTIVE`), **SUDAH DIKEMBALIKAN TERLAMBAT** = `returnedAt > dueDate` (category `RETURNED`).
- **Backend (aditif, 3 file):** `src/shared/dto/report.ts` (`OverdueReportFilter` +`search?: string` — `OverdueCategory`/`RowDTO`/`SummaryDTO` existing TIDAK berubah), `src/main/repositories/report.repository.ts` (`OverdueActiveQuery` +`search?/skip?/take?`; `ReturnReportQuery` +`skip?/take?`; **baru** `buildActiveOverdueWhere` [satu grup `OR` DI LEVEL DETAIL: `{ borrow: { borrowNumber/memberNumber/memberName } }` relation-field + `bookTitle` — snapshot] & `buildReturnedLateSearchSql` [SQL AND-clause shared row+count] & `findActiveOverdueDetails` [**1 baris = 1 buku**: `returnedAt: null` + `borrow: { returnDate: null, dueDate: { lt: asOf } }`, include `{ borrow: true }`, order `dueDate asc`] & `countActiveOverdueDetails` & `countReturnedLateBetween`; `findReturnedLateBetween` + search + skip/take override), `src/main/services/report.service.ts` (`getOverdueReport` + search pass-through; **pagination gabungan** via pure `computeOverdueSlice` [alokasi skip/take per kategori dari posisi di daftar gabungan `[active..., returned...]`]; ringkasan via count [search ikut terfilter]; `lateDays = diffDays(now, dueDate)` ACTIVE / `diffDays(returnedAt, dueDate)` RETURNED; `total = active + returned`, `totalPages = ceil(total/limit)` — GANTI legacy `Math.max(totalPages)` yang membuat baris gabungan bisa melebihi limit).
- **Renderer (5 file):** `src/pages/report/OverdueReportPage.tsx` (**baru** — filter Periode `date`/Search; 3 kartu statistik; tabel 8 kolom; badge status [rose = Masih Terlambat, amber = Sudah Dikembalikan Terlambat]; pagination 20/halaman; loading & empty state), `src/pages/ReportsPage.tsx` (+kartu "Laporan Keterlambatan" ikon TriangleAlert rose), `src/routes/index.tsx` (+`reports/overdues`), `src/utils/navigation.ts` (+`REPORT_OVERDUES`), `src/utils/labels.ts` (+`REPORT.OVERDUES/OVERDUES_DESC/TOTAL_OVERDUE/STILL_LATE/RETURNED_LATE/COL_BORROW_DATE/COL_LATE_DAYS/STATUS_STILL_LATE/STATUS_RETURNED_LATE`).
- **TIDAK diubah:** IPC/preload/env.d.ts/bootstrap (**channel `reports:overdues` reused** — DTO aditif auto-flow, tanpa wiring baru), schema/migration (diff = empty), `BorrowService`/`ReturnService`/Enrollment/Dashboard/Promotion, laporan lain, `findActiveOverdue` (legacy per-transaksi R-1, dipertahankan utk regression).
- **Kontrak data (R-1, dikonfirmasi):** **MASIH TERLAMBAT = 1 baris = 1 buku** (`BorrowDetail` dari borrow `returnDate null` + `dueDate < now`); SUDAH DIKEMBALIKAN = 1 baris = 1 buku (`returnedAt > dueDate`); **periode HANYA memfilter RETURNED** (`returnedAt`), ACTIVE (ongoing) SELALU tampil apa pun periode; Kelas = snapshot `className` (BorrowService dari SSOT enrollment saat pinjam); search memakai **snapshot** (borrowNumber/memberNumber/memberName di `Borrow` + `bookTitle` di `BorrowDetail`); ringkasan mengikuti filter, pagination murni view.
- **Validation PASS:** smoke `report_r4_smoke` **40/40** (fresh DB; VALIDASI PO: data-DB `summary.active == count(returnedAt null && borrow returnDate null && dueDate<now)` + `summary.returned == raw SQL count(returnedAt > dueDate)`, hari-terlambat ob1=20/ob2=[5,5]/ob3=4/ob6=[2,2], status hanya 2 nilai + returnDate null/terisi, search 5 skenario + summary ikut terfilter [Alpha → active 1/returned 2], periode boundary [10,now]→ob3 & [90,20]→ob6×2, statistik `active+returned==total`, pagination gabungan+skala bulk 12 → total 18 **page1 10/page2 8** summary stabil); regression R-1 repo **46/46** + service **52/52** + Borrow `it1` **34/34** + `eligibility` **7/7** + `e2` **36/36** (search opsional tidak memutus kontrak lama); lint PASS; build PASS (main **1,868.43 kB** +3.45 [backend overdue] · preload **9.95 kB identik** · renderer **1,104.99 kB** +13.49 [UI baru]); `prisma migrate diff` = "This is an empty migration."; grep bundle main `reports:overdues`=1, renderer `Laporan Keterlambatan`/`reports/overdues`/`Masih Terlambat`/`Hari Terlambat` ter-render.
- **Laporan:** `WORK_ORDER_REPORT_R4_IMPLEMENTATION.md`, `REPORT_R4_FINAL_REVIEW.md`, `REPORT_R4_RELEASE.md`. Status: **DONE - RELEASED** (tidak lanjut R-5..R-9).
- **Release finalization (2026-08-05):** defensive hardening PO-approved dipertahankan — `buildActiveOverdueWhere` `search?.trim()` identik `buildReturnedLateSearchSql` (Invariant A) + `getOverdueReport` `slice(0, limit)` clamp (Invariant B); audit `IMPLEMENTATION_AUDIT_R4.md` + `BUILD_ARTIFACT_AUDIT.md`; komit `d42610c` hardening di-push; `npm run package:win` EXIT 0 (05/08 11:25) dengan `electron-builder.yml` + `win.signAndEditExecutable: false` (mesin tanpa Developer Mode/admin tidak bisa ekstrak symlink macOS pada `winCodeSign-2.6.0` saat `signApp`; signing dilewati tanpa sertifikat, dampak kosmetik); app.asar (52,668,776 B) diverifikasi — bundle renderer `index-z9hEr1Se.js` byte-identik `out/` (SHA-256 `D7A55F6C…`), main identik, 5/5 channel `reports:*` + marker UI ter-render, bundle lama `index-BYfUl8e8.js` tidak ada lagi.
- **Commit:** `7a2a4ab` fitur → `d42610c` hardening + audit → final release doc + `electron-builder.yml` + AGENTS.md (di-push). File untracked WO lain TIDAK diikutkan.

### Pelajaran (retain)
- **Search kategori MASIH TERLAMBAT wajib SATU grup `OR` di LEVEL DETAIL** (`{ borrow: { borrowNumber/memberNumber/memberName } }` relation-field + `bookTitle`), BUKAN memecah OR ke level borrow (`where.borrow.OR`) + `where.OR` di detail — dua klausa itu di-AND Prisma sehingga search judul tidak cocok baris yang borrow-nya tak match. Pola yang benar = `buildReturnReportWhere` R-3 (semua term OR di level row).
- **Pagination gabungan (dua query → satu daftar)** — jangan `Math.max(totalPages)` + gabung `data` (baris bisa melebihi limit per halaman). Solusi: count dulu TOTAL tiap kategori → pure `computeOverdueSlice(page, limit, activeTotal, returnedTotal)` menghitung posisi skip/take per kategori pada daftar gabungan `[active..., returned...]` → setiap halaman berisi `limit` baris (kecuali halaman terakhir); `totalPages = ceil(total/limit)`. Repo diberi override `skip?/take?` (bukan page/limit).
- **Periode TIDAK memfilter MASIH TERLAMBAT** — `findActiveOverdue`/`findActiveOverdueDetails` tanpa rentang tanggal (kontrak R-1); hanya RETURNED yang dibatasi `returnedAt`. Jangan tambah rentang ke active tanpa keputusan PO.
- **late count ACTIVE = Prisma count** (`buildActiveOverdueWhere` sama) sedangkan **late count RETURNED = raw SQL join** (`returnedAt > dueDate` dua kolom lintas baris) — `summary.active + summary.returned == pagination.total` dijamin konsisten dengan search karena semua memakai filter yang sama.
- **Kategori ACTIVE kini per-buku (1 baris = 1 `BorrowDetail`)**, berbeda legacy R-1 `findActiveOverdue` (per-transaksi) — konsisten R-2/R-3; legacy dipertahankan untuk regression (jangan dihapus).
- **Asersi smoke "data sesuai DB"**: count RETURNED pakai `$queryRawUnsafe('... returnedAt > dueDate')`, JANGAN `returnedAt: { not: null }` (ikut menghitung pengembalian tepat waktu); asersi periode dengan rentang presisi harus sadar bahwa baris gabungan diawali ACTIVE (filter `category === 'RETURNED'` dulu), dan "28 hari lalu" lebih TUA dari "20 hari lalu" sehingga MASUK rentang `to = 20 hari lalu`.
- Smoke R-4: compile `--module commonjs --moduleResolution node` (tanpa bwip-js) + fresh DB temp per suite + `NODE_PATH`; assert pagination gabungan dengan bulk dua kategori melewati limit (page1 10 / page2 8).
- **`electron-builder` di Windows tanpa Developer Mode/admin:** `npm run package:win` GAGAL di langkah `signApp` karena ekstraksi cache `winCodeSign-2.6.0` (7za) tidak bisa membuat symlink macOS `darwin/10.12/lib/libcrypto.dylib` (`A required privilege is not held by the client`), padahal alat itu tidak dipakai (tanpa sertifikat). Fix baku: `win.signAndEditExecutable: false` di `electron-builder.yml` (skips signApp; signing memang dilewati karena `cscInfo=null`; rcedit-metadata juga ter-skip — dampak kosmetik karena ikon/versi exe tidak dipakai). `CSC_IDENTITY_AUTO_DISCOVERY=false` TIDAK mencegah download winCodeSign — flag konfigurasi `-c.win.signAndEditExecutable=false` via CLI salah di-parse PowerShell (dianggap file config), wajib `--config.win.signAndEditExecutable=false`.

---

## R-5 (Laporan Anggota UI): Member Report Page + Search server-side + Status Keanggotaan (COMPLETE - READY review PO)

### Ringkasan
- WO UI keempat modul Report. **Keputusan PO:** (1) filter minimal **Search + Status Keanggotaan + Kelas** (search **server-side**, pola aditif R-2/R-3/R-4); (2) kolom tabel **5** — Nomor Anggota + Nama + Kelas + **Status Keanggotaan** + **Tanggal Bergabung**; (3) statistik minimal **Total Anggota · Aktif · Nonaktif**; (4) **tanpa kolom Petugas (K1)** & **tanpa nominal denda (K2)**; (5) **Status Keanggotaan** = AKTIF bila PERNAH memiliki `MemberEnrollment` (status apa pun), NONAKTIF = tidak pernah — **BUKAN** dari `Member.status` maupun pinjaman aktif; **Kelas** = SSOT `MemberEnrollment` ACTIVE (`status=ACTIVE && leftAt=null`, bukan `Member.classId` legacy); **Tanggal Bergabung** = `Member.createdAt`.
- **Backend (aditif, 3 file):** `src/shared/dto/report.ts` (`MemberReportFilter` +`status?: 'ACTIVE'|'INACTIVE'`; `MemberReportRowDTO` +`membershipStatus` +`joinedAt`; `MemberReportSummaryDTO` +`active` +`nonActive` — `total == active + nonActive`), `src/main/repositories/report.repository.ts` (`MemberReportQuery` +`status?`; `memberReportInclude` +`_count: { select: { memberEnrollments: true } }` [independen filter → dipakai Service turunkan membershipStatus]; **baru** `buildMemberReportWhere(query)` [search OR `memberNumber`/`fullName` contains, `memberType`, `classId`/`academicYearId` via `memberEnrollments: { some: { status: ACTIVE, leftAt: null, ... } }`, status ACTIVE → `some: {}` hanya bila belum ada constraint kelas, status INACTIVE → `none: {}`]; `findMembersReport` pakai builder; `countMembersByType(query?)` kini filter-aware; **baru** `countMemberMembershipSummary(query)` → `{ active, nonActive }`), `src/main/services/report.service.ts` (`getMemberReport` kini `Promise.all`(findMembersReport, countMemberMembershipSummary, countMembersByType); row `membershipStatus = m._count.memberEnrollments > 0 ? 'ACTIVE' : 'INACTIVE'`; `joinedAt = iso(m.createdAt)` [**fallback sementara** — createdAt bukan definisi bisnis "Tanggal Bergabung", domain belum punya field khusus]; summary +`active`/`nonActive`).
- **Renderer (5 file):** `src/pages/report/MemberReportPage.tsx` (**baru** — filter Status `select`/Kelas `select` [fetch-all loop 100]/Search; 3 kartu statistik; tabel 5 kolom; badge status [hijau = Aktif, abu-abu = Nonaktif]; pagination 20/halaman; loading & empty state), `src/pages/ReportsPage.tsx` (+kartu "Laporan Anggota" ikon Users indigo), `src/routes/index.tsx` (+`reports/members`), `src/utils/navigation.ts` (+`REPORT_MEMBERS`), `src/utils/labels.ts` (+`REPORT.MEMBERS/MEMBERS_DESC/TOTAL_MEMBERS/MEMBERSHIP_STATUS/MEMBERSHIP_ALL/MEMBERSHIP_ACTIVE/MEMBERSHIP_INACTIVE/CLASS_FILTER/CLASS_ALL/SEARCH_MEMBER/COL_MEMBER_NUMBER/COL_NAME/COL_JOINED`).
- **TIDAK diubah:** IPC/preload/env.d.ts/bootstrap (**channel `reports:members` reused** — DTO aditif auto-flow, tanpa wiring baru), schema/migration (diff = empty), `MemberService`/`MemberRepository`, `EnrollmentService`, `BorrowService`/`ReturnService`, Dashboard, Promotion, laporan lain.
- **Kontrak data (R-1, dikonfirmasi):** **Status Keanggotaan AKTIF = pernah memiliki `MemberEnrollment`** (enrollment terminal DROPPED tetap AKTIF); m3 `status=ACTIVE` tanpa enrollment + PINJAMAN AKTIF → NONAKTIF (bukan dari pinjaman); **Kelas = SSOT `MemberEnrollment` ACTIVE** (terminal → null); **Tanggal Bergabung = FALLBACK `Member.createdAt`** (createdAt BUKAN definisi bisnis — domain belum punya field khusus, nilai dipakai sementara & dikomentari di DTO/Service/smoke); **ringkasan mengikuti filter** (search + status + kelas) — `summary.total == active + nonActive == pagination.total`; pagination murni view (summary stabil antar-halaman); **kombinasi NONAKTIF + Kelas → 0** (some+none di-AND Prisma — anggota berkelas pasti pernah enrollment).
- **Validation PASS:** smoke `report_r5_smoke` **46/46** (fresh DB; VALIDASI PO: jumlah-DB `pagination.total == count(member)`, status kontrak [m2 DROPPED → AKTIF; m3 pinjaman aktif tanpa enrollment → NONAKTIF], kelas SSOT [m1/m6 X Merdeka 1, m4 XI Merdeka 2, m2/m3/m5 null], joinedAt == createdAt ISO, search nama+nomor 4 skenario, filter status 2 jalur, filter kelas 2 jalur, statistik ikut filter [kelas X → active 2 students 1/teachers 1/general 0; NONAKTIF → students 1/teachers 1; kombinasi NONAKTIF+kelas → 0; AKTIF+search "Eka" → m2], pagination+skala bulk 15 → total 21 page1 10/page3 1 summary stabil); regression Report `r1` **46/46** + `r1_service` **52/52** + `r2` **35/35** + `r3` **41/41** + `r4` **40/40** + Member/Enrollment/Borrow/Dashboard `member_class_display` **18/18** + `membership_first_borrow` **20/20** + `wo13_e1` **39/39** + `wo15_e3` **78/78** + `wo16_e4` **45/45** + `it1` **34/34** + `eligibility` **7/7** + `wo14_e2` **36/36** + `dashboard_phase1` **30/30** (total **567 PASS**; search/status opsional tidak memutus kontrak lama); lint PASS; build PASS (main **1,870,596 B** +2.17 [backend member] · preload **9.95 kB identik** · renderer **1,120.02 kB** +15.03 [UI baru] `index-Dnx2t54A.js`); `prisma migrate diff` = "This is an empty migration."; grep bundle main `reports:members`=1, renderer `Laporan Anggota`=1/`reports/members`=3/`Status Keanggotaan`=3/`Tanggal Bergabung`=1 ter-render.
- **Laporan:** `WORK_ORDER_REPORT_R5_IMPLEMENTATION.md`, `REPORT_R5_FINAL_REVIEW.md`, `REPORT_R5_RELEASE.md`. Status: **DONE - READY review PO** (tidak lanjut R-6..R-9).
- **Commit:** satu final commit + push. File untracked WO lain TIDAK diikutkan.

### Pelajaran (retain)
- **Status Keanggotaan ≠ `Member.status` dan ≠ pinjaman aktif** — AKTIF = *pernah* memiliki `MemberEnrollment`; implementasinya `_count.memberEnrollments > 0` via `memberReportInclude._count` (independen terhadap filter). Badge dihitung Service dari `_count`, ringkasan `active/nonActive` dari count dengan builder yang sama → konsisten. Dua domain berbeda dari "membership status" by-borrow (WO Membership First Borrow).
- **Filter Status = Prisma relation filter** (`some: {}` untuk AKTIF, `none: {}` untuk NONAKTIF); kombinasi NONAKTIF + kelas = `some`+`none` di-AND → 0 baris (anggota berkelas pasti pernah enrollment) — perilaku logis, diuji; jangan "perbaiki" tanpa keputusan PO.
- **Kelas dari SSOT `MemberEnrollment` ACTIVE** (konsisten laporan lain & member list), BUKAN `Member.classId` legacy; enrollment terminal → `className null` walau membershipStatus AKTIF (m2 DROPPED). Inklusi di `buildMemberReportWhere` via `memberEnrollments: { some: { status: ACADEMIC_STATUS.active, leftAt: null, ... } }`.
- **Jangan jadikan `Member.createdAt` definisi bisnis "Tanggal Bergabung"** — domain belum punya field khusus, jadi `joinedAt = iso(createdAt)` hanya FALLBACK; komentar kontrak (DTO), Service, dan smoke wajib menyatakan "fallback sementara, ganti ke field khusus saat tersedia". Koreksi ini dipicu review PO setelah rilis awal R-5.
- **Ringkasan memakai builder yang sama** (`buildMemberReportWhere` di-share ke findMany, countMemberMembershipSummary, countMembersByType) sehingga statistik selalu konsisten dengan baris — anti-pola B1 (fetch-all) dihindari; `countMembersByType` lama diperluas opsional query (non-breaking).
- **Perubahan aditif ke DTO fondasi aman bila field opsional** — regression Report 214/214 + domain 307/307 hijau; buktikan dengan menjalankan smoke lama, bukan hanya tsc.
- Smoke R-5: compile `--module commonjs --moduleResolution node` (tanpa bwip-js) + fresh DB temp per suite + `NODE_PATH`; bukti "status bukan dari pinjaman" dengan seed member NONAKTIF yang punya pinjaman AKTIF; bukti skala dengan bulk member (page 3 = 1 baris, summary stabil).

---

## R-6 (Laporan Koleksi Buku UI): UI + backend aditif 4 keputusan PO (COMPLETE - READY review PO)

### Ringkasan
- WO UI kelima modul Report sekaligus **perluasan backend aditif** per `REPORT_R6_DISCOVERY.md` (DISCOVERY APPROVED). **4 keputusan PO:** **G-2** "Rusak" = count `condition ∈ {LIGHT_DAMAGE, HEAVY_DAMAGE}` (tanpa migration — nilai `RUSAK` TIDAK ada di schema); **G-4** "Jumlah Eksemplar" & `totalCopies` = **Non-REMOVED saja** (`status != REMOVED`, LOST tetap dihitung); **G-5** status × kondisi **per dimensi, boleh overlap** (kolom Tersedia+Dipinjam+Hilang+Rusak tidak dijamin sum = total); **G-6** search **OR** atas `title`/`isbn`/`author.name`/`publisher.name` (bukan hanya `title contains`).
- **Backend (aditif, 3 file):** `src/shared/dto/report.ts` (`CollectionReportRowDTO` +`borrowedCount`/`availableCount`/`lostCount`/`damagedCount`), `src/main/repositories/report.repository.ts` (`bookReportInclude._count.bookCopies` **difilter** `where: { status: { not: REMOVED } }` [G-4]; `findBookReportRows` per-judul breakdown via **groupBy** status `(bookId, status)` + damaged `(bookId)` utk `condition ∈ {LIGHT_DAMAGE, HEAVY_DAMAGE}`, keduanya filter non-REMOVED [anti-pola B1, bukan fetch-all]; `getCollectionSummary(categoryId?, search?)` **search-aware** [G-6] + eksklusi REMOVED dari totalCopies/byStatus/byCondition/asset; helper `buildBookReportWhere` — filter kategori + search `OR` lintas relasi, dipakai findMany & summary agar konsisten), `src/main/services/report.service.ts` (`getCollectionReport` mapping 4 field count baru; summary menerima search).
- **Renderer (5 file):** `src/pages/report/CollectionReportPage.tsx` (**baru** — filter Kategori `select` + Search server-side; 3 kartu statistik Total Judul/Total Eksemplar/Nilai Aset; tabel 11 kolom; pagination 20/halaman), `src/pages/ReportsPage.tsx` (+kartu "Laporan Koleksi Buku" ikon `BookMarked` amber), `src/routes/index.tsx` (+`reports/collections`), `src/utils/navigation.ts` (+`REPORT_COLLECTIONS`), `src/utils/labels.ts` (+blok `REPORT.COLLECTIONS/*`).
- **TIDAK diubah:** IPC/preload/env.d.ts/bootstrap (**channel `reports:collections` reused** — DTO aditif auto-flow, tanpa wiring baru), schema/migration (diff = "This is an empty migration."), `BookCopyStatus`/`BookCopyCondition` config, `BorrowService`/`ReturnService`, laporan lain.
- **Validation PASS:** smoke `report_r6_smoke` **30/30** (fresh DB; VALIDASI PO: G-2 damagedCount Alpha=2 [LIGHT+HEAVY overlap BORROWED], G-4 copyCount Alpha=4 [5-1 REMOVED] & totalCopies=6 & byStatus tanpa REMOVED, G-5 invariant `available+borrowed+lost == copyCount` per-judul, G-6 search 5 skenario judul/ISBN/author/publisher/no-result + ringkasan ikut filter, filter kategori, **skala bulk 105 → page2 6 rows tanpa clamp**, backward-compat `getCollectionSummary(catId)`); regression Report 7 suite fresh DB **290 PASS** (r1 46 · r1_service 52 · r2 35 · r3 41 · r4 40 · r5 46 · r6 30); lint PASS; build PASS (main **1,872.87 kB** +2.44 [backend] · preload **9.95 kB identik** · renderer **1,137.66 kB** +17.64 [UI baru]); `prisma migrate diff` = "This is an empty migration."; grep bundle main `reports:collections`=1, renderer `Laporan Koleksi Buku`/`reports/collections`/`Jumlah Eksemplar`/`Nilai Aset` ter-render.
- **Laporan:** `REPORT_R6_DISCOVERY.md` (APPROVED), `WORK_ORDER_REPORT_R6_IMPLEMENTATION.md`, `REPORT_R6_FINAL_REVIEW.md`, `REPORT_R6_RELEASE.md`. Status: **DONE - READY review PO** (tidak lanjut R-7..R-9).

### Pelajaran (retain)
- **"Jumlah Eksemplar" per judul = `_count` difilter `status != REMOVED`** (G-4) — `bookReportInclude._count.bookCopies` kini ber-where; REMOVED bukan "eksemplar" tapi artefak dekomision. Eksklusi REMOVED diterapkan konsisten di row (`copyCount`), `totalCopies`, `byStatus`, `byCondition`, dan asset.
- **Per-row breakdown via groupBy, bukan fetch-all** — `findBookReportRows` ambil halaman buku → `bookCopy.groupBy({ by: ['bookId','status'] })` + `groupBy({ by: ['bookId'] })` utk damaged (condition in [LIGHT_DAMAGE, HEAVY_DAMAGE]); Map `bookId → Map<status,count>`; `available+borrowed+lost === copyCount` (dimensi status), `damagedCount` terpisah (dimensi condition) — boleh overlap (G-5).
- **Search laporan koleksi = OR lintas relasi di repo** (`buildBookReportWhere`): `{ OR: [title contains, isbn contains, author:{name contains}, publisher:{name contains}] }`; dipakai BUKAN hanya list tapi juga summary (`getCollectionSummary(categoryId, search)`) agar kartu statistik konsisten dengan hasil pencarian (pola R-2..R-5).
- **`getCollectionSummary` backward-compat** — signature lama `(categoryId?: string)` tetap dipanggil `getCollectionSummary(catId)`; search ditambah sebagai parameter ke-2 opsional, sehingga regression R-1 repo (46) tetap hijau tanpa edit smoke.
- **Status & kondisi adalah dua dimensi ortogonal** (G-3/G-5): jangan jumlahkan `Tersedia+Dipinjam+Hilang+Rusak` = total; eksemplar BORROWED/LOST bisa sekaligus rusak. Ringkasan tetap `byStatus`/`byCondition` per-dimensi (R-1).
- **`condition` string bebas di schema** — interpretasi "Rusak" = `LIGHT_DAMAGE` + `HEAVY_DAMAGE` ditetapkan PO (G-2) dan hidup di repository groupBy; UI renderer hanya label/ikon.
- Smoke R-6: compile `--module commonjs --moduleResolution node` (tanpa bwip-js) + fresh DB temp per suite + `NODE_PATH`; bukti G-4 dengan seed copy REMOVED bernilai asset 999999 (harus di-exclude dari totalAssetValue); bukti G-6 dengan search ISBN unik (`978-9-<i>`) & nama author/publisher yang HANYA match lewat relasi.

---

## DATABASE_URL Startup Fix (COMPLETE — READY review PO)

### Ringkasan
- **Bug:** `npm run dev` gagal start — `Environment variable not found: DATABASE_URL` padahal `.env` ada di root. Audit `DATABASE_URL_STARTUP_AUDIT.md` menemukan root cause: **`DATABASE_URL` TIDAK pernah dimuat ke `process.env` aplikasi** — (1) `dotenv.config()` tidak pernah ada di source; (2) electron-vite tidak memuat `.env` ke proses main (hanya prefix `VITE_*`); (3) Prisma runtime 5.22 auto-load `.env` hanya via `relativeEnvPaths` yang di-embed di generated client — di sini `rootEnvPath: null` (generate terakhir dari workdir `prisma/` saat smoke). Aplikasi selama ini bergantung pada `DATABASE_URL` di env OS/terminal (sisa sesi smoke).
- **Fix (3 baris source + 1 dependency):** `electron/main/index.ts` module scope + `dotenv.config({ path: path.resolve(__dirname, '../../.env') })` + `dotenv.config()` (fallback CWD) — berjalan SEBELUM `initDatabase()` (yang hanya dipanggil di `app.whenReady().then()`); `package.json`/lockfile +`"dotenv": "16.6.1"` (sudah transitif di node_modules → lockfile berubah minimal).
- **TIDAK diubah:** schema, migration, Report, Dashboard, Repository, Service, UI.
- **Validation PASS:** `npm run dev` di sesi BERSIH (tanpa setenv) → `[DB] SQLite connected successfully` + `[RECONCILE] InventorySequence lastNumber=28`; `npm run build` PASS (main 1,882.54 kB · preload 9.95 kB · renderer 1,137.66 kB **identik baseline R-6**); `prisma migrate diff` = "No difference detected."
- **Laporan:** `WORK_ORDER_DATABASE_URL_FIX_IMPLEMENTATION.md`, `DATABASE_URL_FIX_FINAL_REVIEW.md`, `DATABASE_URL_FIX_RELEASE.md`. Status: **DONE - menunggu review PO**.

### Pelajaran (retain)
- **App runtime TIDAK pernah membaca `.env` secara otomatis** — electron-vite tidak load env ke main, dan Prisma runtime auto-load `.env` HANYA jika `relativeEnvPaths` ter-embed di generated client (null bila `prisma generate` dijalankan dari workdir `prisma/`). Fix baku: panggil `dotenv.config()` eksplisit di entry main SEBELUM `initDatabase()`, dengan path eksplisit `path.resolve(__dirname, '../../.env')` (tidak bergantung CWD) + fallback `dotenv.config()` (dotenv tidak menimpa env yang sudah ter-set).
- **`npm run dev` validasi harus di sesi terminal BERSIH** (tanpa `$env:DATABASE_URL` tersisa dari smoke) — hanya itu yang membuktikan `.env` benar-benar dimuat. Log sukses: `[DB] SQLite connected successfully`.
- **Dependency yang sudah ada transitif boleh di-*promote* ke dependency langsung** dengan versi eksak (`dotenv: 16.6.1`) — lockfile berubah minimal (hanya pindah blok), bukan reinstall penuh.
- **Semua PrismaClient dibuat di module-scope-safe path**: `initDatabase()` dan `getPrisma()` singleton keduanya lazy — PrismaClient membaca `process.env.DATABASE_URL` saat konstruksi, sehingga dotenv di module scope index.ts selalu lebih dulu.

---

## NS-1 (Notification Foundation): Provider + Reducer + Toast + ConfirmDialog (COMPLETE - READY review PO)

### Ringkasan
- Source of Truth: `NOTIFICATION_UX_AUDIT.md` (read-only, 53 match) + `NOTIFICATION_SYSTEM_ARCHITECTURE.md` (**DISETUJUI PO dengan 11 revisi**). Scope NS-1: **fondasi Notification System v1.0** — Provider, Reducer, Toast, ToastViewport, ConfirmDialog, Configuration, Smoke Test. **BELUM** migrasi `alert()`/`confirm()`, **BELUM** mengubah halaman/routes, **ZERO dependency** (dilarang library toast).
- **File baru (8):** `src/shared/config/notification.ts` (`NOTIFICATION_DURATION` success 3000/info 4000/warning 5000/error 6000 — semua auto-dismiss, `NOTIFICATION_MAX_TOASTS=3`, `NOTIFICATION_Z_INDEX` toast 90/confirm 100), `src/notification/types.ts` (`ToastType`/`ToastItem`/`ConfirmDescriptor`/`ConfirmOptions`/`Notify`), `src/notification/notification-reducer.ts` (**reducer PURE** — aksi `toast/add|dismiss|dismissAll|confirm/open|resolve`; `toast/add` slice ke maks 3 = evict toast tertua; id dibangkitkan caller `crypto.randomUUID` agar reducer tetap murni), `src/notification/NotificationContext.tsx` (provider + `useNotification()` pola `BookImportContext`; timer auto-dismiss per-id di provider, cleanup unmount; `confirm()` Promise — jika dialog kedua dibuka, promise pertama di-resolve `false`), `src/notification/ToastItem.tsx` (ikon per tipe via lucide, bar warna kiri, dismiss button, `aria-live`), `src/notification/ToastViewport.tsx` (`createPortal(document.body)`, `fixed top-14 right-4` = **TOP RIGHT** di bawah TopBar h-12, stack flex-col), `src/notification/ConfirmDialog.tsx` (`createPortal`, `role=alertdialog`, ikon TriangleAlert(danger)/HelpCircle, title+description, Cancel/Confirm, **fokus awal Cancel** + Tab trap + Esc=batal), `ns1_notification_smoke/smoke.ts` (**27/27 PASS** murni tanpa DB/Electron).
- **Dimodifikasi (3):** `src/renderer/App.tsx` (`<NotificationProvider>` bungkus `<RouterProvider>`), `tsconfig.web.json` (+include `src/notification/**/*`), `src/renderer/assets/styles.css` (`@keyframes toast-enter` slide kanan 24px→0 + fade 0.22s).
- **Revisi PO terimplementasi (11):** zero-dep; portal body; top-right; stack; maks 3 (ke-4 evict tertua); animasi slide+fade; durasi 3/4/5/6s semua auto-dismiss; **tidak ada persistent toast**; ConfirmDialog modern + danger variant; reducer pure; belum sentuh halaman.
- **TIDAK diubah:** package.json (zero-dep), schema, migration, IPC/preload/env, halaman, routes.
- **API:** `useNotification()` → `{ notify.success|error|warning|info(msg): id, notify.dismiss(id), notify.dismissAll(), confirm({title,message,confirmLabel?,cancelLabel?,danger?}): Promise<boolean> }`.
- **Validation PASS:** smoke 27/27; `npm run lint` PASS; `npm run build` PASS (main **1,882.54 kB identik baseline** · preload **9.95 kB identik** · renderer **1,148.88 kB** +11.22 = modul notification); `prisma migrate diff` = "This is an empty migration."
- **Laporan:** `WORK_ORDER_NS1_IMPLEMENTATION.md`, `NS1_FINAL_REVIEW.md`, `NS1_RELEASE.md`. Status: **DONE - READY review PO** (tidak membuka NS-2). Commit: Satu final commit NS-1 + push.

### Pelajaran (retain)
- **Reducer pure + id dari caller** — `crypto.randomUUID()` di context (caller), bukan reducer; durasi/tipe di payload → reducer bisa di-smoke headless tanpa IO; StrictMode double-invoke terbukti identik (smoke).
- **Timer auto-dismiss = provider**, bukan reducer (waktu bukan kontrak state); map per-id, skip yang sudah ada, cleanup pada unmount; reducer tetap murni.
- **Posisi top-right `top-14`** = offset TopBar `h-12` + gap 8px; z-index terpusat di config (toast 90, confirm 100 — di atas semua modal eksisting z-50).
- **Confirm bertumpuk**: panggilan kedua `confirm()` saat dialog masih terbuka → promise pertama di-resolve `false` (menggantikan perilaku window.confirm yang mengabaikan panggilan lama); satu `pendingConfirmResolveRef` di provider.
- **Constrain scope = bukti bundle identik**: main & preload byte-identik baseline membuktikan tidak ada wiring lain; satu-satunya delta renderer +11.22 kB = modul notification. Jika WO menyentuh hanya renderer, delta renderer-lah yang wajar.
- **Smoke pure tanpa DB/Electron**: compile `npx tsc --module commonjs --target es2022 --moduleResolution node --esModuleInterop --skipLibCheck --rootDir . --outDir <tmp>\out ns1_notification_smoke/smoke.ts` lalu `node <tmp>\out\ns1_notification_smoke\smoke.js` (tanpa bwip-js → pola commonjs+node, bukan node16).

---

## NS-2 (PILOT Migration): Notifikasi Sukses Peminjaman Buku (COMPLETE - READY review PO)

### Ringkasan
- **Pilot migration Notification System — HANYA SATU FITUR: Peminjaman Buku, HANYA alur sukses setelah peminjaman berhasil disimpan.** Notifikasi sukses legacy diganti `notify.success()`. BELUM Return, Master Data, Error, Confirm.
- **File diubah (1 renderer):** `src/pages/BorrowingsPage.tsx` — import `useNotification` (hapus `Printer`), `const { notify } = useNotification()`, alur sukses `alert('Transaksi berhasil disimpan.')` → `notify.success('Transaksi berhasil disimpan.')`; **hapus dead UI legacy**: kotak hijau `lastSuccessBorrowingId && (...CETAK BUKTI...)`, `handlePrintReceipt` (channel legacy `printing:borrowReceipt`), state `lastSuccessBorrowingId`/`printing`.
- **Kenapa kotak hijau dihapus:** kotak hijau = notifikasi sukses lama (dead code di happy path — `navigate(receiptPreviewPath(id))` jalan tanpa syarat setelah create sukses → halaman unmount → kotak tak pernah terlihat); preview WO-2 sudah punya Cetak/PDF (`borrowCard`/`borrowCardPdf`). Channel legacy `printing:borrowReceipt` di electron/main/preload **dibiarkan** (cleanup di WO terpisah).
- **TIDAK diubah:** ERROR (4 `alert` error di BorrowingsPage: duplikat barcode/barcode tak ditemukan/buku tak tersedia/catch), CONFIRM, halaman lain (ReturnsPage masih `alert` sukses — target NS berikut), business logic (create→navigate→reset form utuh), schema/migration/IPC/preload/env.
- **Validation PASS:** `npm run lint`; `npm run build` (main 1,882.54 · preload 9.95 **identik** · renderer **1,147.66 kB**); `prisma migrate diff` = "This is an empty migration."
- **Laporan:** `WORK_ORDER_NS2_IMPLEMENTATION.md`, `NS2_FINAL_REVIEW.md`, `NS2_RELEASE.md`. Status: **DONE - READY review PO** (belum migrasi Return/Master Data/Error/Confirm). Commit: Satu final commit NS-2 + push.

### Pelajaran (retain)
- **Pilot migration = bukti pola migrasi**: titik migrasi HANYA di jalur sukses (setelah `await create()` sukses); error & confirm dilarang bersentuhan; provider global NS-1 memungkinkan toast survive navigasi (viewport render di luar halaman) — `notify.success()` dipanggil sebelum `navigate()` tetap terlihat di preview.
- **Notifikasi sukses lama bisa berupa lebih dari `alert()`** — kotak hijau + tombol "CETAK BUKTI" (dead code karena navigate tanpa syarat). Audit UX menangkap `alert()` sukses; kotak hijau ditemukan saat inspeksi file. Selalu cek UI sukses selain alert saat migrasi satu fitur.
- **Channel legacy (`printing:borrowReceipt`/`returnReceipt`) tidak dihapus saat pemanggil renderer hilang** — keputusan desain BORROW_RECEIPT menunda cleanup; hapus hanya di WO housekeeping terpisah bila PO setuju, bukan di WO migrasi notifikasi.
- **Constrain scope renderer**: main & preload byte-identik baseline = bukti tanpa wiring; renderer delta 1,148.88→1,147.66 kB (hapus dead UI + import) — delta negatif wajar saat menghapus legacy UI.
- **Verifikasi error-path utuh dengan grep**: `alert(` di BorrowingsPage tersisa 4, semua jalur error — bukan kebetulan, diverifikasi eksplisit sebelum commit.

---

## NS-2 HOTFIX: Tailwind content scan — toast tidak terlihat (COMPLETE - READY review PO)

### Ringkasan
- **Bug:** setelah klik SIMPAN TRANSAKSI di Peminjaman Buku, tidak ada alert maupun toast; aplikasi langsung navigate ke preview. Investigasi READ ONLY `NS2_TOAST_INVESTIGATION.md` menemukan **root cause = build-time, bukan runtime**: `tailwind.config.js` `content` globs TIDAK mencakup `./src/notification/**/*`, sehingga seluruh class utility Tailwind eksklusif modul Notification di-purge saat build → toast & confirm dialog tetap masuk DOM (JS bundle lengkap) tapi tanpa style positioning/visual → invisible.
- **Bukti:** grep CSS build lama `index-BSa87M2u.css` — `top-14`/`right-4`/`z-[90]`/`z-[100]`/`bg-emerald-500`/`.w-1`/`.pr-2`/`hover:bg-slate-100` semua MISSING; class `.fixed`/`.w-80`/`bg-white` KEBETULAN ada karena di-generate file lain yang tercakup globs. JS bundle `index-BxKcJ9qP.js:15192` masih memuat `className="... top-14 right-4 z-[90] ..."` — class tertulis di DOM tapi rule CSS-nya tidak ada.
- **Fix (1 baris konfigurasi, TIDAK ada perubahan source):** `tailwind.config.js` `content` + `'./src/notification/**/*.{js,ts,jsx,tsx}'`. Main/preload bundle IDENTIK baseline (1,882.54 / 9.95 kB); renderer 1,147.66 kB (JS hash berubah, ukuran sama); CSS baru `index-Catve8Qm.css` 41.28 kB (+1.6 kB = class notification).
- **Validation PASS:** (1) grep CSS baru — 5 class wajib `top-14`, `right-4`, `z-[90]`, `z-[100]`, `bg-emerald-500` + `bg-rose/amber/sky-500`, `.w-1`, `.pr-2`, `hover:bg-slate-100`, `.toast-enter` semua FOUND; (2) `npm run lint` PASS; (3) `npm run build` PASS; (4) `prisma migrate diff --from-migrations` = "This is an empty migration."; (5) UAT headless: `BorrowingsPage.tsx:129-130` `notify.success` dipanggil SEBELUM `navigate`; `App.tsx` provider di atas router → ToastViewport (portal `document.body`) survive navigasi; JS bundle memuat `Transaksi berhasil disimpan.` + viewport class + `receipt-preview`. Klik nyata & visual toast butuh runtime Electron — konfirmasi manual PO direkomendasikan.
- **Laporan:** `NS2_TOAST_INVESTIGATION.md`, `NS2_TOAST_FIX_IMPLEMENTATION.md`, `NS2_TOAST_FIX_FINAL_REVIEW.md`, `NS2_TOAST_FIX_RELEASE.md`. Status: **DONE - READY review PO** (tidak membuka NS-3). Commit: satu final commit + push.

### Pelajaran (retain)
- **Tailwind `content` ≠ tsconfig include.** `tsconfig.web.json` bisa include `src/notification/**/*` (type-check PASS) padahal Tailwind tidak men-scan folder itu → build hijau tapi class di-purge. Verifikasi UI Tailwind WAJIB grep CSS hasil build (`top-14`/`z-[90]`/dst), bukan hanya tsc.
- **Class yang "ada" di CSS belum tentu dari file itu** — `.fixed`/`.w-80`/`bg-white` di-generate file lain yang tercakup globs. Bukti scan folder baru yang benar = class eksklusif folder itu (`top-14`, `z-[90]`, `z-[100]`, `bg-emerald-500`) baru muncul setelah glob ditambahkan.
- **Bug "UI tidak tampil tapi build hijau"** → selalu cek apakah komponen di bawah globs Tailwind content; purge Tailwind bersifat diam-diam (tidak error). Folder baru untuk komponen React WAJIB ditambahkan ke `content` `tailwind.config.js` (saat ini: renderer/components/pages/routes/notification).
- **Toast tidak terlihat ≠ toast tidak masuk state** — dispatch `notify.success` sinkron sebelum `navigate`; provider di atas router + viewport portal body → toast TETAP tampil di halaman tujuan. Navigasi bukan penyebab; verifikasi posisi CSS dulu.

---

## BORROW CARD PDF FIX: Save PDF 110×60mm via preferCSSPageSize (COMPLETE - READY review PO)

### Ringkasan
- **Bug:** Simpan PDF Kartu Peminjaman menghasilkan halaman A4/Letter dengan kartu kecil, padahal Preview benar. Root cause dari `PRINT_PIPELINE_INVESTIGATION.md` (APPROVED): `renderPdf()` memanggil `printToPDF({ printBackground: true })` **tanpa** `preferCSSPageSize` (default `false`) sehingga `@page { size: 110mm 60mm }` pada template kartu diabaikan oleh Chromium.
- **Fix (1 baris, jalur Save PDF SAJA):** `electron/main/services/print.service.ts:136` → `printToPDF({ printBackground: true, preferCSSPageSize: true })`. CSS `@page` di template menjadi SSOT ukuran halaman PDF.
- **TIDAK diubah:** template kartu (`borrow-card.service.ts`), layout, Preview (`BorrowReceiptPreviewPage.tsx`), Print (`webContents.print()` di `printBorrowCard`/`printHtml`), schema/migration/IPC/preload/env/bootstrap/renderer/UI. WO PRINT tidak dibuka.
- **Validation PASS:** (1) lint; (2) build (main 1,882.57 kB +0.03 · preload 9.95 kB identik · renderer 1,147.66 kB identik); (3) `prisma migrate diff` = "This is an empty migration."; (4) **PDF via `renderPdf` asli** — MediaBox `[0 0 312.000 169.920]` pt = **110.067 × 59.944 mm** (ekspektasi 311.811×170.079 pt; Chromium membulatkan ke kelipatan 0.08pt); **kontrol tanpa flag = Letter 792×612 pt** — bukti flag penyebab.
- **Smoke Electron headless:** `borrow_card_pdf_fix_smoke/main.cjs` memanggil `PrintService.renderPdf()` ASLI (compiled) pada HTML kartu asli (`generateBorrowCardHtml` + QR `generateQrCodeSvg`) → 6/6 PASS; kontrol negatif `printToPDF(..., false)`.
- **Laporan:** `WORK_ORDER_BORROW_CARD_PDF_FIX.md`, `BORROW_CARD_PDF_FIX_FINAL_REVIEW.md`, `BORROW_CARD_PDF_FIX_RELEASE.md`. Status: **DONE - READY review PO** (tidak membuka WO PRINT). Commit: satu final commit + push.

### Pelajaran (retain)
- **`preferCSSPageSize: true` wajib pada `printToPDF` bila kartu/lembar memakai `@page { size: ... }`** — tanpa flag, Chromium default Letter/A4 dan CSS `@page` diabaikan. Ini jalur Save PDF; jalur print fisik (`webContents.print()`) butuh `pageSize` di opsi cetak (WO terpisah, TIDAK dibuka).
- **Verifikasi ukuran PDF = ekstraksi `/MediaBox` dari file PDF** (`/MediaBox [0 0 w h]` dalam **point**): 110mm = 311.811pt, 60mm = 170.079pt; Chromium membulatkan ke kelipatan 0.08pt (312.000 × 169.920). Kontrol negatif (flag `false`) → Letter 792×612 pt membuktikan perbedaan berasal dari flag, bukan printer/default.
- **Smoke Electron runtime:** `require('electron')` tersedia di script yang dijalankan `electron <script>`; `app.whenReady()` dulu sebelum `new BrowserWindow`. **`NODE_PATH` TIDAK dibaca Electron** untuk resolusi module di luar repo → compile output ke temp DI DALAM repo (`<wo>_smoke/out/`) agar `require('bwip-js/node')` ter-resolve ke `node_modules` root. Tambah guard `process.on('uncaughtException', ... app.exit(1))` agar proses tidak menggantung (default: error load → app tidak exit).
- **Private method TS bisa dipanggil di runtime JS** — `new PrintService(null, null).renderPdf(html)` memanggil implementasi produksi persis (private hanya compile-time), sehingga smoke membuktikan file nyata bukan duplikat kode. Constructor deps (`BorrowRepository`/`SettingService`) tak dipakai `renderPdf` → `null` aman.
- **Fix 1 baris = bukti scope**: bundle preload/renderer byte-identik baseline; delta main hanya +0.03 kB; `git status` hanya 1 file M. Jangan sentuh `webContents.print()` dalam WO yang hanya menargetkan printToPDF.




---

## BORROW CARD LAYOUT v1.1: Optimasi Kapasitas Daftar Buku (COMPLETE - READY review PO)

### Ringkasan
- **WO:** Optimasi layout kartu 110×60mm agar memuat lebih banyak buku **TANPA mengubah ukuran kartu**, ukuran PDF, Preview, Print, QR, tanda tangan, identitas anggota, header/logo/border/style visual.
- **Keputusan PO:** (1) **Jumlah + Status (AKTIF) pindah ke pojok kanan ATAS** (header-info) pada kartu utama & lanjutan; (2) **footer kiri-bawah dikosongkan** → zona daftar buku bertambah; (3) **judul buku diperkecil ke 8pt** (tetap dominan di list); (4) spasi baris dikurangi → target **5 buku nyaman di halaman 1** (sebelumnya 3), **13 di lanjutan** (sebelumnya 10); (5) nomor urut kiri, judul rata kiri, **inventory number rata kanan**; (6) QR & tanda tangan tetap kanan-bawah footer.
- **SATU file source:** `src/main/services/borrow-card.service.ts` — `BORROW_CARD_LAYOUT` {bookRowHeightMm 3.4→**2.8**, pageOne {header 12, body 20→**18**, footer 10→**9**}, continuation {header 8, footer 10→**9**}}; helper baru `headerInfoHtml(data)`; `footerHtml` = QR + tanda tangan saja (elemen `.footer-left` dihapus total); CSS `.book-row` font-size 8pt + line-height 2.8mm + margin 0; `.num`/`.inv` 6.5pt; `.body` 18mm + margin-top 0; `.avatar` 18×18; `.footer` 9mm + margin-top 0.5mm; `.qr` margin-left:auto; `.header-text` flex:1 + overflow hidden; `.school-name` ellipsis.
- **Geometri deterministik:** halaman 1 = 54 − (12+18+9+0.5) = 14.5mm → floor(14.5/2.8) = **5**; lanjutan = 54 − 17.5 = 36.5 → **13**. Maks 20 buku → 5+13+2 = 3 kartu.
- **TIDAK diubah:** DTO (`borrow-card.ts`), Repository, Borrow/Return Service, IPC, preload, env.d.ts, schema, migration, `print.service.ts` (PDF fix WO sebelumnya), Preview/Print pipeline, renderer.
- **Validation PASS:** lint; build (main **1,883.01 kB** +0.44 · preload **9.95 kB identik** · renderer **1,147.66 kB identik**); `prisma migrate diff` = "This is an empty migration."; smoke wo1 **104/104** (pagination 5+13+2, badge ×3 di header-info, `!footer-left`) · v11 **58/58** (pagination, preview 1/3/5, struktur baris, CSS marker, distribusi per halaman) · uat **31/31** fresh DB (header-info Jumlah:20 ×3, badge ×3, distribusi 5+13+2) · pdf **6/6** (MediaBox 312.000×169.920pt = 110.067×59.944mm — ukuran TIDAK berubah) · geometry **10/10** (render nyata Electron: 5 baris tanpa overlap + di dalam kartu + footer clear, QR & tanda tangan terpisah, header-info kanan-atas).
- **Laporan:** `WORK_ORDER_BORROW_CARD_LAYOUT_V11_IMPLEMENTATION.md`, `BORROW_CARD_LAYOUT_V11_FINAL_REVIEW.md`, `BORROW_CARD_LAYOUT_V11_RELEASE.md`. Status: **DONE - menunggu review PO** (tidak membuka WO baru).

### Pelajaran (retain)
- **Optimasi kapasitas baris = kompromi mm antar zona.** Untuk menambah baris buku pada kartu fixed-size, kurangi zona yang bukan target: footer 10→9mm & body 20→18mm (avatar dekoratif menyesuaikan) — teks identitas/font/kolom TIDAK berubah. Padding frame (3mm) dipertahankan agar border tidak terkesan berubah.
- **`footer-left` (informasi Jumlah/status) dihapus total dari footer; dipindah ke header-info** — pastikan grep `footer-left` = 0 di `src/` setelah refactor; label Jumlah kini tampil di KARTU UTAMA & LANJUTAN (tiap kartu dokumen sah, R4).
- **Kapasitas pagination = fungsi murni mm yang SAMA dengan CSS** (bookRowHeightMm 2.8, body 18, footer 9, margin footer 0.5): halaman 1 = floor((54−(12+18+9+0.5))/2.8) = 5, lanjutan = floor((54−(8+9+0.5))/2.8) = 13. Bila margin CSS berubah, angka ini harus ikut — jangan hardcode 5/13.
- **Bukti "tidak overlap / tidak terpotong" = ukur bounding box di render nyata (Electron `executeJavaScript`)** — `geometry.cjs`: baris berurutan `row[i].top >= row[i-1].bottom`, semua baris di dalam kartu, `lastRowBottom <= footer.top`; QR & tanda tangan `!overlaps`; header-info right edge ≈ tepi kartu. String-match HTML saja tidak cukup.
- **Assertion span vs div**: baris buku = `<span class="num">`/`<span class="title">`/`<span class="inv">` (bukan div); badge di header-info = `class="badge badge-active"` (substring `class="badge-active"` TIDAK cocok karena atribut berisi dua class).
- **Distribusi halaman untuk 20 buku** = [5, 13, 2] (halaman 2 memuat buku 6..18, bukan 6..13) — hitung ulang sebelum assert `!includes('Buku Ke-14')` dsb.
- Smoke compile: v11 `smoke.ts` + geometry memakai `--module node16 --moduleResolution node16` (bwip-js transitif via barcode.service) + `NODE_PATH=<repo>\node_modules`; geometry dijalankan via `electron geometry.cjs <outDir>` dengan outDir hasil compile DI DALAM repo (Electron abaikan NODE_PATH). Dir `out/` hasil compile di-gitignore (pola `out/` cocok semua folder bernama out).

---

## BORROW CARD LAYOUT v1.2: Refinemen Visual (COMPLETE - READY review PO)

### Ringkasan
- **WO:** penyempurnaan visual kecil di atas v1.1 (ter-release) **TANPA mengubah ukuran kartu**, PDF, print pipeline, Preview, QR, header, logo, identitas anggota, business logic, DTO, Repository, Service.
- **Keputusan PO:** (1) **judul buku diperkecil 8→7.5pt** (tetap > identitas 6.5pt, judul tetap dominan); (2) **inventory number mengikuti judul** — rilis awal `margin-left: 13mm` (gap keras) **DITOLAK PO** (nilai 13mm hanya ilustrasi visual, bukan requirement; yang dinilai adalah hasil visual: inv satu grup dgn judul, bukan rata tepi kanan, area kanan lega utk QR/ttd); revisi memakai **flex `gap: 3mm`** (menggantikan `margin-right` `.num`) + inv **`margin-left: 5mm`** = **~8mm total** proporsional, baris tanpa `justify-content: space-between`; (3) **garis pemisah tipis abu terang** antara data anggota & daftar buku (`border-bottom: 1px solid #e2e8f0` + `margin-bottom: 1mm`).
- **SATU file source:** `src/main/services/borrow-card.service.ts` — `BORROW_CARD_LAYOUT` {bookRowHeightMm **2.7**, pageOne.bodyMm **17** (header 12/footer 9 tetap), continuation tetap}; CSS `.book-row` 7.5pt + line-height 2.7mm + `gap: 3mm`; `.num` flex 0 0 5mm (tanpa margin); `.title` flex **0 1 auto** (tidak memenuhi sisa baris); `.inv` margin-left 5mm; `.body` 17mm + margin-bottom 1mm + border-bottom #e2e8f0; `.avatar` 17mm.
- **Kapasitas dipertahankan 5+13:** halaman 1 = floor((54−(12+17+9+0.5))/2.7) = **5**; lanjutan = floor((54−(8+9))/2.7) = **13**. 20 buku → 3 kartu (5+13+2), pagination deterministik tanpa ubah kode pagination.
- **TIDAK diubah:** DTO (`borrow-card.ts`), Repository, Borrow/Return Service, IPC, preload, env.d.ts, schema, migration, `print.service.ts` (PDF fix), Preview/Print pipeline, renderer.
- **Validation PASS:** lint; build (main **1,883.05 kB** ±0.01 · preload **9.95 kB identik** · renderer **1,147.66 kB identik**); `prisma migrate diff` = "This is an empty migration."; smoke MURNI wo1 **104** · v11 layout **60** · v12 layout **38**; smoke DB uat **31** (fresh DB temp); smoke Electron v11 geometry **10** · v12 geometry **18** · pdf **6** → **TOTAL 267 PASS, 0 FAIL**. Geometry nyata: gap inv→judul **tepat 8mm** `[8,8,8,8,8]` (flex gap 3mm + margin-left 5mm), num→judul **3mm**, legroom judul pendek **65.79mm** (inv tidak rata tepi), separator + jarak **1mm**, judul panjang ellipsis + inv tetap 8mm, distribusi [5,13,2], PDF tetap 312.000×169.920pt (110.067×59.944mm).
- **Laporan:** `WORK_ORDER_BORROW_CARD_LAYOUT_V12.md`, `BORROW_CARD_LAYOUT_V12_FINAL_REVIEW.md`, `BORROW_CARD_LAYOUT_V12_RELEASE.md`. Status: **DONE - menunggu review PO** (tidak membuka WO baru).

### Pelajaran (retain)
- **Perubahan murni visual = 3 kompromi kecil di SATU file** — 7.5pt/8mm/separator. Kapasitas 5+13 dipertahankan dengan menggeser mm antar zona: body 18→17 & baris 2.8→2.7 memberi ruang separator (1mm margin + 1px border) tanpa mengurangi jumlah baris. Verifikasi via formula, bukan hardcode.
- **Posisi inventory number "mengikuti judul" = flex `gap` + `margin-left` proporsional, BUKAN margin keras.** Review PO menolak `margin-left: 13mm` (nilai hanya ilustrasi) — teknik terbaru: `.book-row { display: flex; gap: 3mm }` (gap menggantikan `margin-right` pada `.num`) + `.inv { margin-left: 5mm }` → gap inv→judul tepat **8mm** di semua baris; judul pendek menyisakan legroom **65.79mm** di kanan (sign area terlihat lebih luas); judul panjang tetap ter-ellipsis tanpa memindah inv. Tanpa `justify-content: space-between`, judul `flex: 0 1 auto`.
- **PO menilai HASIL VISUAL, bukan teknik CSS** — saat keputusan PO memuat angka ilustrasi, konfirmasi apakah itu requirement atau contoh; verifikasi akhir = geometry render nyata (gap/legroom/overlap), bukan string-match nilai hardcoded.
- **Pemisah antar zona = `border-bottom` di zona atas + `margin-bottom`** — bukan elemen `<hr>` baru; halaman lanjutan TANPA `.body` otomatis tanpa pemisah. Geometry mengukur jarak `books.top − body.bottom` = 1mm.
- **Pitfall MEASURE di geometry Electron:** konstanta main-process (`MM`) TIDAK tersedia di renderer `executeJavaScript` — definisikan di dalam string IIFE; selector `.body` boleh `null` di halaman lanjutan → guard `body && books ?` sebelum `.getBoundingClientRect()`.
- **Grep false-positive assertion**: `.book-row .inv { flex: 0 0 auto; margin-left: 5mm; ... }` harus dicocokkan dengan substring penuh (6.5pt monospace) agar tidak lolos dengan margin lama; gunakan `includes('.book-row { display: flex; gap: 3mm; font-size: 7.5pt;') && !includes('justify-content: space-between')` untuk membuktikan pembuangan space-between.
- **Regression suite hidup**: `borrow_card_layout_v11_smoke/smoke.ts` STEP 5 CSS marker di-update ke nilai v1.2 (bukan membuat suite terpisah yang menduplikasi) — v1.1 & v1.2 diuji bersamaan; suite v12 baru menambah assertion gap/separator/kapasitas yang lebih spesifik.
- Smoke compile & run mengikuti pola v1.1 (node16 untuk bwip-js, geometry via `electron ... <outDir>` in-repo, uat fresh DB temp).

---

## BORROW CARD PRINT PIPELINE FIX: Cetak default 110×60mm (COMPLETE - READY review PO)

### Ringkasan
- **WO:** perbaiki **jalur Print** kartu peminjaman agar default paper size = **110×60mm** (bukan A4/default). Source of Truth `PRINT_PIPELINE_INVESTIGATION.md` (APPROVED) — pola "parameter paper size tidak diteruskan ke API cetak" pada dua jalur: **PDF** sudah diperbaiki WO sebelumnya (`preferCSSPageSize: true`), **Print** diperbaiki WO ini. Scope: **HANYA jalur Print**; Preview/PDF/template/layout/business logic/DTO/Repository TIDAK disentuh.
- **Modifikasi (1 file source):** `electron/main/services/print.service.ts` — `printBorrowCard()` kini meneruskan `pageSize: { width: BORROW_CARD_LAYOUT.pageWidthMm * 1000, height: BORROW_CARD_LAYOUT.pageHeightMm * 1000 }` (= `{ width: 110000, height: 60000 }` **mikron**) ke `printHtml` → `webContents.print`; import +`BORROW_CARD_LAYOUT` dari `borrow-card.service.ts` (read-only). `printHtml` TIDAK diubah (helper bersama label buku A4 & bukti legacy) — `pageSize` diteruskan per-jalur via `printOptions`.
- **TIDAK diubah:** Preview, PDF (`renderPdf`/`preferCSSPageSize`), template `@page`, layout, IPC/preload/env.d.ts, schema/migration, jalur label buku & bukti (tetap A4).
- **Validation PASS:** lint; build (main **1,883.46 kB** +0.41 · preload **9.95 kB identik** · renderer **1,147.66 kB identik**); `prisma migrate diff` = "This is an empty migration."; smoke Electron baru `borrow_card_print_fix_smoke/main.cjs` **11/11 PASS** (`PRINT_PAGE_SIZE=110000x60000`, label TANPA pageSize, PDF regression 312.000×169.920pt); regression wo1 **104** · v11 **60** · v12 **38** · uat **31** · pdf_fix **6** · geometry v11/v12 PASS → **250 + 2, 0 FAIL**.
- **Laporan:** `WORK_ORDER_BORROW_CARD_PRINT_FIX.md`, `BORROW_CARD_PRINT_FINAL_REVIEW.md`, `BORROW_CARD_PRINT_RELEASE.md`. Status: **DONE - menunggu review PO** (tidak membuka WO baru).

### Pelajaran (retain)
- **`webContents.print` TIDAK punya `preferCSSPageSize`** (hanya `printToPDF`) — dialog cetak fisik diatur opsi `pageSize` (mikron), bukan `@page`. Template `@page` hanya untuk PDF/print-to-scale Chromium.
- **`WebContentsPrintOptions.pageSize` = `string | Size`** — custom size memakai `Size { width, height }` dalam **mikron** (110mm=110000, 60mm=60000). Derive dari `BORROW_CARD_LAYOUT.pageWidthMm*1000` agar SSOT dimensi kartu tetap 1 tempat (jangan hardcode di print service).
- **Ubah per-jalur, bukan helper global** — `printHtml` dipakai label buku (A4) & bukti legacy; `pageSize` diteruskan HANYA di `printBorrowCard` via `printOptions`, sehingga scope tetap dan tidak ada efek samping.
- **Intercept `webContents.print` tanpa dialog:** patch `BrowserWindow.prototype.loadURL` → setelah `super`/webContents tersedia, set `wc.print = (opts, cb) => { capture; cb(true) }` — karena `printHtml` memanggil `loadURL` DULU lalu mendaftarkan `did-finish-load`, spy sudah terpasang sebelum `print` dipanggil. Jangan reassign `BrowserWindow` global (compiled module memegang `electron_1.BrowserWindow` — reassign tidak berefek).
- **Bukti scope negatif:** smoke memanggil `printBookLabels` setelah `printBorrowCard` dan assert opsi label TIDAK memuat `pageSize` — membuktikan helper netral & perubahan terbatas kartu.
- **Keterbatasan perangkat:** `pageSize` menyetel ukuran job print; hasil fisik bergantung driver/printer mendukung custom paper 110×60mm (printer label/kartu). Ini keterbatasan hardware, terdokumentasi investigasi.
- Smoke compile: `npx tsc --module node16 --moduleResolution node16 ... electron\main\services\print.service.ts` → outDir in-repo (`<wo>_smoke/out/`, gitignored) → `electron main.cjs <outDir> <pdfPath>`; NODE_PATH tidak dibaca Electron.

---

## WO-1 (Production Data Infrastructure): Path Helper + userData + Directory Manager + Folder Bootstrap (COMPLETE - READY review PO)

### Ringkasan
- Source of Truth: `ADR_001_DATA_PROTECTION_FINAL_DECISIONS.md` (FINAL APPROVED) + `RFC_001_DATA_PROTECTION_ARCHITECTURE.md` (APPROVED). Keputusan PO: fondasi lokasi data production saja — **BUKAN** Manifest/Provider/Backup Engine/Restore Engine/UI.
- **File baru (3 source + 1 smoke):** `src/main/infrastructure/paths.ts` (Path Helper PURE tanpa Electron — `createAppPaths(root)` resolve absolut 11 subfolder + `databaseFile=<database>/aplibrary.db` + `appDirectoryList` 12 entri, persis ADR-001 §3.1; `DATABASE_FILENAME='aplibrary.db'` konstanta), `src/main/infrastructure/directory-manager.ts` (`DirectoryManager.ensureAll(dirs)` idempoten via `fs.access`+`fs.mkdir recursive` → `{ dirs, newlyCreated, alreadyExisted }`), `electron/main/infrastructure/bootstrap.ts` (Folder Bootstrap: `bootstrapDataInfrastructure(rootOverride?)` → `rootOverride ?? app.getPath('userData')` → `createAppPaths` → `ensureAll(appDirectoryList)` → `{ root, paths, newlyCreated, alreadyExisted }`), `wo1_data_infra_smoke/smoke.ts` (**88/88 PASS**).
- **Revisi PO (WO-1 R1):** mekanisme override env `APPLIBRARY_USER_DATA` **DIHAPUS**; `bootstrapDataInfrastructure()` menerima **parameter opsional `rootOverride`** (`bootstrapDataInfrastructure()` produksi / `bootstrapDataInfrastructure(testRoot)` uji); produksi tetap `app.getPath('userData')`; smoke memakai **parameter `testRoot`** (bukan env); `console.log` startup diberi `TODO(WO Logging)` — akan diganti Logging Framework pada Work Order Logging.
- **Dimodifikasi (1):** `electron/main/index.ts` — `app.whenReady()` memanggil `bootstrapDataInfrastructure()` SEBELUM `initDatabase()` (ADR-001 §9 langkah 2: direktori wajib ada sebelum koneksi DB), dua `console.log('[DataInfra] …')` + TODO logging.
- **Arsitektur:** Pure vs Electron dipisah — `src/main/infrastructure/` murni (headless-testable), hanya `bootstrap.ts` di `electron/main/infrastructure/` yang mengimpor `app`; override root via parameter fungsi, bukan env.
- **TIDAK diubah:** schema/migration/DB dev (`prisma migrate diff` = "This is an empty migration."), `DATABASE_URL`, PrismaClient dual, container/IPC/preload/renderer/UI. **Relokasi DB (`prisma/aplibrary.db` → `userData/database/`) + `DATABASE_URL` runtime + journal WAL = keputusan teknis tersisa (ADR-001 §8.2 Q2–Q5), WO terpisah — BUKAN bagian WO-1.**
- **Validation PASS (revisi):** (1) `npm run lint`; (2) `npm run build` (main **1,885.87 kB** +2.41 · preload **9.95 kB identik** · renderer **1,147.66 kB identik**); (3) smoke `wo1_data_infra_smoke` **88/88 PASS** (blok lama 36 + blok baru `bootstrapDataInfrastructure(testRoot)` #37–44 — testRoot dipakai sebagai root, 12 dibuat, idempoten, struktur; kode asli hasil tsc); (4) `prisma migrate diff` = empty; (5) grep bundle main `bootstrapDataInfrastructure`/`app.getPath("userData")`/`"aplibrary.db"`/`[DataInfra]` = ter-render, **`APPLIBRARY_USER_DATA` = 0 match (dihapus)**.
- **Laporan:** `WORK_ORDER_1_PRODUCTION_DATA_INFRASTRUCTURE.md`. Status: **DONE - READY review PO** (tidak membuka WO berikutnya).

### Pelajaran (retain)
- **Pure vs Electron dipisah di modul infra** — Path Helper + Directory Manager di `src/main/infrastructure/` (tanpa `app`) bisa di-smoke headless; hanya `bootstrap.ts` di `electron/main/infrastructure/` mengimpor Electron. Konsisten pola `print.service`(electron) → `borrow-card.service`(src/main).
- **Import kedalaman Electron-wiring wajib cek:** `electron/main/infrastructure/bootstrap.ts` mengimpor `src/main/...` dengan `../../../src/main/...` (dari `electron/main/infrastructure/` naik 3 level), bukan `../../` — TS2307 muncul saat import salah kedalaman.
- **`fs.mkdir({recursive:true})` ikut membuat root** — smoke assertion `alreadyExisted` harus tahu bahwa pre-creating `root` atau `logs` mengubah pembagian created/existing; jangan asumsikan hanya subfolder yang terdeteksi.
- **`databaseFile` adalah file, bukan folder** — jangan masukkan ke `appDirectoryList` (12 entri folder: root + 11); assertion cek keanggotaan list harus mengecualikannya.
- **Override root untuk pengujian = parameter fungsi, bukan env** (revisi PO) — `bootstrapDataInfrastructure(rootOverride?)`; smoke memanggil `bootstrapDataInfrastructure(testRoot)` pada kode asli hasil kompilasi tsc (yang mempertahankan `rootOverride ?? app.getPath('userData')`).
- **Minifier esbuild dapat men-specialize fungsi ke satu call-site**: di bundle main, `bootstrapDataInfrastructure` tampak mengabaikan `rootOverride` (`const root = electron.app.getPath("userData")`) karena satu-satunya pemanggil di startup tanpa argumen → perilaku produksi tetap benar. Jangan menilai source dari bundle minified; bukti parameter dipakai = kompilasi tsc + smoke.
- **WO-1 TIDAK memindahkan DB** — DB tetap `prisma/aplibrary.db`; `userData/database/aplibrary.db` baru siap (struktur dibuat) tapi belum dipakai sampai keputusan §8.2 Q2–Q5.
- Smoke compile: `npx tsc --module commonjs --moduleResolution node ... wo1_data_infra_smoke/smoke.ts` → `node <out>\wo1_data_infra_smoke\smoke.js` (tanpa DB/Electron; import transitif `bootstrap.ts` menarik `require('electron')` — aman di plain node karena hanya diakses bila `rootOverride` kosong; `NODE_PATH=<repo>\node_modules`; cleanup `os.tmpdir()/wo1-data-infra-<ts>`).


---

## WO-2 (Manifest Domain): Manifest Model + Metadata + Entry + Summary + Validator + SchemaVersion VO + Checksum VO (COMPLETE - READY review PO)

### Ringkasan
- Source of Truth: `ADR_001_DATA_PROTECTION_FINAL_DECISIONS.md` (FINAL APPROVED, SSOT) + RFC-002/003/004. Scope: **Domain Manifest murni** - BUKAN Backup/Restore Engine, ZIP, Provider, UI, Electron API. Manifest TIDAK boleh tahu filesystem/zip/electron/sqlite/provider.
- **File baru (8 source):** `src/main/domain/manifest/domain-error.ts` (`ManifestDomainError`), `schema-version.ts` (`SchemaVersion` VO - string identitas skema, trim, <=128, tanpa kontrol; `isSchemaVersion`; BELUM baca migration), `checksum.ts` (`Checksum` VO - 64 hex SHA-256, di-lowercase; `isChecksum`; BELUM hitung SHA256), `metadata.ts` (`ManifestMetadata` - backupVersion int>=1, appVersion/appName/type non-kosong, schemaVersion instanceof, createdAt Date valid, engine?/integrity?; `MANIFEST_BACKUP_VERSION=1`, `MANIFEST_BACKUP_TYPE_FULL='full'`), `entry.ts` (`ManifestEntry` - path relatif kanonik, sizeBytes int>=0, sha256 Checksum, kind {database,asset,log}; `isRelativeManifestPath` murni tanpa node:path - tolak leading slash, backslash, ../, drive-letter, URI, trailing slash, double slash, kontrol), `summary.ts` (`ManifestSummary` - files/totalBytes wajib int>=0, tables?/members? opsional [ADR-001 §8.2 Q5 open]), `manifest.ts` (`Manifest` aggregate - format wajib `aplibrary-backup`, toJSON faithful RFC-002 §4, `isManifestJSON`), `validator.ts` (`ManifestValidator.validate(raw)` -> `{ok:true,manifest}|{ok:false,errors[]}` - 5 tugas mandat PO: field wajib, schema version, duplicate entry, relative path, checksum format; field tak dikenal DIABAIKAN [additive-only]).
- **TIDAK diubah:** schema/migration (`prisma migrate diff` = "This is an empty migration."), IPC/preload/bootstrap/env.d.ts/renderer/UI/engine/provider.
- **Validation PASS:** (1) lint; (2) build (main **1,886.02 kB** Â· preload 9.94 kB Â· renderer 1,148.25 kB - identik baseline, **grep bundle `aplibrary-backup`/`manifestSha256`/`ManifestValidator` = 0** = bukti standalone/TIDAK ter-wire); (3) smoke `wo2_manifest_domain_smoke/smoke.ts` **167/167 PASS** murni tanpa DB/Electron (SchemaVersion 13, Checksum 12, Metadata 14, Entry+path 28, Summary 10, Model 14, Validator valid+additive 9, field wajib 28, schema version 6, duplicate 5, relative path 12, checksum 10; round-trip `toJSON` == JSON asli).
- **Laporan:** `WORK_ORDER_2_MANIFEST_DOMAIN.md`. Status: **DONE - READY review PO** (tidak lanjut WO berikutnya).

### Revisi (Review PO - Immutability, COMPLETE)
- PO: Manifest Domain harus **benar-benar immutable** — getter Array → defensive copy, getter Date → copy Date, tanpa mengubah kontrak public.
- **Perubahan (4 file source):** `manifest.ts` (`create()` simpan COPY array `files` + COPY objek `checksums`; getter `files` → `[...this._props.files]`; getter `checksums` → objek baru), `metadata.ts` (`of()` simpan COPY objek props + COPY Date `createdAt`; getter `createdAt` → `new Date(...)`), `entry.ts`/`summary.ts` (`of()` simpan COPY objek props).
- **Smoke +11 (178 total):** section 13 "Immutability" — getter `files`/`createdAt`/`checksums` selalu instance baru; `push`/`splice`/`setUTCFullYear`/`setTime`/reassign oleh caller TIDAK mengubah state internal; mutasi input (`Date` ke `of`, array ke `create`) setelah konstruksi juga tidak berpengaruh.
- **Validation PASS:** lint; build (main **1,841.82 kB** · preload **9.71 kB** · renderer **1,121.34 kB**, manifest tetap 0 match di bundle); smoke **178/178**; `prisma migrate diff` = "This is an empty migration." (schema tidak disentuh).
- **Status: DONE - menunggu review PO** (tidak lanjut WO berikutnya).

### Pelajaran (retain)
- **Manifest = domain model murni** - nol import di luar folder `src/main/domain/manifest/` (hanya `Date`); dipakai Backup Engine (RFC-003) & Restore Engine (RFC-004) via `src/main/` (tsconfig.node). Jangan taruh di `src/shared/` (renderer tak boleh pegang business logic manifest).
- **Pola VO: factory `of()` throw (fail-fast, konstruksi programatik) + predikat `isX()` non-throwing (Validator collect banyak error)** - nilai kanonik di-trim/lowercase; `equals()` struktural.
- **Validator = satu pintu parse dari `unknown`** (manifest dibaca dari JSON on-disk); memeriksa struktur + membangun tipe `Manifest`. `Manifest.create()` tetap ada untuk konstruksi programatik (Backup Engine).
- **Path relatif divalidasi MANUAL (tanpa `node:path`)** - node:path platform-dependent (separator); aturan kanonik RFC-002 (forward-slash, relatif, tanpa ../) murni & headless-testable.
- **Pitfall TS narrowing tanpa `--strict`:** `if (r.ok)` truthiness TIDAK men-narrow `r.errors` di branch false saat compile tanpa strict (TS2339); pakai perbandingan eksplisit `r.ok === true` / `r.ok === false` agar aman di kompilasi smoke commonjs+node (tanpa --strict). Case yang sama muncul di kind literal (`kind: 'backup' as never`).
- **`summary.tables`/`members` opsional** - ADR-001 §8.2 Q5 masih open; jangan kunci kontrak sebelum keputusan engine.
- **Bukti standalone = grep bundle main**: modul yang belum di-import mana pun TIDAK masuk bundle (tree-shake) - `aplibrary-backup`=0, `manifestSha256`=0, `ManifestValidator`=0 di `out/main/index.js`.
- **Immutability penuh = copy pada GETTER (keluar) DAN copy pada KONSTRUKSI (masuk).** Getter Array/Date/objek wajib mengembalikan instance baru (`[...files]`/`new Date(...)`/objek baru) agar mutasi hasil getter tidak menyentuh internal; factory (`of`/`create`) wajib meng-copy input (`{...props}`, `[...files]`, `new Date(t)` agar mutasi objek milik caller setelah konstruksi juga tidak mengubah internal. Buktikan dua arah di smoke: mutasi hasil getter DAN mutasi input sumber sama-sama tidak berpengaruh.
- **Smoke cast objek ke index-signature** (uji mutasi objek getter) perlu `as unknown as Record<string, unknown>` — TS2352 menolak `ManifestChecksums` langsung ke `Record<string, unknown>` (index signature tidak overlap) tanpa melewati `unknown`.
- **`Date` adalah mutable reference** — menyimpan `props.createdAt` apa adanya (atau mengembalikan `this._props.createdAt`) adalah kebocoran immutability; copy via `new Date(d.getTime())` di getter dan di `of()`.
- **Perubahan murni immutability = tanpa perubahan kontrak public** — signature & tipe getter/factory identik; buktikan bundle main tetap 0 match manifest (tree-shaken) dan seluruh smoke lama masih hijau.
- Smoke compile: `npx tsc --module commonjs --moduleResolution node --target es2022 --esModuleInterop --skipLibCheck --rootDir . --outDir <tmp>\out wo2_manifest_domain_smoke/smoke.ts` -> `node <tmp>\out\wo2_manifest_domain_smoke\smoke.js` (tanpa DB/Electron; `NODE_PATH=<repo>\node_modules`).
