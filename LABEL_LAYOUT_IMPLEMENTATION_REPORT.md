# LABEL_LAYOUT_IMPLEMENTATION_REPORT.md

Work Order: **Label Layout Final (A4 3×4, 12 Label/Halaman)**
Mode: IMPLEMENTATION
Date: 2026-08-01
Basis: `LABEL_LAYOUT_FINAL_DESIGN.md` (desain final PO, READ ONLY) + `LABEL_PRINT_ARCHITECTURE_AUDIT.md`.

---

## 1. Ringkasan Implementasi

Layout label buku direvisi dari "A4 2-kolom (`.label` 50%×63mm)" menjadi **A4 3×4 = 12 label per halaman**, sesuai desain final PO, dengan satu penyesuaian margin (lihat §4).

Konfigurasi layout terpusat di `LABEL_PRINT_CONFIG` (`src/main/services/label.service.ts:4-10`):

| Opsi | Nilai | Keterangan |
|------|-------|------------|
| `pageMarginMm` | `6` | Margin halaman (body padding) |
| `columns` | `3` | Kolom label |
| `rows` | `4` | Baris label |
| `barcodeHeightMm` | `37` | Tinggi zona barcode |
| `showLabelBorder` | `false` | Border label off (default) |

Geometri yang dihasilkan: label **66mm × 71.25mm** (`(210 − 2×6)/3` × `(297 − 2×6)/4`), grid 3×4 row-major, total 12 label/halaman.

Urutan konten per label (top-to-bottom): **① Nama Perpustakaan → ② Barcode Code128 → ③ Nomor Inventaris → ④ Judul (maks. 2 baris) → ⑤ Lokasi Rak.**

## 2. File yang Berubah

| File | Perubahan |
|------|-----------|
| `src/main/services/label.service.ts` | Rewrite layout: `LABEL_PRINT_CONFIG` + geometri komputasi (66mm×71.25mm, grid 3×4); header perpustakaan baru (`.label-library`, conditional); urutan zona sesuai desain; border default OFF; inventaris monospace bold 13px; judul 10.5px clamp 2-baris; rak abu 10px; body `padding: 6mm`, `align-items: stretch` |
| `src/shared/dto/print.ts` | `BookLabelData` + `libraryName?: string` (opsional — header dilewati bila kosong) |
| `src/components/books/BookDetail.tsx` | Saat tombol "Cetak Label": ambil `window.electronAPI.settings.get()` → kirim `settings.libraryName` sebagai `libraryName` pada payload label |

**Tidak terdampak:** IPC (`printing:bookLabels`), preload (`print.bookLabels`), `print.service.ts` (`printBookLabels` → `generateLabelsHtml`), env.d.ts, schema/DB. Perubahan lain di working tree (`BooksPage.tsx`, `book.preload.ts`, label `DELETE_ERROR`) berasal dari work order penghapusan buku yang berbeda — bukan bagian WO ini.

## 3. Investigasi Smoke Test FAIL

### Fenomena
```
PASS fallback no library (header omitted): FAIL
```
(1 dari 13 check gagal; 12 lainnya PASS.)

### Root Cause — BUG SMOKE TEST, BUKAN BUG IMPLEMENTASI

Assertion smoke (`label_smoke/smoke.cjs`):

```js
console.log('PASS fallback no library (header omitted):',
  noLibrary.includes('label-library') ? 'FAIL' : 'header omitted OK')
```

- Assertion mengecek substring `label-library` pada **seluruh dokumen HTML**.
- Namun `generateLabelsHtml` **selalu** memuat blok CSS `.label-library { ... }` di dalam `<style>` (selector class, terlepas dari input) → substring selalu ketemu → selalu FAIL.
- Verifikasi implementasi: saat `libraryName` kosong/omitted, elemen `<div class="label-library">` **benar-benar tidak dirender** di body (0 kemunculan di `<body>`; 1 kemunculan hanya di `<style>`).

Dengan kata lain, perilaku implementasi sudah benar (header dilewati bila tanpa nama perpustakaan, `label.service.ts:27-29`); assertion smoke yang terlalu naif (substring seluruh dokumen, tidak membedakan CSS vs elemen).

### Perbaikan
Assertion diubah agar mengecek **elemen ter-render**, bukan substring CSS:

```js
const headerDivInBody = /<div class="label-library">/.test(noLibrary)
console.log('PASS fallback no library (header omitted):',
  headerDivInBody ? 'FAIL' : 'header omitted OK')
```

Tidak ada perubahan pada source implementasi — hanya koreksi verifikasi.

## 4. Catatan Desain vs Implementasi (Deviasi Margin)

Desain final (`LABEL_LAYOUT_FINAL_DESIGN.md`) menspesifikasikan **margin 0mm → label 70mm × 74.25mm**. Implementasi memakai **varian fallback dari tabel risiko desain (§8): margin halaman 6mm → label 66mm × 71.25mm**, tetap 3×4 dan 12 label/halaman.

- Rasional: margin 6mm menghindari area non-cetak printer fisik yang memotong tepi; keputusan ini selaras dengan smoke test yang divalidasi (66mm/71.25mm/6mm).
- **Tetap wajib uji fisik printer target sebelum rilis** — bila printer mampu cetak hingga tepi (margin 0), nilai `pageMarginMm` dapat dikembalikan ke `0` dan geometri menyesuaikan otomatis (label 70×74.25mm) karena ukuran dihitung dari konfigurasi.

## 5. Validasi

| Tes | Hasil |
|-----|-------|
| Smoke test label layout (`label_smoke/smoke.cjs`, via `NODE_PATH` ke repo `node_modules`) | **13/13 PASS** — label count 12/12 · border default OFF · library header tampil · urutan zona monotonik (library→barcode→inventory→title→shelf) · width 66mm · height 71.25mm · body padding 6mm · barcode height 37mm · clamp 2-baris · SVG barcode · `@page size:A4; margin:0` · **fallback no-library: header omitted OK** |
| `npm run lint` | PASS (exit 0) |
| `npm run build` (electron-vite) | PASS — main 1,754.49 kB · preload 7.05 kB · renderer 898.29 kB |

## 6. Risiko & Technical Debt

1. **Margin 6mm vs margin 0** — implementasi memakai fallback 6mm (bukan 70×74.25 exact). Keputusan bisa direvisi hanya dengan mengubah `pageMarginMm` di `LABEL_PRINT_CONFIG`; tetap perlu uji fisik printer.
2. **Smoke test tinggal di temp dir** (`%TEMP%\opencode\label_smoke\`) — menguji versi ter-compile dari `label.service.ts`/`barcode.service.ts`/`print.ts`. Bila ingin menjadi tes permanen, perlu dipindah ke repo (mis. `scripts/`) dan dijalankan via `NODE_PATH=<repo>\node_modules`.
3. **Header perpustakaan mengambil ruang vertikal label** — barcode tetap 37mm sehingga header (10px) mengurangi ruang zona lain secara otomatis (flex `space-evenly`); pada 12-label satu halaman penuh tetap stabil.
4. **Belum ada commit** — perubahan label layout ada di working tree bersama work order lain. Menunggu instruksi.

## 7. Kesimpulan

**READY.** Layout label A4 3×4 (12/halaman, 66×71.25mm, barcode 37mm, urutan Header→Barcode→Inventaris→Judul→Rak) terimplementasi dan terverifikasi: smoke test 13/13 PASS (termasuk kasus `libraryName` omitted yang awalnya FAIL — terbukti bug assertion smoke, bukan implementasi), `npm run lint` PASS, `npm run build` PASS. Fitur tidak berubah; hanya perbaikan assertion verifikasi yang salah mengecek substring CSS.
