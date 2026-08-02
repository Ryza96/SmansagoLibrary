# LABEL_PREVIEW_IMPLEMENTATION_PLAN.md — Design Implementation

**Tanggal:** 01 Agustus 2026
**Mode:** DESIGN IMPLEMENTATION — dokumen perencanaan. **BELUM mengubah source code, BELUM commit, BELUM staging.**
**Basis:** Keputusan PO final + `LABEL_PREVIEW_ARCHITECTURE.md` (disetujui).

---

## Ringkasan Keputusan PO yang Mengikat

| Keputusan | Status |
|-----------|--------|
| Preview = halaman React baru (`/books/:id/labels-preview`) | ✔ |
| Kertas A4, 12 label (3×4) | ✔ |
| `generateLabelsHtml` tetap Single Source of Truth | ✔ |
| Tombol Cetak memakai channel `printing:bookLabels` existing | ✔ |
| Multi-halaman bila label > 12 | ✔ |
| **TANPA iframe** | ✘ dilarang |
| **TANPA BrowserWindow tambahan** | ✘ dilarang |
| **TANPA generator HTML kedua** | ✘ dilarang |
| **TANPA layout React yang meniru HTML print** | ✘ dilarang |

Akibat larangan di atas, HTML preview **harus** dirender langsung di DOM React (tanpa iframe/window). Ini menuntut satu penyesuaian teknis: HTML yang ditampilkan harus berupa **fragment embeddable** (bukan dokumen penuh `<html>/<head>/<body>`), karena menyuntikkan dokumen penuh ke dalam SPA via `dangerouslySetInnerHTML` akan membuat CSS `html/body { display:flex; padding:6mm }` bocor ke seluruh aplikasi dan merusak layout AppLayout. Penyesuaian dilakukan **di dalam `generateLabelsHtml` (fungsi yang sama, mode output opsional)** — bukan generator kedua, bukan duplikasi layout.

---

## 1. Daftar File yang Akan DIBUAT

| # | File | Isi |
|---|------|-----|
| 1 | `src/pages/LabelPreviewPage.tsx` | Halaman preview: fetch buku + eksemplar + settings, build `BookLabelData`, panggil `api.print.getLabelPages`, render toolbar (paging/zoom/Cetak/Batal), render `<LabelSheet>`, state loading/error/empty |
| 2 | `src/components/labels/LabelSheet.tsx` | Komponen penampil satu halaman A4: `dangerouslySetInnerHTML` dari fragment + wrapper `transform: scale` untuk zoom/fit. **TIDAK ada iframe, TIDAK ada layout label** — murni wadah tampil |
| 3 | *(baru, opsional)* `src/utils/labelPreview.ts` | Helper renderer `buildBookLabelData(book, copies, settings)` + `computeSheetScale(containerWidth, zoom)` — menyimpan data-building di satu tempat |

## 2. Daftar File yang Akan DIUBAH

| # | File | Perubahan |
|---|------|-----------|
| 1 | `src/main/services/label.service.ts` | Refactor internal: ekstrak CSS sel label sebagai konstanta bersama (`LABEL_CELL_CSS`) + builder sel tetap `labelItemHtml`; `generateLabelsHtml(data, opts?: { embeddable?: boolean })`; **tambah** fungsi murni `generateLabelPages(data): string[]`. Output print (default) **byte-identik** dengan sekarang |
| 2 | `electron/main/services/print.service.ts` | Tambah method read-only `getLabelPages(data): { pages: string[] }` — delegasi ke `generateLabelPages`, **tanpa** window, tanpa side-effect |
| 3 | `electron/ipc/print.ipc.ts` | Tambah handler `printing:labelPages` |
| 4 | `electron/preload/print.preload.ts` | Tambah `getLabelPages(data)` |
| 5 | `src/renderer/env.d.ts` | Tambah tipe `print.getLabelPages(input): Promise<{ pages: string[] }>` |
| 6 | `src/utils/navigation.ts` | Tambah `ROUTES.BOOK_LABEL_PREVIEW = '/books/:id/labels-preview'` + helper `bookLabelPreviewPath(id)` |
| 7 | `src/routes/index.tsx` | Tambah route `books/:id/labels-preview` → `LabelPreviewPage` |
| 8 | `src/components/books/BookDetail.tsx` | `handlePrintLabels` → `navigate(bookLabelPreviewPath(book.id))` (tidak lagi cetak langsung); tombol tetap disabled bila 0 eksemplar |
| 9 | `src/utils/labels.ts` | Tambah blok `LABELS.LABEL_PREVIEW` (judul halaman, tombol Cetak/Batal/Kembali, indikator halaman, label zoom, empty/error) |

**TIDAK diubah:** `printHtml`, `printing:bookLabels`, `printBookLabels`, `barcode.service`, DTO, `bootstrap.ts`, schema/DB, dependency, CSP.

---

## 3. IPC Baru yang Diperlukan

**Satu channel baru, read-only** (murni menghasilkan HTML, tidak mencetak):

| Channel | Arah | Input | Output |
|---------|------|-------|--------|
| `printing:labelPages` | invoke | `BookLabelData` | `{ pages: string[] }` |

Lapisan (pola sama seperti `printing:bookLabels`):
- Preload: `print.getLabelPages = (data) => ipcRenderer.invoke('printing:labelPages', data)`
- IPC: `ipcMain.handle('printing:labelPages', (_e, data) => printService.getLabelPages(data))`
- Service: `getLabelPages(data) { return { pages: generateLabelPages(data) } }`

`printing:labelPages` **tidak** membuka window, **tidak** memanggil `webContents.print` — tidak mungkin memicu dialog printer.

---

## 4. Perubahan pada Routing

```
ROUTES.BOOK_LABEL_PREVIEW = '/books/:id/labels-preview'
bookLabelPreviewPath(id)   = `/books/${id}/labels-preview`
```

`src/routes/index.tsx` — tambahkan di dalam `children` AppLayout, sejajar route buku:

```tsx
{ path: 'books/:id/labels-preview', element: <LabelPreviewPage /> }
```

- Berada di dalam AppLayout → back-button + chrome konsisten (precedent: `BookImportPreviewPage`).
- URL addressable & refresh-safe: preview membaca `:id`, refetch data sendiri.
- Prioritas route: tidak konflik dengan `books/:id` (path lebih panjang menang di react-router).

---

## 5. Perubahan pada BookDetail

Saat ini (`BookDetail.tsx:79-96`):
```ts
async function handlePrintLabels() {
  const settings = await window.electronAPI.settings.get()
  await window.electronAPI.print.bookLabels({ ... })   // → dialog printer langsung
}
```

Menjadi:
```ts
function handlePrintLabels() {
  navigate(bookLabelPreviewPath(book.id))   // → halaman preview
}
```

- `BookDetail` **tidak lagi** membangun `BookLabelData` dan tidak lagi mencetak. Data & cetak pindah ke `LabelPreviewPage`.
- Tombol "Cetak Label" (baris 159-168) tetap sama tampilan & kondisinya (disabled bila `copies.length === 0`).
- Tidak ada logika baru di `BookDetail` — perubahan minimal (hapus blok IPC, ganti dengan navigasi).

---

## 6. Bagaimana HTML Preview Dirender TANPA iframe

### 6a. Bentuk HTML yang ditampilkan — fragment embeddable (dari `generateLabelsHtml`, mode embeddable)

Larangan iframe memaksa render via `dangerouslySetInnerHTML`. Untuk aman, konten yang ditampilkan **bukan dokumen penuh**, melainkan fragment dengan wadah grid sendiri dan CSS yang di-*scope* ke class `label-sheet`:

```html
<style>
  .label-sheet { width: 210mm; height: 297mm; padding: 6mm;
                 display: flex; flex-wrap: wrap; align-items: stretch; }
  .label { width: 66mm; height: 71.25mm; display: flex; flex-direction: column; ... }
  .label-library { ... } .label-barcode { ... } .label-inventory { ... }
  .label-title { ... } .label-shelf { ... }
</style>
<div class="label-sheet">
  <div class="label"> ... </div> × 12
</div>
```

- Semua selector di-scope ke `label-sheet`/`label-*` → **tidak ada kebocoran** ke CSS AppLayout (tidak seperti `body{display:flex}`).
- Geometri (`210mm`, `6mm`, `66mm`, `71.25mm`, `37mm`) **diturunkan dari `LABEL_PRINT_CONFIG`** yang sama dengan mode print → bukan angka duplikat.
- Tidak ada `<script>` → aman di bawah CSP `script-src 'self'`; inline `<style>` sudah diizinkan `style-src 'unsafe-inline'`.

### 6b. Refactor `generateLabelsHtml` — tetap SATU generator

Agar tidak ada "generator kedua", `generateLabelsHtml` diberi **parameter opsional** (default = output print saat ini, byte-identik):

```ts
generateLabelsHtml(data: BookLabelData, opts?: { embeddable?: boolean }): string
```

- `embeddable` tidak diset / `false` → dokumen penuh (dipakai `printBookLabels` — **tidak berubah**).
- `embeddable: true` → fragment di atas (`label-sheet` + CSS scoped + sel label).

Struktur internal direfaktor agar CSS sel **didefinisikan sekali** dan dipakai dua mode:

```
LABEL_CELL_CSS          ← konstanta: .label, .label-library, .label-barcode, ... (SATU definisi)
labelItemHtml(...)      ← builder sel (SATU definisi)
generateLabelsHtml(data, opts)
   ├─ print    : doctype + @page + html/body layout + LABEL_CELL_CSS + body(label cells)
   └─ embeddable: <style>.label-sheet{...} + LABEL_CELL_CSS</style> + <div class="label-sheet">(label cells)
```

Sel label (`labelItemHtml`) & CSS sel **benar-benar identik** di kedua mode — hanya bungkus luar yang berbeda (dokumen vs fragment).

### 6c. Render di React

```tsx
<div className="sheet-scaler" style={{ transform: `scale(${s})`, transformOrigin: 'top left' }}>
  <div className="sheet-frame" dangerouslySetInnerHTML={{ __html: pages[currentPage] }} />
</div>
```

- `sheet-frame`: wadah berukuran A4 (794×1123 px pada 96 dpi) — ukuran dikekang CSS agar sheet tetap pas.
- `sheet-scaler`: `transform: scale(s)` mengecilkan A4 agar muat monitor; `s` dihitung dari lebar kontainer (fit) atau preset zoom.
- React hanya **menampilkan** string HTML dari main — **tidak ada** satu pun elemen layout label ditulis ulang di renderer.

---

## 7. Bagaimana Paging Bekerja

- `pageSize = LABEL_PRINT_CONFIG.columns × rows = 3 × 4 = 12` — dihitung di **main** (`generateLabelPages`), renderer **tidak tahu** konstanta ini.
- `generateLabelPages(data)`:
  ```ts
  const pageSize = LABEL_PRINT_CONFIG.columns * LABEL_PRINT_CONFIG.rows
  for (let k = 0; k < items.length; k += pageSize)
    pages.push(generateLabelsHtml({ ...data, items: items.slice(k, k + pageSize) }, { embeddable: true }))
  ```
- `LabelPreviewPage`: `pages: string[]` dari satu panggilan IPC; state `currentPage`; toolbar `‹ Halaman 2 dari 3 ›`; prev/next disabled di ujung; indikator "18 label · 2 halaman".
- **Satu sheet di-mount** (`pages[currentPage]`) — efisien untuk set besar (mis. 500 eksemplar → 42 halaman).
- Pindah halaman = ganti string `srcDoc`-ekivalen (`dangerouslySetInnerHTML`) → instan, tanpa IPC ulang.
- Konsistensi dengan print: print (channel lama) me-render semua label dalam satu dokumen dan Chromium memecah tepat 12/halaman (tinggi sel tetap 71.25mm × 4 baris = 285mm = A4 − 12mm padding + `page-break-inside: avoid`). Slice preview memakai `pageSize` dari konfigurasi yang sama → halaman k preview = halaman k print.

---

## 8. Bagaimana Tombol Cetak Bekerja

```ts
async function handlePrint() {
  await window.electronAPI.print.bookLabels(fullData)   // channel EKSISTING — tidak diubah
}
```

- `fullData` = `BookLabelData` **lengkap** (semua eksemplar, bukan halaman aktif) — sudah di-build preview untuk `getLabelPages`.
- `printBookLabels(fullData)` → `generateLabelsHtml(fullData)` (**default/print mode**) → `printHtml` → dialog printer Windows (persis alur lama).
- Karena print & preview sama-sama dibangun dari `generateLabelsHtml` + konstanta yang sama, hasil cetak identik dengan yang dilihat di preview (WYSIWYG).
- State `printing` untuk men-disable tombol & mencegah double-click; `catch → alert` seperti perilaku hari ini (termasuk kasus user membatalkan dialog — perilaku existing dipertahankan).
- Tombol "Batal"/"Kembali" → `navigate(-1)` tanpa efek apa pun (tidak ada window dibuka, tidak ada print).

---

## 9. Mengapa Tidak Terjadi Duplikasi Source of Truth

1. **Satu fungsi generator:** `generateLabelsHtml(data, opts?)` — satu-satunya fungsi yang membangun HTML label. Preview memanggilnya dalam mode `embeddable`; print memanggilnya dalam mode default.
2. **Satu builder sel:** `labelItemHtml` — markup tiap label (barcode SVG, inventory, title, shelf, library) didefinisikan sekali.
3. **Satu set konstanta:** `LABEL_PRINT_CONFIG` + `LABEL_CELL_CSS` — semua angka layout (210mm, 6mm, 66×71.25mm, 37mm, 12/halaman) & semua CSS sel hidup di `label.service`, dipakai kedua mode.
4. **Renderer tanpa layout:** `LabelSheet` hanya `dangerouslySetInnerHTML` + scaling presentasional. Renderer tidak pernah menulis `<div class="label">`, tidak pernah menghitung mm, tidak pernah tahu angka 12. Jika layout berubah di `label.service`, preview DAN print berubah bersamaan — mustahil divergen.
5. **Mode `embeddable` ≠ generator kedua:** ia adalah *varian output* dari fungsi yang sama (parameter opsional), mirip "format" bukan "implementasi kedua". Output print default dibiarkan byte-identik sehingga jalur print yang sudah tervalidasi tidak tersentuh.

---

## 10. Risiko Implementasi

| # | Risiko | Dampak | Mitigasi |
|---|--------|--------|----------|
| R1 | **Bocor CSS global** bila fragment tidak di-scope benar | Layout AppLayout rusak (sheet besar melebihi, dsb.) | Wajib scope semua selector di `label-sheet`/`label-*`; TIDAK ada selector `html/body` di fragment; smoke memeriksa fragment bebas `<html>`/`body{`. Render di route preview terpisah, AppLayout tetap utuh |
| R2 | **XSS / injeksi** lewat `dangerouslySetInnerHTML` | Skrip/tag asing dari data masuk DOM | Selalu `escapeHtml` untuk semua field teks (sudah ada di `labelItemHtml`). Nilai barcode = `inventoryNumber` (alnum, diverifikasi). Catatan: W1 audit lama (barcode tidak di-escape sebelum `bwip-js`) — tetap low karena nilai terkontrol; bisa ditutup dengan validasi charset barcode di WO terpisah |
| R3 | **Paritas print↔preview** (asumsi 12/halaman) | Halaman preview bergeser dari cetak bila layout berubah | `pageSize` & geometri diturunkan dari `LABEL_PRINT_CONFIG` yang sama; uji fisik printer target (sesuai `LABEL_LAYOUT_FINAL_DESIGN.md` §8) |
| R4 | **Konversi mm→px di layar** (794×1123) | Zoom 100% tidak pas "A4 asli" bila dpi browser beda | Skala dihitung dari lebar sheet CSS (`getBoundingClientRect` sheet 794px) → `s = kontainer / 794`; preset zoom dikalikan relatif fit — konsisten lintas monitor |
| R5 | **Kinerja set besar** (banyak halaman) | Paging lambat / DOM berat | `pages[]` di-fetch sekali; hanya 1 sheet di-mount; SVG barcode ~KB per label |
| R6 | **Channel baru tidak terdaftar** (lupa preload/ipc/env.d.ts) | Runtime error `getLabelPages is not a function` | Checklist layer per §3; verifikasi lint (tsc memvalidasi `env.d.ts` vs pemakaian) |
| R7 | **Regresi jalur print** akibat refactor `generateLabelsHtml` | Output print berubah | Mode default byte-identik; smoke print HTML lama tetap 13/13 harus hijau; `npm run lint` + `npm run build` wajib |
| R8 | **Kembali dari preview kehilangan state** (refresh) | Data kosong | Preview refetch by `:id` (URL-addressable) → refresh-safe; loading/error state disediakan |

**Catatan perilaku existing yang dipertahankan:** membatalkan dialog printer tetap memicu `alert('Gagal mencetak')` (debt W2 audit) — di luar scope WO ini.

---

## Urutan Implementasi yang Diusulkan (setelah approval)

1. Refactor `label.service` (CSS bersama + mode embeddable) — jalankan smoke print HTML lama (harus tetap hijau) + smoke baru fragment/paging.
2. `PrintService.getLabelPages` → IPC → preload → env.d.ts.
3. Routing + navigation helper.
4. `LabelPreviewPage` + `LabelSheet` + labels.ts.
5. Ubah `BookDetail.handlePrintLabels` → navigate.
6. Validasi: `npm run lint`, `npm run build`, smoke script (page count 1/1/2/3 untuk 5/12/18/30 label, fragment tanpa `<html>`, CSS scoped, WYSIWYG bytes), uji manual alur Book Detail → Preview → Cetak → dialog printer.

**Status: DESIGN IMPLEMENTATION COMPLETE — BERHENTI. Menunggu approval Product Owner untuk memulai implementasi.**
