# LABEL_PREVIEW_RUNTIME_VERIFICATION.md

Work Order: **Label Print Preview — Runtime Verification**
Mode: READ ONLY (QA Engineer / Frontend Runtime Auditor)
Date: 2026-08-02
Runtime target: **Electron 33.4.11 (Chromium ~130)** — mesin render yang sama dengan aplikasi produksi.
Sumber yang diverifikasi: `generateLabelsHtml()` di working tree (`src/main/services/label.service.ts`) + jalur render `dangerouslySetInnerHTML` (`src/pages/LabelPreviewPage.tsx:103`).

---

## 1. Tujuan

Memverifikasi **perilaku browser yang sebenarnya** (bukan code review) ketika HTML yang dihasilkan `generateLabelsHtml()` dirender melalui `dangerouslySetInnerHTML={{ __html: html }}`, pada 5 poin:

1. Apakah elemen `<style>` benar-benar masuk ke DOM saat LabelPreviewPage dibuka?
2. Apakah CSS label benar-benar aktif (dibuktikan dengan inspeksi DOM + computed style)?
3. Apakah browser membuang elemen `<html>`, `<head>`, `<body>`?
4. Apakah preview identik dengan HTML yang dipakai proses print?
5. Jika ada masalah, solusi paling sederhana (tanpa ubah arsitektur / generator kedua / iframe / BrowserWindow baru).

## 2. Metode Verifikasi

**Pendekatan:** pengukuran runtime pada Chromium sungguhan, bukan tebak-tebakan spek HTML.

1. `label.service.ts` + `barcode.service.ts` dikompilasi dari **source working tree** (via `tsc`) ke `%TEMP%\opencode\label_preview_runtime\`.
2. Data sampel dibangun **identik dengan shape yang dibuat `LabelPreviewPage`** (`libraryName`, `bookTitle`, `items` = `{barcode, inventoryNumber, shelfLocation}`, 12 eksemplar = 1 halaman penuh).
3. HTML dihasilkan **sekali** → `html` + checksum `sha1`. String yang **sama persis** dipakai untuk dua jendela:
   - **Window A (simulasi preview/SPA):** membuat `div.preview-sheet`, lalu `div.innerHTML = html`. Ini **persis** yang dilakukan React pada `dangerouslySetInnerHTML` (React DOM `setInnerHTML` → `node.innerHTML = __html`).
   - **Window B (simulasi print):** `loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))` — sama dengan `PrintService.printHtml` (`print.service.ts:147`).
4. Probing via `webContents.executeJavaScript`: struktur `childNodes`, `getComputedStyle()`, `getBoundingClientRect()`, `document.title`.
5. Screenshot via `webContents.capturePage()`.

Hasil mentah: `%TEMP%\opencode\label_preview_runtime\out\evidence.json` (semua angka di bawah berasal dari file ini).

## 3. Hasil Verifikasi per Poin

### Poin 1 — Apakah elemen `<style>` benar-benar masuk DOM? → **YA**

Inspeksi anak langsung dari kontainer `#sheet` setelah injeksi:

```
childTags  = [meta, title, style, div]
hasStyleElement = true
styleTextChars  = 1309   (blok CSS <style> dari generateLabelsHtml — lengkap)
```

Elemen `<style>` **ada di dalam DOM** sebagai anak kontainer yang sama dengan `.label-page`, bukan di `<head>` dokumen SPA.

### Poin 2 — Apakah CSS label benar-benar aktif? → **YA**

Bukti computed style (`getComputedStyle`) pada Chromium setelah injeksi:

| Properti | Nilai CSS (source) | Computed (px) | Bukti aktif |
|---|---|---|---|
| `.label-page` `display` | `flex` | `flex` | ✔ grid flex aktif |
| `.label-page` `flex-wrap` | `wrap` | `wrap` | ✔ |
| `.label-page` `padding` | `6mm` | `22.6772px` | ✔ 6mm dikonversi |
| `.label-page` `width` | `210mm` | `793.688px` | ✔ |
| `.label-page` `min-height` | `297mm` | `1122.52px` | ✔ |
| `.label` `width` | `66mm` | `249.438px` | ✔ |
| `.label` `height` | `71.25mm` | `269.281px` | ✔ |
| `.label` `display` / `flex-direction` | `flex` / `column` | `flex` / `column` | ✔ |
| `.label-barcode` `height` | `37mm` | `139.828px` | ✔ |
| `.label-barcode svg` `height` | `100%` | `139.828px` | ✔ SVG terisi |
| `.label-library` `font-size` | `10px` | `10px` | ✔ |
| `.label-inventory` `font-weight` | `700` | `700` | ✔ |
| `.label-title` `-webkit-line-clamp` | `2` | `2` | ✔ |

`getBoundingClientRect()` label pertama = **249.44 × 269.28 px** — konsisten dengan computed style. Bukti visual (screenshot) ada di §4. Ini **membuktikan** `<style>` yang disisipkan via `innerHTML` **benar-benar diproses dan diterapkan** oleh browser; bila CSS tidak aktif, `.label-page` akan ber-computed `display: block`, `padding: 0`, `width: auto`.

### Poin 3 — Apakah `<html>`, `<head>`, `<body>` dibuang? → **YA**

```
htmlDropped = true   (sheet.querySelectorAll('html').length === 0)
headDropped = true   (sheet.querySelectorAll('head').length === 0)
bodyDropped = true   (sheet.querySelectorAll('body').length === 0)
```

Di dalam kontainer hasil injeksi **tidak ada satupun** elemen `<html>/<head>/<body>` yang tercipta. Perilaku browser (fragment parsing):

- `<html>`, `<head>`, `<body>` **dibuang** sebagai elemen pembungkus;
- **kontennya diangkat (hoisted)** menjadi anak langsung kontainer → hasil anak kontainer: `[meta, title, style, div.label-page]`;
- `<body>` dokumen SPA tidak tersentuh; `document.title` **tidak berubah** oleh `<title>` yang di-hoist (terukur: tetap `"APLibrary - Pratinjau Label (simulasi SPA)"`);
- SVG dari barcode di-parse ke **SVG namespace** yang benar: `http://www.w3.org/2000/svg` (12/12 SVG), sehingga barcode benar-benar ter-render sebagai gambar vektor.

### Poin 4 — Apakah preview identik dengan HTML proses print? → **YA (byte-sama, render identik)**

**Jalur kode (verifikasi trace):**

| Jalur | Panggilan | Lokasi |
|---|---|---|
| Preview | `getLabelPreviewHtml(data)` → `return generateLabelsHtml(data)` | `electron/main/services/print.service.ts:14-16` |
| Print | `printBookLabels(data)` → `const html = generateLabelsHtml(data)` → `printHtml` | `electron/main/services/print.service.ts:18-21` |
| Renderer preview | `api.print.getLabelPreviewHtml(data)` → `dangerouslySetInnerHTML` | `src/pages/LabelPreviewPage.tsx:46, 103` |

**Kedua jalur memanggil fungsi yang sama dengan data yang sama.** Pada harness, string yang sama persis (`sha1 e1383c93e43b11ecb83f047e407fab7704693b4c`, length 128,655) digunakan untuk Window A (injeksi) dan Window B (data: URL print). Hasil render:

| Metrik | Preview (injeksi) | Print (data: URL) | Sama? |
|---|---|---|---|
| Label count | 12 | 12 | ✔ |
| SVG count | 12 | 12 | ✔ |
| `.label` rect (getBoundingClientRect) | 249.44 × 269.28 | 249.44 × 269.28 | ✔ |
| `.label-page` rect | 793.69 × 1122.52 | 793.69 × 1122.52 | ✔ |
| computed `.label-page` (display/padding/width) | flex / 22.6772px / 793.688px | flex / 22.6772px / 793.688px | ✔ |
| computed `.label` (width/height) | 249.438 / 269.281 | 249.438 / 269.281 | ✔ |
| computed `.label-barcode` height | 139.828px | 139.828px | ✔ |

Nuansa penting (hasil nyata, bukan asumsi): karena injeksi memakai fragment parsing, `innerHTML` kontainer preview **tidak** byte-identik dengan dokumen print mentah — perbedaannya hanya **tag pembungkus `<html>/<head>/<body>` yang dibuang** (Poin 3). Subtree `.label-page` dan blok `<style>` **identik**, dan geometri render terukur **identik** di kedua mode.

### Poin 5 — Apakah ada masalah? → **TIDAK ada masalah fungsional**

Semua poin PASS. Catatan minor (bukan kegagalan, tidak membutuhkan perubahan arsitektur):

1. **`<meta>` dan `<title>` ikut ter-hoist** menjadi elemen inert di dalam kontainer preview. Tidak berdampak: `<title>` tidak mengganti `document.title` (terverifikasi), `<meta>` tidak berfungsi di luar `<head>`. **Solusi paling sederhana:** biarkan (nol risiko); bila ingin bersih, hapus tag head-only dari string generator — tapi itu perubahan kode yang **tidak diperlukan**.
2. **Aturan `@page { size: A4; margin: 0 }` hanya berlaku pada media print** — pada preview layar diabaikan, persis sesuai fungsi. Tidak ada masalah.
3. **`.label-page` ber-width tetap 210mm** → pada jendela aplikasi yang lebih sempit dari ~794px, kontainer `preview-sheet` (yang `overflow-auto`) menampilkan scrollbar horizontal. Terukur di window 1000px: `clientWidth=934` = `scrollWidth=934` → **tanpa overflow**. Pada layar sempit ini adalah perilaku "natural scrolling" yang sudah disetujui PO, bukan bug.

## 4. Screenshot / Bukti

Screenshot diambil langsung dari Chromium via `webContents.capturePage()`:

| File | Isi |
|---|---|
| `%TEMP%\opencode\label_preview_runtime\out\preview.png` (32,510 B) | Window A — grid label 12 (3×4) ter-render di dalam kontainer `preview-sheet` putih dengan barcode SVG, judul, inventaris, rak |
| `%TEMP%\opencode\label_preview_runtime\out\print.png` (28,998 B) | Window B — dokumen print (data: URL) grid label 12 (3×4) identik |

(Catatan: gambar tidak dapat ditampilkan inline pada terminal auditor ini; namun ukuran file + seluruh angka computed/geometry di atas adalah bukti objektif bahwa konten ter-render. Ukuran non-trivial menandakan konten nyata, bukan halaman kosong.)

## 5. Kesimpulan

- `dangerouslySetInnerHTML` (= `element.innerHTML = html`) dengan output `generateLabelsHtml()` **bekerja benar** pada Chromium produksi: `<style>` masuk DOM **dan CSS aktif** (dibuktikan computed style + geometry), wrapper `<html>/<head>/<body>` dibuang sesuai perilaku fragment parsing dengan konten di-hoisted, dan preview **identik** dengan dokumen print (fungsi + string sama, render terukur sama).
- Keputusan desain "satu HTML untuk preview dan print" (refactor layout ke `div.label-page`) **terbukti valid di runtime** — preview menampilkan layout persis seperti cetakan tanpa iframe/BrowserWindow/generator kedua.
- Tidak ada masalah yang memerlukan perbaikan. Seluruh implementasi yang ada dapat dipertahankan apa adanya.

## 6. Status

# **PASS**

(Runtime Verification selesai — READ ONLY. Tidak ada perubahan kode, tidak ada staging, tidak ada commit; satu-satunya artefak baru di repo adalah laporan ini.)
