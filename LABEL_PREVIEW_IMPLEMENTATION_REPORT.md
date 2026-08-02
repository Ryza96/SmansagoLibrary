# LABEL_PREVIEW_IMPLEMENTATION_REPORT.md

Work Order: **Label Print Preview**
Mode: IMPLEMENTATION
Date: 2026-08-02
Basis: `LABEL_PRINT_ARCHITECTURE_AUDIT.md` + `LABEL_PREVIEW_IMPLEMENTATION_PLAN.md` (direvisi oleh PO, lihat §1).

---

## 1. Ringkasan Implementasi

Fitur **Pratinjau Label** untuk alur cetak label buku. Sesuai revisi PO:

- **TIDAK** ada `generateLabelPages()`, **TIDAK** ada `pages: string[]`, **TIDAK** ada paging di main-process.
- Main menghasilkan **SATU dokumen HTML penuh** lewat `generateLabelsHtml(data)` — HTML yang sama persis dipakai untuk **pratinjau** dan **cetak**.
- Pratinjau dirender **tanpa iframe** di dalam halaman React (inject HTML via `dangerouslySetInnerHTML`); scroll alami browser saat HTML melebihi satu halaman A4 (AppLayout `<main>` adalah `overflow-y-auto`).
- Tombol **"Cetak"** tetap memakai channel eksisting **`printing:bookLabels`** — perubahan arsitektur print = nol.
- Alur baru: Buku → "Cetak Label" → halaman `/books/:id/labels-preview` → pratinjau + tombol Cetak/Batal.

### 1.1 Prasyarat arsitektur — refactor layout ke `.label-page`

HTML dari `generateLabelsHtml` semula meletakkan layout grid pada elemen `<body>` (`padding: 6mm; display: flex; flex-wrap: wrap; ...`). Injeksi langsung dokumen penuh ke dalam React memaksa browser membuang elemen `<body>` (fragment parse pada konteks `div`) sehingga grid tidak ter-render. Solusi: **pindahkan seluruh CSS layout dari `body` ke wrapper `<div class="label-page">`** di dalam `<body>`.

- Cetak: print window memuat `body > div.label-page` → layout identik dengan sebelumnya (karena CSS, ukuran, dan struktur label tidak berubah).
- Pratinjau: React meng-inject HTML yang sama; parser membuang tag `<body>`, tetapi `div.label-page` (dengan seluruh layout) dan blok `<style>` ter-render normal. Selektor di `<style>` semuanya ter-scope `.label-*`, sehingga tidak bocor ke styling SPA.
- @page `size: A4; margin: 0` tetap dipertahankan untuk output cetak.

## 2. File yang Diubah

| File | Perubahan |
|------|-----------|
| `src/main/services/label.service.ts` | Layout grid dipindah dari `<body>` ke wrapper `<div class="label-page">` (CSS `.label-page`: `width:210mm`, `min-height:297mm`, `padding:6mm`, `display:flex; flex-wrap:wrap; align-items:stretch`). `<body>` kini hanya `<div class="label-page">...`. HTML tetap single-generator untuk pratinjau & cetak |
| `electron/main/services/print.service.ts` | Method baru read-only **`getLabelPreviewHtml(data: BookLabelData): string`** → `return generateLabelsHtml(data)`. `printBookLabels`/`printHtml` TIDAK diubah |
| `electron/ipc/print.ipc.ts` | Handler baru **`printing:labelPreview`** → `printService.getLabelPreviewHtml(data)`. `printing:bookLabels` tidak diubah |
| `electron/preload/print.preload.ts` | `print.getLabelPreviewHtml(data)` → `ipcRenderer.invoke('printing:labelPreview', data)`. `bookLabels` tidak diubah |
| `src/renderer/env.d.ts` | Tipe `print.getLabelPreviewHtml(input: BookLabelData): Promise<string>` (import `src/shared/dto/print`) |
| `src/utils/navigation.ts` | `ROUTES.BOOK_LABEL_PREVIEW = '/books/:id/labels-preview'` + helper `bookLabelPreviewPath(id)` |
| `src/routes/index.tsx` | Route `books/:id/labels-preview` → `LabelPreviewPage` |
| `src/pages/LabelPreviewPage.tsx` | **BARU.** Ambil `books.findById` + `bookCopies.findByBookId` + `settings.get()` (Promise.all) → bangun `BookLabelData` (pola sama seperti BookDetail lama: `barcode = copy.barcode ?? copy.inventoryNumber`, `shelfLocation ?? ''`) → `getLabelPreviewHtml(data)` → render via `dangerouslySetInnerHTML` pada div `preview-sheet ... overflow-auto`. Tombol **Cetak** → `print.bookLabels(labelData)` (data yang sama); tombol kembali → `navigate(-1)`; state loading/error/printing |
| `src/utils/labels.ts` | Blok `LABELS.LABEL_PREVIEW` baru: `TITLE`, `PRINT`, `PRINTING`, `LOADING`, `NO_DATA`, `BOOK_NOT_FOUND`, `ERROR` |
| `src/components/books/BookDetail.tsx` | `handlePrintLabels()` kini `navigate(bookLabelPreviewPath(book.id))` (tidak lagi cetak langsung); tambah `useNavigate`. Tombol tetap disabled bila 0 eksemplar |

**TIDAK diubah:** `printHtml`, `printing:bookLabels`, `printBookLabels`, `barcode.service`, DTO, `bootstrap.ts`, schema/DB, dependency, CSP. Perubahan working tree lain yang tidak terkait (`BooksPage.tsx`, `book.preload.ts`, label `DELETE_ERROR`) berasal dari work order penghapusan buku — bukan bagian WO ini.

## 3. Keputusan Implementasi

1. **Single HTML shared** — pratinjau dan cetak memakai output `generateLabelsHtml` yang identik; tidak ada generator kedua di main maupun renderer.
2. **Tanpa iframe / BrowserWindow** — HTML di-inject langsung di React. Ini hanya aman karena layout sudah dipindah dari `<body>` ke `div.label-page`; `<style>` ter-scope `.label-*`.
3. **Natural scrolling** — tidak ada toolbar halaman; kontainer pratinjau `overflow-auto` memanfaatkan scroll `<main>` yang sudah ada.
4. **Cetak via channel lama** — tombol Cetak memanggil `print.bookLabels(data)` yang persis seperti perilaku sebelum WO; dialog printer Windows tidak berubah.

## 4. Validasi

| Tes | Hasil |
|-----|-------|
| `npm run lint` | PASS (exit 0) |
| `npm run build` (electron-vite) | PASS — main 1,754.78 kB · preload 7.15 kB · renderer 902.11 kB |
| Smoke HTML preview (`label_preview_smoke/smoke.cjs`, via `NODE_PATH` ke repo `node_modules`) | **20/20 PASS** — doctype; `@page A4 margin:0`; layout di `.label-page` (bukan `body`); flex+wrap+padding 6mm+width 210mm; label 66×71.25mm; 3 label render; SVG barcode; escaping library & title; library header; shelf; single `<style>`; body tanpa inline style; tanpa duplikasi `<html>` |
| Wired check (grep `print.bookLabels`/`printing:bookLabels`/`getLabelPreviewHtml`/`printing:labelPreview`) | `print.bookLabels` hanya dipanggil dari `LabelPreviewPage.tsx:69`; `printing:bookLabels` handler eksisting tetap ada |

## 5. Risiko & Technical Debt

1. **Injeksi HTML penuh via `dangerouslySetInnerHTML`** — aman karena HTML dihasilkan main (data barcode/teks di-escape `escapeHtml` di `label.service.ts`), bukan input bebas renderer.
2. **Elemen `<body>` dari HTML generator dibuang oleh parser saat injeksi React** — sudah diantisipasi dengan memindahkan layout ke `div.label-page`; perilaku cetak tidak berubah.
3. **Smoke test tinggal di temp dir** (`%TEMP%\opencode\label_preview_smoke\`) — menguji versi ter-compile `label.service.ts`/`barcode.service.ts` via `NODE_PATH`. Bila ingin permanen, pindah ke `scripts/`.
4. **`.label-page` ber-width tetap 210mm** — pada jendela aplikasi yang lebih sempit, kontainer pratinjau menampilkan scrollbar horizontal; sesuai keputusan PO (natural scrolling, tanpa page toolbar).
5. **Belum ada commit** — perubahan ada di working tree bersama work order lain. Menunggu instruksi.

## 6. Kesimpulan

**READY.** Pratinjau label terimplementasi sesuai revisi PO: satu HTML shared (`getLabelPreviewHtml` ↔ `printBookLabels`), tanpa iframe/BrowserWindow/pages array, cetak tetap memakai `printing:bookLabels` eksisting. Validasi: lint PASS, build PASS, smoke HTML 20/20 PASS, wiring benar.
