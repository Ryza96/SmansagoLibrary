# SPRINT10_WO3_UAT_REPORT.md

**WO-3 — End-to-End User Acceptance Test: Fitur Import Buku**

- **Status:** DONE — READ ONLY, menunggu review Product Owner
- **Scope:** Alur produksi penuh `Buku → Import Buku → Pilih File (.xlsx) → Validasi → Preview → Import Buku → Matching → Auto Create → Book → BookCopy (Barcode) → Selesai`
- **Aturan:** Tidak ada perubahan kode, tidak ada commit, tidak ada refactor. Bug tidak diperbaiki, hanya dicatat.
- **Environment:** node v22.20.0 · DB temp SQLite `file:C:/Users/hp/AppData/Local/Temp/opencode/wo3-uat/*.sqlite` (fresh, `prisma migrate deploy` 3 migrasi) · UI diverifikasi statis (headless, tanpa Electron/GUI)

---

## 1. TEST MATRIX

Layering uji (alur eksekusi headless = urutan produksi tanpa Electron):

| # | Layer / Step UI | Eksekusi |
|---|-----------------|----------|
| L1 | Pilih File (.xlsx, max 5 MB) — `FileUploadDropzone` + `validateImportFile` | Statis (wiring terverifikasi) + reader real |
| L2 | Baca Workbook — `read-excel-file` (`/browser` di app; `/node` di uji) → `WorkbookReaderService.readWorkbook` → `RawWorkbook` | **DIEKSEKUSI** (file .xlsx nyata dibuat via OOXML, dibaca real) |
| L3 | Validasi — `validationEngineService.validate` (produksi, persis `useBookImportWorkflow.parseAndValidate`) | **DIEKSEKUSI** |
| L4 | Matching → Auto Create → Import — `imports:match` IPC (channel `imports:match`, `electron/ipc/book-import.ipc.ts:22`) = `MatchingEngineService(createProductionStrategies)` → `AutoCreateService.apply` → `BookImportService.importBooks` | **DIEKSEKUSI** (objek identik dengan handler IPC) |
| L5 | UI — `BooksPage` tombol Import → `/books/import` → `/books/import/preview` → `handleCommit` → status sukses/error | Statis (wiring terverifikasi) |

Skenario fungsional (S1–S10):

| ID | Skenario | Layer diuji |
|----|----------|-------------|
| S1 | Import normal 1 buku, semua kolom terisi | L2 + L3 + L4 (E2E) |
| S2 | Author baru (belum ada di DB) | L3 + L4 |
| S3 | Publisher baru | L3 + L4 |
| S4 | Category baru | L3 + L4 |
| S5 | ISBN sudah ada di DB | L4 |
| S5b | Dua baris ISBN sama dalam satu file | L4 |
| S6 | Judul kosong | L3 (`IMP-013`) + L4 (`titleMissing`) |
| S7 | Publisher kosong | L3 (`IMP-013`) + L4 (`entityMissing`) |
| S8 | Header resmi template "Penerbit" | L3 |
| S9 | Header sinonim "Publisher" → dinormalisasi | L3 |
| S10 | Lebih dari satu buku (3 baris, campuran entity baru + reuse) | L3 + L4 |

---

## 2. TEST RESULT

### 2.1 Ringkasan Eksekusi

| Suite | Script | Hasil |
|-------|--------|-------|
| Reader real `.xlsx` | `uat_wo3/reader.check.cjs` | **3/3 PASS** |
| E2E rantai penuh (xlsx→reader→validasi→pipeline→DB) | `uat_wo3/e2e.smoke.ts` | **20/20 PASS** |
| Validation layer | `uat_wo3/validation.smoke.ts` | **22/22 PASS** |
| Import pipeline (strategies produksi) | `uat_wo3/import.smoke.ts` | **50/50 PASS** |
| UI wiring (statis) | Routes, BooksPage, BookImportPage, PreviewPage, Dropzone, bootstrap/ipc/preload | **PASS** |
| **TOTAL** | | **95/95 PASS** |

### 2.2 Detail per Layer

**L1 — Pilih File (statis).** `BooksPage.tsx:72` tombol "Import Buku" (`Upload` icon) → `navigate(ROUTES.BOOK_IMPORT)` (`/books/import`, `src/utils/navigation.ts:5`). Route `/books/import` + `/books/import/preview` terdaftar dalam `BookImportProvider` (`src/routes/index.tsx:36-47`; urutan sebelum `/books/:id`, tidak tertabrak). `FileUploadDropzone.tsx`: klik/drag-drop, accept `.xlsx` saja, info `IMPORT_CONFIG.maxFileSize` = 5 MB (`src/config/import.config.ts:2-3`). `useBookImportWorkflow.selectFile` → `validateImportFile` (ukuran/ekstensi) → set `errorCode` bila invalid, tampil `getImportErrorMessage` di `BookImportPage.tsx:53-57`.

**L2 — Baca Workbook (executed).** File `.xlsx` nyata dibuat secara terprogram (OOXML: `[Content_Types].xml`, rels, workbook, worksheet, sharedStrings, styles via .NET ZipArchive) dengan 3 baris (header resmi + 2 data). Dibaca via `read-excel-file` (parser yang sama antara build `/node` dan `/browser` yang dipakai app). Hasil: return `Sheet[] {sheet:'Sheet1', data:[...]}` — persis asumsi `WorkbookReaderService.readWorkbook` (`src/services/WorkbookReaderService.ts:17-23` memetakan `sheet.sheet`→name, `sheet.data`→rows). Header utuh; data utuh (tahun ter-parse sebagai number `2020`; ISBN string tidak rusak). **PASS.**

**L3 — Validasi (executed, 22/22).** `validationEngineService.validate(rawWorkbook)` (produksi). Rincian:
- S1 normal → valid, 1 canonical row, nilai utuh (`title`, `publisher` terpeta benar).
- S2/S3/S4 (author/publisher/category baru) → valid (pembuatan entitas diverifikasi di L4).
- S5 (ISBN duplikat) → **tetap valid** — cek duplikat bukan tanggung jawab validasi, ditangani di pipeline. ✓ sesuai desain.
- S6 (judul kosong) → `valid=false`, row invalid, issue `IMP-013`, tidak masuk `canonicalRows`. **PASS.**
- S7 (publisher kosong) → `IMP-013`, tidak masuk canonical. **PASS.**
- S8 header "Penerbit" → valid.
- S9 header "Publisher" → `normalizedHeaders[2] === 'penerbit'` (sinonim di `HeaderNormalizerService`). **PASS.**
- S10 (3 baris) → valid, 3 canonical rows. **PASS.**

**L4 — Import pipeline (executed, 50/50).** Objek produksi identik handler IPC `imports:match` (`electron/ipc/book-import.ipc.ts:22-25`): `MatchingEngineService(createProductionStrategies())` → `AutoCreateService.apply` → `BookImportService.importBooks`. Dijalankan pada DB fresh sekuensial (skenario bertumpuk, tally final diverifikasi). Rincian:
- S1 → 1 Book + 1 BookCopy (`barcode === inventoryNumber` = `INV-000001`), Author/Publisher/Category dibuat, 4 relasi (book→author/publisher/category, copy→book) benar. **PASS.**
- S2/S3/S4 → entitas baru dibuat (author=2, publisher=2, category=2). **PASS.**
- S10 → 3 Book + 3 BookCopy; reuse entitas benar (total author=4, publisher=3, category=3); relasi campuran benar; tiap book persis 1 copy. **PASS.**
- S5 → error `bookImport.isbnDuplicate`, Book & BookCopy **tidak dibuat**. **PASS (terkelola).**
- S5b → 2 baris ISBN sama → 1 dibuat (`UAT Dup A` ada, `UAT Dup B` tidak), 1 error `isbnDuplicate`. **PASS (terkelola).**
- S7 → error `bookImport.entityMissing` (publisher kosong lolos sampai pipeline bila input langsung canonical). **PASS (terkelola).**
- S6 → error `bookImport.titleMissing` (judul kosong di pipeline bila input langsung canonical). **PASS (terkelola).**
- Tally akhir: `books=6, copies=6, authors=4, publishers=3, categories=3`. **PASS.**

**E2E rantai penuh (20/20).** Satu alur utuh pada DB fresh: file `.xlsx` nyata → reader → map `RawWorkbook` (kode identik `WorkbookReaderService`) → `validationEngineService.validate` → canonical → pipeline produksi → verifikasi DB. Hasil: 2 Book, 2 BookCopy (`INV-000001`, `INV-000002`, `barcode === inventoryNumber`), 2 Author, 2 Publisher, 2 Category, seluruh relasi lengkap. Ini membuktikan **kontrak antarlayer sama di seluruh rantai tanpa GUI**.

**L5 — UI wiring (statis, PASS).** `BookImportPage.handleContinue` → `parseAndValidate()` → sukses → `navigate('/books/import/preview')`. Preview (`BookImportPreviewPage.tsx`): statistik sheet/normalized headers, `ValidationSummary` (valid/invalid), preview baris, `RowResultsSummary` (max 20). `handleCommit` (`:184-196`) → `await window.electronAPI.imports.match(validatedWorkbook.canonicalRows)` → sukses `setImportSuccess(true)` (pesan hijau, tanpa statistik — konsisten keputusan WO-2 revisi PO), gagal → `IMPORT_ERROR`. Tombol "Kembali ke Daftar Buku" → `/books`. Wiring backend: `electron/main/bootstrap.ts:103-105` (konstruksi strategies/engine/services) → `electron/ipc/index.ts:67` (register) → preload/env.d.ts. **PASS.**

---

## 3. BUG FOUND

| # | Severity | Temuan | Lokasi | Dampak | Rekomendasi |
|---|----------|--------|--------|--------|-------------|
| B1 | **MODERATE** | Baris yang gagal di pipeline (ISBN duplikat, judul/penerbit kosong bila lolos validasi) **tidak pernah tampil ke user**. `imports:match` resolve tanpa throw — error dikumpulkan di `matchedWorkbook.matchingResult.errors` (objek internal) dan `handleCommit` hanya membaca resolve/reject (`BookImportPreviewPage.tsx:189-192`). UI menampilkan sukses total walau sebagian baris gagal. | `electron/ipc/book-import.ipc.ts:22-25`, `BookImportPreviewPage.tsx:184-196` | User yakin semua baris masuk padahal ada yang dilewati | Backend menyediakan summary resmi per-baris (kontrak IPC), renderer menampilkan rincian baris berhasil/gagal + messageKey terindonesia |
| B2 | **LOW–MODERATE** | `AutoCreateService.apply` berjalan **sebelum** `importBooks`. Entitas (Author/Publisher/Category) untuk baris yang **akhirnya gagal di import** (mis. ISBN duplikat dengan nama entitas baru) **tetap dibuat** → entitas yatim (tanpa Book). | `book-import.ipc.ts:24` (apply sebelum importBooks), `auto-create.service.ts:29-40`, `book-import.service.ts:63-66` (cek ISBN setelah auto-create) | Entitas tanpa relasi mencemari master Author/Publisher/Category | Deteksi duplikat ISBN / guard baris sebelum auto-create, atau bungkus satu transaksi per baris |
| B3 | **LOW** | Tidak ada pesan per-baris pada hasil commit (lihat B1); `messageKey` (`bookImport.*`, `autoCreate.*`) bukan kontrak untuk renderer, dan UI tidak mem-parse-nya. | — | Info kegagalan hilang | Sediakan pesan terindonesia dari backend |
| B4 | **INFO** | Header sinonim terbatas (`publisher→penerbit`). Template resmi memakai kolom Indonesia sehingga konsisten; bukan bug. Bahasa alternatif (mis. "Pengarang", "Tahun Terbit", "No ISBN") tidak dinormalisasi. | `src/services/HeaderNormalizerService.ts` | File dengan sinonim lain menghasilkan warning header | Perluas `HEADER_SYNONYMS` bila PO mau toleransi header eksternal |

**Perilaku sengaja TIDAK diubah** (dicatat, bukan bug): B1 & B2 merupakan konsekuensi langsung keputusan WO-2 (PO menolak derivasi summary di renderer; backend belum punya summary) dan arsitektur pipeline saat ini. B2 juga berimplikasi bahwa dalam alur UI normal (validasi sudah menyaring baris judul/penerbit kosong), S6/S7 jarang mencapai pipeline; S5/S5b tetap bisa.

---

## 4. REGRESSION CHECK

| Item | Hasil |
|------|-------|
| `npm run lint` (tsc node + web) | **PASS** |
| `npm run build` (electron-vite) | **PASS** — main 1,746.12 kB · preload 6.59 kB · renderer 887.52 kB (identik WO-2) |
| `prisma migrate deploy` fresh DB | **PASS** — 3 migrasi urut (baseline adr002 → wo13 → wo13_r1) |
| `prisma migrate status` / `diff` | Hijau / "No difference detected" |
| Perubahan kode selama WO-3 | **TIDAK ADA** (READ ONLY) — tidak ada diff baru pada kode produksi |
| DB uji | Dibersihkan (`wo3-uat` temp, di luar repo) |
| Artifacts UAT | `uat_wo3/` (validation.smoke, import.smoke, e2e.smoke, reader.check + out/) — script disimpan utk replikasi; bukan kode produksi |

---

## 5. RECOMMENDATION

1. **Priority 1 (sebelum rilis):** Tuntaskan B1 — backend mengembalikan summary per-baris (berhasil/gagal + alasan terindonesia) pada kanal `imports:match`; preview menampilkan rincian setelah commit. Ini menutup gap pengalaman user terbesar (hasil import tidak bisa diverifikasi di UI).
2. **Priority 2:** Atasi B2 — urutkan guard ISBN duplikat sebelum auto-create (atau per-baris transaksi) agar tidak ada entitas yatim.
3. **Priority 3:** Pertimbangkan B4 (perluas header synonyms) bila file eksternal non-template menjadi target umum.
4. **Tidak ada blocker fungsional** pada jalur sukses: import normal, entity baru, multi-baris, dan reuse entitas berjalan benar di seluruh rantai (95/95 PASS).
5. **Hasil rekomendasi PO:** fitur Import Buku **LULUS UAT** untuk jalur utama; penanganan kegagalan per-baris (B1/B2) diajukan sebagai follow-up work order sebelum rilis produksi.

---

*Lampiran: skenario dapat direplikasi — kompilasi: `npx tsc --module commonjs --target es2022 --moduleResolution node --esModuleInterop --skipLibCheck --outDir uat_wo3/out uat_wo3/validation.smoke.ts uat_wo3/import.smoke.ts uat_wo3/e2e.smoke.ts`; jalankan: `node uat_wo3/out/uat_wo3/validation.smoke.js`, `node uat_wo3/out/uat_wo3/import.smoke.js`, `node uat_wo3/out/uat_wo3/e2e.smoke.js` (butuh `$env:DATABASE_URL` fresh + `$env:UAT_XLSX_PATH` untuk e2e), `node uat_wo3/reader.check.cjs <xlsx>`.*
