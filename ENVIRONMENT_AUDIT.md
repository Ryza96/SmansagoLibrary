# ENVIRONMENT_AUDIT.md

**Audit Lingkungan — Membuktikan source yang diedit == source yang dijalankan `npm run dev`**

- **Mode:** READ ONLY — tidak build, tidak package, tidak menjalankan aplikasi, tidak mengubah kode.
- **Tanggal:** 01/08/2026
- **Status:** SELESAI — berhenti menunggu review Product Owner.

---

## 1. PROJECT ROOT (yang dipakai OpenCode)

```
D:\kontenyou\web\New folder\APPSCANNER\APLibrary
```

- Ditentukan dari `Get-Location` dan `[IO.Path]::GetFullPath` → `D:\kontenyou\web\New folder\APPSCANNER\APLibrary`
- `git rev-parse --show-toplevel` → `D:/kontenyou/web/New folder/APPSCANNER/APLibrary` (sama)
- Volume: `D:\` (local disk, bukan network share)
- Git HEAD: `437b50a "release: v1.0 release candidate"` + **110 file berubah di working tree** (31 modified + 79 untracked) = seluruh implementasi Sprint 5–10.

## 2. DEV SERVER ROOT (yang dipakai `npm run dev`)

**Ditentukan oleh direktori tempat perintah dijalankan (cwd), karena `npm run dev` → `electron-vite dev` me-resolve proyek dari `package.json`/`electron.vite.config.ts` di direktori aktif.** Tidak ada konfigurasi global; Vite/electron-vite tidak membaca path tetap.

Oleh karena itu ada **dua kemungkinan Dev Server Root** yang valid di mesin ini, karena ada **dua proyek identik-nama**:

| Dev Server Root | Isi |
|-----------------|-----|
| `D:\kontenyou\web\New folder\APPSCANNER\APLibrary` | Proyek aktif (OpenCode), memuat fitur Sprint 5–10 |
| `D:\kontenyou\web\New folder\APPSCANNER\APLibrary_Release_Verification` | **Duplikat snapshot release** — TANPA fitur Sprint 5–10 |

## 3. APAKAH KEDUANYA IDENTIK?

**TIDAK.** Kedua proyek sama nama (`"name": "aplibrary"`, `package.json` kembar, remote git sama) tetapi **isinya berbeda**:

| Kunci | `APLibrary` (OpenCode) | `APLibrary_Release_Verification` |
|-------|------------------------|----------------------------------|
| Git HEAD | `437b50a` | `437b50a` (sama) |
| Working tree | **110 perubahan** (Sprint 5–10) | **BERSIH** (kondisi persis release candidate) |
| `BooksPage.tsx` | **Ada tombol Import Buku** | **TIDAK ada tombol** |
| Route `books/import` | Ada (`src/routes/index.tsx:37-47`) | Tidak ada (hanya books, books/new, books/:id, books/:id/edit) |
| Label `IMPORT` | Ada (`src/utils/labels.ts:45,239-…`) | Tidak ada (0 match) |
| Dependensi import | `bwip-js`, `read-excel-file` ada | Tidak ada |
| Bundle build sendiri | — | `out/renderer/assets/index-DCLpSS77.js`: `'Import Buku'` = **0** |

Keduanya **mandiri dan bisa dijalankan** (`node_modules`, `.env`, `out/`, `.git` masing-masing).

## 4. ABSOLUTE PATH (kunci)

```
Project / Dev Server Root A : D:\kontenyou\web\New folder\APPSCANNER\APLibrary
Project / Dev Server Root B : D:\kontenyou\web\New folder\APPSCANNER\APLibrary_Release_Verification
Source Root (renderer)      : <root>\src\renderer  (electron.vite.config.ts:24 → root: 'src/renderer')
Main entry (electron)       : <root>\electron\main\index.ts
Preload entry               : <root>\electron\preload\index.ts
npm local modules           : <root>\node_modules
```

`npm root` untuk proyek OpenCode = `D:\kontenyou\web\New folder\APPSCANNER\APLibrary\node_modules`.

## 5. VERIFIKASI `src/pages/BooksPage.tsx` (proyek OpenCode)

**ADA dan berisi tombol Import Buku.**

- Path: `D:\kontenyou\web\New folder\APPSCANNER\APLibrary\src\pages\BooksPage.tsx`
- Ukuran: 3.499 bytes | SHA256: `DBA12E26E182EE35CC52824C0CD4050611EA0557BB73D05F19E11F830E50AED5` | Modified: 31/07/2026 19:17:38
- `Upload` (ikon lucide) muncul **2×** di file (import + JSX tombol), `BOOK_IMPORT` **1×** (navigate)
- Tombol: `BooksPage.tsx:71-77` → `onClick={() => navigate(ROUTES.BOOK_IMPORT)}` dengan label `LABELS.BOOK.IMPORT` (`'Import Buku'`), ikon `<Upload size={16} />`, berada di antara tombol Refresh dan "Buku Baru".
- Kontras: `APLibrary_Release_Verification\src\pages\BooksPage.tsx` = 3.244 bytes, SHA256 `8B252C84…`, impor lucide hanya `Plus, Search, RefreshCw` → **tidak ada tombol Import**.

## 6. BAGAIMANA `npm run dev` MEMUAT FILE ITU

`electron-vite dev` (dari `package.json:7`) bekerja dalam satu root proyek = cwd:

1. **Main/preload** dibundel dari `<root>/electron/main/index.ts` & `<root>/electron/preload/index.ts` (`electron.vite.config.ts:10,19`).
2. **Renderer** dijalankan sebagai Vite dev server dengan `root: 'src/renderer'` (`electron.vite.config.ts:24`) → menyajikan `src/renderer/index.html` → `<script type="module" src="./main.tsx">`.
3. `main.tsx` → `<App>` → `RouterProvider(router)` dari `src/routes/index.tsx` → route `'books'` → `import BooksPage from '../pages/BooksPage'` (`routes/index.tsx:34`).
4. Vite dev melayani **source langsung** (dengan HMR), bukan `out/` hasil build. Artinya: apapun yang dijalankan `npm run dev` di root A **adalah persis isi `src/**` di root A**.

→ **Jika `npm run dev` dijalankan di root A, `BooksPage.tsx` A (dengan tombol Import) pasti ter-render.** Jika dijalankan di root B, yang ter-render adalah `BooksPage.tsx` B (tanpa tombol).

## 7. SYMLINK / WORKSPACE / MONOREPO / DUPLICATE

| Faktor | Hasil |
|--------|-------|
| Symlink/junction | **Tidak ada** — semua segmen path `D:\kontenyou\web\New folder\APPSCANNER\APLibrary` normal (no LinkType/ReparsePoint) |
| Monorepo workspace | **Tidak ada** — `pnpm-workspace.yaml`, `lerna.json`, `turbo.json`, `nx.json`, `yarn.lock` = tidak ada; field `workspaces` di package.json = tidak ada |
| Remote git | Sama: `https://github.com/Ryza96/SmansagoLibrary.git` (kedua proyek) |
| **Proyek duplikat** | **YA** — `D:\kontenyou\web\New folder\APPSCANNER\APLibrary_Release_Verification`: clone/checkout mandiri (`.git`, `node_modules`, `out/`, `.env`) di commit `437b50a`, working tree bersih. Satu-satunya proyek `APLibrary*` lain di `D:\` (scan depth 6) dan `C:\Users\hp` (scan depth 6) |
| Proyek lain | `alaricscanner` (APPSCANNER, tidak terkait electron-vite/aplibrary) |

---

## ROOT CAUSE

**Source yang diedit OpenCode (`APLibrary`) ≠ source yang dijalankan PO jika PO menjalankan `npm run dev` dari folder duplikat `APLibrary_Release_Verification`.**

Kedua proyek **tidak identik**:
- Proyek OpenCode memuat seluruh Sprint 5–10 (tombol Import Buku, route, label, deps) di **working tree yang belum di-commit**.
- `APLibrary_Release_Verification` adalah **checkout bersih commit `437b50a`** — kondisi release candidate **tanpa** fitur import (BooksPage tanpa tombol, tidak ada route `books/import`, bundle `Import Buku`=0).

Karena `npm run dev` memuat **source dari direktori aktif**, maka:
- PO menjalankan `npm run dev` dari `APLibrary_Release_Verification` (atau salinan lain) → aplikasi menampilkan `BooksPage` versi lama → **tombol Import Buku tidak muncul** — meskipun tidak ada bug, tidak ada artifact basi, dan source proyek aktif benar.

Ini konsisten dengan semua temuan sebelumnya (artifact, render tree): kode proyek aktif selalu benar; yang "salah" adalah **folder/lingkungan yang dipakai untuk menjalankan aplikasi**.

## REKOMENDASI

1. Pastikan PO menjalankan `npm run dev` dari **`D:\kontenyou\web\New folder\APPSCANNER\APLibrary`** (yang memuat Sprint 5–10). Cek dengan `(Get-Location).Path` di terminal PO sebelum `npm run dev`.
2. Konfirmasi ke PO: di terminal yang sama, jalankan `git status` — jika bersih → itu folder duplikat `APLibrary_Release_Verification` (tanpa fitur); jika ada 110 file berubah → itu proyek aktif.
3. Setelah verifikasi, hapus/rename `APLibrary_Release_Verification` agar tidak tertukar lagi (dengan persetujuan PO).
4. Commit working tree proyek aktif setelah PO menyetujui.

---

*Sumber bukti: `Get-Location`/`Get-PSDrive`, `git rev-parse`, `git remote -v`, `git log`, `git status --porcelain`, isi `package.json` kedua proyek, `electron.vite.config.ts`, `src/renderer/index.html`/`main.tsx`/`App.tsx`/`routes/index.tsx`/`pages/BooksPage.tsx`, `Get-FileHash` BooksPage dua proyek, grep bundle `index-DCLpSS77.js`, scan `D:\` depth 6 & `C:\Users\hp` depth 6 untuk duplikat/symlink/workspace.*
