# PRINT_PIPELINE_INVESTIGATION.md

**Status:** COMPLETE — READ ONLY (audit teknis, root cause ditemukan; TIDAK ada perubahan source, TIDAK commit, TIDAK push)
**Tanggal:** 2026-08-05
**Scope:** Pipeline Kartu Peminjaman 110×60mm — Preview → Generate PDF → Print.
**Gejala:** Preview benar (110×60mm). Saat **Simpan PDF** maupun **Print**, hasilnya halaman **A4** dengan kartu kecil di tengah.

---

## 1. Arsitektur Pipeline (kondisi saat ini)

```
BorrowingsPage (SIMPAN TRANSAKSI)
   └─ navigate → BorrowReceiptPreviewPage  (/borrowings/:id/receipt-preview)
        ├─ window.electronAPI.print.borrowCardPreview(id)   → getBorrowCardPreviewHtml  → generateBorrowCardHtml
        ├─ [Tombol Cetak]  → window.electronAPI.print.borrowCard(id)     → PrintService.printBorrowCard  → printHtml → webContents.print
        └─ [Simpan PDF]    → window.electronAPI.print.borrowCardPdf(id)  → PrintService.saveBorrowCardPdf → renderPdf → webContents.printToPDF
```

- **Template tunggal:** `generateBorrowCardHtml()` — `src/main/services/borrow-card.service.ts:217-284`. Satu-satunya sumber HTML untuk Preview / Print / PDF.
- **Assembler:** `buildBorrowCardData()` — `borrow-card.service.ts:323-364`.
- **Layout:** `BORROW_CARD_LAYOUT` — `borrow-card.service.ts:19-26` (`pageWidthMm: 110`, `pageHeightMm: 60`).

---

## 2. Jawaban Pertanyaan

### Q1. Bagaimana ukuran halaman Preview ditentukan? Apakah benar 110×60mm atau hanya CSS scale?

**Jawaban: Preview GENUIN 110×60mm (benar), bukan sekadar CSS scale.**

- Ukuran fisik kartu didefinisikan di template dalam satuan mm asli:
  - `@page { size: 110mm 60mm; margin: 0; }` — `borrow-card.service.ts:228`
  - `.borrow-card { width: 110mm; height: 60mm; padding: 3mm; }` — `borrow-card.service.ts:235`
  - Seluruh layout dalam mm (`.logo` 10mm, `.body` height 20mm, `.footer` height 10mm, baris buku 3.4mm, dst).
- `BorrowReceiptPreviewPage.tsx` me-render HTML ini utuh di dalam `.preview-sheet` (`dangerouslySetInnerHTML`, baris 302), lalu **mengukur** ukuran natural (`el.offsetWidth` / `el.scrollHeight`, baris 72-79) — 110mm pada 96dpi ≈ 416px × 227px (fallback `416/227` baris 179-180 sesuai).
- `transform: scale(zoom)` (baris 301) HANYA untuk zoom tampilan layar — **bukan** sumber ukuran halaman. Fit Width (`handleFitWidth`, baris 116-122) juga hanya menyesuaikan zoom display.
- **Kesimpulan:** Preview = render nyata kartu 110×60mm yang di-zoom untuk layar. Tidak ada masalah di layer ini.

### Q2. Bagaimana PDF dibuat? Library apa?

**Jawaban: `webContents.printToPDF()` milik Electron (Chromium print pipeline).**

- `PrintService.saveBorrowCardPdf` (`electron/main/services/print.service.ts:94-118`):
  1. `buildBorrowCardHtml(id)` → HTML template.
  2. `renderPdf(html)` (`print.service.ts:120-150`) → buka `BrowserWindow` tersembunyi (800×600, `contextIsolation:true`, `nodeIntegration:false`), `loadURL('data:text/html;charset=utf-8,...')`.
  3. `webContents.printToPDF({ printBackground: true })` (`print.service.ts:136`).
- **TIDAK** memakai pdfkit / html2pdf / jsPDF. Teknologi = Chromium built-in via Electron.

### Q3. Bagaimana ukuran halaman PDF ditentukan? A4 atau Custom?

**Jawaban: SAAT INI — ukuran default Electron (Letter/A4), BUKAN custom.**

- `printToPDF` dipanggil **tanpa** opsi `pageSize` dan **tanpa** `preferCSSPageSize`:
  ```ts
  const pdf = await printWindow.webContents.printToPDF({ printBackground: true })  // print.service.ts:136
  ```
- Dokumentasi Electron 33 (diverifikasi di `node_modules/electron/electron.d.ts`): `preferCSSPageSize?: boolean` — *"Whether or not to prefer page size as defined by css. **Defaults to false, in which case the content will be scaled to fit the paper size.**"*
- Karena `preferCSSPageSize` default `false`, Chromium mengabaikan `@page { size: 110mm 60mm }` dan memakai paper size default (Letter/A4) → kartu 110×60mm diletakkan di atas kanvas A4 → **"kartu kecil di tengah"**.

### Q4. Bagaimana tombol Cetak bekerja? Mekanisme apa?

**Jawaban: `webContents.print()` (system print dialog), bukan `window.print()`.**

- `PrintService.printBorrowCard` (`print.service.ts:89-92`) → `printHtml(html, { margins: { marginType: 'none' } })`.
- `printHtml` (`print.service.ts:264-297`): `BrowserWindow` tersembunyi → `loadURL(data:...)` → `webContents.print({ margins: { marginType: 'default' }, printBackground: true, ...printOptions }, callback)` (`print.service.ts:279-280`).
- **TIDAK memakai** `window.print()` (renderer tidak pernah memanggilnya — Preview hanya `invoke` channel IPC), **TIDAK** `printToPDF` (itu jalur Simpan PDF).

### Q5. Apakah teknologi MENDUKUNG paper size 110×60mm secara native?

**Jawaban: YA — didukung penuh oleh Electron 33.4.11 (Chromium print pipeline).**

Bukti (dari `node_modules/electron/electron.d.ts`, Electron 33.4.11):

1. **CSS `@page` (sudah ada di template):**
   ```css
   @page { size: 110mm 60mm; margin: 0; }
   ```
   Chromium mendukung `@page size` sebagai paper size halaman (landscape eksplisit via `110mm 60mm` = width × height).

2. **`webContents.printToPDF` — opsi `preferCSSPageSize?: boolean`** (default `false`):
   ```ts
   printWindow.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true })
   ```
   → memaksa Chromium memakai ukuran `@page` dari CSS (110×60mm). **API native untuk menghasilkan PDF berukuran custom.**

3. **`webContents.printToPDF` & `webContents.print` — opsi `pageSize: string | Size`**:
   ```ts
   // Size = { width: number, height: number }  (satuan MIKRON)
   pageSize: { width: 110_000, height: 60_000 }   // 110mm, 60mm
   ```
   - `printToPDF`: `pageSize` sebagai alternatif eksplisit (misal `'A4'` / `'Letter'` / `{width,height}`).
   - `WebContentsPrintOptions.pageSize` (untuk `print`): tipe `('A0'|'A1'|'A2'|'A3'|'A4'|'A5'|'A6'|'Legal'|'Letter'|'Tabloid') | Size` — **diverifikasi ada di electron.d.ts**.

### Q6. Keterbatasan

| Lapisan | Keterbatasan | Detail |
|---------|-------------|--------|
| **PDF (`printToPDF`)** | TIDAK ADA untuk ukuran halaman — asal opsi benar. | `preferCSSPageSize: true` → PDF 110×60mm deterministik. |
| **Print (`webContents.print`)** | Opsi `pageSize` mengatur ukuran job, TAPI hasil fisik bergantung **driver/printer** di dialog OS. | Printer harus mendukung custom paper 110×60mm (printer label/kartu, atau printer A4 dengan custom size). Bila tidak, driver mem-substitute ukuran terdekat (A4/A5) → kartu tetap kecil. |
| **Print dialog** | `webContents.print` menampilkan dialog sistem; pengguna harus memilih paper size yang benar (ukuran job dari `pageSize` jadi default). | `webContents.print` TIDAK punya `preferCSSPageSize` — hanya `pageSize` eksplisit. |
| **Orientation** | Tidak ada masalah — `@page { size: 110mm 60mm }` menetapkan landscape eksplisit (width > height) tanpa flag `landscape`. | — |

**Kesimpulan keterbatasan:** PDF = fully solvable via Electron API. Print fisik = tergantung printer (limitation perangkat, bukan software).

---

## 3. ROOT CAUSE (dua jalur, satu pola)

Pola sama di dua jalur: **parameter paper size TIDAK diteruskan ke API cetak** sehingga Chromium memakai default A4/Letter dan template `@page { size: 110mm 60mm }` diabaikan.

1. **Simpan PDF** — `print.service.ts:136`
   ```ts
   printWindow.webContents.printToPDF({ printBackground: true })
   ```
   Kurang `preferCSSPageSize: true` (atau `pageSize: { width: 110000, height: 60000 }`).

2. **Print** — `print.service.ts:279-280`
   ```ts
   printWindow.webContents.print({ margins: { marginType: 'default' }, printBackground: true, ...printOptions }, ...)
   ```
   Opsi `pageSize` tidak pernah diset; dialog/default printer memakai A4.

Preview tidak terpengaruh karena preview hanya render on-screen mm tanpa proses print.

---

## 4. Rekomendasi Implementasi

Target: **Preview · PDF · Print SEMUA 110×60mm tanpa A4.** Preview sudah benar; perbaiki dua titik di `electron/main/services/print.service.ts`.

### 4.1 Simpan PDF — `renderPdf` (print.service.ts:120-150)

Tambahkan `preferCSSPageSize: true` (pilihan utama — memakai `@page` yang sudah jadi SSOT ukuran di template):

```ts
const pdf = await printWindow.webContents.printToPDF({
  printBackground: true,
  preferCSSPageSize: true
})
```

Atau (alternatif eksplisit, tidak bergantung `@page`):

```ts
const pdf = await printWindow.webContents.printToPDF({
  printBackground: true,
  pageSize: { width: 110_000, height: 60_000 } // mikron = 110mm × 60mm
})
```

> Rekomendasi: **`preferCSSPageSize: true`** — ukuran tetap diatur template (`@page`), konsisten dengan `BORROW_CARD_LAYOUT`, dan setiap perubahan dimensi cukup 1 tempat.

### 4.2 Print — `printHtml` (print.service.ts:264-297) / `printBorrowCard`

Tambahkan `pageSize` ke opsi `webContents.print` (Electron `WebContentsPrintOptions.pageSize` = `string | Size` dalam mikron):

```ts
printWindow.webContents.print(
  {
    margins: { marginType: 'none' },
    printBackground: true,
    pageSize: { width: 110_000, height: 60_000 },
    ...printOptions
  },
  (success, failureReason) => { ... }
)
```

- `printBorrowCard` sudah meneruskan `{ margins: { marginType: 'none' } }` — cukup pastikan `printHtml` menambahkan `pageSize`.
- Efek: dialog cetak menampilkan ukuran kertas **110×60mm** sebagai default. Hasil fisik tetap bergantung printer yang mendukung custom paper (keterbatasan hardware).

### 4.3 Rekomendasi tambahan (opsional, di luar scope bug)

- **Verifikasi deterministik:** setelah fix, uji PDF dengan tool (mis. `pdfinfo`/reader) bahwa `Page size = 110 x 60 mm` (≈ 311.8 × 170.1 pt). PDF 110×60mm = 110mm×2.835pt/mm ≈ **311.81 × 170.08 pt**.
- **Print fisik:** untuk kualitas cetak kartu, rekomendasikan printer label/kartu 110×60mm (thermal) atau printer inkjet dengan custom paper; dokumentasikan ke PO bahwa output print bergantung driver printer.

### 4.4 Ringkasan perubahan yang dibutuhkan (BELUM dieksekusi — READ ONLY)

| File | Perubahan |
|------|-----------|
| `electron/main/services/print.service.ts` `renderPdf` (~baris 136) | `printToPDF({ printBackground: true, preferCSSPageSize: true })` |
| `electron/main/services/print.service.ts` `printHtml` (~baris 279) | tambah `pageSize: { width: 110000, height: 60000 }` pada opsi `webContents.print` |

Tidak perlu perubahan template, IPC, preload, UI, schema, migration, dependency. Template `@page` (borrow-card.service.ts:228) sudah benar.

---

## 5. Lampiran — Bukti API (Electron 33.4.11 `electron.d.ts`)

- `WebContentsPrintToPDFOptions.preferCSSPageSize?: boolean` — *"Defaults to false, in which case the content will be scaled to fit the paper size."* ✓
- `WebContentsPrintOptions.pageSize: (('A0'|'A1'|'A2'|'A3'|'A4'|'A5'|'A6'|'Legal'|'Letter'|'Tabloid')) | (Size)` ✓
- `interface Size { height: number; width: number }` — mikron ✓
- Konversi: 110mm = 110000 µm; 60mm = 60000 µm; 110mm = 311.81 pt; 60mm = 170.08 pt.
