# SPRINT9_WO1_IMPORT_UI_REPORT.md

Feature: **Book Import — Import UI (WO-1)**
Mode: VERIFICATION (PO: "Anggap WO-1 sudah terpenuhi" — tanpa perubahan kode)
Date: 2026-07-31

---

## 1. Implementation Report

Seluruh deliverable WO-1 sudah terpenuhi oleh pipeline import yang eksis di working tree (changeset WO-BR-99, belum di-commit). Tidak ada perubahan kode yang dilakukan pada WO-1; hasil adalah verifikasi terhadap kode existing.

| # | Deliverable WO-1 | Lokasi | Status |
|---|------------------|--------|--------|
| 1 | Tombol "Import Excel" di halaman Buku | `src/pages/BooksPage.tsx:71-77` — tombol `Upload` + `LABELS.BOOK.IMPORT` → `navigate(ROUTES.BOOK_IMPORT)` | ✅ ADA |
| 2 | Dialog pilih file `.xlsx` | `src/components/books/FileUploadDropzone.tsx` — hidden `<input type="file" accept=".xlsx">` (baris 61 & 99); klik/drag-drop membuka dialog; drag-drop + pilih via klik keduanya didukung | ✅ ADA |
| 3 | Validasi ekstensi `.xlsx` | `src/utils/bookImport.ts:15-22` — `validateImportFile`: `IMP-001` file kosong, `IMP-002` ekstensi bukan `.xlsx`, `IMP-003` ukuran > 5 MB; pesan via `getImportErrorMessage` | ✅ ADA |
| 4 | Tampilkan nama file | `src/components/books/FileUploadDropzone.tsx:36` — `file.name` + ukuran terformat (`formatFileSize`) + daftar ekstensi; tombol Ganti/Hapus | ✅ ADA |
| 5 | Tombol "Lanjut" | `src/pages/BookImportPage.tsx:76-83` — disabled selama `!isValid` (`file === null || errorCode !== null || parsing`); enabled → `navigate(ROUTES.BOOK_IMPORT_PREVIEW)` | ✅ ADA |

### Konfigurasi & integrasi
| Item | Lokasi | Status |
|------|--------|--------|
| Route `/books/import` + `/books/import/preview` | `src/routes/index.tsx:36-47` — di-bungkus `BookImportProvider`; index = `BookImportPage`, child `preview` = `BookImportPreviewPage` | ✅ ADA |
| Constanta route | `src/utils/navigation.ts:5-6` — `BOOK_IMPORT`, `BOOK_IMPORT_PREVIEW` | ✅ ADA |
| Config terpusat | `src/config/import.config.ts` — `allowedExtensions: ['.xlsx']`, `maxFileSize: 5 * 1024 * 1024`, `minColumns: 1` | ✅ ADA |
| Label UI | `src/utils/labels.ts:238-295` — blok `IMPORT` lengkap (TITLE, DROPZONE_*, FORMAT, MAX_SIZE_PREFIX, NO_FILE, CONTINUE="Lanjut", BACK, REPLACE, REMOVE, ERROR_*) | ✅ ADA |

### File module (semua dari changeset WO-BR-99, belum di-commit)
`src/pages/BookImportPage.tsx`, `src/pages/BookImportPreviewPage.tsx`, `src/components/books/FileUploadDropzone.tsx`, `src/contexts/BookImportContext.tsx`, `src/hooks/useBookImportWorkflow.ts`, `src/config/import.config.ts`, `src/utils/bookImport.ts`, `src/types/import.ts`, `src/shared/match-provider.ts`, `src/shared/match-strategy.ts`, `src/services/`, `src/main/strategies/`, `src/main/providers/` (54 file untracked + modifikasi pada `BooksPage.tsx`, `routes/index.tsx`, `labels.ts`, `navigation.ts`).

### Validasi
| Tes | Hasil |
|-----|-------|
| `npm run lint` (node + web tsconfig) | PASS — exit 0 |
| `npm run build` (electron-vite build) | PASS — ✓ built, exit 0 |

---

## 2. Architecture Checklist

| Kriteria | Status | Bukti |
|----------|--------|-------|
| Entry point tombol import di halaman Buku | ✅ | `BooksPage.tsx:71-77` |
| Routing memisahkan flow import dari CRUD biasa | ✅ | subtree `/books/import` sendiri dengan `BookImportProvider` |
| Dialog file membatasi ekstensi `.xlsx` | ✅ | `accept` atribut + `validateImportFile` (IMP-002) |
| Validasi ekstensi berbasis config (bukan hardcode) | ✅ | `import.config.ts allowedExtensions` |
| Nama file & ukuran ditampilkan setelah pilih | ✅ | `FileUploadDropzone.tsx:36-39` |
| Aksi lanjut di-gate oleh validitas file | ✅ | `BookImportPage.tsx:17,77-78` |
| State import di-isolasi (context), tidak membocorkan ke komponen lain | ✅ | `BookImportContext` hanya di subtree route import |
| Label terpusat (i18n-ready) | ✅ | blok `IMPORT` di `labels.ts` |
| Error messaging terpusat & terkode | ✅ | `IMP-001..003` via `getImportErrorMessage` |
| lint + build hijau | ✅ | lihat bagian 1 |
| **Deviation — perilaku melampaui scope WO-1** | ⚠️ | `useBookImportWorkflow.selectFile` langsung memanggil `readWorkbook` + `validationEngine.validate` (parsing & validasi header = scope WO berikutnya). Tidak dipangkas atas keputusan PO — lihat Decision Log DEC-001 & Technical Debt TD-001 |

---

## 3. Decision Log

| ID | Keputusan | Alasan | Konsekuensi |
|----|-----------|--------|-------------|
| DEC-001 | **WO-1 dianggap terpenuhi** oleh pipeline import existing (WO-BR-99); tidak ada perubahan kode | PO memilih opsi ini setelah temuan bahwa seluruh deliverable WO-1 sudah eksis di working tree | Tidak ada diff WO-1; deliverable diverifikasi apa adanya |
| DEC-002 | **Perilaku parsing existing tidak dipangkas** meski melampaui scope WO-1 (membaca/mem-parse workbook saat pilih file) | Menjaga perubahan seminimal mungkin & tidak merusak pipeline yang sudah dibangun; menghindari konflik dengan WO-BR-99 | Tercatat sebagai finding (TD-001); WO berikutnya yang berurusan dengan parsing/validasi harus meninjau ulang `useBookImportWorkflow` |
| DEC-003 | Laporan WO-1 disusun sebagai satu file `SPRINT9_WO1_IMPORT_UI_REPORT.md` berisi 4 bagian (Implementation Report, Architecture Checklist, Decision Log, Technical Debt) | Mengikuti konvensi laporan per-WO repo (mis. `WO13_IMPLEMENTATION_REPORT.md`) | Satu sumber rujukan untuk review WO-1 |
| DEC-004 | Verifikasi integrasi dilakukan pada seluruh lapisan (route → provider → config → label → util), bukan hanya UI | Memastikan deliverable "berfungsi", bukan sekadar "file ada" | Checklist arsitektur mencakup bukti wire-up lengkap |

---

## 4. Technical Debt

| ID | Utang | Detail | Dampak | Rencana |
|----|-------|--------|--------|---------|
| TD-001 | **Parsing aktif sejak pemilihan file** | `useBookImportWorkflow.selectFile` memanggil `workbookReaderService.readWorkbook` + `validationEngineService.validate` saat file dipilih — membaca isi Excel & validasi header langsung dijalankan, padahal scope WO-1 hanya dialog + validasi ekstensi + nama file | Jika PO memetakan WO-1 s/d WO-x secara ketat, perilaku ini menyetop progres di depan (header validation sudah jalan sebelum WO-3). Tidak tampak secara visual (hanya teks "Memproses file Excel..." sekejap) | WO yang berurusan dengan parsing/validasi: audit & pisahkan trigger (validasi header sebaiknya dijalankan saat tombol "Lanjut"/halaman preview, bukan saat pilih file) |
| TD-002 | **Download Template masih placeholder** | `BookImportPage.tsx:24-26` + `labels.ts:251` — "Template akan tersedia di Sprint 3." | Pengguna belum bisa mendapat template .xlsx | Sprint 3 (sesuai rencana) |
| TD-003 | **Single-file only** | `FileUploadDropzone.handleFiles` mengambil `files[0]` | Tidak mendukung multi-file | Di luar scope saat ini |
| TD-004 | **Seluruh modul import belum di-commit** | 54 file untracked (`src/services/`, `src/main/strategies/`, `src/main/providers/`, dll.) + modifikasi `BooksPage/routes/labels/navigation` masih di working tree, tidak ada yang staged | Risiko kehilangan bila disk/worktree gagal; review WO-BR-99 tergantung pada keadaan ini | Menunggu keputusan commit dari PO |
| TD-005 | **`minColumns: 1` di config** | `import.config.ts:4` | Belum divalidasi kegunaannya di alur WO-1; relevan untuk validasi struktur (WO-3+) | Tinjau saat implementasi validasi header |

---

**Status: READY untuk review.** Tidak ada perubahan kode pada WO-1 (mode verifikasi). Menunggu arahan PO untuk WO-2.
