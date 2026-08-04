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

---

## WO-7 (CL-1): Class Immutability Guard (COMPLETE — READY review PO)

### Ringkasan
- Source of Truth: `MASTER_DATA_AKADEMIK_ARCHITECTURE_RFC.md` (LOCKED, §13) + `MASTER_DATA_AKADEMIK_WBS.md` (LOCKED, WO-8 CL-1) + `WO7_DISCOVERY_REPORT.md` (APPROVED). Keputusan PO: **WBS-strict** — hanya `educationLevel` + `parallel` immutable; `academicYearId`/`curriculumId` tetap bisa diubah. Scope: ClassService + Smoke + Docs saja.
- **Modifikasi (1 file source):** `src/main/services/class.service.ts` — `create` normalisasi `educationLevel` (`trim().toUpperCase()`) + validasi via F1 `EDUCATION_LEVELS` (X/XI/XII) → AppError 400 bila invalid; nilai ternormalisasi dipakai untuk `findDuplicate` & persist; `update` **blokir** `educationLevel`/`parallel` (AppError 400 "immutable — buat kelas baru untuk rename"), payload `repository.update` kini hanya `academicYearId`/`curriculumId`/`homeroomTeacher`/`isActive`; `comboChanged` (AY/curriculum) tetap ada.
- **TIDAK diubah:** Repository, IPC, Preload, UI, DTO (`UpdateClassDTO` masih punya `educationLevel`/`parallel` — sengaja dibiarkan, ditolak di service), Schema, Migration, Bootstrap, env.d.ts, resolver; delete guard tetap `Member.classId` legacy (pindah ke enrollment di E-2).
- **Validation PASS:** (1) `npm run lint`; (2) `npm run build` (main 1,776.84 kB · preload 7.68 kB · renderer 959.90 kB — renderer tidak berubah); (3) smoke `wo7_cl1_smoke/smoke.ts` **16/16 PASS** (create valid, level IX/kosong ditolak 400, lowercase `" xi "`→XI, duplikat komposit 400, update educationLevel ditolak 400 + tetap X, update parallel ditolak 400 + tetap, regression: homeroomTeacher/isActive sukses, findById, findMany list/search, delete tanpa anggota sukses, delete beranggota 400); (4) grep bundle main (`educationLevel/parallel immutable`, `Tingkat pendidikan`) = True.
- **Laporan:** `WO7_DISCOVERY_REPORT.md`, `WORK_ORDER_7_IMPLEMENTATION_REPORT.md`, `WO7_FINAL_REVIEW.md`, `WO7_RELEASE_REPORT.md`. Status: **DONE — menunggu review PO** (tidak lanjut CL-2a).

### Pelajaran (retain)
- **Guard immutability = Service layer, DTO tidak diubah.** `UpdateClassDTO` tetap menyertakan `educationLevel`/`parallel`; service menolak (AppError 400). Ini mencegah breaking change kontrak sebelum CL-2a dibangun.
- **Normalisasi level wajib sebelum validasi & persist** (`trim().toUpperCase()`): mencegah `"x"` vs `"X"` jadi 2 row komposit → yang membuat `MemberClassResolver` (key uppercase) mendeteksi `classAmbiguous`. Nilai ternormalisasi harus dipakai konsisten di `findDuplicate` DAN `repository.create`.
- **Delete guard kelas masih `memberRepository.countByClass` (legacy `Member.classId`)** — per RFC F2, cutover ke `enrollment.count` adalah WO E-2, bukan CL-1. Jangan "perbaiki" di WO yang salah scope.
- Smoke seed Member wajib `memberNumber`/`fullName` (bukan `number`/`name`) — pelajaran WO-006B (`@map`).
- Pola `expectRejected(fn, messagePart)` memeriksa `e.message.includes` — AppError message adalah kontrak smoke (bukan `.statusCode`).

---

## WO-8 (CL-2a): Class Master UI (COMPLETE — READY review PO)

### Ringkasan
- Source of Truth: `MASTER_DATA_AKADEMIK_ARCHITECTURE_RFC.md` (LOCKED) + `MASTER_DATA_AKADEMIK_WBS.md` (LOCKED, WO-9 CL-2a) + `WO8_DISCOVERY_REPORT.md` (APPROVED). Keputusan PO: **fetch-all + client-side filtering**. Scope: **renderer-only Class CRUD UI**; backend `classes:*` (sudah ada sejak WO-005 + CL-1) TIDAK diubah.
- **Deliverable (3 file baru + 4 file UI):** `src/pages/master/ClassListPage.tsx` (fetch paralel AY+kurikulum+classes, fetch-all loop `limit 100`, **filter client-side** tahun+kurikulum+search, kolom lookup nama AY/kurikulum via Map, delete), `src/pages/master/ClassFormPage.tsx` (create/edit; **payload update TANPA educationLevel/parallel** — immutable CL-1), `src/components/master/ClassForm.tsx` (dropdown Tahun/Kurikulum/Tingkat X/XI/XII via `EDUCATION_LEVELS`, input Paralel + Guru Kelas, checkbox Aktif; **Tingkat/Paralel disabled saat edit** + hint immutable); modified: `src/routes/index.tsx` (+3 route `master/classes[...]`), `src/components/layout/Sidebar.tsx` (+item "Kelas"), `src/utils/labels.ts` (blok `CLASS`), `src/utils/navigation.ts` (+`ROUTES.MASTER_CLASS*` + `classEditPath`).
- **Keputusan teknis R1:** `classes.findMany` tidak punya filter Tahun/Kurikulum & IPC dilarang diubah → UI fetch-all (`findMany(undefined, page, 100)` loop sampai `total`) lalu filter client-side; acceptable untuk data master kelas.
- **Validation PASS:** (1) `npm run lint`; (2) `npm run build` (main 1,776.84 kB · preload 7.68 kB · renderer **978.36 kB** — main/preload tidak berubah = bukti backend N/A); (3) smoke `wo8_cl2a_smoke/smoke.ts` **16/16 PASS** (create payload UI, fetch-all, filter client-side tahun/kurikulum/search, update guru+isActive, immutable regresi CL-1, duplicate guard, delete beranggota 400, delete sukses); (4) grep bundle renderer (`Kelas`, `master/classes`, `Tambah Kelas`, `classEditPath`) = True.
- **Laporan:** `WO8_DISCOVERY_REPORT.md`, `WORK_ORDER_8_IMPLEMENTATION_REPORT.md`, `WO8_FINAL_REVIEW.md`, `WO8_RELEASE_REPORT.md`. Status: **DONE — menunggu review PO** (tidak lanjut CL-2b).

### Pelajaran (retain)
- **`CreateClassDTO.homeroomTeacher` = `string | undefined` (bukan `null`)** — form mengirim `string | null | undefined`; saat create harus di-map `?? undefined` (`ClassFormPage`), update menerima `null` (clear field). Tipe strict tsconfig.web menjebak bila kirim `null` ke create.
- **Fetch-all pattern:** `findMany(undefined, page, 100)` di-loop `while (all.length < result.total) page++` karena `limit` max 100 (`getPaginationParams` `Math.min(100, ...)`) dan IPC tak boleh diubah.
- **Client-side filter:** renderer memegang `yearFilter`/`curriculumFilter`/`search` + `useMemo` filter pada dataset; lookup nama AY/kurikulum via `Map<id,name>` dibangun dari fetch paralel `Promise.all([academicYears, curricula, classes])`.
- **Immutable CL-1 di UI:** field Tingkat/Paralel `disabled` saat edit (hint amber) + payload update tidak mengirim keduanya → double-layer dengan guard service (WO-7).
- Smoke wo8 memakai fresh DB temp dan dibersihkan; DB live dev tidak pernah disentuh.

---

## WO-9 (CL-2b): Class Clone ke Tahun Baru (COMPLETE - READY review PO)

### Ringkasan
- Source of Truth: `MASTER_DATA_AKADEMIK_ARCHITECTURE_RFC.md` (LOCKED, RFC §7 prasyarat promosi) + `MASTER_DATA_AKADEMIK_WBS.md` (LOCKED, WO-10 CL-2b) + `WO9_DISCOVERY_REPORT.md` (APPROVED). Keputusan PO: **Clone HANYA menyalin `curriculumId`, `educationLevel`, `parallel`; `homeroomTeacher = null`, `isActive = true`**. Scope: 1 Service method + 1 IPC channel + 1 preload method + 1 env.d.ts entry + UI Clone.
- **Modifikasi (3 source + 1 DTO + 1 UI baru):** `src/main/services/class.service.ts` (+`cloneToYear(sourceAY, targetAY)` - validasi `source !== target` + `existsById` kedua tahun; loop kelas sumber `findByAcademicYear`; SATU `$transaction` via `runTransaction(getPrisma(), ...)`; per kelas cek duplikat komposit `(targetAY, curriculumId, educationLevel, parallel)` - ada -> skip, belum -> `create` dgn `homeroomTeacher: null`, `isActive: true`; return `{ created, skipped }`), `electron/ipc/class.ipc.ts` (+`classes:cloneToYear`), `electron/preload/class.preload.ts` (+`classes.cloneToYear`), `src/renderer/env.d.ts` (+entry), `src/shared/dto/academic.ts` (+`CloneClassResult`), `src/components/master/ClassCloneModal.tsx` (**baru** - modal Tahun Sumber + Tahun Target + hasil created/skipped), `src/pages/master/ClassListPage.tsx` (+tombol "Clone ke Tahun Baru" di toolbar filter + render modal + re-fetch `onCloned`), `src/utils/labels.ts` (+blok `CLASS.CLONE_*`).
- **TIDAK diubah:** Repository, Schema, Migration, CRUD `classes:*` eksisting, Academic Year, Curriculum, Enrollment, Promotion. Service import `getPrisma` + `runTransaction` dari base (pola transaction base, bukan repo baru).
- **Validation PASS:** (1) `npm run lint`; (2) `npm run build` (main 1,778.91 kB · preload 7.84 kB · renderer 985.76 kB); (3) smoke `wo9_cl2b_smoke/smoke.ts` **26/26 PASS** pada fresh DB (clone 3 row baru copy curriculumId/level/parallel, homeroomTeacher null + isActive true, idempotency run ulang created=0 skipped=3, duplicate skip clone balik, source=target ditolak 400, tahun tak ditemukan ditolak 400, regresi CRUD update guru + immutable CL-1); (4) grep bundle `classes:cloneToYear` (main) & `Clone ke Tahun Baru` (renderer) = ter-render.
- **Laporan:** `WO9_DISCOVERY_REPORT.md`, `WORK_ORDER_9_IMPLEMENTATION_REPORT.md`, `WO9_FINAL_REVIEW.md`, `WO9_RELEASE_REPORT.md`. Status: **DONE - menunggu review PO** (tidak lanjut WO berikutnya).

### Pelajaran (retain)
- **Clone struktur kelas = service method, bukan repository.** Semua kebutuhan sudah ada di repo (`findByAcademicYear`), sehingga batch create dalam transaksi dilakukan langsung via `runTransaction(getPrisma(), ...)` + `tx.class.findFirst`/`tx.class.create` - tanpa menyentuh Repository (constraint WO).
- **Idempotensi clone**: cek duplikat komposit per-baris lalu SKIP (bukan throw) - hasil `{ created, skipped }`; run ulang = created 0. Guard `source === target` -> AppError 400 "tidak boleh sama" dipisah dari guard tahun tidak ditemukan.
- **Keputusan PO domain**: clone hanya menyalin identitas kelas (curriculumId/educationLevel/parallel); `homeroomTeacher` dikosongkan & `isActive=true` (guru/status adalah kepemilikan tahun berjalan, bukan struktur). Jangan menyalin field non-struktur.
- **UI modal tanpa route baru**: tombol di toolbar ClassListPage membuka `ClassCloneModal` (reuse data `academicYears` yang sudah di-fetch page) - tidak perlu sentuh `navigation.ts`/routes.
- Smoke wo9 memakai fresh DB temp dan dibersihkan; DB live dev tidak pernah disentuh.

---

## WO-19 MI-3: Import Duplicate Strategy — Skip & Flag (COMPLETE - READY review PO, ter-release)

### Ringkasan
- Keputusan PO: **strategi A "Skip & flag"** (RFC §12.2) — member existing tidak lagi diblokir; baris yang SUDAH ACTIVE di tahun target **dilewati** (`skipped`), member existing yang belum terdaftar tahun target mendapat **enrollment-only** (PO #5); member baru → create Member + Enrollment ACTIVE. Email hanya diblokir untuk member BARU.
- **File diubah (3 source + 1 DTO):** `member-duplicate-checker.service.ts` (NISN existing → `existingByRow: Map<rowNumber, ExistingMemberInfo>` routing, email blocker hanya baris NISN baru; `continue` di baris existing), `enrollment.repository.ts` (+`findMemberIdsActiveInYear(memberIds, year)` batch lookup Set<memberId> — bukan query per baris), `member-import.service.ts` (`RowRouting` = `'create-member'|'enrollment-only'|'skip'`; routing di preflight dengan 1 batch query ACTIVE-per-tahun; `writePhase(rows, routingByRow, existingMemberIdByRow, classIdByRow, academicYearId)` split 3 jalur dalam SATU `$transaction`; `allocateMemberNumbers` hanya utk create-member (count-0 aman); result +`skipped`), `member.ts` (`MemberImportResultDTO` +`skipped: number` aditif).
- **TIDAK diubah:** UI Import, IPC `members:previewCheck/import(rows, scope?)`, preload, env.d.ts (format fix di env.d.ts dikembalikan identik — tidak ada perubahan), Schema, Migration, `EnrollmentService`, `Member.status` sync (E-3), Promotion, Reporting.
- **Validation PASS:** lint; build (main 1,797.87 kB · preload 8.62 kB · renderer 999.83 kB); smoke MI-3 **38/38** (baru/enrollment-only/skip/email-blocker-hanya-baru/email-tak-blokir-existing/campuran 1+2/invariant satu-ACTIVE/rollback batch campuran); regression MI-1 44, MI-2 37, E-1 39, E-2 36, E-3 78, E-4 45; `migrate diff` = no drift (schema tidak disentuh).
- **Commit:** `70d2e15` "feat: import duplicate strategy skip & flag for existing members (WO-19 MI-3)" — di-push (`1855568..70d2e15`, 8 files, +638/−49). Working tree bersih.
- **Laporan:** `WORK_ORDER_MI3_IMPLEMENTATION_REPORT.md`, `MI3_FINAL_REVIEW.md`, `MI3_RELEASE_REPORT.md`.
- **Status: DONE — menunggu review PO** (tidak lanjut WO berikutnya).

### Pelajaran (retain)
- **Migrasi smoke:** `npx prisma migrate deploy --skip-generate` GAGAL dengan "Specify a schema" di Prisma 5.22 setup ini; `prisma migrate deploy` (tanpa `--skip-generate`) dari `workdir=prisma` selalu berhasil. Bila `--skip-generate` dibutuhkan, jalankan dari folder `prisma/` (schema ter-resolve; generate client aman selama dev server mati).
- **`existingByRow` routing memakai MapIterator** — `duplicateResult.existingByRow.values()` adalah `MapIterator`, bukan array; konversi via `Array.from(map.values(), fn)` (bukan `.map()`).
- **Strategi A flag = `skipped` count agregat** di `MemberImportResultDTO` (aditif, non-breaking IPC); renderer tidak menurunkan business logic (konsisten WO-2) — field list per-baris tidak ditambahkan.
- **Prisma `file:` URL** di smoke: gunakan absolute `file:C:/...`; `migrate deploy` sukses memakai `.env` repo root (relative ke schema dir) bila DATABASE_URL tidak diset.
- **Rollback batch campuran terbukti** — stub `EnrollmentRepository` melempar saat `createManyWithTx` setelah Member createMany → 0 Member + 0 Enrollment tersimpan (all-or-nothing).

---

## WO-20 MI-4: Member Import UI — Scope Wajib (COMPLETE - READY review PO)

### Ringkasan
- Keputusan PO: **hapus fallback MI-1** — dialog Import Anggota WAJIB meminta Academic Year (default tahun aktif) + Curriculum; scope `{academicYearId, curriculumId}` dikirim eksplisit ke `previewCheck()`/`import()`; resolver tidak pernah lagi memakai "tahun aktif implicit" / "kurikulum opsional".
- **Kontrak dikencangkan (opsional → WAJIB):** `MemberImportScope` dua field `string`; `previewCheck(rows, scope)`; `import(rows, options:{scope,onProgress?})`; `preflight` resolve `scope.*`; `MemberImportPreflight.academicYearId: string`; `writePhase(..., academicYearId: string)` + guard null dihapus; `MemberClassResolver` ctor hanya `(classRepository)` (dependensi AcademicYearRepository dihapus), `resolve(rows, year, curriculum)`; `ClassRepository.findByAcademicYearAndCurriculum` `curriculumId: string` (spread kondisional dihapus); IPC/preload/env.d.ts scope wajib.
- **UI (`MemberImportDialog.tsx`):** state `academicYears`/`curricula`/`academicYearId`/`curriculumId`; mount → `Promise.all([academicYears.findMany(), curricula.findMany()])`, default `academicYearId = data.find(y => y.isActive)?.id`; blok "Penempatan Kelas" (2 dropdown `*`); `runPreview(rows, year, curriculum)`; `handleFileChange`/scope onChange re-preview (hint `REQUIRE_SCOPE` bila scope belum lengkap); `handleImport` kirim scope; hasil sukses grid-cols-5 (+ sel **Dilewati** dari `result.skipped` MI-3). `labels.ts` + `SCOPE_*`/`YEAR`/`CURRICULUM`/`SELECT_*`/`RESULT_SKIPPED`.
- **Smoke:** baru `wo20_mi4_smoke/smoke.ts` **24/24** (kontrak dialog findMany default aktif, picker kurikulum, preview default aktif valid, preview di-scope kurikulum, preview tahun non-aktif dihormati + `yearC` tanpa kelas → classNotFound BUKAN fallback, import scope yearB → enrollment yearB+classD, import scope kurikulum → classC vs classA, invariant satu-ACTIVE). Smoke MI-1 di-update ke kontrak baru (44→43): STEP 5 hapus null-curriculum ambiguous → scope mempersempit unik; STEP 6 hapus fallback → tahun scope non-aktif dihormati; STEP 7 hapus no-active-year; STEP 10 ganti backward-compat → import scope yearB. MI-2 (37) STEP 6 ganti backward-compat → scope yearB. MI-3 (38) hanya ctor.
- **Validation PASS:** lint; build (main 1,796.83 kB · preload 8.62 kB · renderer 1,006.72 kB); smoke MI-4 24/24 + regression MI-1 43, MI-2 37, MI-3 38, E-1 39, E-2 36, E-3 78, E-4 45 (fresh DB); `prisma migrate diff` = empty (schema tidak disentuh); grep bundle renderer (`Penempatan Kelas`/`Dilewati`) & main (`members:previewCheck`) ter-render.
- **Laporan:** `WORK_ORDER_MI4_IMPLEMENTATION_REPORT.md`, `MI4_FINAL_REVIEW.md`, `MI4_RELEASE_REPORT.md`. Status: **DONE - menunggu review PO** (tidak lanjut WO berikutnya).

### Pelajaran (retain)
- **UI dialog = kontrak backend; smoke service adalah bukti kontrak itu.** Default tahun aktif, picker kurikulum, dan hint scope adalah logika renderer (tak ada framework test React di repo) — dibuktikan via `Promise.all(findMany)` contract + `npm run build` + grep bundle; logika backend yang dipakai dialog (findMany/paginated, previewCheck, import, resolver) diuji penuh di smoke.
- **Kencangkan tipe, jangan hapus fungsionalitas di tengah.** Penghapusan fallback dilakukan bertahap: tipe scope → service → resolver → repository → plumbing IPC/preload/env → smoke; `npm run lint` (tsc node+web) adalah gate cepat antar langkah.
- **Smoke lama yang menguji perilaku yang dihapus = di-edit, bukan dibuang** — ganti tiap kasus fallback dengan kasus baru yang membuktikan non-fallback (mis. "tahun non-aktif dihormati", "yearC tanpa kelas → classNotFound padahal tahun aktif punya kelas itu").
- **Smoke historis `uat_*`** masih memakai konstruktor/scope lama dan TIDAK di-upgrade (obsolete oleh keputusan PO, di luar regression suite) — didokumentasikan sebagai tech debt di laporan.
- Compile & run smoke batch: `npx tsc --module commonjs --target es2022 --moduleResolution node --esModuleInterop --skipLibCheck --rootDir . --outDir <tmp>\out <list smoke.ts>` → fresh DB per smoke (`Remove-Item *.db*` → `npx prisma migrate deploy` dari workdir `prisma/`) → `node <tmp>\out\<wo>_smoke\smoke.js` dgn `$env:DATABASE_URL` absolute + `$env:NODE_PATH=<repo>\node_modules`.

---

## E-1 (Enrollment Core): EnrollmentRepository + EnrollmentService (COMPLETE - READY review PO)

### Ringkasan
- Source of Truth: `MASTER_DATA_AKADEMIK_ARCHITECTURE_RFC.md` (LOCKED, §1.2/§1.3/§2.1/§4/§6.1/§6.2/§11) + `MASTER_DATA_AKADEMIK_WBS.md` (LOCKED, WO-13 E-1) + `MILESTONE_B_DISCOVERY_REPORT.md` (APPROVED, Gap #1-#4 HIGH blocker). Scope: **fondasi Enrollment** — repo + service + DTO + config status akademik + IPC `enrollments:*` + preload + env.d.ts + bootstrap. **TIDAK** mengubah schema/migration/`Member.classId`/MemberService/BorrowService/ClassService/Import/UI; `Member.status` sync = E-3 (scope discipline).
- **File baru (7):** `src/shared/config/academic-status.ts` (`ACADEMIC_STATUS` as const 7 nilai + `isAcademicStatus` + `isTerminalAcademicStatus` — leaf node, pola config F1), `src/shared/dto/enrollment.ts` (`EnrollmentDTO` + `CreateEnrollmentDTO`/`CloseEnrollmentDTO`/`RepointEnrollmentDTO`), `src/main/repositories/enrollment.repository.ts` (`create`/`findById`/`findActiveByMember` [status=ACTIVE + leftAt=null]/`countActiveByMember`/`close`; `CreateEnrollmentData.status` **wajib** karena no-DB-default), `src/main/services/enrollment.service.ts` (`enroll` [member ada 404 + `hasAcademicRecord` siswa saja 400 + class milik tahun 400 + satu-ACTIVE 400], `close` [ACTIVE saja + `isTerminalAcademicStatus` 400; set status/leftAt/note; tidak pernah DELETE], `repoint` [close REDISTRIBUTED + enroll target dalam SATU `runTransaction(getPrisma(),...)`, tahun = tahun enrollment lama, guard target ada/sama-tahun/tidak-sama-kelas], `findActiveByMember` → DTO|null), `electron/ipc/enrollment.ipc.ts` (+4 channel `enrollments:enroll/close/repoint/findActiveByMember`), `electron/preload/enrollment.preload.ts` (+`enrollments.*`), `wo13_e1_smoke/smoke.ts`.
- **Dimodifikasi (4):** `electron/preload/index.ts` (+`enrollmentAPI`), `src/renderer/env.d.ts` (+entry `enrollments`), `electron/main/bootstrap.ts` (+`EnrollmentService`/`EnrollmentRepository` di Container), `electron/ipc/index.ts` (+`registerEnrollmentHandlers` + tipe).
- **Validation PASS:** (1) `npm run lint`; (2) `npm run build` (main 1,788.10 kB · preload 8.49 kB · renderer 987.29 kB); (3) smoke `wo13_e1_smoke/smoke.ts` **39/39 PASS** pada fresh DB (enroll ACTIVE + label, satu-ACTIVE ditolak, guru/umum ditolak, member/kelas 404, kelas tahun lain 400, close status non-terminal ditolak/GRADUATED valid, close ulang ditolak, repoint REDISTRIBUTED+baru ACTIVE histori 2 baris, guard repoint 4 kasus, findActive null, invariant groupBy aktif<=1); (4) `prisma migrate diff` = no drift (empty migration); (5) grep bundle main+preload `enrollments:*` = 4/4.
- **Laporan:** `WORK_ORDER_E1_IMPLEMENTATION_REPORT.md`, `E1_FINAL_REVIEW.md`, `E1_RELEASE_REPORT.md`. Status: **DONE - menunggu review PO** (tidak lanjut E-2).

### Pelajaran (retain)
- **`status` di MemberEnrollment wajib** (no DB default) — `CreateEnrollmentData.status: string` REQUIRED di repository; membuatnya optional memicu TS2322 karena `undefined` tak assignable. DTO input `CreateEnrollmentDTO` TIDAK punya `status` (Service yang menetapkan `ACADEMIC_STATUS.active`).
- **Satu-ACTIVE = guard Service, bukan DB** — schema tanpa `@@unique([memberId, academicYearId])` (REDISTRIBUTED 2-baris setahun valid). `enroll` MEMBLOKIR bila ada ACTIVE (tidak auto-close; auto-close = keputusan E-2/MI-2); `repoint` adalah jalur eksplisit mutasi tengah tahun.
- **`repoint` pakai pola WO-9** — close+enroll dalam satu `runTransaction(getPrisma(), ...)` langsung `tx.memberEnrollment.*`, tanpa Repository (pola transaction base). Tahun ajaran baru = `existing.academicYearId`.
- **Definisi "aktif"** = `status=ACTIVE` AND `leftAt=null` (RFC §1.3) — dipakai `findActiveByMember`/`countActiveByMember`; guard E-1 tidak menyentuh `Member.status` (scope E-3).
- **Pesan AppError adalah kontrak smoke** — `expectRejected(fn, messagePart)` memeriksa `msg.includes`; konsisten pola WO-4/5/6/7.
- Smoke E-1 memakai fresh DB temp (`file:C:/.../e1-smoke/smoke.db`) dan dibersihkan; DB live dev tidak pernah disentuh.
- Compile smoke multi-file dengan struktur terjaga: `npx tsc ... --rootDir . --outDir <tmp>\out wo13_e1_smoke/smoke.ts` (rootDir "." → emit mempertahankan relatif path sehingga import antar file tetap valid); jalankan `node <tmp>\out\wo13_e1_smoke\smoke.js` dengan `$env:DATABASE_URL` absolute + `$env:NODE_PATH=<repo>\node_modules`.

---

## P-1 (Promotion Foundation): decide() Single Decision Engine + PromotionPreviewService (COMPLETE - READY Final Review, revisi Review PO)

### Ringkasan
- Source of Truth: `MASTER_DATA_AKADEMIK_ARCHITECTURE_RFC.md` (LOCKED, §7/§7.1/§8/§9) + `MASTER_DATA_AKADEMIK_WBS.md` (LOCKED, WO-21 P-1) + `P1_DISCOVERY_REPORT.md` (APPROVED). Keputusan arsitektur PO: **`decide()` = Single Decision Engine** — P-2 WAJIB memakai fungsi yang sama, dilarang ada logika keputusan kedua. Scope: **fondasi keputusan + preview read-only**. **TIDAK** menyentuh Repository/IPC/Preload/UI/Bootstrap/Schema/Migration/Executor (keputusan JANGAN PO).
- **File baru (2 source + 2 smoke):** `src/shared/dto/promotion.ts` (`PromotionPreviewDTO` persis RFC §8: mode + counts {promoted,repeated,graduated,redistributed,noTarget,error} + items {memberId,memberName,sourceClassId,sourceLabel,targetClassId?,targetLabel?,outcome,message}; `PromotionDecision`; `PromotionDecideInput` [member, sumber lengkap, targetClasses, repeat?]; `PromotionTargetClassInput` [id, educationLevel, parallel, curriculumId]; `AutomaticPromotionPreviewInput`), `src/main/services/promotion-preview.service.ts` (`decide()` MURNI: invalid level → ERROR; **XII → GRADUATED MENANG atas repeat** (RFC §7 tanpa syarat); X/XI + repeat → REPEATED; X/XI → levelOrder+1 cocok parallel+kurikulum → PROMOTED; tanpa target → NO_TARGET; diexport utk P-2; `PromotionPreviewService.preview()` read-only **via `EnrollmentRepository.findActiveByClasses`** — Service TIDAK akses Prisma langsung (revisi Review PO), validasi mode AUTOMATIC / tahun ada / tahun ≠ / fromClassId milik tahun sumber, tanpa tulis apa pun), `p1_decide_smoke/decide.unit.ts`, `p1_preview_smoke/smoke.ts`.
- **Dimodifikasi (revisi PO):** `src/main/repositories/enrollment.repository.ts` (+`findActiveByClasses(classIds, academicYearId)` — guard empty→[], filter status=ACTIVE + leftAt=null, ordered level/parallel/nama, include member+class), `p1_preview_smoke/smoke.ts` (injeksi `EnrollmentRepository`). **TIDAK diubah lainnya:** schema, migration, IPC, preload, bootstrap, UI, Repository lain (bundles identik: main 1,796.83 · preload 8.62 · renderer 1,006.72 kB).
- **Validation PASS:** (1) `npm run lint`; (2) `npm run build`; (3) unit `decide()` **30/30** (X→XI, XI→XII, XII→GRADUATED, NO_TARGET parallel/kurikulum beda, REPEATED, repeat-no-target, **XII+repeat → GRADUATED**, level invalid IX → ERROR, determinisme, pure); (4) smoke preview fresh DB **33/33** (counts, items, per-kelas, read-only [enrollment/run/item/member.status tidak berubah], guard 5 kasus, deterministik); (5) regression E-1 39 · E-2 36 · E-3 78 · E-4 45 · MI-1 43 · MI-2 37 · MI-3 38 · MI-4 24; (6) `prisma migrate diff` = empty; (7) grep bundle `promotions:`/`Promotion` = 0 (bukti tidak ada wiring IPC/preload/UI).
- **Revisi Review PO (2 poin):** (1) Service TIDAK boleh akses Prisma langsung → refactor ke `EnrollmentRepository.findActiveByClasses`; (2) analisis RFC menyimpulkan "XII → GRADUATED" tanpa syarat (klausul "kecuali dinyatakan REPEATED" melekat pada validasi "tidak ada yang dipromosikan ke tingkat sama" = anti X→X/XI→XI, BUKAN XII; §6.1 `REPEATED` = "(X→X)") → GRADUATED menang atas repeat; unit STEP 8 dikembalikan ke ekspektasi GRADUATED (perbaiki implementasi agar mengikuti RFC, jangan ubah test agar mengikuti implementasi).
- **Laporan:** `WORK_ORDER_P1_IMPLEMENTATION_REPORT.md`, `P1_FINAL_REVIEW.md`, `P1_RELEASE_REPORT.md`. Status: **DONE - READY Final Review** (tidak lanjut P-2).

### Pelajaran (retain)
- **`decide()` murni = kontrak P-2.** Input lengkap via `PromotionDecideInput`; tidak boleh membaca DB/state global. Unit "pure" membuktikan determinisme lintas run. P-2 cukup `import { decide }` + jalankan ulang di dalam `$transaction` (RFC §7.1 re-validate) — jangan pernah re-implement keputusan.
- **XII → GRADUATED menang atas repeat.** "XII → GRADUATED" (RFC §7 Mode A) tanpa syarat; REPEATED hanya tinggal kelas di tingkat sama (X→X, XI→XI, §6.1). Urutan decide: invalid → **GRADUATED (order===3)** → repeat → promote. JANGAN ditaruh repeat dulu (hasil analisis Review PO).
- **Pencocokan otomatis parallel+kurikulum:** `findTarget` menyamakan `levelOrder(expected)`, `parallel`, DAN `curriculumId` — unique komposit `Class (academicYearId, curriculumId, educationLevel, parallel)` menjamin maksimal 1 match → deterministik tanpa tie-breaker.
- **Service TIDAK boleh akses Prisma langsung** — preview baca via `EnrollmentRepository.findActiveByClasses` (pola WO-007C/borrow.service); `getPrisma` hanya untuk transaksi di Repository/base. Buktikan read-only dengan smoke yang membandingkan count sebelum/ sesudah preview.
- **Mode di-preview dikunci AUTOMATIC** untuk P-1 (MAPPING/BULK_EDIT → AppError 400 "belum didukung"); jangan implementasikan resolusi mode lain secara siluman di WO yang salah scope.
- **Review PO bisa mengubah keputusan teknis** — dokumentasikan analisis RFC + alasan balik arah di laporan; verifikasi ulang seluruh gate setelah revisi (unit+smoke+regression+lint+build+diff).
- Smoke P-1: compile `p1_decide_smoke/decide.unit.ts` + `p1_preview_smoke/smoke.ts` sekaligus (import `../src/main/services/promotion-preview.service`); unit tanpa DB, preview pakai fresh DB temp `file:C:/...` + `migrate deploy` dari workdir `prisma/`, dibersihkan setelah run.

---

## P-2 (Promotion Execute): executor Mode A SATU transaksi + audit run (COMPLETE - READY Final Review)

### Ringkasan
- Source of Truth: `MASTER_DATA_AKADEMIK_ARCHITECTURE_RFC.md` (LOCKED, §7/§7.1/§8/§9) + `MASTER_DATA_AKADEMIK_WBS.md` (LOCKED, WO-22 P-2) + `P2_DISCOVERY_REPORT.md` (APPROVED). Keputusan PO: **eksekusi Mode A satu transaksi all-or-nothing + audit**; WAJIB pakai `decide()` P-1 (dilarang logika keputusan kedua). **TIDAK** IPC/Preload/UI/Reporting/Bulk Operation/Schema/Migration (WBS `promotions:run` di-trim PO → executor saja).
- **File baru (3 source + 1 smoke):** `src/main/services/promotion-execute.service.ts` (`executeAutomatic(input)` — validasi mode/tahun/fromClassId; dalam `runTransaction(getPrisma(), ...)` re-validate state TERBARU via `EnrollmentRepository.findActiveByClassesWithTx` + `ClassRepository.findByAcademicYearWithTx`; keputusan via `decide()` (repeat:false); tulis per item — PROMOTED/REPEATED: `closeWithTx`→`updateStatusWithTx`(ACTIVE)→`createActiveWithTx`; GRADUATED: close→INACTIVE; NO_TARGET/ERROR/REDISTRIBUTED: TANPA mutasi (tetap ACTIVE = retry-able RFC §9); lalu `PromotionRepository.createRunWithTx` (run SUCCESS + summary=JSON(counts) + items); return `PromotionRunDTO` via runService), `src/main/services/promotion-run.service.ts` (`findById` → `PromotionRunDTO` 404; `findMany` list + itemCount), `src/main/repositories/promotion.repository.ts` (`createRunWithTx(tx,run,items)` — tulis dlm tx service; `findById` run+items; `findMany` paginated).
- **Dimodifikasi (4 source):** `src/shared/dto/promotion.ts` (+`AutomaticPromotionExecuteInput` [mode/fromYearId/toYearId/fromClassId?/runBy?], `PromotionRunDTO`, `PromotionRunItemDTO`, `PromotionRunStatus` SUCCESS/PARTIAL/FAILED), `src/main/repositories/enrollment.repository.ts` (+`findActiveByClassesWithTx`, `closeWithTx` [terminal+leftAt+note], `createActiveWithTx` [status ACTIVE]), `src/main/repositories/class.repository.ts` (+`findByAcademicYearWithTx`), `src/main/repositories/member.repository.ts` (+`updateStatusWithTx` [ACTIVE/INACTIVE]). **TIDAK diubah:** schema, migration, IPC, preload, bootstrap, env.d.ts, UI, EnrollmentService (rule sama dijalankan repo tx methods — tidak bisa ikut transaksi execute karena transaksi terpisah), preview, P-1.
- **Validation PASS:** (1) lint; (2) build (main 1,799.72 kB · preload 8.62 kB · renderer 1,006.72 kB — preload/renderer identik = N/A layer lain); (3) smoke P-2 fresh DB **87/87** (Preview==Execute item-identik; re-validate hanya ACTIVE — DROPPED tak diproses; mutasi PROMOTED/GRADUATED/NO_TARGET; Member.status sync; invarian satu-ACTIVE; konsistensi run+items; **rollback all-or-nothing** via injeksi gagal `createRunWithTx` setelah close+create → 0 run/0 item + state tak berubah; guard 5 kasus; run ulang hanya proses ACTIVE tanpa duplikasi); (4) regression 10 suite: P-1 decide 30 · P-1 preview 33 · E-1 39 · E-2 36 · E-3 78 · E-4 45 · MI-1 43 · MI-2 37 · MI-3 38 · MI-4 24 (total 490); (5) `prisma migrate diff` = empty; (6) grep `promotions:`/execute/run di renderer+electron = 0.
- **Laporan:** `WORK_ORDER_P2_IMPLEMENTATION_REPORT.md`, `P2_FINAL_REVIEW.md`, `P2_RELEASE_REPORT.md`. Status: **DONE - READY Final Review** (tidak lanjut WO berikutnya, menunggu review PO).

### Pelajaran (retain)
- **Transaksi execute di-orkestrasi Service; Repository menerima `tx`** — pola `createManyWithTx`/`findLastMemberNumberByPrefix(tx)`. Service TIDAK akses Prisma langsung; `getPrisma()` hanya untuk `runTransaction`. Re-validate `decide()` HARUS di dalam `$transaction` (RFC §7.1/§8: keputusan basi tidak pernah dieksekusi — baca ulang ACTIVE + kelas target via metode `*WithTx`).
- **Preview == Execute = engine tunggal `decide()`, bukan membandingkan output.** Smoke membuktikan item per item outcome+targetClassId identik. Jangan pernah re-implement keputusan di executor.
- **NO_TARGET/ERROR TIDAK menulis apa pun** — enrollment sumber tetap ACTIVE (RFC §9 state-based eligibility) sehingga run ulang hanya memproses sisa ACTIVE (terbukti smoke: run2 = sX3+sNoTarget, tanpa duplikasi).
- **`summary` = JSON string counts** (`PromotionPreviewCounts`) di kolom `PromotionRun.summary`; `PromotionRunService` mem-parse ke DTO. Summary hanya dari backend (konsisten WO-2).
- **EnrollmentService tidak bisa dipakai untuk menulis di execute** (tiap method buka transaksi sendiri, Prisma interaktif tak nested) — jalankan rule SAMA via repo tx methods (`closeWithTx`/`createActiveWithTx`). Invarian satu-ACTIVE dijaga karena sumber ditutup pada transaksi yang sama sebelum dibuka yang baru.
- **Pitfall smoke:** jangan membuat kelas target tahun-TARGET dengan parallel yang bertepatan dengan kelas sumber paralel "tanpa target" — itu secara diam-diam membuat NO_TARGET jadi PROMOTED (STEP 8 guard memakai parallel MERDEKA 7, bukan MERDEKA 9). Hitung ulang total enrollment = seed + ACTIVE baru (enrollment ditutup via UPDATE, tidak pernah DELETE — "total 8" bukan 7).
- Smoke P-2: compile `p2_execute_smoke/smoke.ts` + regression bersamaan (`--rootDir . --outDir <tmp>\out <list>`), fresh DB per suite (`migrate deploy` dari workdir `prisma/`), `NODE_PATH=<repo>\node_modules`; bukti rollback via `PromotionRepository.prototype.createRunWithTx` di-override throw lalu dikembalikan (restore di `finally`).

---

## P-3 (Promotion Run History): history READ-ONLY + UI (COMPLETE - READY Final Review)

### Ringkasan
- Source of Truth: `MASTER_DATA_AKADEMIK_ARCHITECTURE_RFC.md` (LOCKED, §2.2/§9) + `MASTER_DATA_AKADEMIK_WBS.md` (LOCKED) + P-1/P-2 reports. **Catatan:** WBS WO-23 P-3 = "Mapping mode" (beda); WO ini = run history (audit). Keputusan PO: **history READ ONLY** — semua data dari `PromotionRun` + `PromotionRunItem` (summary JSON counts); **DILARANG hitung ulang via `decide()`** (history = audit, bukan preview). Kolom 8 counts sesuai Business Rule: Promoted, Graduated, Repeated, Redistributed, **Transferred, Dropped** (default 0 utk AUTOMATIC), No Target, Error.
- **File baru (5 source + 1 smoke):** `src/shared/dto/promotion.ts` (+`PromotionRunSummaryCounts` [8 kolom], `PromotionRunListItemDTO`; `PromotionRunDTO`/`PromotionRunItemDTO` diperluas — `fromYearName`/`toYearName`/`memberName`/`sourceClassLabel`/`targetClassLabel`/`counts`), `src/main/repositories/promotion.repository.ts` (`findById` + include `fromYear`/`toYear`/`items.member.fullName` + **batch** lookup class via `in: classIds` → label `"LEVEL PARALLEL"` — item TIDAK punya relation ke Class, dilarang query per baris; `findMany` + include tahun + `_count.items`), `src/main/services/promotion-run.service.ts` (mapping audit ke DTO history — `parseRunCounts` default 0 per kolom, READ-ONLY tanpa decide()), `electron/ipc/promotion.ipc.ts` (`promotions:findMany`/`promotions:findById`), `electron/preload/promotion.preload.ts`, `src/pages/promotion/PromotionHistoryPage.tsx` (list 13 kolom + badge status + navigate detail), `src/pages/promotion/PromotionRunDetailPage.tsx` (meta run + kartu 8 counts + tabel item), `p3_promotion_history_smoke/smoke.ts`.
- **Dimodifikasi (11):** `electron/ipc/index.ts` (+import +`registerPromotionHandlers` + tipe), `electron/main/bootstrap.ts` (+`PromotionRepository`/`PromotionRunService` — **sebelumnya TIDAK ter-wire** karena P-2 di-trim IPC), `electron/preload/index.ts` (+`promotionAPI`), `src/renderer/env.d.ts` (+blok `promotions`), `src/utils/navigation.ts` (+`ROUTES.PROMOTIONS`/`PROMOTION_DETAIL` + `promotionDetailPath`), `src/utils/labels.ts` (+blok `PROMOTION`; typo `STATUS_SUCCCESS`→`STATUS_SUCCESS`), `src/components/layout/Sidebar.tsx` (+item "Riwayat Promosi" ikon `TrendingUp`), `src/routes/index.tsx` (+route `/promotions` + `/promotions/:id`). **TIDAK diubah:** schema, migration, `decide()`/preview, `PromotionExecuteService`, `EnrollmentService`, business rule, `MasterTable` (history tidak pakai — READ-ONLY tanpa aksi add/edit/delete).
- **Validation PASS:** (1) lint; (2) build (main 1,805.61 kB · preload 8.86 kB · renderer 1,028.69 kB); (3) smoke P-3 fresh DB **75/75** (list = data run bukan recompute; counts 8 kolom dgn transferred/dropped=0; itemCount=_count.items; urutan startedAt desc; pagination; detail label dari relasi — memberName/fullName, sourceClassLabel/targetClassLabel `"LEVEL PARALLEL"`; konsistensi audit groupBy outcome DB == counts; guard 404 AppError; run ke-2 → 2 run urutan terbaru dulu); (4) regression 12 suite fresh DB total **565 PASS** (P-1 decide 30 · P-1 preview 33 · P-2 87 · **P-3 75** · E-1 39 · E-2 36 · E-3 78 · E-4 45 · MI-1 43 · MI-2 37 · MI-3 38 · MI-4 24); (5) `prisma migrate diff` = "No difference detected" (schema tidak disentuh); (6) grep bundle: main `promotions:findMany`/`promotions:findById`, renderer `Riwayat Promosi`/`Detail Run Promosi` = True.
- **Laporan:** `WORK_ORDER_P3_IMPLEMENTATION_REPORT.md`, `P3_FINAL_REVIEW.md`, `P3_RELEASE_REPORT.md`. Status: **DONE - READY Final Review** (tidak lanjut WO berikutnya, menunggu review PO).

### Pelajaran (retain)
- **History = audit, bukan preview.** Jangan pernah memanggil `decide()` di layer history; seluruh angka diambil dari `summary` (JSON counts yang ditulis P-2) + jumlah baris item. "Preview == Execute" sudah dibuktikan P-2; P-3 cukup membuktikan label/angka BERASAL dari relasi & kolom.
- **`PromotionRunItem` TIDAK punya relation ke `Class`** — label kelas harus lewat **batch lookup** (`in: classIds` lalu Map id→`"${educationLevel} ${parallel}"`); dilarang query per baris. Label hanya display; keputusan tetap `outcome`/`targetClassId`.
- **Counts P-3 ≠ kontrak P-2 `PromotionPreviewCounts`** — `PromotionRunSummaryCounts` menambah transferred/dropped (default 0) untuk memenuhi 8 kolom Business Rule PO; nilai hanya terisi bila mode lain menuliskannya ke summary. `summary` (kontrak P-2) dipertahankan apa adanya di DTO.
- **`PromotionRunService`/`PromotionRepository` belum ter-wire di bootstrap** pasca P-2 (IPC di-trim PO) — WO dengan IPC harus memeriksa bootstrap, bukan menganggap service sudah terdaftar.
- **History UI tidak memakai `MasterTable`** (komponen add/edit/delete); pakai tabel langsung + badge status/outcome, pola `EnrollmentHistoryPage`.
- Smoke P-3: fresh DB per run; run ulang (STEP 5) memproses sisa ACTIVE — sNoTarget (NO_TARGET, tetap ACTIVE) + sX3 (PROMOTED) = **2 item**, bukan 1 (pitfall yang sama dgn P-2 STEP 9).

## P-4 (Promotion Operator UI): Preview → Execute → Redirect (COMPLETE - READY Final Review, ter-release)

### Ringkasan
- Scope: workflow operator penuh — pilih tahun sumber → tahun tujuan → kelas sumber (opsional, "Semua Kelas") → **Preview** → kartu counts + tabel hasil → **Execute** → **redirect otomatis ke Promotion Run Detail**. Renderer TIDAK punya business rule: payload `{mode:'AUTOMATIC', fromYearId, toYearId, fromClassId?}` diteruskan apa adanya ke channel; seluruh keputusan via `decide()` (engine tunggal P-1).
- **File baru (2):** `src/pages/promotion/PromotionPage.tsx` (dropdown tahun/kelas dari `academicYears.findMany` + `classes.findMany` fetch-all loop 100 + filter client-side per tahun sumber; default tahun sumber = aktif; preview/execute → `api.promotions.*`; hasil = 6 kartu counts + tabel items `sourceLabel`/`targetLabel`/`outcome`/`message`; execute sukses → `navigate(promotionDetailPath(run.id))`; error → `alert(err.message)`), `p4_operator_ui_smoke/smoke.ts` (37/37).
- **Modifikasi (9):** `electron/ipc/promotion.ipc.ts` (+`promotions:preview`→`previewService.preview`, +`promotions:execute`→`executeService.executeAutomatic`; signature → objek `{runService, previewService, executeService}`), `electron/preload/promotion.preload.ts` (+`preview`/`execute`), `electron/ipc/index.ts` + `electron/main/bootstrap.ts` (**wiring** — instantiasi `PromotionPreviewService`/`PromotionExecuteService` yang SEBELUMNYA belum ter-wire pasca P-2 di-trim IPC), `src/renderer/env.d.ts` (+2 channel), `src/routes/index.tsx` (+route `promotions/run`), `src/components/layout/Sidebar.tsx` (+"Promosi" ikon `PlayCircle` di atas "Riwayat Promosi"), `src/utils/navigation.ts` (+`PROMOTION_RUN`), `src/utils/labels.ts` (+blok `PROMOTION_OPERATOR`).
- **TIDAK diubah:** `decide()`, `PromotionPreviewService`, `PromotionExecuteService`, `EnrollmentService`, business rule, schema, migration (service hanya di-instantiasi & dipanggil lewat IPC).
- **Validation PASS:** lint; build (main 1,817.22 kB · preload 9.02 kB · renderer 1,045.33 kB); smoke P-4 **37/37** fresh DB (preview semua kelas 4 items [promoted 2/graduated 1/noTarget 1/error 0], preview per-kelas `fromClassId` → 1 item + sourceLabel `"X MERDEKA 1"`, **Preview==Execute** item-identik outcome+target + `run.summary==preview.counts`, detail run + muncul di riwayat, guard 400/404 AppError 3 kasus, re-execute → 1 item NO_TARGET); regression 13 suite **602 PASS** (p1-30 p1prev-33 p2-87 p3-75 **p4-37** e1-39 e2-36 e3-78 e4-45 mi1-43 mi2-37 mi3-38 mi4-24); `prisma migrate diff` no-drift; grep bundle main/preload `promotions:preview`/`promotions:execute` + renderer `Eksekusi Promosi`/`Tahun Ajaran Sumber`/`Semua Kelas`; grep business-rule di `src/pages/promotion` = 0 (satu match = komentar).
- **Commit:** `2624aee..<HEAD>` (satu commit final P-4, di-push). Working tree bersih.
- **Laporan:** `WORK_ORDER_P4_IMPLEMENTATION_REPORT.md`, `P4_FINAL_REVIEW.md`, `P4_RELEASE_REPORT.md`.
- **Status: DONE - READY Final Review** (tidak lanjut WO berikutnya).

### Pelajaran (retain)
- **IPC handler promotion menjadi 3 service** (`runService`/`previewService`/`executeService`) — signature `registerPromotionHandlers(services)`; pembungkus `preview`/`execute` MURNI (validasi input type-aman lewat DTO shared, lalu langsung panggil service). Renderer kirim `{mode:'AUTOMATIC', ...}` — mode adalah konstanta kontrak (satu-satunya mode didukung P-1/P-2), bukan keputusan UI.
- **Preview == Execute = engine tunggal `decide()`, dibuktikan dengan membandingkan output item per item** (outcome + targetClassId) dan `run.summary == preview.counts` — bukan dengan membandingkan kode.
- **Redirect pasca execute** ke `promotionDetailPath(run.id)` (P-3) menghubungkan operator UI → history detail; `execute` mengembalikan `PromotionRunDTO` (id), renderer tidak menghitung apa pun.
- **Bootstrap & IPC adalah dua hal terpisah yang wajib di-cek**: P-2 di-trim IPC sehingga `PromotionRunService`/`PromotionRepository` hanya ter-wire di P-3; P-4 menambah `PromotionPreviewService`/`PromotionExecuteService` — verifikasi `Services` type + objek return + handler map sekaligus.
- **Class list filter client-side** (bukan keputusan akademik): `classes.findMany` fetch-all loop 100, filter `academicYearId === fromYearId` untuk dropdown; `fromClassId` di-omit saat "Semua Kelas" (kontrak service: opsional = seluruh kelas tahun sumber).
- **Smoke P-4 seed berbeda dari P-3** (4 member, kelas src X/XI/XII/X9) → re-execute hanya sisa ACTIVE (sNoTarget NO_TARGET) = **1 item**; jangan copy ekspektasi P-3 (2 item) — pitfall serupa P-2 STEP 9 / P-3 STEP 5.
- Grep bundle vs source: di bundle minified, properti API bisa berubah nama — gunakan **string channel** (`promotions:preview`), bukan bentuk `promotions.preview`; source grep tetap memakai bentuk properti.

## P-5 (Promotion Finalization): Audit FINAL + Milestone Promotion DITUTUP (COMPLETE - APPROVED & RELEASED)

### Ringkasan
- WO P-5 = audit final **DISCOVERY ONLY / READ ONLY** atas seluruh Promotion Module (Mode A) — **tidak ada fase implementation**. `P5_DISCOVERY_REPORT.md` **disetujui Product Owner**; hasil menyatakan Mode A production-ready, tidak perlu implementasi tambahan.
- **Verifikasi 6 mandat (semua PASS):** (1) **Single Decision Engine** — `decide()` didefinisikan persis 1× di `promotion-preview.service.ts:25`, dipakai preview (`:161`) & execute (`:115`, re-validate dlm `$transaction`); history (`PromotionRunService`) TIDAK memanggil decide — baca kolom `summary` (by-design RFC §8/§9); (2) **tanpa business rule di renderer** — grep simbol domain di `src/pages/promotion` = 1 komentar; (3) **tanpa akses Prisma langsung dari service Promosi** — 0 `\.prisma\.` di `src/main/services`; `getPrisma()` hanya utk `runTransaction`; (4) **tanpa duplicate decision logic** — satu-satunya komputasi outcome = `decide()` (`OUTCOME_COUNT_KEY` = pemetaan counts, bukan keputusan); (5) **PromotionRun/Item immutable audit** — satu-satunya tulis = `PromotionRepository.createRunWithTx` (create+createMany); 0 update/delete di source; FK RESTRICT tanpa `@updatedAt`; (6) **dependency P-1..P-4 terpenuhi** (regression 13 suite 602 PASS).
- **Debt dicatat (bukan blokir):** single-flight guard eksekusi (RFC §9 #5) belum ada di IPC (UI sudah mencegah; SQLite serial); duplikasi agregasi counts (preview switch vs `OUTCOME_COUNT_KEY`); `DatabaseReconciliationService` akses Prisma langsung (pre-existing, luar module Promosi); Mode MAPPING/BULK_EDIT + UI mapping (WBS P-3/P-5b) = WO masa depan (saat ini ditolak AppError 400).
- **Validation:** 13 suite fresh DB 602 PASS · lint PASS · build PASS (main 1,817.22 · preload 9.02 · renderer 1,045.33 kB) · `prisma migrate diff` no-drift · working tree bersih.
- **Commit:** `<HEAD>` (SATU FINAL COMMIT dokumentasi — hanya AGENTS.md + P5 laporan; TANPA perubahan source), di-push.
- **Laporan:** `P5_DISCOVERY_REPORT.md`, `P5_FINAL_REVIEW.md`, `P5_RELEASE_REPORT.md`.
- **Status: APPROVED & RELEASED. Milestone Promotion (Mode A: P-1→P-2→P-3→P-4→P-5) DITUTUP.** Berpindah ke **Integration Testing**.

### Pelajaran (retain)
- **Audit final (P-5) = bukti silang mandat, bukan hanya smoke.** Verifikasi mandat memakai grep source (`decide(` = 1 implementasi; `\.prisma\.` = 0 di services; `promotionRun*.update/delete` = 0 di app source) + inspeksi alur (preview/execute share `decide()`; history baca `summary`) + regression. Grep membuktikan ketiadaan, bukan hanya kehadiran.
- **History promosi TIDAK boleh memanggil `decide()`** — history = audit (baca `summary`/items yang ditulis execute). "Preview == Execute = engine tunggal" dibuktikan di P-2/P-4; P-3/P-5 hanya membuktikan angka BERASAL dari kolom audit.
- **Immutability audit record**: cek kode (hanya `createRunWithTx`) DAN schema (tanpa `@updatedAt`, FK default RESTRICT → hapus Member/AcademicYear yang dirujuk run diblokir). Tidak ada update/delete path di layer mana pun.
- **WO audit-readonly selesai tanpa fase implementation** → rilis = SATU FINAL COMMIT dokumentasi (laporan + AGENTS.md saja), TIDAK menyentuh source. Ini menjaga riwayat git bersih per WO.
- **Penutupan milestone**: P-5 menutup rantai P-1..P-5 (Mode A). WO masa depan untuk Mode B/C (MAPPING/BULK_EDIT) + single-flight guard tercatat sebagai backlog, bukan bagian milestone ini.

---

## WO-21 (B1/B2 Import Fix): Import Buku — Per-Baris Atomic + Hasil Per-Baris (COMPLETE - READY review PO)

### Ringkasan
- Keputusan user: perbaiki bug UAT `SPRINT10_WO3_UAT_REPORT.md` — **B1** (baris gagal tidak tampil ke user) & **B2** (orphan AutoCreate: entitas dibuat walau baris import gagal).
- **B2 fix — atomic per baris:** `AutoCreateService.apply()` + cache `created` **dihapus**; API baru `resolveRow(row, tx)` menerima `Prisma.TransactionClient` (candidate cocok dipakai; entity baru dibuat dlm tx; race `P2002` → fallback `findExactWithTx`; SKIPPED/AMBIGUOUS → `resolvedEntity = null`). `BookImportService.createBookWithCopies()` = SATU `runTransaction` per baris: `resolveRow` → `book.createWithTx` → `InventoryAllocator.allocate(tx, copyCount)` → `createManyWithTx` (barcode=inventoryNumber; shelfLocation/acquisitionSource/acquisitionDate/acquisitionCost dipertahankan). Baris gagal → rollback → **0 tulisan DB** → tidak ada orphan.
- **B1 fix — hasil per-baris:** `imports:match` kini mengembalikan **`ImportResultDTO`** `{totalRows, importedBooks, importedCopies, failedRows: {rowNumber, messageKey}[]}`; renderer me-render langsung dari DTO. Guard baru: AMBIGUOUS, `titleMissing`, `isbnDuplicate` (pre-check `existsByISBN`), `copyCreateFailed` (copyCount non-integer/<1/>100, default 1), `entityMissing`, `createFailed`. Retry `P2002` inventory 3× (retry transaksi baris penuh).
- **File:** `src/types/import.ts` (+DTO), `auto-create.service.ts` (rewrite), `book-import.service.ts` (rewrite), `author/publisher/category.repository.ts` (+`createWithTx`/`findExactWithTx`), `electron/ipc/book-import.ipc.ts` (handler 2 arg: matchingEngine, bookImportService), `electron/ipc/index.ts`, `electron/main/bootstrap.ts` (`new BookImportService(..., autoCreateService)`), `src/renderer/env.d.ts`, `BookImportPreviewPage.tsx`, `utils/bookImport.ts` (`computeImportResultSummary` dihapus).
- **TIDAK diubah:** schema, migration, `InventoryAllocator`, matching/validation engine, import UI dialog flow, member import.
- **Validation PASS:** lint; build (main 1,818.41 kB · preload 9.02 kB · renderer 1,044.59 kB); smoke `wo21_import_b1b2_smoke/smoke.ts` **48/48 PASS** fresh DB (S1 copyCount 2, S5b/s5 isbnDuplicate tanpa orphan, S7 entityMissing, S6 titleMissing, S10 reuse+baru, default copy 1, invariant `sum importedBooks==DB books` & `sum importedCopies==DB copies`, semua failedRows punya rowNumber); `prisma migrate diff` = "No difference detected"; grep `.apply(`/`computeImportResultSummary`/cache `created` di src+electron = 0.
- **Laporan:** `WORK_ORDER_WO21_B1B2_IMPORT_FIX_REPORT.md`, `WO21_FINAL_REVIEW.md`, `WO21_RELEASE_REPORT.md`. Status: **DONE — menunggu review PO** (tidak lanjut WO berikutnya).

### Pelajaran (retain)
- **Orphan AutoCreate = penulisan entity di luar transaksi baris.** Solusi: seluruh AutoCreate/Book/BookCopy dalam SATU `runTransaction` per baris; API `resolveRow(row, tx)` menggantikan `apply()`; **jangan cache `created` antar-baris** — pembacaan transaksi terkini (commit per baris) mencegah duplikasi entity.
- **`imports:match` TIDAK pernah throw utk kegagalan baris** — kembali dikonfirmasi; kini DTO memuat `failedRows` per-baris (`rowNumber` selalu non-null; error ber-rowNumber null diabaikan di aggregasi).
- **Guard `copyCount` pindah ke service** (1..100, default 1, error `copyCreateFailed`) — renderer tidak menghitung business logic; DTO `importedCopies` = jumlah copy DB yang benar-benar dibuat (bukan baris × count).
- **Retry P2002 inventory** = retry SELURUH transaksi baris (bukan hanya `allocate`); non-P2002 → throw → baris gagal (bukan crash seluruh import).
- **Pola `createWithTx`/`findExactWithTx`** (repo menerima `tx`) = perluasan dari `createManyWithTx`/`createRunWithTx` (P-2) — Service memegang orkestrasi transaksi, repo hanya eksekusi per-kolom tx.
- Smoke wo21 memakai fresh DB temp + `prisma migrate deploy` (workdir `prisma/`) dan dibersihkan; DB live dev tidak pernah disentuh.

---

## IT-1 (Borrow/Return Transaction Integrity): Single Status Authority + Atomic Guards (COMPLETE - READY review PO)

### Ringkasan
- Source of Truth: `IT1_DISCOVERY_REPORT.md` (APPROVED) + 5 keputusan PO. Scope: **transisi status `BookCopy` disatukan ke satu otoritas**, `HILANG→LOST`, `BORROWED→REMOVED` ditolak, seluruh mutasi status pindah ke stack baru (`src/main/`, satu PrismaClient).
- **File baru (4):** `src/shared/config/book-copy-status.ts` (SATU otoritas: `BOOK_COPY_STATUS` 4 nilai + `ALLOWED_STATUS_TRANSITIONS` matriks + `canTransitionStatus()` — leaf node, pola config F1), `electron/main/shared/book-copy-status.ts` (shim backward-compat untuk legacy `addCopies`), `src/main/services/book-copy.service.ts` (`BookCopyService` baru: `findByBarcode()` + `decommissionCopy()` dengan guard BORROWED→REMOVED ditolak + canTransitionStatus + delete/REMOVED logic), `it1_borrow_return_smoke/smoke.ts` (**34/34 PASS**: double-borrow atomic, decommission guards, HILANG→LOST, no-resurrection, matriks transisi).
- **Dimodifikasi (5):** `src/main/repositories/book-copy.repository.ts` (+`findByIdWithHistory()`, +`updateStatusIf(id, fromStatus, toStatus)` guarded write via `updateMany` berpredikat), `src/main/repositories/borrow.repository.ts` (`createWithItems`: atomic guard AVAILABLE→BORROWED via `updateMany` berpredikat + count check → all-or-nothing rollback; `processReturn`: guarded status transition via `canTransitionStatus` + predikat status — HILANG→LOST, selainnya→AVAILABLE, REMOVED tidak pernah kembali AVAILABLE), `electron/main/services/book-copy.service.ts` (hapus `ALLOWED_TRANSITIONS`, `validateStatusTransition`, `updateStatus`, `updateCondition`; `decommissionCopy` jadi throwing stub), `electron/ipc/book-copy.ipc.ts` (rewire `decommissionCopy` → `newBookCopyService`), `src/components/books/BookDetail.tsx` (error surfacing `try/catch` + `window.alert(message)`).
- **Validation PASS:** (1) `npm run lint` (tsc node+web); (2) `npm run build` (main 1,819.24 kB · preload 9.02 kB · renderer 1,044.75 kB); (3) `prisma migrate diff --exit-code` = "No difference detected"; (4) `it1_borrow_return_smoke` **34/34 PASS** (fresh DB): double-borrow service guard, atomic in-tx rollback all-or-nothing, decommission BORROWED rejected, return normal→AVAILABLE, HILANG→LOST + conditionBack HILANG, decommission LOST→REMOVED, decommission AVAILABLE no-history→DELETE, decommission AVAILABLE with-history→REMOVED, return REMOVED no-respiration, return not-borrowed rejected, 10 transition matrix unit cases; (5) `wo14_e2_smoke` **36/36 PASS** (unmodified regression).
- **Laporan:** `IT1_FINAL_REVIEW.md`, `IT1_RELEASE_REPORT.md`. Status: **DONE — menunggu review PO** (tidak lanjut WO berikutnya).

### Pelajaran (retain)
- **Atomic borrow guard di dalam transaksi**: `createWithItems` memindahkan `updateMany` berpredikat `status: AVAILABLE` ke SETELAH `borrow.create + detail.createMany`. Bila `count !== items.length`, throw → Prisma rollback seluruh tx → tidak ada Borrow/Detail parsial, tidak ada resurrection REMOVED/LOST. Pre-tx `findById` (service) tetap ada sebagai fast-fail advisory.
- **Decommission policy**: AVAILABLE tanpa history → `delete`; AVAILABLE/LOST dengan history → `updateStatusIf(REMOVED)`; BORROWED → AppError 400 "sedang dipinjam". Pola `delete` vs `updateStatusIf` = reuse perilaku legacy yang benar.
- **No-resurrection**: `processReturn` hanya menulis status bila `canTransitionStatus(current, target)` TRUE → REMOVED tidak pernah kembali AVAILABLE (REMOVED→AVAILABLE tidak ada di matriks). Guard predikat `updateMany({ where: { id, status: currentCopy.status } })` concurrent-safe tanpa lock.
- **Config leaf node** (`src/shared/config/book-copy-status.ts`) = pattern konsisten dengan `academic-status.ts`, `member-type.ts`, `education-level.ts`. Importable dari `src/main/` (tsconfig.node) dan `src/renderer/` (tsconfig.web) tanpa cyclic.
- **Cross-boundary import `AppError`** dari `electron/main/errorHandler` ke `src/main/repositories/borrow.repository.ts` — pola existing, bukan baru. `AppError` adalah class murni (tanpa import Electron) sehingga aman dijalankan di smoke node.
- **Smoke atomic guard**: bypass pre-tx service check dengan memanggil `borrowRepository.createWithItems` langsung — satu-satunya cara menguji rollback all-or-nothing (pre-tx guard memblokir sebelum tx).
- **Smoke no-resurrection**: simulasi legacy dirty data via `prisma.bookCopy.update({ status: REMOVED })` langsung pada copy yang punya active detail, lalu `returnBook` → status tetap REMOVED.

---

## IT-1 HOTFIX: Borrow Member Status Eligibility (COMPLETE - READY review PO)

### Ringkasan
- **Root Cause:** `BorrowService.create` memakai `member.status !== 'ACTIVE'` sebagai guard peminjaman, tetapi `Member.status` bukan sumber otoritas eligibility peminjaman — SISWA eligibility ditentukan oleh `MemberEnrollment.status=ACTIVE`.
- **Business Rules (PO Approved):** SISWA → wajib punya Enrollment ACTIVE; GURU/UMUM → tidak butuh enrollment; Unknown MemberType → DITOLAK (Validation Error, bukan dianggap General).
- **Modifikasi (2 source):** `src/main/services/borrow.service.ts` (ganti `member.status` check → `getMemberType()` + `enrollmentService.findActiveByMember()`; unknown type → AppError 400), `src/pages/BorrowingsPage.tsx` (`'active'` → `'ACTIVE'` badge fix).
- **Regression Updated:** `wo14_e2_smoke/smoke.ts` (STEP 9: teacher dgn classId legacy; STEP 10: message baru), `it1_borrow_return_smoke/smoke.ts` (seed tambah enrollment untuk student).
- **Validation PASS:** (1) smoke 7/7 (7 mandatory cases: ACTIVE/GRADUATED/TRANSFERRED/DROPPED/teacher/general/unknown); (2) regression wo14_e2 36/36 + it1 34/34 = **77 PASS total**; (3) lint PASS; (4) build PASS (main 1,819.55 kB · preload 9.02 kB · renderer 1,044.75 kB); (5) `prisma migrate diff` = "No difference detected".
- **Laporan:** `IT1_BORROW_ELIGIBILITY_FINAL_REVIEW.md`, `IT1_BORROW_ELIGIBILITY_RELEASE_REPORT.md`. Status: **DONE — menunggu review PO**.

### Pelajaran (retain)
- **`Member.status` bukan otoritas eligibility peminjaman.** SISWA eligibility = `MemberEnrollment.status=ACTIVE` (enrollment-based). Guru/Umum tidak membutuhkan enrollment.
- **Unknown `MemberType` harus ditolak eksplisit** — `getMemberType()` mengembalikan `null`; BorrowService menolak sebelum cek enrollment.
- **Case-sensitive badge UI** — `BorrowingsPage.tsx` harus pakai `'ACTIVE'` (bukan `'active'`).
- **Regression yang pakai `BorrowService` wajib seed enrollment untuk student** — dua regression smoke harus di-update.
