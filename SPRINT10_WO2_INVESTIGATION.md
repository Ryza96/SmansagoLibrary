# SPRINT10_WO2_INVESTIGATION.md

**Investigasi: Ketidaksesuaian Laporan WO-2 vs Kondisi Aplikasi (Menu Buku tanpa tombol "Import Buku")**

- **Mode:** READ ONLY — tidak ada perubahan kode, tidak ada implementasi.
- **Metode:** audit source (routes/layout/pages), audit git history & diff, audit artifact build (source `out/` vs packaged `dist/`), pencarian string di bundle ter-compile.
- **Status:** INVESTIGASI SELESAI — menunggu review PO.

---

## RINGKASAN (TL;DR)

**Source code BENAR dan lengkap** — tombol "Import Buku" ada di `src/pages/BooksPage.tsx`, route `/books/import` ada, label ada, `handleCommit` ada.

**Yang Product Owner jalankan adalah aplikasi yang TIDAK sesuai source** — `dist/win-unpacked/` (aplikasi ter-package) dibuild **31/07 2026 10:24**, sebelum seluruh fitur Import (termasuk tombol dan commit WO-2) ada di working tree. Bundle renderer di dalam `app.asar` terbukti **tidak mengandung satu pun** string import (`Import Buku`, `BOOK_IMPORT`, `books/import`, `imports:match` = 0 kemunculan).

**Akarnya bukan bug logika, bukan feature flag, bukan conditional rendering** — melainkan **artifact build/package yang basi (stale)** dan **seluruh kerja Sprint 5–10 belum pernah di-commit** (working tree di atas commit `437b50a`).

---

## 1. ROOT CAUSE

### 1.1 Timeline & Bukti Git

| Fakta | Nilai | Bukti |
|-------|-------|-------|
| Commit terakhir | `437b50a "release: v1.0 release candidate"` — 2026-07-31 16:01 WIB | `git log`; `git show -s --format=%ci` |
| Commit isinya | **TIDAK** memuat fitur import sama sekali | `git ls-tree -r 437b50a` → 0 file `BookImport*`, 0 `ImportContext`, 0 `useBookImport`; `navigation.ts` commit tidak punya `BOOK_IMPORT`/`BOOK_IMPORT_PREVIEW`; `routes/index.tsx` commit tidak punya `books/import`; `BooksPage.tsx` commit tidak punya tombol Import; `labels.ts` commit tidak punya `IMPORT_ACTION`/`BACK_TO_BOOKS`/`IMPORT_SUCCESS`; `BookImportPreviewPage.tsx` commit tidak punya `handleCommit`/`imports.match` |
| Seluruh kerja Import (Sprint 5–10, WO-2, WO-3, WO-8, WO-13, dst.) | **Hanya di working tree, belum di-commit** | `git status` → 31 file modified + banyak untracked; `git diff HEAD -- src/pages/BooksPage.tsx` menambahkan tombol Import |
| Aplikasi ter-package | `dist/win-unpacked/` dibuild **31/07 2026 10:24** (sebelum commit release & sebelum WO-2) | `Get-Item dist`, `dist/win-unpacked` LastWriteTime |
| Aplikasi ter-package isinya | Bundle renderer **tanpa** fitur import | grep `app.asar`: `Import Buku`=0, `BOOK_IMPORT`=0, `books/import`=0, `imports:match`=0, `IMPORT_ACTION`=0, `BACK_TO_BOOKS`=0 |
| Build source terkini | `out/` dibuild **01/08 2026 12:37** (regresi WO-3) → **lengkap** | `index-DiqpmWbM.js`: `Import Buku`=6, `BOOK_IMPORT`=11, `books/import`=3, `BACK_TO_BOOKS`=2; `out/main/index.js`: `imports:match`=1 |

### 1.2 Kesimpulan Akar

1. Commit `437b50a` (satu-satunya "release") lahir **sebelum** fitur Import dibuat. Seluruh fitur Import hidup di working tree yang belum di-commit.
2. Aplikasi yang diinstal/dijalankan PO diambil dari `dist/` (electron-builder) yang dihasilkan **31/07 10:24** — sebelum WO-2 — sehingga tidak memuat tombol, route, maupun pipeline.
3. Laporan WO-2 benar untuk **source**, tetapi **belum pernah dibuild ulang & di-package ulang** untuk `dist/`, dan **belum di-commit** sehingga tidak ada artifact yang bisa dijamin menyertainya.
4. Konsekuensi: siapa pun yang membuka menu Buku dari aplikasi ter-package yang ada → melihat `BooksPage` versi lama (tanpa tombol). Bukan karena logika, melainkan karena kode lama yang ter-bundle.

---

## 2. ACTIVE UI FILE

### 2.1 Rantai render (source)

```
src/renderer/index.html
  └─ src/renderer/main.tsx
       └─ src/renderer/App.tsx  → <RouterProvider router={router}/>
            └─ src/routes/index.tsx  (createHashRouter)
                 ├─ AppLayout (src/components/layout/AppLayout.tsx)
                 │    ├─ TopBar
                 │    ├─ Sidebar (src/components/layout/Sidebar.tsx)
                 │    │    └─ item "Buku" → to: '/books'   (Sidebar.tsx:19)
                 │    └─ <Outlet/>
                 └─ route path '/books' → <BooksPage/>     (routes/index.tsx:34)
                      └─ tombol "Import Buku"              (BooksPage.tsx:71-77)
                           → navigate(ROUTES.BOOK_IMPORT)  ('/books/import')
```

### 2.2 File yang SEHARUSNYA dirender ketika membuka Menu Buku (working tree / benar)

| File | Peran | Kondisi |
|------|-------|---------|
| `src/components/layout/Sidebar.tsx:19` | Menu "Buku" → `/books` | ✓ tidak berubah |
| `src/routes/index.tsx:34` | Route `/books` → `<BooksPage/>` | ✓ tidak berubah |
| `src/routes/index.tsx:36-47` | Route `/books/import` + `/books/import/preview` | ✓ working tree (ADA) |
| `src/pages/BooksPage.tsx:71-77` | Tombol "Import Buku" (`Upload` + `LABELS.BOOK.IMPORT`) | ✓ working tree (ADA) |
| `src/utils/labels.ts` | `BOOK.IMPORT = 'Import Buku'` + blok `IMPORT.*` | ✓ working tree (ADA) |
| `src/utils/navigation.ts:5-6` | `BOOK_IMPORT`/`BOOK_IMPORT_PREVIEW` | ✓ working tree (ADA) |
| `src/pages/BookImportPage.tsx` | Halaman pilih file | ✓ working tree (ADA) |
| `src/pages/BookImportPreviewPage.tsx:184-196` | `handleCommit` → `window.electronAPI.imports.match` | ✓ working tree (ADA) |
| `electron/ipc/book-import.ipc.ts:22-25` | Channel `imports:match` | ✓ working tree (ADA) |

### 2.3 File yang BENER-render di aplikasi PO (artifact basi)

Bundle di dalam `dist/win-unpacked/resources/app.asar` — setara source commit `437b50a`:
- `BooksPage` versi lama (import baris `Plus, Search, RefreshCw` — **tanpa `Upload`**).
- `routes` versi lama (**tanpa** `/books/import`).
- `labels` versi lama (**tanpa** `BOOK.IMPORT` / `IMPORT.*`).
- `navigation` versi lama (**tanpa** `BOOK_IMPORT`).
- Tanpa `BookImportPage`, `BookImportPreviewPage`, `imports:match`.

---

## 3. MENGAPA PRODUCT OWNER TIDAK MELIHAT PERUBAHAN

| Hipotesis | Ditemukan? | Penjelasan |
|-----------|-----------|------------|
| Feature flag mematikan tombol | **TIDAK** | Tidak ada flag/konfigurasi fitur import di source manapun |
| Permission/role gating | **TIDAK** | Tidak ada auth/role/permission di renderer; tombol dirender tanpa syarat |
| Conditional rendering | **TIDAK** | `BooksPage.tsx` merender tombol tanpa kondisi; di bundle PO tombol tidak ada sama sekali (bukan disembunyikan) |
| Route berbeda / halaman lama-vs-baru dalam satu aplikasi | **TIDAK** | Satu `createHashRouter`, satu `BooksPage`, satu sidebar; `Sidebar.tsx:19` selalu `/books` |
| Layout berbeda | **TIDAK** | `AppLayout` tunggal (TopBar+Sidebar+Outlet+StatusBar) |
| **Artifact build basi (STALE)** | **YA** | PO menjalankan `dist/win-unpacked` (31/07 10:24) yang dibuild dari kode sebelum import ada; bukti string: `app.asar` 0 kemunculan fitur import vs `out/` hari ini puluhan kemunculan |
| **Kerja belum di-commit** | **YA** | Commit `437b50a` (31/07 16:01) tidak memuat import; seluruh Sprint 5–10 ada di working tree yang belum di-commit |

**Urutan masalah:** bukan tombol yang tidak dirender karena kode, melainkan **kode yang ditulis belum pernah dikompilasi ke artifact yang PO jalankan**. `out/` (build source) sudah benar hari ini; `dist/` (aplikasi package) masih versi lama.

---

## 4. RENCANA PERBAIKAN (usulan — BELUM dieksekusi)

> READ ONLY: berikut hanya rekomendasi untuk disetujui PO sebelum eksekusi.

| # | Langkah | Detail | Kategori |
|---|---------|--------|----------|
| 1 | **Rebuild source** | `npm run build` (electron-vite → `out/`) — sudah terbukti menghasilkan bundle yang memuat `Import Buku`/`BOOK_IMPORT`/`books/import`/`imports:match` | Build |
| 2 | **Repackage aplikasi** | Jalankan electron-builder (`npm run dist`/`electron-builder`) sehingga `dist/` berisi bundle baru | Build |
| 3 | **Verifikasi artifact** | Grep `dist/win-unpacked/resources/app.asar` → pastikan `Import Buku`/`BOOK_IMPORT`/`imports:match` ≥ 1; jalankan `dist/win-unpacked/APLibrary.exe` → buka Menu Buku → tombol "Import Buku" tampil | QA |
| 4 | **Commit seluruh working tree** | Commit Sprint 5–10 (termasuk WO-2/WO-3/WO-8/WO-13 dst.) agar artifact dapat direproduksi dari git; pastikan urutan/revisi PO terdahulu sudah di-approve | Git hygiene |
| 5 | **Standard operating (anti-terulang)** | Tambahkan aturan: setiap WO selesai → `npm run build` + repackage + verifikasi `app.asar` → baru dianggap "READY review PO"; PO wajib menguji artifact terbaru (`dist/`), bukan aplikasi yang terinstal lama | Proses |

---

## 5. JAWABAN PERTANYAAN INVESTIGASI

1. **File yang sebenarnya dirender saat PO membuka Menu Buku:** komponen `BooksPage` yang ter-compile di dalam `dist/win-unpacked/resources/app.asar` (setara source commit `437b50a` — versi lama tanpa tombol). Dalam source, file aktifnya adalah `src/pages/BooksPage.tsx` via `src/routes/index.tsx:34`, layout `src/components/layout/AppLayout.tsx`, sidebar `src/components/layout/Sidebar.tsx:19`.
2. **Apakah file yang diubah WO-2 memang file yang dirender?** **Ya, dari sisi source** — `BooksPage.tsx`/`labels.ts`/`BookImportPreviewPage.tsx`/`routes` adalah file aktif dan benar. **Tidak, dari sisi artifact** — perubahan tersebut belum pernah masuk ke `dist/` yang dijalankan PO.
3. **Mengapa tombol tidak muncul?** Bukan karena logika/flag — karena aplikasi yang dijalankan PO adalah **build basi** (31/07 10:24, dari kode sebelum import), yang bundle-nya terbukti tidak mengandung fitur import sama sekali.
4. **Feature flag/permission/conditional/route/layout lama-vs-baru?** Semua **tidak ada**. Yang berbeda hanyalah **artifact build**: `out/` (baru, benar) vs `dist/` (lama, tanpa fitur).
5. **Apakah implementasi di file salah?** **Tidak.** File implementasi sudah benar. Yang keliru adalah **proses pengemasan**: `dist/` belum di-rebuild & belum di-commit. Perbaikan = rebuild + repackage + commit (rencana di atas).

---

*Sumber bukti lengkap tersimpan di working tree: `git show 437b50a:...` (versi release), `git diff HEAD` (perubahan working tree), `dist/win-unpacked/resources/app.asar` (artifact PO), `out/renderer/assets/index-DiqpmWbM.js` + `out/main/index.js` (build terkini).*
