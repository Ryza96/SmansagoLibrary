# SPRINT 11 — Download Template Investigation (READ ONLY)

> Mode: **READ ONLY** — tidak ada perubahan kode, tidak ada implementasi.
> Tanggal: 2026-08-01
> Tujuan: Investigasi mengapa tombol **"Download Template"** di Menu Buku masih menampilkan placeholder **"Template akan tersedia di Sprint 3."** padahal Template Import Buku v2 sudah dibuat (WO-11-B).

---

## Ringkasan Temuan

Tombol "Download Template" **tidak pernah dihubungkan ke file template**. Sejak Sprint 2, handler-nya hanya memunculkan label placeholder. WO-11-B membuat **file aset statis** `templates/Template_Import_Buku_v2.0.xlsx`, tetapi **tidak ada mekanisme download sama sekali** (tidak ada IPC handler, preload bridge, deklarasi env.d.ts, maupun save dialog). Ini **BUKAN** artifact basi, feature flag, route lama, atau conditional rendering — placeholder tersebut adalah perilaku literal komponen aktif saat ini.

---

## 1. File UI yang dirender saat "Download Template" ditekan

**`src/pages/BookImportPage.tsx`**

- Tombol: `src/pages/BookImportPage.tsx:66-72` (`<button onClick={handleDownloadTemplate}>` dengan ikon `FileDown` dan label `LABELS.IMPORT.DOWNLOAD_TEMPLATE`).
- Catatan placeholder: `src/pages/BookImportPage.tsx:73-75` — merender `LABELS.IMPORT.TEMPLATE_PLACEHOLDER` saat `showTemplateNote === true`.
- Route: `/books/import` → `BookImportPage` (index route), terdaftar di `src/routes/index.tsx:37` (parent `books/import` + `{ index: true, element: <BookImportPage /> }` di baris 44).
- Entry dari Menu Buku: `src/pages/BooksPage.tsx:72` `onClick={() => navigate(ROUTES.BOOK_IMPORT)}` (`ROUTES.BOOK_IMPORT = '/books/import'` di `src/utils/navigation.ts:5`).

## 2. Function yang dipanggil saat tombol ditekan

- **Nama function:** `handleDownloadTemplate()`
- **File:** `src/pages/BookImportPage.tsx:31-33`
  ```ts
  function handleDownloadTemplate() {
    setShowTemplateNote(true)
  }
  ```
- **Route:** tidak ada navigasi. Tombol adalah `<button>` biasa (bukan `<Link>`/`navigate`). Tidak memanggil `window.electronAPI.*` apa pun.

## 3. Apakah masih menggunakan placeholder / mock / toast / TODO / hardcoded?

**YA — murni placeholder (mock handler).**

| Jenis | Lokasi |
|-------|--------|
| Placeholder text | `src/utils/labels.ts:252` — `TEMPLATE_PLACEHOLDER: 'Template akan tersedia di Sprint 3.'` |
| Render placeholder | `src/pages/BookImportPage.tsx:73-75` — `<span>{LABELS.IMPORT.TEMPLATE_PLACEHOLDER}</span>` |
| Mock handler | `src/pages/BookImportPage.tsx:31-33` — `handleDownloadTemplate` hanya `setShowTemplateNote(true)` |
| State placeholder | `src/pages/BookImportPage.tsx:15` — `const [showTemplateNote, setShowTemplateNote] = useState(false)` |

Tidak ada toast/notifikasi; bukan TODO comment; bukan hardcoded inline string (memakai label), tapi **secara fungsional adalah placeholder yang di-commit sejak Sprint 2 dan belum pernah diganti.**

## 4. Apakah Template Generator v2 terhubung ke UI?

**TIDAK TERHUBUNG — dan tidak ada generator runtime sama sekali.**

Yang ada hanya **aset statis** (dibuat satu kali saat WO-11-B lewat automasi Excel COM, bukan service runtime):

| Aset | Lokasi |
|------|--------|
| Template v2 | `templates/Template_Import_Buku_v2.0.xlsx` (14.680 byte) |
| Screenshot v2 | `templates/Template_Import_Buku_v2.0_screenshot.png` |
| Template v1 (backward) | `templates/Template_Import_Buku_v1.0.xlsx` |

Titik yang **belum terhubung** (semuanya kosong di codebase):
1. **Main process** — tidak ada IPC handler (mis. `imports:downloadTemplate` / `templates:download`) yang membaca file `templates/...` dan membuka `dialog.showSaveDialog`.
2. **Preload** — tidak ada bridge method untuk download. Grep `template|download` di `electron/` = 0 match.
3. **`src/renderer/env.d.ts`** — tidak ada deklarasi tipe download template.
4. **Renderer** — `handleDownloadTemplate` tidak memanggil API apa pun.
5. **Packaging** — `electron-builder.yml` (files: `out/**/*` + `node_modules/**/*`) **TIDAK memaket folder `templates/`**; `extraResources` hanya berisi prisma client. Artinya di aplikasi terinstal (dist/), file template v2 bahkan tidak ikut tersalin.

Renderer sama sekali tidak mereferensikan file template; satu-satunya pembaca `templates/Template_Import_Buku_v2.0.xlsx` adalah `wo11c/smoke.ts:8` (test, bukan aplikasi).

## 5. File v2 dapat dihasilkan tapi tidak pernah dipanggil, atau endpoint belum ada?

**Keduanya:**
- File **SUDAH dihasilkan** (WO-11-B, satu kali, via COM), disimpan di `templates/`. — dapat dihasilkan = fakta.
- File tersebut **tidak pernah dipanggil** oleh aplikasi runtime (0 referensi di `src/` dan `electron/`).
- **Endpoint download memang belum pernah dibuat** — tidak ada IPC, preload, env.d.ts, save dialog, maupun handler renderer.

Jadi klaim "Template Generator telah dibuat" yang dimaksud PO sebenarnya adalah **produk akhirnya (file .xlsx)**, bukan generator runtime yang terpasang ke aplikasi. Generator runtime tidak pernah dibangun.

## 6. Feature flag / conditional rendering / legacy component / route lama / import salah?

**TIDAK ADA satupun.**

- Tidak ada feature flag, tidak ada conditional branch berdasarkan status template.
- Komponen `BookImportPage.tsx` adalah komponen aktif yang benar (dipanggil dari `src/routes/index.tsx`, `ROUTES.BOOK_IMPORT`).
- Tidak ada route ganda/lama — `books/import` hanya satu definisi (index + preview).
- Tidak ada import salah.
- Bukan artifact basi (kasus WO-2 Investigation): placeholder text memang tertulis literal di source aktif `labels.ts:252` dan dirender `BookImportPage.tsx:74`.

## 7. Root Cause

**Penyebab:**
- **Sprint 2** membuat tombol Download Template sebagai *stub* sengaja: menampilkan pesan "Template akan tersedia di Sprint 3." (catatan `SPRINT9_WO1_UI_AUDIT.md:37` dan `TD-002` di `SPRINT9_WO1_IMPORT_UI_REPORT.md:74`).
- **WO-11-B** membuat Template Import v2, tetapi scope-nya eksplisit: *"HANYA mengubah Template Generator / aset template — TIDAK ada perubahan pipeline import"* (`SPRINT11_WO11B_IMPLEMENTATION_REPORT.md:5`). Tidak ada pekerjaan wiring UI download.
- **WO-11-C / D / E** semuanya fokus pipeline (validation / persist / multi-copy), tidak menyentuh UI download.
- Akibatnya: tidak ada sprint yang menghubungkan tombol Download ke file template maupun membuat mekanisme download (IPC/preload/dialog). Placeholder Sprint 2 bertahan sampai sekarang, dan implementasi Sprint 11 tidak "terlihat" karena memang tidak menyentuh jalur Download sama sekali.

**File yang harus diubah (untuk perbaikan — bukan bagian investigasi ini):**
| File | Peran |
|------|-------|
| `electron/ipc/book-import.ipc.ts` (atau `templates.ipc.ts` baru) | IPC handler download template: baca file + `dialog.showSaveDialog` |
| `electron/preload/book-import.preload.ts` + `electron/preload/index.ts` | Bridge method ke renderer |
| `src/renderer/env.d.ts` | Deklarasi tipe method download |
| `electron/main/bootstrap.ts` | Registrasi channel |
| `src/pages/BookImportPage.tsx` | Ganti `handleDownloadTemplate` memanggil API; hapus placeholder |
| `src/utils/labels.ts` | Ganti/hapus `TEMPLATE_PLACEHOLDER` |
| `electron-builder.yml` | Tambah `templates/` ke `extraResources` (atau generate di runtime) agar file ada di aplikasi terinstal |

**Mengapa implementasi Sprint 11 tidak terlihat oleh PO:** karena WO-11-B hanya memproduksi **file aset** template, sedangkan seluruh mekanisme download (endpoint + wiring UI + packaging) tidak pernah dibangun oleh WO mana pun. Placeholder "Template akan tersedia di Sprint 3." adalah satu-satunya perilaku tombol Download sejak Sprint 2.

---

## Output yang diminta

### Root Cause
Tombol "Download Template" adalah stub Sprint 2 yang hanya menampilkan label placeholder; tidak pernah dihubungkan ke file `templates/Template_Import_Buku_v2.0.xlsx`. WO-11-B membuat file template tapi secara eksplisit di luar scope untuk wiring UI; tidak ada sprint yang membuat endpoint download (IPC/preload/dialog) maupun memaket folder templates.

### Active UI File
`src/pages/BookImportPage.tsx` (route `/books/import`; tombol baris 66-72, placeholder baris 73-75).

### Active Download Flow
Tidak ada flow download. `handleDownloadTemplate()` (`BookImportPage.tsx:31-33`) → `setShowTemplateNote(true)` → render `LABELS.IMPORT.TEMPLATE_PLACEHOLDER` ("Template akan tersedia di Sprint 3.", `labels.ts:252`). Tidak ada IPC, route, atau pembacaan file.

### Mengapa Product Owner masih melihat placeholder
1. Placeholder literal masih ada di komponen aktif (`BookImportPage.tsx:74` + `labels.ts:252`).
2. Handler download hanya mock (`setShowTemplateNote(true)`).
3. Tidak ada mekanisme download (IPC/preload/env.d.ts/dialog) yang pernah dibuat.
4. Folder `templates/` tidak di-package ke aplikasi terinstal (`electron-builder.yml`), sehingga endpoint pun belum bisa membaca file di produksi.
5. Sprint 11 (B/C/D/E) seluruhnya tidak menyentuh jalur Download.

### Rencana perbaikan
WO baru (di luar investigasi ini, READ ONLY):
1. Buat IPC handler `imports:downloadTemplate` di main: baca `templates/Template_Import_Buku_v2.0.xlsx` (via `app.getAppPath()`/resources) → `dialog.showSaveDialog` → tulis file.
2. Tambah preload bridge + deklarasi `env.d.ts`.
3. Wiring `handleDownloadTemplate` di `BookImportPage.tsx` memanggil API; hapus `showTemplateNote`/`TEMPLATE_PLACEHOLDER` (atau ubah jadi status sukses/gagal).
4. Tambah `templates/` ke `extraResources` di `electron-builder.yml` (atau buat generator runtime xlsx).
5. Rebuild + repackage + verifikasi `app.asar`/resources memuat template & string baru sebelum review PO (mengikuti pelajaran WO-2 Investigation: review PO = uji ARTIFACT, bukan source).

**Status: DONE (READ ONLY) — menunggu instruksi / review Product Owner.**
