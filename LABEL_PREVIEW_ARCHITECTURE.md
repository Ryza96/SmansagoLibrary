# LABEL_PREVIEW_ARCHITECTURE.md — Arsitektur Preview Cetak Label Buku

**Tanggal:** 01 Agustus 2026
**Mode:** READ ONLY — audit arsitektur. **TIDAK ada kode/implementasi/commit/staging.**
**Status:** AUDIT COMPLETE — menunggu approval Product Owner sebelum implementasi.
**Peran:** Principal Software Architect / UI-UX Architect / Tech Lead (audit); Product Owner (keputusan).

---

## 1. Architecture Overview — Kondisi Saat Ini (Sebelum Perubahan)

Alur Cetak Label saat ini **langsung ke dialog printer** tanpa pratinjau:

```
Renderer  BookDetail.tsx:79-96  handlePrintLabels()
              │  settings.get() → window.electronAPI.print.bookLabels({libraryName, bookTitle, items})
              ▼
Preload   print.preload.ts:8     ipcRenderer.invoke('printing:bookLabels', data)
              ▼
IPC main  print.ipc.ts:12-14     ipcMain.handle('printing:bookLabels', ...)
              ▼
Service   print.service.ts:14-17 printBookLabels(data)
              │  → generateLabelsHtml(data)          ← SATU-SATUNYA source of truth layout
              ▼
Print     print.service.ts:131-164  printHtml()
              │  hidden BrowserWindow → loadURL(data:text/html) → webContents.print()
              ▼
Printer   Dialog Windows (default, TIDAK silent)
```

Fakta penting yang mendasari seluruh rekomendasi:

1. **Source of truth layout sudah tunggal:** `generateLabelsHtml` di `src/main/services/label.service.ts:40` — fungsi murni (tanpa Electron/DB), menghasilkan HTML A4 3×4 (12 label/halaman, `LABEL_PRINT_CONFIG` label.service.ts:4-10).
2. **Generator tidak bisa diimpor renderer:** `label.service` → `barcode.service` mengimpor `bwip-js/node` (conditional export Node). Renderer bundle (electron-vite) tidak bisa meng-import ini tanpa duplikasi layout — oleh karena itu SSOT **harus** tinggal di main process.
3. **Print = HTML murni, bukan PDF:** tidak ada `printToPDF`, tidak ada canvas/ZPL. `webContents.print` di main yang memunculkan dialog.
4. **CSP renderer ketat:** `default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'` (src/renderer/index.html). Konsekuensi & peluang dijelaskan di §3/Q1.
5. **Precedent preview page sudah ada:** `BookImportPreviewPage.tsx` + route `books/import/preview` — pola "buat data → halaman preview terpisah → aksi final" sudah dipakai proyek ini.
6. **Semua channel IPC domain-driven** (`electron/ipc/*.ipc.ts` + `electron/preload/*.preload.ts`), DI via `bootstrap.ts`.

File yang terlibat (audit lengkap):

| Layer | File | Peran |
|-------|------|-------|
| Renderer (tombol) | `src/components/books/BookDetail.tsx:79-96,159-168` | `handlePrintLabels` langsung cetak |
| Renderer (page) | `src/pages/BookDetailPage.tsx` | Muat `book` + `copies` |
| Renderer (types) | `src/renderer/env.d.ts:124-128` | Tipe `print.bookLabels` |
| Preload | `electron/preload/print.preload.ts` | `bookLabels` invoke |
| IPC | `electron/ipc/print.ipc.ts` | `printing:bookLabels` |
| Service | `electron/main/services/print.service.ts` | `printBookLabels` + `printHtml` |
| Generator (SSOT) | `src/main/services/label.service.ts` | `generateLabelsHtml`, `labelItemHtml`, `escapeHtml`, `LABEL_PRINT_CONFIG` |
| Barcode | `src/main/services/barcode.service.ts` | `generateBarcodeSvg` (bwip-js/node, Code128) |
| DTO | `src/shared/dto/print.ts` | `BookLabelData`, `BookLabelItemData` |
| Routing | `src/routes/index.tsx` (HashRouter), `src/utils/navigation.ts` | Route & helper path |
| Main window | `electron/main/index.ts` | 1 window SPA utama (1280×800) |

---

## 2. Flow Diagram — Arsitektur yang Diusulkan

```
[BookDetail.tsx]  "Cetak Label"
      │  (TIDAK langsung cetak lagi)
      ▼  navigate('/books/:id/labels-preview')
┌────────────────────────────────────────────────────────────────────┐
│ [LabelPreviewPage (renderer)]  ← route baru, di dalam AppLayout     │
│                                                                     │
│  1. fetch book + copies (api.bookCopies.findByBookId) + settings.get│
│  2. build BookLabelData (helper renderer — satu-satunya tempat)     │
│  3. api.print.getLabelPages(data)                                   │
│       ▼                                                             │
│  4. render <iframe srcDoc={pages[current]} />  → A4 scaled          │
│  5. toolbar: ‹ Halaman 1/2 › · zoom (50/75/100/Fit) · [Cetak] [Batal]│
└────────────────────────────────────────────────────────────────────┘
      │                                                               │
      │  (preview) NEW IPC read-only                                   │  (cetak) channel EKSISTING — tidak berubah
      ▼  printing:labelPages                                           ▼  printing:bookLabels
┌───────────────────────────┐                            ┌───────────────────────────────┐
│ IPC print.ipc.ts          │                            │ IPC print.ipc.ts              │
└──────────┬────────────────┘                            └───────────────┬───────────────┘
           ▼                                                              ▼
┌────────────────────────────────────────────┐              ┌────────────────────────────────┐
│ PrintService.getLabelPages(data)           │              │ PrintService.printBookLabels(data) │
│  pageSize = LABEL_PRINT_CONFIG.columns×rows │              │  → generateLabelsHtml(data)        │
│  = 3 × 4 = 12 label/halaman                │              │  → printHtml → Windows dialog      │
│  slicing items → per halaman:              │              └────────────────────────────────┘
│    generateLabelsHtml(pageData)   ← SSOT   │  ================= SAMA ==================
│  return { pages: string[] }                │  (generator yang sama, layout identik)
└────────────────────────────────────────────┘
```

**Alur lengkap user:**
1. User klik **"Cetak Label"** di `BookDetail` → dialihkan ke halaman Preview (`/books/:id/labels-preview`).
2. Preview memuat data (buku, eksemplar, setting) lalu meminta HTML per halaman dari main via **`printing:labelPages`** (channel baru, read-only, tanpa efek samping).
3. User memeriksa setiap halaman A4 (paging ‹ ›, zoom, skala fit) — ini **WYSIWYG** karena memakai HTML yang sama persis dengan yang akan dicetak.
4. User klik **"Cetak"** → memanggil channel **`printing:bookLabels`** yang sudah ada (persis seperti perilaku hari ini) → dialog printer Windows.
5. User klik **"Batal"** → kembali ke halaman buku tanpa efek apa pun.

---

## Q1. Pendekatan Terbaik untuk Membuat Preview Label

| Pendekatan | Kelebihan | Kekurangan | Kompleksitas | Maintainability | Kesesuaian proyek |
|------------|-----------|------------|--------------|-----------------|-------------------|
| **A. Halaman React khusus (route baru)** — `LabelPreviewPage` di `src/pages/`, data via refetch by `bookId` | Cocok pola SPA existing; URL addressable & refresh-safe (`/books/:id/labels-preview`); bisa pakai AppLayout (back button, chrome); precedent `BookImportPreviewPage`; ruang besar untuk paging+zoom; renderer tetap tipis (hanya UI chrome, HTML dari main) | Perlu route baru + 1 fetch ulang data | Rendah–Sedang | **Tinggi** (pola sama dengan page lain) | **PALING SESUAI** |
| **B. Modal React** (overlay di atas BookDetail) | Tidak pindah halaman; data `copies` sudah di tangan (tanpa refetch) | Modal besar (A4 penuh) tidak ada precedent (modal existing maks `max-w-md`); tidak URL-addressable; layout sempit untuk paging; toolbar & scrolling penuh dalam overlay cenderung "berantakan" UX | Sedang | Rendah–Sedang | Kurang sesuai |
| **C. BrowserWindow baru (show:true)** berisi HTML label | "Nyata" 1:1 dengan print window | Tanpa React/AppLayout → toolbar/paging/zoom harus di-inject script ke HTML data: URL (hacky, tanpa preload/IPC); skala multi-monitor sulit; tidak ada perpindahan halaman alami (Chromium screen render ≠ pagination print); window ke-2 harus dikelola lifecycle di main | Tinggi | Rendah (UI terpisah dari SPA) | Tidak sesuai |
| **D. Hidden window + `capturePage` → gambar PNG** | WYSIWYG paling literal (Chromium render) | Perlu render per halaman + scroll + capture + transfer gambar; lebih lambat; state gambar statis (tidak interaktif); kode main bertambah signifikan | Tinggi | Rendah–Sedang | Tidak perlu (berlebihan) |
| **E. PDF (`printToPDF`) + viewer (pdf.js)** | Format dokumen standar | Dependency baru (`pdf.js`); pipeline print berubah total; render PDF di React butuh komponen tambahan; font/embed barcode perlu verifikasi ulang | Tinggi | Rendah | Tidak sesuai (overkill) |

**Rekomendasi: Pendekatan A** — halaman React khusus dengan konten HTML dari main via iframe `srcdoc`. Alasannya: (1) sejalan dengan arsitektur SPA + HashRouter + AppLayout yang sudah ada; (2) precedent preview-page sudah terbukti (`BookImportPreviewPage`); (3) renderer tetap tipis, semua layout di main (SSOT); (4) scaling/paging mudah dikontrol React; (5) tidak ada dependency baru, tidak ada perubahan pipeline print.

---

## Q2. Preview Menggunakan Generator HTML yang Sama dengan Print (Satu Source of Truth)

**Ya, dimungkinkan dan justru wajib.**

- SSOT sudah ada: `generateLabelsHtml(data)` (`label.service.ts:40`) — dipakai print hari ini via `printBookLabels`.
- Preview tinggal **memanggil fungsi yang sama** untuk konten layar. Karena renderer tidak bisa mengimpor `label.service` (bwip-js/node), konten dikirim dari main melalui channel IPC **baru** yang read-only:
  - `PrintService.getLabelPages(data): { pages: string[] }` → slicing per halaman + `generateLabelsHtml` per halaman.
  - Channel ini **tidak** membuka window, tidak mencetak — murni menghasilkan HTML string.
- Renderer **hanya menampilkan** HTML itu (via iframe `srcdoc`). Tidak ada satu baris pun layout/CSS/barcode di renderer.

**Arsitektur konsep:**

```
print  : printing:bookLabels → printBookLabels(data) → generateLabelsHtml(data)   [semua label, 1 dokumen]
preview: printing:labelPages → getLabelPages(data)   → generateLabelsHtml(page)   [per halaman, pageSize=12]
                                                          │
                                        keduanya menunjuk ke label.service yang SAMA
```

Keuntungan: perubahan layout (mis. 3×4 → 2×5, margin, ukuran font) cukup di `label.service` — preview dan print otomatis berubah bersama. Regresi layout tidak mungkin karena kodenya satu.

---

## Q3. Menampilkan Preview dengan Ukuran A4 Sebenarnya tapi Nyaman di Monitor

Konsep **fixed canvas + CSS transform scale** (bukan CSS `zoom`, bukan resize konten):

- A4 pada 96 dpi = **794 × 1123 px** (210/25.4×96 ≈ 794; 297/25.4×96 ≈ 1123).
- iframe dibuat **fixed** `width: 794px; height: 1123px` (internal = ukuran A4 sebenarnya). Konten iframe tidak pernah diubah skalanya — ini menjaga layout 1:1 dengan print.
- **Skala ditangani di luar iframe** via `transform: scale(s)` + `transform-origin: top left`, dibungkus div berukuran `794·s × 1123·s`:
  - `s = min(1, availWidth / 794)` untuk mode **fit-to-width** (default).
  - `s = min(availW/794, availH/1123)` untuk **fit-window**.
  - **Zoom manual:** 50% / 75% / **100%** / 125% (+/−). Pada **100%, piksel = ukuran A4 sebenarnya** — inilah "ukuran sebenarnya" yang diminta PO.
- Karena layar hampir selalu lebih kecil dari 794 px (di dalam AppLayout), default-nya fit-to-width; tombol zoom memberi kontrol presisi.

**Verifikasi teknis (penting):** CSP renderer `frame-src` **tidak berlaku untuk `<iframe srcdoc>`** (srcdoc dianggap bagian dokumen induk; CSP induk diwarisi). HTML label tidak mengandung `<script>` dan hanya memakai `<style>` inline — sudah diizinkan oleh `style-src 'unsafe-inline'`. Jadi iframe `srcdoc` aman di bawah CSP saat ini **tanpa perubahan CSP**. (Diverifikasi dari perilaku Chromium; tetap di-smoke saat implementasi.)

---

## Q4. Menangani Lebih dari Satu Halaman

Perhitungan halaman = **dilakukan di main process** agar renderer tidak tahu konstanta layout:

- `pageSize = LABEL_PRINT_CONFIG.columns × rows = 3 × 4 = 12` (didefinisikan di `label.service.ts`, bukan hardcode di renderer).
- `totalPages = ceil(items.length / pageSize)`; `pageItems[k] = items.slice(k·pageSize, (k+1)·pageSize)`.
- `getLabelPages(data)` mengembalikan `pages: string[]` — **satu HTML A4 per halaman**, sudah ter-slice.

| Jumlah label | Halaman |
|--------------|---------|
| 5 | 1 |
| 12 | 1 |
| 18 | 2 (12 + 6) |
| 30 | 3 (12 + 12 + 6) |

**Perpindahan halaman yang paling baik:** navigasi per halaman (bukan scroll panjang, bukan thumbnail saja):

- Toolbar: `‹ Halaman 2 dari 3 ›` + indikator jumlah label; tombol prev/next disabled di ujung; optional jump-to-page.
- **Hanya satu iframe yang di-mount** (halaman aktif). Untuk set besar (mis. 500 eksemplar → 42 halaman) ini menjaga DOM tetap ringan — tidak ada 42 iframe sekaligus.
- Pindah halaman = ganti `pages[current]` ke `srcDoc` (instan, tanpa IPC ulang karena `pages` sudah di-fetch sekali).
- **Konsistensi preview ↔ print:** print (channel lama) me-render SEMUA label dalam satu dokumen dan Chromium otomatis memecah halaman tepat di batas label karena `.label` punya tinggi tetap (71.25mm × 4 baris = 285mm = A4 − 2×6mm padding) + `page-break-inside: avoid`. Karena slice preview memakai `pageSize` yang sama dari konfigurasi yang sama, **halaman k preview = halaman k print** (dokumentasikan sebagai kontrak, §Risiko/R2).

---

## Q5. Preview di Renderer atau Main Process?

**Keduanya — pembagian peran (hybrid), dengan source of truth di main:**

| Aspek | Renderer | Main |
|-------|----------|------|
| UI Chrome (toolbar, paging, zoom, tombol Cetak/Batal) | ✅ renderer | — |
| Layout label (HTML + CSS + SVG barcode) | ❌ (tidak bisa & tidak boleh) | ✅ `label.service` |
| Pembuatan halaman (`pages[]`) | ❌ | ✅ `PrintService.getLabelPages` |
| Aksi cetak | `bookLabels(data)` invoke | ✅ `printBookLabels` |

**Alasan teknis:**
1. **Renderer tidak bisa mengimpor generator:** `barcode.service` mengimpor `bwip-js/node` (conditional export Node). Di bawah electron-vite, renderer bundle tidak dapat meng-import layanan `src/main` yang bergantung Node — bukti: seluruh generator hidup di `src/main/services` dan hanya dipanggil dari main process. Memindahkan generator ke renderer = menduplikasi layout (melanggar SSOT).
2. **Main sudah punya print-nya:** `printBookLabels` di main. Preview yang memanggil main juga berarti "cetak" dan "preview" mengakses generator yang sama tanpa melewati batas bundle.
3. **Renderer adalah rumah UI:** SPA, AppLayout, HashRouter. Toolbar/paging/zoom adalah UI murni — natural di React. Membuat UI ini di main (BrowserWindow tambahan) = duplikasi chrome & manajemen window yang tidak perlu.

Kesimpulan: **generasi & pagination di main, presentasi & interaksi di renderer.** Ini tepat satu-satunya kesimpulan yang konsisten dengan arsitektur saat ini.

---

## Q6. Tombol "Cetak" Memakai Layout yang Sama Persis Tanpa Generator Kedua

**Alur yang direkomendasikan — tombol Cetak memanggil channel yang sudah ada:**

1. `LabelPreviewPage` menyimpan `BookLabelData` yang sama yang ia pakai untuk preview (data sudah di-build di langkah 2, §2).
2. Klik **"Cetak"** → `await window.electronAPI.print.bookLabels(data)` — **persis channel yang dipakai hari ini**, tanpa perubahan apa pun di `PrintService.printBookLabels`, `printHtml`, atau `printing:bookLabels`.
3. `printBookLabels(data)` memanggil `generateLabelsHtml(data)` — fungsi yang sama dengan preview (per halaman). Layout **identik byte demi byte per halaman**.
4. Print dialog Windows muncul; user memilih printer; sukses → kembali ke preview (atau tutup ke halaman buku); batal → error "cancelled" ditangani seperti hari ini.

**Mengapa tidak ada generator kedua:** karena preview tidak pernah membuat layout sendiri — ia menampilkan output `generateLabelsHtml`. Cetak men-trigger ulang fungsi yang sama. Satu-satunya perbedaan adalah preview menyajikan per-halaman dan print menyajikan satu dokumen penuh yang dipecah Chromium di posisi yang sama.

*(Opsional di masa depan, di luar scope: tombol "Cetak halaman ini saja" cukup mengirim `pageData` yang sedang aktif ke channel yang sama.)*

---

## Q7. Menambah Preview Tanpa Mengubah Arsitektur Print yang Sekarang

**Ya, 100% additive — tidak ada satu pun file print-flow yang berubah perilakunya.**

Perubahan minimum (semua tambahan):

| # | File | Perubahan | Tipe |
|---|------|-----------|------|
| 1 | `src/main/services/label.service.ts` | Tambah **fungsi murni** `generateLabelPages(data): string[]` — slicing `pageSize` dari `LABEL_PRINT_CONFIG` + map `generateLabelsHtml` | BARU |
| 2 | `electron/main/services/print.service.ts` | Tambah method **read-only** `getLabelPages(data)` delegasi ke `generateLabelPages` (tanpa window, tanpa side-effect) | BARU |
| 3 | `electron/ipc/print.ipc.ts` | Tambah handler `printing:labelPages` | BARU |
| 4 | `electron/preload/print.preload.ts` | Tambah `getLabelPages(data)` | BARU |
| 5 | `src/renderer/env.d.ts` | Tambah tipe `print.getLabelPages` | BARU |
| 6 | `src/utils/navigation.ts` | Tambah `ROUTES.BOOK_LABEL_PREVIEW` + helper `bookLabelPreviewPath(id)` | BARU |
| 7 | `src/routes/index.tsx` | Tambah route `/books/:id/labels-preview` | BARU |
| 8 | `src/pages/LabelPreviewPage.tsx` (+ komponen toolbar `src/components/labels/`) | Halaman preview + toolbar paging/zoom/Cetak | BARU |
| 9 | `src/components/books/BookDetail.tsx` | `handlePrintLabels` → `navigate` ke preview (bukan cetak langsung) | MODIFIKASI |
| 10 | *(opsional)* helper renderer `buildBookLabelData(book, copies, settings)` | Hindari duplikasi pembuatan `BookLabelData` (saat ini di `BookDetail.tsx:82-91`; nanti juga dipakai `LabelPreviewPage`) | BARU |

**TIDAK diubah:** `printHtml`, `printing:bookLabels`, `printBookLabels`, `barcode.service`, DTO, `bootstrap.ts` (PrintService konstruktor tidak berubah), schema/DB, dependency, CSP.

---

## Q8. Rekomendasi Arsitektur Final

**"Preview Page (renderer) + konten HTML dari main via IPC read-only + iframe srcdoc + tombol Cetak memakai channel eksisting."**

Ringkasan keputusan (ADR singkat):

| # | Keputusan | Nilai |
|---|-----------|-------|
| D1 | Preview = **route React** `/books/:id/labels-preview` di dalam AppLayout | Sesuai SPA + precedent `BookImportPreviewPage`; refresh-safe |
| D2 | **SSOT tetap `generateLabelsHtml`**; tambah `generateLabelPages` (murni) di `label.service` | Layout satu; preview & print mustahil divergen |
| D3 | Konten ditampilkan via **`<iframe srcdoc>`** (CSP-aman tanpa perubahan), bukan PDF/capture/window ke-2 | Tanpa dependency baru |
| D4 | **Tombol Cetak memanggil `printing:bookLabels` yang ada** — tidak ada jalur print baru | Perubahan arsitektur print = nol |
| D5 | **Pagination di main** (pageSize dari `LABEL_PRINT_CONFIG`), renderer menerima `pages[]` | Renderer tidak tahu konstanta layout |
| D6 | Scaling = iframe fixed 794×1123 px + `transform: scale`; default fit-to-width; 100% = A4 asli | Nyaman di semua monitor, presisi saat perlu |
| D7 | Data preview = **refetch by `bookId`** (buku + copies + settings) | URL-addressable, refresh-safe |

---

## Risiko

| # | Risiko | Dampak | Mitigasi |
|---|--------|--------|----------|
| R1 | **CSP / srcdoc** — jika asumsi frame-src tidak berlaku ternyata berbeda di versi Electron | Preview blank | Sudah diverifikasi perilaku Chromium (srcdoc = bagian parent doc; hanya `<style>` inline yang dipakai → diizinkan `style-src 'unsafe-inline'`). **Wajib smoke test** saat implementasi. Fallback: tampilkan HTML dalam iframe `src="blob:"` + izinkan `frame-src blob:` (perubahan CSP kecil) — bukan diubah default. |
| R2 | **Paritas pagination preview↔print** — asumsi Chromium pecah tepat 12/halaman (tinggi label tetap + `page-break-inside:avoid`) | Halaman preview vs cetak bergeser bila layout berubah | `pageSize` diturunkan dari `LABEL_PRINT_CONFIG` (bukan hardcode 12); verifikasi fisik printer target (sekali). Printer dengan area non-cetak besar bisa menggeser isi — uji fisik wajib (sudah ada di `LABEL_LAYOUT_FINAL_DESIGN.md` §8). |
| R3 | **Volume data besar** — ratusan eksemplar → banyak halaman | Fetch/pemrosesan lambat | Satu IPC mengembalikan `pages[]` sekali; hanya iframe halaman aktif di-mount; SVG barcode kecil (~KB). Tidak ada masalah praktis hingga ribuan eksemplar. |
| R4 | **Font tidak sama** bila jalur preview & print memakai engine berbeda | WYSIWYG gagal | Preview (renderer Chromium) dan print (hidden window Chromium) memakai **engine yang sama** dan font Windows yang sama (Arial/Consolas) → identik. |
| R5 | **Error print "cancelled" masih jadi alert** (debt W2 audit lama) | UX kecil | Di luar scope WO ini; dicatat, bisa ditangani bersamaan jika PO mau. |

---

## Technical Debt

**Baru (akibat WO ini):**
- TD-P1: **Kontrak paritas halaman** antara slicing preview dan pagination otomatis Chromium bersifat implisit (12/halaman). Dikendalikan satu sumber (`LABEL_PRINT_CONFIG`), tapi tidak ada test otomatis yang membuktikan print == preview. → Tambahkan smoke yang membandingkan halaman preview vs `printToPDF` render di masa depan (opsional).
- TD-P2: Duplikasi kecil pembuatan `BookLabelData` (BookDetail vs LabelPreviewPage) — dihilangkan dengan helper `buildBookLabelData` (item 10 §Q7).

**Carry-over (tidak diperbaiki WO ini, dari `LABEL_PRINT_ARCHITECTURE_AUDIT.md`):**
- TD-1: Template label = string HTML hardcoded di service (tanpa template engine).
- TD-2: A4/ukuran kertas hardcoded; `Setting.reportPaperSize` tidak dikonsumsi.
- TD-3: Receipt path (`generateReceiptHtml`) tidak di-escape & terpisah dari label service.
- TD-4: `printHtml` tanpa timeout/cleanup bila load hang.
- TD-5: Cancel print dialog → alert error yang membingungkan (W2).

Semua TD di atas **tidak menghalangi** WO preview dan tidak perlu diselesaikan lebih dulu.

---

## Keputusan Arsitektur yang Direkomendasikan (untuk Approval PO)

1. **Terima Pendekatan A** (halaman React `/books/:id/labels-preview`).
2. **Terima konsep SSOT ganda-titik-panggil:** `generateLabelsHtml` untuk print (eksisting) + `generateLabelPages` untuk preview — keduanya satu fungsi dasar di `label.service`.
3. **Terima channel IPC baru read-only** `printing:labelPages` → `print.getLabelPages(data) → { pages: string[] }`.
4. **Tombol Cetak tetap memakai `printing:bookLabels`** yang sudah ada — nol perubahan arsitektur print.
5. **Terima iframe `srcdoc`** sebagai media tampil + `transform: scale` untuk scaling + navigasi per-halaman (pageSize = 12, dari konfigurasi).
6. **Tidak** menambah dependency, **tidak** mengubah CSP, **tidak** mengubah pipeline print.

**Status: AUDIT COMPLETE — READY. Implementasi TIDAK dimulai sampai mendapat approval Product Owner.**
