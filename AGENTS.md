# APLibrary — Session Summary

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
- Root cause: schema/DB column mismatch (`memberNumber`→`number`, `birthPlace`→`birthplace`)
- Fixed with `@map` + `prisma db push`

### Schema Normalization Audit
- Full drift analysis: 6 orphaned migrations, 5 `db push` tables, `@map` bridges
- Two-migration plan: M7 (baseline record) + M8 (remove `@map`)

### WO-006C: Member Navigation Redesign
- Collapsible Anggota sidebar (Siswa/Guru/Umum), 3 routes, MemberListPage
- Filtering moved from React → backend (Repository/Service/IPC)
- STAFF→GENERAL rename across all layers
- Case bug fixed (STUDENT→student) in route props

### WO-007: Borrowing Module Audit (COMPLETE)
See full report below.

---

## WO-007: Borrowing Module — Discovery & Architecture Audit — LENGKAP

## 1. RUANG LINGKUP
Audit menyeluruh terhadap Borrowing Module: Prisma schema, Repository, Service, IPC, Preload, UI Pages, Routes, Sidebar, DTO, env.d.ts.

## 2. ARSITEKTUR — DUA STACK PARALEL

### STACK A (BARU — `src/main/`)
| Layer | File | Model Prisma |
|-------|------|-------------|
| Service | `src/main/services/borrow.service.ts` | `Borrow`, `BorrowDetail` |
| Repository | `src/main/repositories/borrow.repository.ts` | `Borrow` |
| Repository | `src/main/repositories/borrow-detail.repository.ts` | `BorrowDetail` |

### STACK B (LEGACY — `electron/main/`)
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
- **Digunakan:** YA — Production flow (create, findMany, findById)
- **Duplicate:** Ya — BorrowingService (legacy) adalah duplikat dengan schema salah
- **Rekomendasi: PERTAHANKAN**

### BorrowingService (`electron/main/services/borrowing.service.ts`)
- **Digunakan:** SEBAGIAN — hanya `findBookCopyByBarcode()` dipakai
- **Dead code:** Method `getAll`, `getById`, `create` tidak dipanggil
- **Duplicate:** Ya — BorrowService adalah pengganti
- **Rekomendasi: HAPUS** — pindahkan `findBookCopyByBarcode` ke service lain

### BorrowRepository (`src/main/repositories/borrow.repository.ts`)
- **Digunakan:** YA — oleh BorrowService (baru)
- **Duplicate:** Ya — BorrowingRepository
- **Rekomendasi: PERTAHANKAN**

### BorrowingRepository (`electron/main/repositories/borrowing.repository.ts`)
- **Digunakan:** YA — oleh BorrowingService, ReturnService, PrintService
- **Akan RUNTIME ERROR** karena model `Borrowing` tidak ada di schema
- **Rekomendasi: HAPUS**

### BorrowDetailRepository (`src/main/repositories/borrow-detail.repository.ts`)
- **Digunakan:** YA — oleh BorrowService (baru)
- **Rekomendasi: PERTAHANKAN**

### BorrowingItemRepository (`electron/main/repositories/borrowing-item.repository.ts`)
- **Digunakan:** YA — oleh ReturnService, BorrowingService, langsung dari IPC (`getMemberBorrowingStats`)
- **Akan RUNTIME ERROR** karena model `BorrowingItem`/`Borrowing` tidak ada
- **Rekomendasi: HAPUS** — pindahkan method yang diperlukan ke BorrowDetailRepository

### ReturnService (`electron/main/services/return.service.ts`)
- **Digunakan:** YA — Return flow (`findByBarcode`, `returnBook`)
- **Akan RUNTIME ERROR**
- **Rekomendasi: HAPUS** — buat ReturnService baru di `src/main/services/`

### ReturnRepository (`electron/main/repositories/return.repository.ts`)
- **Digunakan:** YA — oleh ReturnService
- **Akan RUNTIME ERROR**
- **Rekomendasi: HAPUS** — buat ReturnRepository baru di `src/main/repositories/`

## 5. TEMUAN TAMBAHAN

### 5.1 `members:search` — Missing IPC Handler
- `BorrowingsPage.tsx:53` memanggil `window.electronAPI.members.search(query)`
- Tidak ada handler, preload method, atau type definition
- Runtime error saat user mencari anggota di form peminjaman

### 5.2 `PrintService` — Dual Dependency
- Bergantung pada `BorrowingRepository` (legacy, broken)
- Perlu diport ke Stack A menggunakan `BorrowRepository`

### 5.3 Legacy `MemberRepository` (`electron/main/repositories/member.repository.ts`)
- Hanya punya `findById`, `update`, `search`
- Digunakan oleh `BorrowingService` (legacy) — akan ikut terhapus saat Stack B dibersihkan

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
| WO-007J | Cleanup `bootstrap.ts` — hapus instantiasi legacy borrowing classes |

## 7. KESIMPULAN
**Module tidak production-ready.** 9 production flows: 2 bekerja, 3 broken, 1 partial broken, 2 tanpa UI. Root cause: Stack B mempertahankan referensi ke model Prisma yang sudah dihapus dari schema.

---

## WO-PV-01: ADR-002 Migration Recovery Implementation (COMPLETE)

### Ringkasan
- ADR-002 disetujui (Strategi C+D: squash baseline + governance) menggantikan Strategi A yang sempat diimplementasikan.
- **Pekerjaan 1 — Migration Recovery (DONE):**
  - 11 migration lama (termasuk 2 no-op REPAIR + `20260731_pv01_schema_baseline`) di-archive ke `prisma/migrations_archive/` sebagai dokumentasi.
  - Baseline tunggal `prisma/migrations/20260731_adr002_initial/migration.sql` (296 baris) di-generate resmi via `prisma migrate diff --from-empty --to-schema-datamodel --script`.
  - Fresh DB `migrate deploy` PASS; `migrate diff` = "No difference detected" (replay & datasource); `migrate status` = up to date.
  - Dev DB di-reconcile hanya via mekanisme resmi `prisma migrate resolve --applied` — TIDAK ada perubahan manual checksum `_prisma_migrations`. Checksum baseline baru match dengan file (hash dihitung Prisma). 11 record lama tetap ada sebagai riwayat (folder sudah tidak aktif).
- **Pekerjaan 2 — Member Detail (DONE):** `src/pages/MemberDetailPage.tsx` memakai data real (`api.members.findById`, `api.borrowings.findMany`, `api.borrowings.getMemberBorrowingStats`); `MOCK_MEMBER` 0 match di seluruh `src/`.
- **Validation:** `npm run lint` PASS, `npm run build` PASS.
- **Regression:** seeded smoke test pada fresh baseline DB PASS (findById+classInfo, borrowings search/findById/stats, returns findByBarcode/returnBook, stats turun ke 0). DB uji dibersihkan.
- **Status: READY.**

### Pelajaran (retain)
- Field Prisma ter-map: `memberNumber`/`borrowNumber` (bukan `number`); smoke seed wajib pakai `memberNumber`.
- `prisma/migrations/` di-gitignore; `prisma/migrations_archive/` TIDAK tercakup pola gitignore (jika nanti commit, perlu pola tambahan).
- Squash baseline: arsipkan folder lama → generate `--from-empty` baseline → `migrate resolve --applied` (dev yang sudah ada schema final) → status hijau. Fresh deploy hanya 1 migration.

---

## WO13: Procurement Information Activation (COMPLETE)

### Ringkasan
- Feature "Informasi Pengadaan" diaktifkan: kolom procurement ditambahkan ke `BookCopy` (bukan model `Procurement` terpisah): `acquisitionSource String?`, `acquisitionPrice Int?`, `acquisitionNotes String?` — reuse `acquisitionDate` yang sudah ada.
- **Schema & Migration (DONE):** `prisma/migrations/20260731_wo13_procurement_fields/` (3 ALTER). Baseline `20260731_adr002_initial` TIDAK dimodifikasi.
- **Backend (DONE):** `electron/main/services/book-copy.service.ts` `addCopies` validasi harga (integer non-negatif) + persist 4 field via `executeAddCopiesTransaction`; `src/main/repositories/book-copy.repository.ts` `CreateBookCopyData` + 3 field; `src/shared/dto/book.ts` `CreateBookCopiesDTO` + 4 field opsional; `src/renderer/env.d.ts` `bookCopies.findById` + 3 field. TIDAK ada perubahan IPC/preload/bootstrap (channel `bookCopies:addCopies` sudah ada).
- **Frontend (DONE):** dialog "Tambah Eksemplar" di `BookDetail.tsx` kini punya form procurement aktif (Tanggal, Sumber dropdown + "Lainnya", Harga, Catatan); placeholder disabled dihapus dari `BookForm.tsx` (helper `Section` hilang prop `placeholder`); `InventoryDetailPage.tsx` menampilkan Sumber/Harga/Catatan Pengadaan; `labels.ts` + `ACQUISITION_SOURCES`, `FIELD.ACQUISITION_*`.
- **Validation:** `npm run lint` PASS, `npm run build` PASS, fresh DB `migrate deploy` PASS (urutan baseline→WO13 benar), `migrate status` hijau (dev & fresh), `migrate diff` = "No difference detected", smoke test Prisma client (insert+baca 4 field procurement) PASS.
- **Status: READY.** Perubahan WO13 ada di working tree di atas 194 perubahan staged WO-BR-99 (belum commit).

### Pelajaran (retain)
- **Urutan folder migration Prisma = sort lexicographic.** `20260731094204_...` (`'0'`=0x30) mengurut SEBELUM `20260731_adr002_initial` (`'_'`=0x5F) → fresh deploy menerapkan ALTER sebelum baseline → P3018. Fix: nama folder `20260731_wo13_procurement_fields` (urut setelah `adr002`). **SELALU verifikasi fresh-DB deploy setelah menambah migration**, bukan hanya dev DB (dev DB menyembunyikan masalah urutan karena baseline sudah applied).
- Reconcile dev DB setelah rename folder: `prisma migrate resolve --applied <nama-baru>` + `prisma db execute` DELETE record stale dari `_prisma_migrations` (bukan edit checksum).
- Smoke test env: `$env:DATABASE_URL` di-override akan menang atas `.env`; relative SQLite path diselesaikan oleh Prisma — pakai absolute `file:C:/...` untuk DB uji. Script import `@prisma/client` harus berada di dalam repo (node resolve dari lokasi script).
- WO13 adalah WO pertama yang menyentuh schema setelah baseline squash — alur baku: edit schema → `prisma migrate diff --from-migrations --to-schema-datamodel --script` → tulis folder `prisma/migrations/<ts>_<name>/migration.sql` → `prisma migrate deploy` → `prisma generate` → lint+build+smoke.

---

## WO13-R1: Procurement Revision 1 (COMPLETE)

### Ringkasan
- **Rename:** `acquisitionPrice` → `acquisitionCost` (kolom, DTO, repository, service, env.d.ts). Label UI: **"Harga Perolehan"** (bukan "Harga Beli").
- **`acquisitionSource` = enum ketat:** `PEMBELIAN`, `DONASI`, `HIBAH`, `BANTUAN_PEMERINTAH`, `LAINNYA` — free text tidak lagi disimpan; validasi enum ditambahkan di `book-copy.service.ts` (`VALID_ACQUISITION_SOURCES`).
- **Field baru `acquisitionSourceDetail String?`:** textbox "Jelaskan Sumber Perolehan" hanya tampil saat source=`LAINNYA`; disimpan ke field ini.
- **Inventory Detail:** tampilkan "Sumber Perolehan: Lainnya" + blok "Detail" saat `LAINNYA`; blok Detail disembunyikan untuk source lain bila kosong.
- **Migration baru:** `prisma/migrations/20260731_wo13_revision1_source_detail/` — ditulis manual `RENAME COLUMN` (mengawetkan data; Prisma diff akan DROP+ADD). Migration lama & baseline TIDAK diedit.
- **Validation:** `prisma generate`, `migrate deploy`, `migrate status`, `migrate diff` = "No difference detected" — semua PASS; fresh DB deploy urutan benar (baseline→WO13→R1); `npm run lint` PASS; `npm run build` PASS; smoke test (insert LAINNYA+detail, kolom lama ditolak client) PASS.
- **Status: READY.** Laporan: `WO13_REVISION1_REPORT.md`. Belum commit (menunggu instruksi).

### Pelajaran (retain)
- **Rename kolom SQLite** = tulis migration manual `ALTER TABLE ... RENAME COLUMN` (Prisma diff menghasilkan DROP+ADD → data hilang). Verifikasi: akses kolom lama via Prisma client harus error.
- **Nama folder migration baru wajib sort AFTER folder WO13:** `revision1` (`r` > `p`) benar; tetap verifikasi fresh deploy karena ini WO ke-2 yang menyentuh `BookCopy` setelah baseline.
- Istilah UI harga perolehan: **"Harga Perolehan"** — `FIELD.PRICE` (labels.ts) adalah key mati lama yang masih berisi "Harga Beli" (tidak dipakai, di luar scope).

---

## WO-8: Barcode & Label (COMPLETE — READY review PO)

### Ringkasan
- **Keputusan PO:** (1) nilai barcode di DB = `inventoryNumber` (bukan `BC-XXXX`); (2) simbol **Code128**; (3) gambar barcode **TIDAK disimpan** — dirender saat cetak; (4) `Setting.barcodeFormat` dibiarkan (tidak dikonsumsi).
- **File baru:** `src/main/services/barcode.service.ts` (`generateBarcodeSvg` Code128 via `bwip-js/node`), `src/main/services/label.service.ts` (`generateLabelsHtml` A4 2-kolom, `.label` 50%×63mm, escapeHtml, fallback `item.barcode || item.inventoryNumber`), DTO `BookLabelData`/`BookLabelItemData` di `src/shared/dto/print.ts`.
- **Modifikasi:** `electron/main/services/print.service.ts` (`printBookLabels` + `printHtml(html, printOptions?)` opsional non-breaking), `electron/ipc/print.ipc.ts` (`printing:bookLabels`), `electron/preload/print.preload.ts` (`print.bookLabels`), `src/renderer/env.d.ts`, `electron/main/services/book-copy.service.ts` (**Decision #1:** `barcode: invNum`, `generateBarcodes` dihapus, `crypto.randomUUID` tetap), `src/components/books/BookDetail.tsx` (tombol "Cetak Label"), `src/utils/labels.ts` (`COPY.PRINT_LABELS`), `package.json`+`package-lock.json` (`bwip-js@^4.11.2`).
- **TIDAK diubah:** Matching/Validation/AutoCreate/BookImportService/BookCopyRepository; schema+migrasi DB; `Setting.barcodeFormat`; backfill.
- **Validation:** `npm run lint` PASS, `npm run build` PASS (main 1,746.12 kB), smoke unit 16/16 (SVG Code128, HTML label, escaping, fallback), smoke DB `addCopies` asli 16/16 (fresh DB 3 migration: barcode===inventoryNumber tiap row, unik `INV-`, `findByBarcode` bekerja). DB uji dibersihkan.
- **Laporan:** `SPRINT9_WO8_IMPLEMENTATION_REPORT.md`, `SPRINT9_WO8_ARCHITECTURE_CHECKLIST.md`, `SPRINT9_WO8_DECISION_LOG.md`, `SPRINT9_WO8_TECHNICAL_DEBT.md`.
- **Status: DONE — Architecture Gate BERHENTI**, menunggu review Product Owner (tidak lanjut WO berikutnya).

### Pelajaran (retain)
- **`bwip-js` wajib import `bwip-js/node`** (bukan `bwip-js`) — paket memakai conditional exports (`node`/`browser`/`electron`); dengan `moduleResolution: bundler` import default tidak resolve. Untuk menjalankan smoke JS yang mengimpor `bwip-js/node` di luar bundle, set `NODE_PATH=<repo>\node_modules`.
- **Smoke DB service legacy:** `electron/main/database.ts` memakai singleton `prisma` yang hanya terisi setelah `initDatabase()`; repo/service mengimpor `prisma` via binding modul (live) — jangan destructure `const { prisma } = require(...)` saat require (tertangkan `undefined`), akses `db.prisma` setelah `await initDatabase()`.
- **Compile terpisah service legacy utk smoke:** `npx tsc --module commonjs --target es2022 --moduleResolution node --esModuleInterop --skipLibCheck --outDir <temp>` daftar file ts → jalankan hasil `.js` dengan `$env:DATABASE_URL` absolute `file:C:/...` temp DB (fresh `prisma migrate deploy`).
- Nilai barcode kini seragam `= inventoryNumber` di kedua jalur (manual + import); nilai `INV-...` valid sebagai input Code128 → label eksisting render tanpa backfill.
- **DB smoke WAJIB fresh DB per run:** assertion `sequential inventory numbers` mengharapkan `INV-000001...`; bila DB temp masih menyimpan baris dari run sebelumnya, `InventorySequence` berlanjut ke `004+` dan smoke FAIL padahal kode benar. Prosedur: hapus file `.db`/`-wal`/`-shm` → `prisma migrate deploy` → run.

### Revisi (Review PO — DB Smoke blocker, DONE)
- Blocker: DB smoke FAIL (`TypeError reading 'book'` + `sequential inventory numbers`). Root cause **bukan kode aplikasi**: (1) smoke destructure `prisma` sebelum `initDatabase()`; (2) DB temp stale dari run sebelumnya.
- Fix: smoke akses `db.prisma` setelah init; fresh DB per run. Kode aplikasi **tidak berubah** (tidak ada fitur/refactor/scope creep).
- Re-run PASS: lint, build (main 1,746.12 kB), HTML Smoke 16/16, DB Smoke 16/16.
- **Status: DONE — menunggu review PO.**

---

## Sprint 10 WO-2: Import Commit (COMPLETE — READY review PO)

### Ringkasan
- Audit WO-1 menemukan dead-end: `BookImportPreviewPage` tanpa tombol commit; `api.imports.match` 0 panggilan di `src/`. WO-2 menutupnya.
- **Modifikasi (3 file renderer; TIDAK ada perubahan backend):** `src/pages/BookImportPreviewPage.tsx` (state `committing`/`importError`/`importSuccess`; `handleCommit()` → `await window.electronAPI.imports.match(validatedWorkbook.canonicalRows)` → pesan sukses/gagal; action bar "Import Buku" + loading `Hourglass` inline; tombol "Kembali" → "Kembali ke Daftar Buku" setelah sukses), `src/utils/labels.ts` (6 label baru blok `IMPORT`: IMPORT_ACTION, IMPORT_PROCESSING, IMPORT_SUCCESS, IMPORT_ERROR, COMMIT_HINT, BACK_TO_BOOKS). `src/utils/bookImport.ts` TIDAK ditambah (revisi).
- **Revisi (Review PO):** iterasi awal memakai `buildImportSummary()` di renderer untuk menghitung statistik (Book/BookCopy/Author/Publisher/Category) dari messageKey — **DITOLAK PO** (business logic import & dependensi string `bookImport.*` tidak boleh di renderer). Dihapus total; UI kini menampilkan **status sukses tanpa statistik** karena backend tidak menyediakan summary resmi.
- **TIDAK diubah:** Validation/Matching/AutoCreate/BookImportService/BookCopyRepository; IPC/preload/env.d.ts (channel `imports:match`); schema+migrasi; dependency; tidak pakai Modal/Stepper/ProgressBar/Toast.
- **Validation:** `npm run lint` PASS, `npm run build` PASS (main 1,746.12 kB; preload 6.59 kB; renderer 887.52 kB); grep sisa `buildImportSummary|ImportSummary|BOOK_FAILURE_MESSAGE_KEYS|SUMMARY_*` di `src/` = 0 match.
- **Laporan:** `SPRINT10_WO2_IMPLEMENTATION_REPORT.md`, `SPRINT10_WO2_ARCHITECTURE_CHECKLIST.md`, `SPRINT10_WO2_DECISION_LOG.md`, `SPRINT10_WO2_TECHNICAL_DEBT.md` (semua revisi).
- **Status: DONE — Architecture Gate BERHENTI**, menunggu review Product Owner (tidak lanjut WO berikutnya).

### Pelajaran (retain)
- **Renderer tidak boleh punya business logic import.** Statistik hasil import (Book/BookCopy/Author/Publisher/Category dibuat) hanya boleh datang dari backend sebagai kontrak IPC formal; renderer cukup menunggu resolve/reject promise dan menampilkan status.
- **messageKey (`bookImport.*`, `autoCreate.*`) bukan kontrak sistem** — jangan parsing di renderer.
- Jika backend belum menyediakan summary resmi, tampilkan status sukses saja; jangan derivasi sendiri.

---

## WO-2 Investigation: Import Buku tidak muncul di aplikasi PO (DONE — READ ONLY)

### Ringkasan
- PO membuka Menu Buku di aplikasi → **tidak ada tombol "Import Buku"**, tidak ada akses pipeline import.
- **Root cause = artifact build basi, BUKAN bug source.** Aplikasi yang PO jalankan adalah `dist/win-unpacked/` (electron-builder, dibuild **31/07 10:24**) dari kode sebelum fitur import ada. Grep `app.asar`: `Import Buku`/`BOOK_IMPORT`/`books/import`/`imports:match` = **0 kemunculan**.
- Commit terakhir `437b50a "release: v1.0 release candidate"` (31/07 16:01) **TIDAK memuat fitur import sama sekali** (`git ls-tree` 0 file import; routes/labels/navigation/BooksPage versi commit tanpa import). Seluruh Sprint 5–10 (termasuk WO-2/WO-3/WO-8/WO-13) ada di **working tree yang belum di-commit**.
- Build source terkini `out/` (01/08 12:37) **benar & lengkap**: `index-DiqpmWbM.js` memuat `Import Buku`×6, `BOOK_IMPORT`×11, `books/import`×3; `out/main/index.js` memuat `imports:match`×1.
- **Bukan** feature flag / permission / conditional rendering / route berbeda / layout berbeda (diverifikasi). File implementasi sudah benar.
- **Perbaikan (belum dieksekusi):** rebuild `npm run build` → repackage electron-builder → verifikasi `app.asar` memuat string import → commit seluruh working tree → aturan baku "WO selesai = build+repackage+verifikasi artifact sebelum review PO".
- **Laporan:** `SPRINT10_WO2_INVESTIGATION.md` (Root Cause, Active UI File, Mengapa PO tidak melihat perubahan, Rencana perbaikan).
- **Status: DONE — menunggu review PO.**

### Pelajaran (retain)
- **Verifikasi review PO = uji ARTIFACT (`dist/`), bukan source.** `npm run build` menghasilkan `out/` yang benar, tetapi aplikasi yang diinstal PO berasal dari `dist/` (electron-builder) yang harus di-rebuild & di-repackage ulang terpisah.
- **Grep string di `app.asar`** adalah cara cepat memastikan fitur masuk package: `Import Buku`/`BOOK_IMPORT`/`books/import` di bundle renderer, `imports:match` di `out/main/index.js`.
- **Git repo hanya 3 commit**; seluruh kerja Sprint 5+ belum di-commit. Commit `437b50a` = baseline release yang belum punya import. Jangan asumsikan working tree = apa yang dirilis.

---

## Sprint 10 WO-3: Import UAT (COMPLETE — READY review PO)

### Ringkasan
- End-to-End User Acceptance Test alur produksi `Buku → Import Buku → Pilih File → Validasi → Preview → Import Buku → Matching → Auto Create → Book → BookCopy (Barcode) → Selesai`. **READ ONLY** — tanpa perubahan kode, tanpa commit.
- **Hasil: 95/95 PASS** + static UI review PASS.
  - Reader real: `uat_wo3/reader.check.cjs` 3/3 (file `.xlsx` OOXML dibuat via .NET ZipArchive, dibaca `read-excel-file`; return `Sheet[] {sheet, data}` cocok persis mapping `WorkbookReaderService`).
  - E2E rantai penuh: `uat_wo3/e2e.smoke.ts` 20/20 (xlsx → reader → `validationEngineService.validate` → pipeline produksi `createProductionStrategies` → DB; 2 Book, 2 BookCopy `INV-000001`/`-2` barcode===inventoryNumber, entitas & relasi benar).
  - Validation layer: `uat_wo3/validation.smoke.ts` 22/22 (S1 normal; S2/S3/S4 entity baru; S5 ISBN dup tetap valid — cek duplikat ada di pipeline; S6 judul kosong `IMP-013`; S7 publisher kosong `IMP-013`; S8 header "Penerbit"; S9 header "Publisher" → normalized `penerbit`; S10 3 baris).
  - Import pipeline: `uat_wo3/import.smoke.ts` 50/50 pada fresh DB (S1 + S2/S3/S4 + S10 reuse entitas + S5 `isbnDuplicate` baris dilewati + S5b 1 dibuat 1 gagal + S7 `entityMissing` + S6 `titleMissing`; tally books=6 copies=6 authors=4 publishers=3 categories=3).
- **Bug Found (tidak diperbaiki, dicatat di laporan):** B1 (MODERATE) baris gagal pipeline tidak tampil ke user — `imports:match` resolve tanpa throw, error tersembunyi di `matchingResult.errors`, UI hanya status sukses (konsekuensi keputusan WO-2); B2 (LOW–MODERATE) `AutoCreateService.apply` berjalan sebelum `importBooks` → entitas yatim untuk baris yang gagal ISBN duplikat dengan entitas baru; B3 (LOW) tidak ada pesan per-baris; B4 (INFO) header synonyms terbatas (`publisher`→`penerbit`).
- **Regression:** lint PASS, build PASS (main 1,746.12 kB · preload 6.59 kB · renderer 887.52 kB), migrate deploy fresh PASS, diff = no difference.
- **Laporan:** `SPRINT10_WO3_UAT_REPORT.md` (format: Test Matrix, Test Result, Bug Found, Regression Check, Recommendation).
- **Status: DONE — Architecture Gate BERHENTI**, menunggu review Product Owner (rekomendasi: fitur LULUS jalur utama; B1/B2 diajukan follow-up sebelum rilis).

### Pelajaran (retain)
- **`read-excel-file` v9 return `Sheet[]` (`{sheet, data}`)**, bukan array row langsung — mapping di `WorkbookReaderService` (`sheet.sheet`→name, `sheet.data`→rows) adalah satu-satunya tempat kontrak shape. Uji reader Wajib menebak shape ini (header row = `data[0]`).
- **`imports:match` TIDAK pernah throw untuk kegagalan baris** — error dikumpulkan ke `matchedWorkbook.matchingResult.errors` (messageKey `bookImport.*`); renderer tidak bisa tahu baris mana gagal tanpa summary dari backend.
- **AutoCreate berjalan SEBELUM deteksi ISBN duplikat** (`book-import.ipc.ts:24`): entitas untuk baris yang akhirnya gagal tetap dibuat → risiko orphan bila nama entitas baru. Dalam alur UI normal judul/penerbit kosong sudah disaring validasi (IMP-013 → bukan canonical), jadi S6/S7 jarang sampai pipeline; S5 (ISBN dup) tetap bisa membuat orphan.
- **Validasi UI (renderer) vs guard pipeline (main) adalah dua lapis terpisah:** validasi menyaring baris kosong (IMP-013); pipeline punya guard sendiri (`titleMissing`/`entityMissing`/`isbnDuplicate`) yang aktif bila input canonical di-IPC langsung (mis. smoke).
- UAT headless dapat meniru alur produksi penuh tanpa Electron dengan: generate file `.xlsx` nyata (OOXML Zip) → `read-excel-file/node` → objek identik IPC → `createProductionStrategies()` (bukan dummy) → fresh DB `migrate deploy`. **Jalankan lint+build di akhir sebagai regression karena WO-3 read-only.**

---

## WO-1 (F1): Shared Domain Config (COMPLETE — READY review PO)

### Ringkasan
- Source of Truth: `MASTER_DATA_AKADEMIK_ARCHITECTURE_RFC.md` (LOCKED) + `MASTER_DATA_AKADEMIK_WBS.md` (LOCKED) + `WO1_DISCOVERY_REPORT.md` (APPROVED). **Tidak ada perubahan schema/migration/DB; tidak ada perubahan perilaku; refactor preservasi nilai.**
- **File baru (2):** `src/shared/config/member-type.ts` (definisi tunggal `MemberType`: `code/label/memberNumberPrefix/borrowRights/hasAcademicRecord`; struktur `as const satisfies` extensible — tambah properti domain tanpa refactor besar; **primitive** `getMemberType()` = satu-satunya tempat guard null/invalid → mengembalikan value object utuh; **thin projections** `isMemberTypeCode`/`memberTypeLabel`/`memberNumberPrefix`/`memberBorrowRights` mendelegasi ke primitive; default prefix = STUDENT `S` untuk tipe tak dikenal/undefined), `src/shared/config/education-level.ts` (`EDUCATION_LEVELS` Set + `levelOrder(level)` → X/XI/XII = 1/2/3, invalid → NaN).
- **Config = leaf node** (nol import) → aman dipakai main (`tsconfig.node.json`) + renderer (`tsconfig.web.json`), keduanya include `src/shared/**/*`.
- **Refactor 11 konsumen (preservasi nilai):** `number-generator.service.ts` (hapus `MEMBER_TYPE_PREFIX`+`DEFAULT_PREFIX` → `memberNumberPrefix()`), `member-class-resolver.service.ts` (hapus Set lokal → `EDUCATION_LEVELS` config), `member-import.service.ts` (`'student'` ×2 → `MEMBER_TYPES.student.code`), `labels.ts` (derive `MEMBER_TYPES`/`MEMBER_RIGHTS` dari config), `MemberForm.tsx` (hapus `MEMBER_TYPES`/`type MemberType` lokal; `memberBorrowRights()` + `isMemberTypeCode()`; payload pakai `memberTypeCode` ter-narrow), `MembersPage`/`MemberListPage`/`MemberDetailPage` (hapus `MEMBER_TYPE_LABEL` lokal → `memberTypeLabel()`), `RightsSidebar.tsx` (hapus `interface RightsData` → `type MemberBorrowRights`), `routes/index.tsx` (literal → `MEMBER_TYPES.*.code`).
- **DTO:** `src/shared/dto/member.ts` `CreateMemberDTO.memberType`/`UpdateMemberDTO.memberType` → `MemberTypeCode` (input ter-validasi domain); `MemberDTO.memberType` tetap `string | null` (faithful ke kolom string bebas DB).
- **Validation:** `npm run lint` PASS, `npm run build` PASS (main 1,775.48 kB · preload 7.68 kB · renderer 940.40 kB), smoke config `wo1_config_smoke/config.smoke.ts` **46/46 PASS** (levelOrder, tabel MemberType lengkap, prefix S/G/U + default, rights 2/7 & 5/30 & 10/90, hasAcademicRecord, konsistensi label vs config, `getMemberType` primitive, kesetaraan proyeksi≡primitive). Grep: literal `'student'/'teacher'/'general'` = 0 di `src/` di luar config; `MEMBER_TYPE_LABEL`/`MEMBER_TYPE_PREFIX`/`MEMBER_RIGHTS[...]` = 0.
- **ESLint (`lint:eslint`) — pre-existing:** error `react-hooks/set-state-in-effect` (MembersPage:34, MemberListPage:42) + warnings exhaustive-deps/TAB_IDS di baris yang TIDAK disentuh WO-1 (pola `useEffect(() => fetchMembers())` lama). Gate resmi WO-1 hanya `npm run lint` (tsc) — PASS.
- **Laporan:** `WORK_ORDER_1_F1_IMPLEMENTATION_REPORT.md`. Status: **DONE — Architecture Gate BERHENTI**, menunggu review Product Owner (tidak lanjut WO berikutnya, AY-1a).

### Pelajaran (retain)
- **Config domain di `src/shared/config/` = leaf node tanpa import** — kontrak cross-boundary main/renderer (terbukti pola `src/shared/dto`); `as const satisfies Record<string, MemberTypeDefinition>` memberi literal type penuh + konformansi skema.
- **Jangan mengubah tipe DTO baca (`MemberDTO.memberType`) ke union domain** — kolom DB string bebas; union hanya di tipe INPUT (Create/Update) yang sudah tervalidasi, helper menerima `string | null` dan men-narrow.
- **Nama file laporan WO-1 bentrok** dengan `WORK_ORDER_1_IMPLEMENTATION_REPORT.md` lama (sprint Import Anggota) → laporan baru diberi suffix `_F1_`; jangan overwrite laporan WO lama.
- Verifikasi sisa hardcode pakai grep tool (bukan `rg` — tidak ada di Windows env ini).

---

## WO-2 (F2a): Schema + Migration Master Data Akademik (COMPLETE — APPROVED & RELEASED)

### Ringkasan
- Source of Truth: `MASTER_DATA_AKADEMIK_ARCHITECTURE_RFC.md` (LOCKED) + `MASTER_DATA_AKADEMIK_WBS.md` (LOCKED) + `WO2_DISCOVERY_REPORT.md` (APPROVED). Scope: **Schema + Migration saja** — TIDAK ada Repository/Service/IPC/Preload/UI, TIDAK ada backfill, `Member.classId` tidak disentuh.
- **Schema (`prisma/schema.prisma`):** 3 model baru — `MemberEnrollment` (SSOT penempatan per tahun ajaran), `PromotionRun` (audit operasi massal/promosi), `PromotionRunItem` (detail per-anggota); 4 back-relation (`AcademicYear.memberEnrollments` + `promotionRunsFrom`/`promotionRunsTo` named `PromotionRunFromYear`/`PromotionRunToYear`, `Class.memberEnrollments`, `Member.memberEnrollments` + `promotionRunItems`). FK semuanya `ON DELETE RESTRICT`.
- **Desain kunci: business rule TIDAK pindah ke DB** — `MemberEnrollment.status` (ACTIVE/PROMOTED/REPEATED/REDISTRIBUTED/TRANSFERRED/DROPPED/GRADUATED), `PromotionRun.mode` (AUTOMATIC/MAPPING/BULK_EDIT) & `status` (SUCCESS/PARTIAL/FAILED), `PromotionRunItem.outcome` = `TEXT NOT NULL` **tanpa DEFAULT** (Service yang menentukan). Kombinasi `(memberId, academicYearId, classId)` **tidak unique** — mendukung REDISTRIBUTED (2 baris setahun); "1 kelas aktif" adalah rule Service.
- **Migration:** `prisma/migrations/20260803_wo2_f2a_master_data_akademik/` — murni additive (3 CREATE TABLE + 11 CREATE INDEX, tanpa ALTER). Sort order benar setelah `20260731_wo13_revision1_source_detail`. Baseline & WO13 tidak dimodifikasi. 11 index punya business purpose terdokumentasi (`WORK_ORDER_2_F2A_IMPLEMENTATION_REPORT.md` §3).
- **Validation:** `prisma validate` PASS, dev deploy + status PASS (4 migrations), fresh DB deploy PASS (urutan baseline→WO13→R1→F2a), `migrate diff` = "No difference detected", `prisma generate` PASS (setelah dev server dihentikan), smoke `wo2_f2a_smoke/smoke.ts` **35/35 PASS** (relasi include, semua index-query, 2 baris setahun, FK RESTRICT P2003, no-DB-default dibuktikan 2 lapis: client validation + raw SQL `NOT NULL constraint failed`), `npm run lint` PASS, `npm run build` PASS (main tidak berubah — schema hanya).
- **Laporan:** `WORK_ORDER_2_F2A_IMPLEMENTATION_REPORT.md`, `WO2_FINAL_REVIEW.md`, `WO2_RELEASE_REPORT.md`. Status: **APPROVED & RELEASED** (FINAL APPROVAL 2026-08-03, commit `1397e47` + final release commit; tidak lanjut WO berikutnya). Status: **DONE — menunggu review PO** (tidak lanjut WO berikutnya).

### Pelajaran (retain)
- **`prisma generate` gagal EPERM saat dev server berjalan** — `npm run dev` (electron-vite) memuat `query_engine-windows.dll.node` ke memori sehingga file tidak bisa di-rename. Prosedur: hentikan dev server (dengan izin PO) sebelum `prisma generate`; jangan abaikan error EPERM.
- **Smoke DB wajib fresh DB per run** (ulang pelajaran WO-8): fixture unique (`AcademicYear.name`) bertabrakan bila DB temp menyimpan baris run sebelumnya — hapus `.db` lalu `migrate deploy` ulang.
- **Uji "no DB default" butuh 2 lapis:** (1) panggilan Prisma client yang omit kolom → PrismaClientValidationError tanpa `.code` (bukan P2011) karena validasi client-side mendahului DB; (2) `$executeRaw` INSERT omit kolom → error `Code: 1299 ... NOT NULL constraint failed` (bukti di level DB). Jangan assert P2011 untuk omit kolom wajib via client.
- **tsc single-file outDir:** input `dir/file.ts` dengan `--outDir` menghasilkan `<outDir>/file.js` (rootDir diinfer dari input), bukan `<outDir>/dir/file.js`.
- **Kolom workflow (status/mode/outcome) bebas string tanpa default** — konsisten pola schema existing; validasi enum ada di Service layer, bukan DB. Uniqueness semantik ("satu kelas aktif per anggota") juga domain Service.
- **Cek bentrok nama laporan SEBELUM menulis file:** `WORK_ORDER_2_IMPLEMENTATION_REPORT.md` sudah dipakai laporan sprint Import Anggota (commit `a7adf66`) — laporan F2a diberi suffix `_F2A_` (`WORK_ORDER_2_F2A_IMPLEMENTATION_REPORT.md`). Jangan `git checkout` lalu `Move-Item -Destination` ke file baru di satu perintah — gunakan nama baru langsung agar isi tidak tertimpa.

---

## WO-3 (F2b): Backfill + Reconciliation (COMPLETE — READY review PO)

### Ringkasan
- Source of Truth: `MASTER_DATA_AKADEMIK_ARCHITECTURE_RFC.md` (LOCKED) + `MASTER_DATA_AKADEMIK_WBS.md` (LOCKED) + `WO3_DISCOVERY_REPORT.md` (APPROVED). Scope: **backfill idempoten** `Member.classId → MemberEnrollment(ACTIVE)` memakai `class.academicYearId` (RFC §15 F1). **TIDAK** mengubah schema/migration/Repository/Service/IPC/UI; `Member.classId` tetap ada.
- **Deliverable (2 file):** `scripts/backfill-member-enrollment.ts` (ekspor `runBackfillEnrollment(prisma)` — skip bila ACTIVE sudah ada, orphan dilaporkan+dilewati, satu `$transaction` via `runTransaction`, CLI dengan guard `require.main === module`) + `wo3_f2b_smoke/smoke.ts` **28/28 PASS** (seed gaya skema lama: M1/M2 ber-classId, M3 tanpa classId, M4 orphan via raw SQL `PRAGMA foreign_keys=OFF`).
- **Validation 6/6 PASS:** (1) fresh DB deploy + smoke; (2) idempotensi run-2 = 0 created, total tetap 2; (3) orphan dilaporkan tanpa insert; (4) empty DB no-op — CLI di DB dev (0 member) exit 0; (5) `npm run lint`; (6) `npm run build`.
- **Laporan:** `WORK_ORDER_3_F2B_IMPLEMENTATION_REPORT.md`, `WO3_FINAL_REVIEW.md`, `WO3_RELEASE_REPORT.md`. Status: **DONE — menunggu review PO** (tidak lanjut WO berikutnya, AY-1a).

### Pelajaran (retain)
- **Orphan (`classId` menggantung) praktis mustahil di DB normal** — FK `Member.classId → Class` di-enforce SQLite (`FOREIGN KEY constraint failed`). Seed orphan untuk smoke: `$executeRawUnsafe('PRAGMA foreign_keys = OFF')` lalu raw INSERT di **koneksi Prisma yang sama** (Prisma SQLite memakai satu koneksi — pragma bertahan), lalu `PRAGMA ... = ON`. **`PRAGMA foreign_keys` adalah no-op di dalam `$transaction`** (SQLite) — harus di luar transaction.
- **Raw SQL tabel `Member` wajib kolom fisik `number`/`birthplace`** (bukan `memberNumber`/`birthPlace`) karena `@map` (pelajaran WO-006B). Error `table Member has no column named memberNumber` = petunjuk kolom ter-map.
- **Prisma SQLite satu koneksi:** `$executeRawUnsafe('PRAGMA ...')` memengaruhi query berikutnya pada instance yang sama (bukan pooled terpisah).
- **Script one-time di `scripts/`**: TS + `PrismaClient` langsung, tanpa tsx/ts-node — compile `npx tsc --module commonjs ... --outDir <temp>` lalu `node` dengan `DATABASE_URL` + `NODE_PATH`. `require.main === module` untuk CLI guard agar fungsi bisa di-import smoke.

---

## WO-4 (AY-1a): AcademicYear exclusive-active guard (COMPLETE — READY review PO)

### Ringkasan
- Source of Truth: `MASTER_DATA_AKADEMIK_ARCHITECTURE_RFC.md` (LOCKED, §2.4/§17) + `MASTER_DATA_AKADEMIK_WBS.md` (LOCKED, WO-4 AY-1a) + `WO4_DISCOVERY_REPORT.md` (READY FOR IMPLEMENTATION). Scope: **guard service + repo transaksional + smoke + docs**. **TIDAK** mengubah schema/migration/IPC/Preload/UI/DTO; repo sudah ada (WBS Repo/UI = N/A).
- **Deliverable (2 file source + 1 smoke):** `src/main/repositories/academic-year.repository.ts` +2 metode transaksional `createExclusiveActive`/`updateExclusiveActive` (`$transaction`: `updateMany(isActive:true→false)` lalu create/update target `isActive:true`); `src/main/services/academic-year.service.ts` guard decision — `isActive===true` → metode exclusive-active, selainnya `create`/`update` biasa (perilaku lama); `wo4_ay1a_smoke/smoke.ts` **21/21 PASS** pada fresh DB.
- **Logika:** deaktivasi **semua** tahun aktif (tanpa exclude target) lalu target di-set aktif dalam satu transaksi — net "hanya target aktif"; gagalnya create/update target → rollback deaktivasi (tidak ada window "nol aktif").
- **Validation 3/3 PASS:** (1) fresh DB deploy (4 migrations) + smoke 21/21 (create B aktif nonaktifkan A, update A aktif nonaktifkan B&C, create/update nonaktif tak menyentuh tahun aktif, count `isActive=true`===1 di tiap langkah, duplikat/404 tetap ditolak); (2) `npm run lint`; (3) `npm run build` (main 1,776.61 kB · preload 7.68 kB · renderer 940.40 kB).
- **Laporan:** `WORK_ORDER_4_AY1A_IMPLEMENTATION_REPORT.md`, `WO4_FINAL_REVIEW.md`, `WO4_RELEASE_REPORT.md`. Status: **DONE — menunggu review PO** (tidak lanjut WO berikutnya, AY-1b).

### Pelajaran (retain)
- **Guard = keputusan bisnis di Service, eksekusi atomik di Repository** — pola `$transaction` meniru `borrow.repository.createWithItems`/`processReturn`. Guard mengikat jalur service saja; caller yang memanggil repository langsung bisa bypass (konsisten RFC: guard hidup di service).
- **Deaktivasi menyeluruh tanpa exclude target** lebih sederhana daripada `where: { id: { not: targetId } }` — target langsung di-set aktif di operasi berikutnya dalam transaksi yang sama.
- **Rollback otomatis** melindungi invarian "tepat satu aktif": bila create/update target gagal, deaktivasi ikut dibatalkan.
- Smoke WO-4 memakai fresh DB temp (`file:C:/Users/hp/AppData/Local/Temp/opencode/...`) dan dibersihkan setelah run — DB live dev tidak pernah disentuh.
- Nama laporan WO-4 wajib suffix `_AY1A_` (`WORK_ORDER_4_IMPLEMENTATION_REPORT.md` sudah dipakai laporan sprint lama — jangan ditimpa).

---

## WO-5 (AY-2): Academic Year Master UI (COMPLETE — READY review PO)

### Ringkasan
- Source of Truth: `MASTER_DATA_AKADEMIK_ARCHITECTURE_RFC.md` (LOCKED) + `MASTER_DATA_AKADEMIK_WBS.md` (LOCKED) + `WO5_DISCOVERY_REPORT.md` (APPROVED). Scope: **renderer-only Academic Year CRUD UI**. **TIDAK** mengubah Repository/Service/IPC/Preload/Schema/Migration; Curriculum/Class/Enrollment/Promotion tidak disentuh.
- **Deliverable (3 file baru + 4 file UI):** `src/pages/master/AcademicYearListPage.tsx` (list + search `.data` dari paginated `findMany` + delete + badge status), `src/pages/master/AcademicYearFormPage.tsx` (create/edit via `findById`/`create`/`update`), `src/components/master/AcademicYearForm.tsx` (nama + date mulai/selesai + toggle aktif + warning guard + validasi tanggal); modified: `src/routes/index.tsx` (+3 route `master/academic-years[...]`), `src/components/layout/Sidebar.tsx` (+item "Tahun Ajaran" di grup Master Data), `src/utils/labels.ts` (blok `ACADEMIC_YEAR`), `src/utils/navigation.ts` (+`ROUTES.MASTER_ACADEMIC_YEAR*` + `academicYearEditPath`).
- **Catatan sequencing:** WBS menaruh AY-1b (Buka/Tutup) sebelum AY-2, tapi AY-2 hanya mengonsumsi API yang sudah ada (Flow AY-2: Preload→UI→Testing; Repo/Service/IPC = N/A) — "tandai aktif" via `update(isActive:true)` sudah ter-guard AY-1a; AY-1b tetap WO terpisah.
- **Validation PASS:** (1) `npm run lint`; (2) `npm run build` (main 1,776.61 kB · preload 7.68 kB · renderer 952.31 kB); (3) UAT smoke `wo5_ay2_smoke/smoke.ts` **14/14 PASS** pada fresh DB (create nonaktif, create aktif → nonaktifkan tahun lain, edit + toggle aktif → guard tetap, delete tahun berkelas ditolak 400, delete tanpa kelas sukses, findMany list, duplikat nama ditolak); (4) grep bundle renderer (`Tahun Ajaran`, `master/academic-years`) ter-render.
- **Laporan:** `WORK_ORDER_5_IMPLEMENTATION_REPORT.md`, `WO5_FINAL_REVIEW.md`, `WO5_RELEASE_REPORT.md`. Status: **DONE — menunggu review PO** (tidak lanjut WO berikutnya, C-1).

### Pelajaran (retain)
- **Renderer tidak perlu pagination manual** untuk list master — `academicYears.findMany(search)` mengembalikan paginated `{data, total, ...}`; List page memakai `.data` (server-side search, pola eksisting), total dipakai utk verifikasi.
- **Input `type="date"` memberi `YYYY-MM-DD`** — konversi ke ISO (`new Date(v).toISOString()`) saat submit; value input di-backfill dari ISO via `iso.slice(0,10)`.
- **Guard 1-aktif tampil sebagai UX**: toggle aktif menampilkan `ACTIVATE_WARNING` ("Mengaktifkan akan menonaktifkan tahun ajaran lain") — ekspektasi user dijaga sebelum submit.
- **Delete Guard (service) mengembalikan AppError 400** saat tahun dipakai kelas — List page menampilkan `err.message` via `alert`, tanpa redirect/loading error UI.
- Smoke WO-5 memakai fresh DB temp dan dibersihkan; DB live dev tidak pernah disentuh (ulang pola WO-4).

---

## WO-6 (C-1): Curriculum Master UI (COMPLETE — READY review PO)

### Ringkasan
- Source of Truth: `MASTER_DATA_AKADEMIK_ARCHITECTURE_RFC.md` (LOCKED) + `MASTER_DATA_AKADEMIK_WBS.md` (LOCKED, WO-7 C-1) + `WO6_DISCOVERY_REPORT.md` (APPROVED). Scope: **renderer-only Curriculum CRUD UI**. **TIDAK** mengubah Repository/Service/IPC/Preload/Schema/Migration; AcademicYear/Class/Enrollment/Promotion tidak disentuh.
- **Deliverable (3 file baru + 4 file UI):** `src/pages/master/CurriculumListPage.tsx` (list + search `.data` + delete), `src/pages/master/CurriculumFormPage.tsx` (create/edit), `src/components/master/CurriculumForm.tsx` (satu field nama — `CurriculumDTO` hanya `name`); modified: `src/routes/index.tsx` (+3 route `master/curricula[...]`), `src/components/layout/Sidebar.tsx` (+item "Kurikulum"), `src/utils/labels.ts` (blok `CURRICULUM`), `src/utils/navigation.ts` (+`ROUTES.MASTER_CURRICULUM_*` + `curriculumEditPath`).
- **Backend sudah lengkap sejak WO-005** termasuk delete guard `countByCurriculum > 0`; C-1 hanya konsumen preload `curricula.*` (WBS C-1: Dependency `—`, Flow Preload→UI→Testing→PO Review, LOW).
- **Validation PASS:** (1) `npm run lint`; (2) `npm run build` (main 1,776.61 kB · preload 7.68 kB · renderer 959.90 kB); (3) UAT smoke `wo6_c1_smoke/smoke.ts` **10/10 PASS** (create, duplikat nama ditolak 400, edit + rename-ke-nama-sendiri no-op, rename-ke-nama-lain ditolak, delete berkelas ditolak 400, delete tanpa kelas sukses, list + search); (4) grep bundle renderer (`Kurikulum`, `master/curricula`) ter-render.
- **Laporan:** `WORK_ORDER_6_IMPLEMENTATION_REPORT.md`, `WO6_FINAL_REVIEW.md`, `WO6_RELEASE_REPORT.md`. Status: **DONE — menunggu review PO** (tidak lanjut WO berikutnya, CL-1).

### Pelajaran (retain)
- **Master satu-field (Curriculum) mengikuti persis pola `AuthorForm`** — tidak perlu grid tanggal/toggle; reuse `MasterTable` + `confirm` + `alert(err.message)` untuk guard service.
- **Guard duplikat nama dua jalur di service:** create & update sama-sama cek `existsByName`; update mengecualikan nama sendiri (`name !== existing.name`) sehingga rename-ke-nama-sendiri no-op — smoke memastikan tidak error.
- **Delete Guard service (400, `countByCurriculum`)** — UI cukup menampilkan `err.message`; tidak ada redirect/loading error UI.
- **`findMany(search)` paginated** (`{data,total,...}`) — list memakai `.data` (server-side search), `total` utk verifikasi; pola sama WO-5.
- Smoke WO-6 memakai fresh DB temp dan dibersihkan; DB live dev tidak pernah disentuh.
