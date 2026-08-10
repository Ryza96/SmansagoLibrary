# WORK ORDER — Label Visual Redesign (v2): Header Logo + Author + Footer Navy

## Ringkasan
Redesain visual label buku (3 kolom × 4 baris, A4, 66×71.25mm per label) dari
tampilan lama (barcode → inventory → judul → rak, layout `space-evenly`) menjadi
desain v2: **header logo+identitas** (logo data URI / fallback monogram, libraryName,
schoolName) → **barcode** → **inventory** → **divider** → **baris judul+penulis**
(ikon buku navy) → **footer navy** (ikon pin + lokasi rak).

## Scope
- **4 file dimodifikasi:** `src/main/services/label.service.ts`, `electron/main/services/print.service.ts`, `src/pages/LabelPreviewPage.tsx`, `src/shared/dto/print.ts`.
- **Harness smoke (baru, untracked):** `label_visual_smoke/main.cjs` (struktur HTML + PDF MediaBox), `label_visual_smoke/geometry.cjs` (pengukuran bounding-box render nyata), `label_visual_smoke/capture.cjs` (PNG capture, helper).
- **TIDAK diubah:** schema/migration (`prisma migrate diff` = "This is an empty migration."), IPC/preload/env.d.ts/bootstrap (channel `printing:bookLabels` **reused**), `LABEL_PRINT_CONFIG` (byte-identical terhadap HEAD), `BorrowCardService`/`BorrowCardData`, template kartu peminjaman, layout kartu, DTO `BookLabelData` non-breaking (author/schoolName/logo opsional).

## Desain & Keputusan Teknis

### 1. `label.service.ts` — template v2
- **Header label** (`labelHeaderHtml`): logo bulat 7mm (border navy) + libraryName (12px 800 navy uppercase, ellipsis) + schoolName (7.5px slate, ellipsis), dibatasi `border-bottom: 0.3mm solid #12235a`.
- **Logo** (`labelLogoHtml`): bila `data.logo` (data URI dari main) → `<img class="label-logo-img">`; bila kosong → fallback `generateLogoMonogramSvg(schoolName, libraryName)` yang **sudah diekspor dari `borrow-card.service.ts`** (reuse, bukan duplikasi). Ini menjamin ruang logo tidak pernah kosong.
- **Baris judul** (`label-book`): ikon buku SVG navy 4.5mm (konstanta `BOOK_ICON_SVG` self-contained) + `label-title` (10.5px 700, clamp 2 baris) + `label-author` (8.5px italic slate, ellipsis) — author opsional (`item.author`), baris di-skip bila kosong.
- **Divider**: `0.3mm` abu (`#cbd5e1`) antara inventory dan blok judul.
- **Footer** (`label-footer`): bar navy (`#12235a`), `border-radius 2mm`, padding `0.8mm 1.5mm`, teks putih 8.5px, ikon pin putih 3mm (`PIN_ICON_SVG`), `-webkit-print-color-adjust: exact` (warna navy ikut tercetak).
- Layout `.label` dari `justify-content: space-evenly` → `flex-start`; `.label-book { flex: 1 }` mengisi sisa ruang; `.label-footer { margin-top: auto }` menempel dasar label.
- **`LABEL_PRINT_CONFIG` TIDAK berubah** (A4 210×297, margin 6mm, 3×4, barcode 37mm) — ukuran label, kapasitas 12/halaman, dan barcodeHeight terjaga.

### 2. `print.service.ts` — enrich data label (SSOT logo & identitas)
- Method baru `enrichLabelData(data)` (private, async): membaca `settingService.get()` → `resolveAssetPath(settings.logoPath, this.assetRoot)` → `readFileAsDataUri(...)` → `logo: string` (data URI) atau `''` bila gagal. `resolveAssetPath` tetap **SATU-SATUNYA pembaca logoPath** (RFC §12), pola identik `buildBorrowCardHtml`.
- `libraryName`: `data.libraryName ?? settings.libraryName` (nilai renderer dipertahankan bila diisi, selebihnya Settings); `schoolName`: dari Settings.
- `getLabelPreviewHtml` dan `printBookLabels` kini **async** dan memanggil `enrichLabelData` — renderer tetap mengirim `items`/`author`/`bookTitle`; identitas & logo datang dari main (konsisten WO-2/Dashboard: renderer tidak menurunkan data logo).

### 3. `LabelPreviewPage.tsx` — kirim author
- `author = (book.authors ?? []).map(a => a.name).join(', ')` diteruskan per item. Sisa alur (fetch book+copies+settings, preview, print) tidak berubah.

### 4. `dto/print.ts` — aditif non-breaking
- `BookLabelItemData.author?: string`, `BookLabelData.schoolName?: string`, `BookLabelData.logo?: string` — semuanya opsional; kontrak lama tetap valid.

## Validation
- **lint PASS** (tsc node+web).
- **build PASS**: main 2,072.69 kB · preload 11.64 kB · renderer 1,234.38 kB (`index-ByC-EywR.js`).
- **`prisma migrate diff`** = "This is an empty migration." (schema tidak disentuh).
- **Smoke render nyata** `label_visual_smoke/main.cjs` **12/12 PASS** (Electron + `generateLabelsHtml` ASLI hasil compile): 1 halaman 12 label, logo kosong → fallback monogram (tanpa `data:image`), header berisi libraryName+schoolName, author skip 11/12, footer 12× dengan rak, tanpa `undefined`/`NaN`, barcode+inventory ter-render, `@page A4`, `.label` 66×71.25mm, PDF MediaBox A4 (594.960×841.920pt = 209.889×297.011mm) 1 halaman, `PDF_BYTES=188325`.
- **Geometry render nyata** `label_visual_smoke/geometry.cjs` **8/8 PASS**: 12 label dalam grid A4 (793.7×1122.5px), 66.00×71.25mm, tanpa tumpang tindih, urutan zona vertikal benar (header→barcode→inventory→divider→book→footer), footer baris terakhir di dalam label, barcode 37.00mm, konten tidak terpotong.
- **Regression borrow card** `borrow_card_print_fix_smoke/main.cjs` (compiled chain lengkap) **17/17 PASS**: `printBorrowCard` pageSize A6 105000×148000 mikron, margins none, printBackground, landscape false, scaleFactor 1, silent false → dialog cetak OS; **label buku TANPA pageSize (A4) & TANPA resolveA6DeviceName** (scope kartu saja tidak bocor); preview HTML kartu 12060 chars; PDF A6 MediaBox regression (298.080×420.000pt).
- **Scope check git**: 4 file modified + harness untracked; `LABEL_PRINT_CONFIG` **byte-identical** terhadap HEAD (dibuktikan `git diff` tanpa `+/-` pada blok config).

## Status
**DONE — READY review PO.** Belum commit/push (menunggu instruksi). File untracked lain (WO lain) TIDAK diikutkan.
