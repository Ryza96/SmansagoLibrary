# GIT_RELEASE_AUDIT.md — Analisis Working Tree vs Baseline `437b50a`

**Mode:** READ ONLY — tidak ada perubahan kode, tidak ada `git add`/`restore`/`commit`.
**Baseline:** commit `437b50a` "release: v1.0 release candidate" (31/07 16:01).
**Rentang kerja belum di-commit:** seluruh Sprint 5–11 (import feature, WO13 procurement, WO-8 barcode/label) + seluruh dokumentasi.
**Skala:** 33 file tracked ter-modifikasi, 141 entri untracked, total ±925 insertions / 686 deletions.

---

## 1. Sprint 11 Files

File yang dibuat/diubah oleh Work Order WO-11A … WO-11J (import feature production-hardening).

### 1a. File Baru (untracked — WAJIB di-commit)

| File | WO | Peran |
|------|-----|-------|
| `src/main/services/inventory-allocator.ts` | WO-11E/H | Alokasi `inventoryNumber` per eksemplar |
| `src/main/services/database-reconciliation.service.ts` | WO-11I | Rekonsiliasi DB saat startup (dipanggil `electron/main/index.ts:38`) |
| `templates/Template_Import_Buku_v2.0.xlsx` | WO-11B | Template produksi (dipakai `book-import.ipc.ts:9`, dikemas `electron-builder.yml`) |
| `templates/Template_Import_Buku_v2.0_screenshot.png` | WO-11B | Artifact review PO |

### 1b. File yang Dibuat Sprint 9–10 dan DI-MODIFIKASI Sprint 11 (shared)

| File | Peran Sprint 11 |
|------|-----------------|
| `src/main/services/book-import.service.ts` | Persist field, commit flow, result |
| `src/main/services/auto-create.service.ts` | Auto-create entitas sebelum commit |
| `src/services/ValidationEngineService.ts` | Guard pipeline (titleMissing/entityMissing) |
| `src/services/HeaderNormalizerService.ts` | Normalisasi header Excel |
| `src/config/bookImport.template.ts` | Definisi template v2 |
| `src/types/import.ts` | Kontrak `MatchedWorkbook`, `BookImportResult` |
| `src/utils/bookImport.ts` | `computeImportResultSummary` (WO-11J) |
| `src/utils/labels.ts` | `IMPORT.RESULT_*` labels (WO-11J) |
| `src/pages/BookImportPage.tsx` | Halaman import (WO-11F) |
| `src/pages/BookImportPreviewPage.tsx` | Summary + error list (WO-11J) |
| `src/components/books/FileUploadDropzone.tsx` | Dropzone (WO-11G) |
| `electron/ipc/book-import.ipc.ts` | Handler `imports:match`/`imports:downloadTemplate` |
| `electron/preload/book-import.preload.ts` | Expose `imports.*` ke renderer |
| `src/renderer/env.d.ts` | Type `imports.*` |
| `electron-builder.yml` | extraResources `templates/` |

### 1c. File Tracked yang Diubah di Sprint 11

| File | Peran |
|------|-------|
| `electron/main/index.ts` (+2) | `databaseReconciliationService.run()` (WO-11I) |
| `src/main/repositories/book.repository.ts` (+11) | `createWithTx` (WO-11E) |
| `src/main/repositories/book-copy.repository.ts` (+8) | `createManyWithTx` (WO-11E) |
| `src/main/repositories/author/category/publisher.repository.ts` (+31 each) | Auto-create (Sprint 9) |
| `src/pages/BooksPage.tsx` (+11) | Tombol "Import Buku" |
| `src/routes/index.tsx` (+18) | Route `/books/import` |
| `src/utils/navigation.ts` (+2) | `ROUTES.BOOK_IMPORT*` |
| `tsconfig.node.json` (+6) / `tsconfig.web.json` (+6) | Mendukung path strategi |

---

## 2. Legacy Files (Sprint sebelumnya — Belum Pernah Di-commit)

### 2a. Import Pipeline Foundation (Sprint 9–10, sekarang hanya dipakai Spr.11)

| File | Peran |
|------|-------|
| `src/services/MatchingEngineService.ts`, `WorkbookReaderService.ts`, `MatchProviders.ts`, `DummyMatchProviders.ts`, `DummyMatchStrategies.ts` | Engine matching + reader |
| `src/services/strategies/*` (10 file: Alias/Contains/Exact/Fuzzy/PrefixAuthor, ExactBook, ContainsCategory/Publisher, dedupe, similarity) | Strategi matching |
| `src/main/providers/*` (index + prisma-author/book/category/publisher-match.provider.ts) | Provider berbasis Prisma |
| `src/main/strategies/index.ts` | Factory `createProductionStrategies` |
| `src/config/import.config.ts` | Konfigurasi pipeline |
| `src/contexts/BookImportContext.tsx`, `src/hooks/useBookImportWorkflow.ts` | State workflow renderer |
| `src/shared/match-provider.ts`, `src/shared/match-strategy.ts` | Kontrak shared |
| `scripts/smoke-match-strategies.ts` | Smoke legacy (Sprint 9) |

### 2b. WO13 — Procurement Fields

| File | Peran |
|------|-------|
| `prisma/schema.prisma` (-90/+ variasi) | `BookCopy.acquisitionSource/Cost/SourceDetail/Notes` |
| `prisma/migrations/20260731_wo13_procurement_fields/migration.sql` | Migration WO13 |
| `prisma/migrations/20260731_wo13_revision1_source_detail/migration.sql` | Migration R1 (rename + enum source) |
| `electron/main/services/book-copy.service.ts` (+57) | Validasi harga + enum source + `barcode=invNum` |
| `src/shared/dto/book.ts` (+5) | `CreateBookCopiesDTO` + field procurement |
| `src/components/books/BookDetail.tsx` (+122) | Dialog tambah eksemplar + procurement + tombol cetak label |
| `src/components/books/BookForm.tsx` (-53) | Section procurement dihapus (dead code) |
| `src/pages/InventoryDetailPage.tsx` (+25) | Tampil Sumber/Harga/Detail pengadaan |

### 2c. WO-8 — Barcode & Label (Sprint 9)

| File | Peran |
|------|-------|
| `src/main/services/barcode.service.ts` | `generateBarcodeSvg` Code128 (`bwip-js/node`) |
| `src/main/services/label.service.ts` | `generateLabelsHtml` A4 2-kolom |
| `electron/main/services/print.service.ts` (+12) | `printBookLabels` + `printHtml` |
| `electron/ipc/print.ipc.ts` (+4) | `printing:bookLabels` |
| `electron/preload/print.preload.ts` (+4) | `print.bookLabels` |
| `src/shared/dto/print.ts` (+11) | `BookLabelData` |

### 2d. Wiring & Dependency

| File | Peran |
|------|-------|
| `electron/ipc/index.ts` (+8) | `registerBookImportHandlers` |
| `electron/preload/index.ts` (+4) | Aggregator import preload |
| `electron/main/bootstrap.ts` (+20) | Instantiasi container |
| `package.json` / `package-lock.json` | `bwip-js ^4.11.2`, `read-excel-file ^9.3.5` |

---

## 3. Documentation Files (untracked — direkomendasikan di-commit)

### 3a. Laporan Sprint (core history — PALING bernilai)
- `SPRINT4_REPORT.md`, `SPRINT5_REPORT.md`, `SPRINT6_REPORT.md`, `SPRINT7_REPORT.md`
- `SPRINT8_REPORT.md` + `SPRINT8_IMPLEMENTATION_PLAN.md`, `SPRINT8_EXECUTION_PROTOCOL.md`, `SPRINT8_REVISION1_RFC.md`, `SPRINT8_REVISION2_REPORT.md`, `SPRINT8_REVISION2_RFC.md`, `SPRINT8_REVISION3_RFC.md`
- `SPRINT9_WO1_IMPORT_UI_REPORT.md`, `SPRINT9_WO2_1_REPORT.md`, `SPRINT9_WO2_PARSING_AUDIT.md`, `SPRINT9_WO3_REPORT.md`, `SPRINT9_WO4_MATCHING_AUDIT.md`, `SPRINT9_WO4_1_*.md` (4), `SPRINT9_WO5_*.md` (4), `SPRINT9_WO6_*.md` (4), `SPRINT9_WO6_1_*.md` (4), `SPRINT9_WO7_*.md` (4), `SPRINT9_WO8_*.md` (4)
- `SPRINT10_WO1_UI_AUDIT.md`, `SPRINT10_WO2_*.md` (4), `SPRINT10_WO3_UAT_REPORT.md`
- `SPRINT2_1_REPORT.md`, `SPRINT3_TEMPLATE_SPEC.md`, `SPRINT3_WO1_TEMPLATE_IMPLEMENTATION_REPORT.md`

### 3b. Sprint 11 Investigations & Reports
- `SPRINT11_BOOK_CREATION_ROOTCAUSE.md`, `SPRINT11_DATABASE_VERIFICATION.md`, `SPRINT11_DOWNLOAD_TEMPLATE_INVESTIGATION.md`, `SPRINT11_FILE_SELECTION_RUNTIME_INVESTIGATION.md`, `SPRINT11_IMPORT_RUNTIME_INVESTIGATION.md`, `SPRINT11_IMPORT_TEMPLATE_V2_IMPACT_ANALYSIS.md`
- `SPRINT11_WO11A/B/C/D/E/E_DESIGN_REVIEW/F/G/H/I/J_IMPLEMENTATION_REPORT.md`

### 3c. Audit & WO13
- `ENVIRONMENT_AUDIT.md`, `PRODUCTION_READINESS_AUDIT_SPRINT8.md`, `REACT_RENDER_TREE_AUDIT.md`, `RELEASE_ARTIFACT_AUDIT.md`
- `WO13_DISCOVERY_REPORT.md`, `WO13_IMPLEMENTATION_REPORT.md`, `WO13_REVISION1_REPORT.md`, `WO13_1_ENUM_DISCOVERY_REPORT.md`

---

## 4. Temporary Files — TIDAK layak di-commit

| Lokasi | Isi | Alasan |
|--------|-----|--------|
| `uat_wo3/` | e2e.smoke.ts, import.smoke.ts, reader.check.cjs, validation.smoke.ts | UAT ad-hoc, butuh fresh DB, sekali pakai |
| `uat_wo11h/` | instr.probe.ts, pipeline.probe.ts, step.probe.ts | Probe instrumentasi |
| `uat_wo11i/` | duplicate.validate.ts, reconcile.validate.ts | Validasi rekonsiliasi ad-hoc |
| `uat_wo11j/` | summary.validate.ts | Validasi summary ad-hoc |
| `wo11a/` … `wo11g/` | smoke.ts / runtime.cjs | Smoke per-WO |
| `templates/Template_Import_Buku_v1.0.xlsx` + screenshot | Template v1 | Hanya direferensikan `wo11c/smoke.ts` (temp), BUKAN produksi |

**Catatan:** `templates/Template_Import_Buku_v2.0_screenshot.png` bisa dipindah ke `docs/` jika ingin dipertahankan sebagai artifact review; jika tidak, masuk daftar eksklusi.

---

## 5. Recommended `.gitignore` Additions

```gitignore
# UAT / probe / smoke (ad-hoc, sekali pakai)
uat_wo*/
wo11*/

# Template v1 (legacy, tidak dipakai produksi)
templates/Template_Import_Buku_v1.0.xlsx
templates/Template_Import_Buku_v1.0_screenshot.png

# Screenshot review (opsional; pindah ke docs/ jika mau dipertahankan)
templates/Template_Import_Buku_v2.0_screenshot.png

# Prisma SQLite WAL/SHM (selain *.db dan *.db-journal)
prisma/*.db-wal
prisma/*.db-shm

# Runtime log dari probe (jika ada)
*.runtime.log
```

---

## 6. Recommended Commit Plan

Urutan diusulkan dari yang paling aman ke yang paling berisiko (1 WO = 1 commit setelah PO approve).

| # | Isi | Jenis | Risiko |
|---|-----|-------|--------|
| 1 | Prisma: `schema.prisma` + migration `20260731_wo13_procurement_fields` + `20260731_wo13_revision1_source_detail` | schema | RENDAH (self-contained) |
| 2 | WO13 procurement: `book-copy.service.ts`, `dto/book.ts`, `BookDetail.tsx`, `BookForm.tsx`, `InventoryDetailPage.tsx` | fitur | RENDAH |
| 3 | WO-8 barcode/label: `barcode.service.ts`, `label.service.ts`, `print.service.ts`, `print.ipc.ts`, `print.preload.ts`, `dto/print.ts`, `package.json`, `package-lock.json` | fitur | RENDAH |
| 4 | Import pipeline foundation (Sprint 9–10): `src/services/*`, `src/services/strategies/*`, `src/main/providers/*`, `src/main/strategies/*`, `src/config/import.config.ts`, `src/contexts/*`, `src/hooks/*`, `src/shared/match-*`, repositori author/category/publisher, `scripts/smoke-match-strategies.ts` (atau hapus) | fitur | SEDANG (entitas besar) |
| 5 | Sprint 11 WO-11A–J: `book-import.service.ts`, `auto-create.service.ts`, `inventory-allocator.ts`, `database-reconciliation.service.ts`, `ValidationEngineService.ts`, `HeaderNormalizerService.ts`, `bookImport.template.ts`, `types/import.ts`, `bookImport.ts`, `labels.ts`, `BookImportPage.tsx`, `BookImportPreviewPage.tsx`, `FileUploadDropzone.tsx`, `book-import.ipc.ts`, `book-import.preload.ts`, `env.d.ts`, `electron-builder.yml`, `electron/main/index.ts`, `BooksPage.tsx`, `routes/index.tsx`, `navigation.ts`, `tsconfig.*` | fitur | SEDANG |
| 6 | Dokumen Sprint 4–11 + audit + WO13 (Section 3) | docs | SEDANG (menyimpan history kerja 4–11) |
| 7 | `AGENTS.md` (+122) | docs | RENDAH |
| 8 | `.gitignore` (Section 5) + hapus folder temp bila perlu | housekeeping | RENDAH |
| 9 | **HATI-HATI** `SPRINT1_REPORT.md`, `SPRINT2_REPORT.md`, `SPRINT3_REPORT.md` — **tidak boleh dicommit dalam kondisi sekarang** (lihat Risiko R2) | — | TINGGI |

**Catatan penting:** file shared (`src/utils/labels.ts`, `src/renderer/env.d.ts`, `src/main/repositories/*.repository.ts`, `BookDetail.tsx`) membawa perubahan dari beberapa WO sekaligus. Karena semuanya belum pernah di-commit, **pemisahan per-WO murni tidak dimungkinkan tanpa `git add -p`** (hand-split hunk). Dua opsi:
- **Opsi A (direkomendasikan):** commit berlapis per-fitur seperti tabel di atas; file shared ikut di commit nomor 4/5 dan modifikasinya dibiarkan agregat.
- **Opsi B:** squash seluruhnya menjadi 1 commit besar "feat: buku import, procurement, barcode/label (Sprint 5–11)" — lebih sederhana, riwayat lebih kasar.

---

## 7. Potential Risks

| # | Risiko | Detail | Mitigasi |
|---|--------|--------|----------|
| R1 | **Migration WO13 tidak tracked** | Baseline `20260731_adr002_initial` + `migration_lock.toml` tracked; `20260731_wo13_procurement_fields` + `20260731_wo13_revision1_source_detail` untracked. Jika dicommit tanpa keduanya → clone fresh gagal `migrate deploy` (P3018) atau schema mismatch | Commit Prisma (tabel #1) PALING PERTAMA |
| R2 | **`SPRINT1/2/3_REPORT.md` ditimpa** | File tracked ini di-REWRITE: isi asli (Book Domain Foundation, sprint 1–3) diganti konten baru bertajuk "Book Import UI Foundation / Excel Reader Foundation / Validation Engine" dengan penghapusan 558 baris. Ini bukan dokumen asli | Konfirmasi PO: (a) pulihkan isi asli, atau (b) ganti nama file baru (`SPRINT11_REPORT_1/2/3.md`) dan restore yang lama, atau (c) akui sebagai dokumen baru. JANGAN commit blind |
| R3 | **141 entri untracked = ambiguitas** | Bercampur kode produksi, docs, temp. Risiko commit keliru (mis. `uat_*/`, `wo11*/`, template v1) masuk history | Ikuti klasifikasi Section 1–5; tambah `.gitignore` sebelum `git add .` |
| R4 | **`scripts/smoke-match-strategies.ts`** | Smoke legacy, belum teruji dipakai setelah refactor strategi | Hapus atau commit sebagai script development; jangan biarkan di-commit tanpa keputusan |
| R5 | **`.gitignore` gap** | `prisma/*.db-wal`/`*.db-shm` dan `uat_wo*/`/`wo11*/` belum di-ignore → bisa ter-stage tidak sengaja | Terapkan Section 5 sebelum commit pertama |
| R6 | **Template v2 = aset produksi** | `electron-builder.yml` mengemas `templates/` dan `book-import.ipc.ts:9` memakai `Template_Import_Buku_v2.0.xlsx`. Jika tidak dicommit, build/release baru kehilangan template | Commit v2.0.xlsx di commit #4/5 |
| R7 | **Riwayat kerja Sprint 5–10 hanya ada di working tree** | Commit `437b50a` tidak memuat import; seluruh Sprint 5–10 belum pernah masuk history git. Jika working tree rusak/terhapus → hilang permanen | Commit dokumen (tabel #6) lebih awal; jangan menunda |
| R8 | **`bwip-js`/`read-excel-file` dependency** | Hanya di working tree (`package.json`+lock). Build release baru tanpa keduanya → runtime error | Commit #3 membawa dependency |
| R9 | **Fresh-clone recovery test belum diverifikasi pasca commit** | Setelah commit, belum ada bukti `migrate deploy` dari clone bersih + build + smoke | Setelah commit #1–#5, jalankan fresh DB `migrate deploy` + `npm run lint` + `npm run build` + smoke jalur import |

---

## Kesimpulan
Working tree = 1 fitur besar (Import Buku) + 2 fitur pendukung (Procurement, Barcode/Label) + dokumentasi penuh Sprint 4–11, semuanya di atas baseline release yang tidak memuat fitur-fitur tersebut. **Blocker sebelum release:** R1 (migration untracked), R2 (SPRINT1/2/3_REPORT ditimpa), dan keputusan Opsi A/B commit. Seluruh isi laporan ini **READ ONLY** — belum ada staging/commit/perubahan kode.
