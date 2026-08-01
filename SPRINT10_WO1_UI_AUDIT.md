# SPRINT10 — WO-1 UI Audit: Import Buku

**MODE: READ ONLY.** Audit kondisi aktual UI Import Buku yang sudah ada, sebelum mendesain UI baru.
Tidak ada perubahan kode.

---

## 1. Current UI

### 1.1 Halaman Buku — `src/pages/BooksPage.tsx` (98 baris)
| Bagian | Detail | Lokasi |
|--------|--------|--------|
| Header | `<h1>` `LABELS.BOOK.TITLE` = `"Buku"`, tanpa subjudul/aksi | :47-49 |
| Container | `bg-white rounded-lg shadow-sm border border-slate-200` | :51 |
| Toolbar | `p-4 border-b` — berisi 4 elemen berurutan: | :52-86 |
| &nbsp;&nbsp;1. Search input | lokal `useState('')`, placeholder `"Cari judul atau ISBN..."`, icon `Search` | :54-63 |
| &nbsp;&nbsp;2. Refresh | icon-only `RefreshCw`, `title="Refresh"`, `fetchBooks()` | :64-70 |
| &nbsp;&nbsp;3. **Import Buku** | icon `Upload` + `LABELS.BOOK.IMPORT` = `"Import Buku"` → `navigate(ROUTES.BOOK_IMPORT)` → `/books/import` | :71-77 |
| &nbsp;&nbsp;4. Tambah Buku | icon `Plus` + `LABELS.BOOK.NEW` = `"Tambah Buku"` → `navigate(ROUTES.BOOK_NEW)` (tombol primer biru) | :78-84 |
| Table | `BookTable` (komponen terpisah) | :88-94 |

**Catatan toolbar:** tombol **"Import Buku" SUDAH ADA** (dari Sprint 9 WO-1 / changeset WO-BR-99, belum di-commit).

### 1.2 `BookTable` — `src/components/books/BookTable.tsx` (73 baris)
- Props: `{ books: BookListItemDTO[]; onDelete }`.
- Kolom: TITLE, ISBN, CATEGORY, PUBLISHER, YEAR, COPY_COUNT, ACTIONS.
- Aksi baris: `Eye` (detail `/books/:id`), `Pencil` (edit), `Trash2` (hapus, `window.confirm`).
- **Tanpa pagination** — BooksPage memuat seluruh daftar (`api.books.findMany()`), filter dilakukan **client-side** (title/isbn `includes`).

### 1.3 Halaman Import — `src/pages/BookImportPage.tsx` (95 baris) — STEP 1 (Upload)
| Elemen | Detail |
|--------|--------|
| Header | back arrow + `LABELS.IMPORT.TITLE` = `"Import Buku"` |
| Subtitle | `"Impor data buku dari file Excel (.xlsx)."` |
| Dropzone | `<FileUploadDropzone file={file} onFileChange={selectFile} />` |
| Status | 4 kondisi: no-file hint / error (via `getImportErrorMessage`) / `parsing` spinner teks / `READY` (hijau) |
| Tombol | **"Download Template"** (`FileDown`) → hanya `setShowTemplateNote(true)` → teks placeholder `"Template akan tersedia di Sprint 3."`; **"Kembali"** → `/books`; **"Lanjut"** (`FileUp`, disabled unless `isValid`) → `parseAndValidate()` → navigate `/books/import/preview` |

### 1.4 Halaman Preview — `src/pages/BookImportPreviewPage.tsx` (326 baris) — STEP 2 (Validasi)
| Elemen | Detail |
|--------|--------|
| Guard | bila tak ada file/parsing/error → redirect ke `/books/import` (deep-link guard) |
| State | 4 kondisi: no-file / parsing / error / `validatedWorkbook` (preview penuh) |
| Preview | nama file, 3 stat (nama sheet, jumlah baris, jumlah kolom), header ternormalisasi, `ValidationSummary` (valid/invalid + warnings), `RowResultsSummary`, tabel data mentah (max 50 baris, header huruf kolom A,B,C) |
| Batas | `PREVIEW_ROW_LIMIT = 50`, `ROW_RESULT_LIMIT = 20` |
| **Tombol commit** | **TIDAK ADA** — tidak ada tombol "Import"/"Simpan"/"Commit" di halaman ini |

### 1.5 Entry point lain
| Lokasi | Status |
|--------|--------|
| `src/pages/DashboardPage.tsx:221-230` | Kotak **"Import Data" / "Coming Soon"** — placeholder statis, **tidak bisa diklik**, tidak menaut ke `/books/import` |
| `src/components/layout/Sidebar.tsx` | **TIDAK ada** entri import di sidebar |
| `src/components/layout/TopBar.tsx` | Tidak ada UI terkait import |

---

## 2. Current User Flow

```
Halaman Buku (/books)
   ↓  klik "Import Buku" (BooksPage.tsx:71-77)
/books/import  (BookImportPage — STEP 1)
   ↓  pilih/drag file .xlsx (FileUploadDropzone)
   ↓  [validasi ekstensi & ukuran — client-side]
   ↓  klik "Lanjut" (parseAndValidate → readWorkbook + validationEngine.validate)
/books/import/preview  (BookImportPreviewPage — STEP 2)
   ↓  melihat hasil validasi + preview data mentah
   ✗  DEAD END — TIDAK ada tombol commit → data TIDAK pernah diimpor
```

**Temuan kritis:** Alur berhenti di preview. `api.imports.match` **tidak pernah dipanggil di mana pun** dalam `src/`
(grep `imports\.match|api\.imports|electronAPI\.imports` di `src/` = 0 match). Padahal backend lengkap & ter-registrasi:
`imports:match` (electron/ipc/book-import.ipc.ts:22) → `matchingEngine.match` → `autoCreateService.apply`
→ `bookImportService.importBooks` (membuat Book + BookCopy). Pipeline **ADA tapi tak terjangkau UI**.

### Ketersediaan per item yang ditanyakan
| Item | Ada? | File & Alur |
|------|------|-------------|
| Tombol Import | ✅ | `src/pages/BooksPage.tsx:71-77` → navigate `/books/import` |
| Dialog Import | ✅ (file picker OS) | `src/components/books/FileUploadDropzone.tsx` hidden `<input type="file" accept=".xlsx">` |
| Route Import | ✅ | `src/routes/index.tsx:36-45` — `/books/import` (index) + `/books/import/preview`; dibungkus `BookImportProvider` |
| Modal Import | ⚠️ | Bukan modal — flow berjalan di 2 halaman/route penuh. Tidak ada modal import |
| Placeholder Import | ⚠️ | Dashboard `"Import Data / Coming Soon"` (DashboardPage.tsx:221-230) — statis, tidak menaut |

---

## 3. Existing Components (modul import — sudah dibangun)

| Komponen | File | Keterangan |
|----------|------|------------|
| BookImportPage (step 1) | `src/pages/BookImportPage.tsx` | Upload + "Lanjut" |
| BookImportPreviewPage (step 2) | `src/pages/BookImportPreviewPage.tsx` | Validasi + preview; **tanpa commit** |
| FileUploadDropzone | `src/components/books/FileUploadDropzone.tsx` | Drag&drop / klik, single-file, validasi ekstensi+ukuran, tampil nama+ukuran, Ganti/Hapus |
| BookImportContext | `src/contexts/BookImportContext.tsx` | State `{file, errorCode, validatedWorkbook, parsing}` + `reset()` (eksposed, **tidak dipanggil** komponen) |
| useBookImportWorkflow | `src/hooks/useBookImportWorkflow.ts` | `selectFile` (validasi ekstensi/ukuran saja), `parseAndValidate` (read+validate, race-protected via `parseSeq`) |
| WorkbookReaderService | `src/services/WorkbookReaderService.ts` | `readWorkbook(file)` → `RawWorkbook` via `read-excel-file/browser` |
| ValidationEngineService | `src/services/ValidationEngineService.ts` | Validasi struktur (IMP-005..014) + bangun `canonicalRows` |
| HeaderNormalizerService | `src/services/HeaderNormalizerService.ts` | lowercase + synonym map |
| MatchingEngineService | `src/services/MatchingEngineService.ts` | `match(validatedWorkbook)` → `MatchedWorkbook`; default = dummy strategies |
| MatchProviders + Strategies | `src/services/` + `src/services/strategies/` | 11 kelas strategi; **produksi hanya 4** (`src/main/strategies/index.ts:21-26`) + provider Prisma |
| Main pipeline | `src/main/services/book-import.service.ts`, `auto-create.service.ts`, `electron/ipc/book-import.ipc.ts`, `electron/preload/book-import.preload.ts` | `imports:match` → match → auto-create → persist Book+BookCopy |
| Config & label | `src/config/import.config.ts`, `src/config/bookImport.template.ts` (template v3, 6 kolom), `src/utils/bookImport.ts`, `src/utils/labels.ts:239-296` | Terpusat, i18n-ready |
| Tipe | `src/types/import.ts` (129 baris) | `ImportErrorCode IMP-001..014`, `ValidatedWorkbook`, `MatchedWorkbook`, dll. |
| env.d.ts | `src/renderer/env.d.ts:197-199` | `imports.match(canonicalRows) → Promise<MatchedWorkbook>` |

**IPC import — satu-satunya channel:** `imports:match` (canonicalRows → MatchedWorkbook). Tidak ada channel
template-download, preview server-side, atau history/status.

---

## 4. Reusable Components

| Komponen | File | Keterangan | Reusable untuk UI import baru? |
|----------|------|------------|-------------------------------|
| FileUploadDropzone | `src/components/books/FileUploadDropzone.tsx` | Drag&drop, single-file, validasi | ✅ (inti step upload) |
| BookTable | `src/components/books/BookTable.tsx` | Tabel buku | ⚠️ hanya untuk daftar buku (hasil import) |
| MasterTable | `src/components/master/MasterTable.tsx` | Tabel master generic | ⚠️ potensial untuk tabel hasil |
| InlineAddModal | `src/components/ui/InlineAddModal.tsx` | Modal input 1-field (Simpan/Batal) | ⚠️ pola modal; bukan generic |
| SearchableSelect | `src/components/ui/SearchableSelect.tsx` | Select dengan pencarian + multi + onAdd | ⚠️ untuk form; bukan inti import |
| FormFooter / Section / Card | `src/components/members/*` | Pola footer form, section card | ⚠️ pola styling (member-scoped) |

**Yang TIDAK ADA (perlu dibuat untuk UI import baru):**
| Komponen | Status |
|----------|--------|
| **Stepper** (indikator langkah Upload → Validasi → Commit → Selesai) | ❌ tidak ada |
| **Toast / notification** | ❌ tidak ada (pesan via `window.confirm` / teks inline / `alert`) |
| **Progress bar** (upload/commit progress) | ❌ tidak ada (hanya teks "Memproses file Excel...") |
| **Generic Modal / Dialog** | ❌ hanya `InlineAddModal` spesifik 1-field |
| **Generic Spinner / Loading** | ❌ semua halaman pakai `useState(loading)` + teks `LABELS.PLACEHOLDER.LOADING` inline |
| **Generic Button** (primary/secondary variant) | ❌ button styling di-inline per halaman |

---

## 5. Files Impact (perkiraan terdampak bila menambah UI Import baru)

> Estimasi, **bukan** implementasi. Dipecah berdasarkan jenis perubahan; akan dikonfirmasi saat desain disetujui.

### A. Minimal (menyambung alur yang ada — commit di preview)
| File | Perubahan |
|------|-----------|
| `src/pages/BookImportPreviewPage.tsx` | Tambah tombol commit → `api.imports.match(canonicalRows)` + state hasil (sukses/error) |
| `src/utils/labels.ts` | Label tombol commit / hasil (block `IMPORT.*` baru) |
| `src/contexts/BookImportContext.tsx` | Tambah state hasil import / `reset()` setelah selesai |
| `src/types/import.ts` | Opsional: tipe hasil commit |
| `src/hooks/useBookImportWorkflow.ts` | Opsional: fungsi `commit()` |

### B. Template Download (mengganti placeholder)
| File | Perubahan |
|------|-----------|
| `electron/ipc/book-import.ipc.ts` | Channel baru `imports:template` (atau pakai dialog save) |
| `electron/preload/book-import.preload.ts` | `imports.template()` |
| `src/renderer/env.d.ts` | Tipe `imports.template` |
| `src/pages/BookImportPage.tsx` | Panggil API riil (hapus placeholder) |
| Generator template (.xlsx) | Service baru (main) — `read-excel-file` adalah reader; writer butuh dep baru (`exceljs`/`xlsx`) |

### C. Redesign Flow (stepper / rework halaman)
| File | Perubahan |
|------|-----------|
| `src/pages/BookImportPage.tsx` / `BookImportPreviewPage.tsx` | Rework ke stepper 3-4 langkah |
| `src/routes/index.tsx` | Mungkin pertahankan subtree `/books/import` + preview, atau route hasil |
| Komponen baru | `ImportStepper.tsx`, `ImportResultPage.tsx`, `Toast/Notification`, `ProgressBar` |

### D. Entry point lain
| File | Perubahan |
|------|-----------|
| `src/pages/DashboardPage.tsx:221-230` | Sambungkan placeholder "Import Data" → `/books/import` |
| `src/components/layout/Sidebar.tsx` | Opsional: entri import |
| `src/utils/navigation.ts` | Route const tambahan bila perlu |

### E. Perbaikan terkait (di luar UI, perlu keputusan PO)
| File | Perubahan |
|------|-----------|
| `src/pages/BooksPage.tsx` | Server-side pagination (saat ini client-side, tanpa pagination) |
| `src/services/` renderer vs main | Keputusan arsitektur: pindah parsing ke main process (file tak pernah lewat IPC sekarang; hanya `canonicalRows`) |

---

## 6. Risk Analysis

| # | Risiko | Dampak | Mitigasi |
|---|--------|--------|----------|
| 1 | **Alur import dead-end** — preview tanpa commit; `imports.match` tak dipanggil UI | Fitur import tidak berfungsi meski pipeline lengkap | Prioritas #1: tambah langkah commit (minimal) sebelum redesign |
| 2 | **Parsing di renderer** — `read-excel-file/browser` membaca file di renderer; file tidak pernah lewat main | File besar lambat; bundle renderer membengkak; main tidak bisa akses isi file utk matching server-side | Keputusan arsitektur: pindah parsing ke main process (IPC `imports:parse`), kirim `RawWorkbook`/`canonicalRows` |
| 3 | **Strategi matching produksi hanya 4/11** — strategi lain (Fuzzy/Alias/Prefix/ExactAuthor, dedupe, similarity) ada tapi tidak ter-wire | Kualitas match tak optimal; ekspektasi fitur tak sesuai rencana awal | Tinjau `src/main/strategies/index.ts` saat mendesain ulang preview/matching |
| 4 | **State import tidak di-reset** — `reset()` eksposed tapi tak dipanggil komponen | Sesi import lama melekat saat membuka import baru | Panggil `reset()` saat masuk `/books/import` atau selesai commit |
| 5 | **Download template masih placeholder** | User tak bisa menyiapkan file sesuai format | Implementasi generator .xlsx (butuh dep writer) atau bundle template statis |
| 6 | **Tidak ada komponen UI dasar (stepper/toast/progress/modal generic)** | Redesign membutuhkan komponen baru; konsistensi visual berisiko bila dibuat per-halaman | Buat komponen dasar reusable sebagai bagian desain UI baru |
| 7 | **Semua modul import belum di-commit** (54 file untracked, TD-004 WO-1) | Risiko kehilangan pekerjaan; baseline tidak jelas | Keputusan commit sebelum UI redesign |
| 8 | **XSS/escaping pada preview & hasil** — nilai Excel di-interpolasi ke JSX (pola existing) | Konten file (judul/lokasi) bisa memicu HTML tak diinginkan bila nanti di-render ke HTML print | Gunakan escapinig yang sama dengan WO-8 label bila menampilkan data di luar React |

---

## 7. Recommendation

1. **Jangan redesign dulu — sambungkan dulu alur yang ada.** Tambahkan langkah **commit** pada
   `BookImportPreviewPage` yang memanggil `api.imports.match(canonicalRows)` + tampilan hasil. Ini menutup
   dead-end dengan perubahan minimal (bagian A §5) dan membuat fitur benar-benar berfungsi.
2. **Putuskan arsitektur parsing** sebelum UI baru: renderer (`read-excel-file/browser`) vs main process.
   Implikasi: ukuran file, bundle, dan kemampuan matching server-side.
3. **Desain UI baru sebagai stepper** (Upload → Validasi → Commit → Hasil) dengan komponen dasar yang
   **dibuat sekali & reusable**: `Stepper`, `Toast`, `ProgressBar`, `Modal` generic, `Button` generic.
   Hindari membuat ulang di tiap halaman.
4. **Implementasikan template download** sebagai bagian dari desain baru (bundle statis `.xlsx` atau
   generator via dep writer) — hapus placeholder.
5. **Sambungkan entry point lain** sebagai prioritas rendah: Dashboard "Import Data" (klik → `/books/import`),
   dan pertimbangkan entri sidebar.
6. **Panggil `reset()`** pada masuk route import agar sesi bersih per percobaan.
7. **Kunci scope Sprint 10** (hindari scope creep): commit/pipeline, template, stepper UI, reset state.
   Server-side pagination BooksPage dan perpindahan parsing ke main = kandidat WO terpisah.
8. **Pertimbangkan strategi matching** (4/11 aktif) sebagai WO tersendiri — bukan bagian dari desain UI.

---

*Audit selesai. READ ONLY — tidak ada perubahan kode. Berhenti di sini, menunggu review Product Owner.*
