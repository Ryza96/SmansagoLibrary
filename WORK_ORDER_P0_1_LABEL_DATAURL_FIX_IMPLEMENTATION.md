# WORK ORDER P0-1 — LABEL DATA-URL FIX (OPTION A) — IMPLEMENTATION REPORT

Status: **DONE - READY review PO** — TIDAK commit/push, menunggu UAT PO.

Source of Truth: `WORK_ORDER_P0_1_LABEL_DATAURL_INVESTIGATION.md` (root cause terbukti empiris) + keputusan PO **OPTION A** (logo data URI disematkan SATU KALI per dokumen, dirender per label via CSS `background-image`).

Scope: HANYA `src/main/services/label.service.ts` (fix). Pre-existing `M electron/main/services/print.service.ts` (P0-1 print hardening) dipertahankan. DB, migration, printer, template kartu, PDF, IPC, renderer TIDAK disentuh.

---

## 1. Root Cause

`printBookLabels` → `printHtml` memuat HTML melalui `loadURL(data:text/html;charset=utf-8, ${encodeURIComponent(html)})` (print.service.ts L489). Chromium mem-blow URL pada `url::kMaxURLChars` = **2,097,152 karakter**. Karena logo data URI (≈297,806 karakter) di-*duplicate* per label (12 label = 12×), HTML label multi-eksemplar melewati batas → error `-300 ERR_INVALID_URL` → halaman cetak tidak pernah dimuat.

Bukti empiris (sebelum fix, logo 223,336 B → data URI 297,806 char):

| N label | data URL chars | hasil |
|--------:|---------------:|:-----:|
| 1  | 348,189 | OK |
| 2  | 677,982 | OK |
| 3  | 1,008,383 | OK |
| 6  | 1,999,291 | OK |
| 9  | 2,990,124 | **FAIL** |
| 12 | 3,978,555 | **FAIL** |
| 24 | 7,936,980 | **FAIL** |

Threshold: MAX_OK = 2,097,152; MIN_FAIL = 2,097,153 (kartu peminjaman 5 buku = 333,347 OK).

## 2. Design Fix (OPTION A)

- **`labelLogoHtml(data)`**: saat `data.logo` hadir → kembalikan `''` (CSS yang menggambar); saat kosong → monogram fallback `generateLogoMonogramSvg(schoolName, libraryName)` (tanpa data URI).
- **`generateLabelsHtml`**: logo disematkan **tepat satu kali** dalam blok `<style>`:
  ```css
  :root {
    --label-logo-url: url("${data.logo}");
  }
  ```
- **`.label-logo`**: `background-image: var(--label-logo-url, none)` + `background-color: #ffffff` (bukan shorthand `background:` agar var fallback tidak menimpa warna) + `background-size: contain` + `background-position: center` + `-webkit-print-color-adjust: exact` (agar logo ikut tercetak).

Hasil: ukuran data-URL HTML turun dari `N × logo` menjadi `1 × logo`. CSS custom property di-resolve per elemen secara internal Chromium (tidak pernah lewat URL), sehingga **tidak memicu kMaxURLChars**.

## 3. Keamanan & Sintaks

- Base64 charset (`A-Za-z0-9+/=`) aman di dalam `url("...")` — logo data URI **TIDAK** di-escape dengan `escapeHtml` (escapeHtml menyasar `<>&"'` untuk konteks HTML; di konteks CSS-url tidak berlaku dan tidak diperlukan karena charset base64 tidak mengandung karakter CSS-url berbahaya).
- Logo berasal dari `settings.logoPath` yang di-resolve & dibaca sebagai file oleh main (enrichLabelData), tidak pernah dari input renderer bebas.

## 4. Ukuran Setelah Fix (measurement smoke, real logo 297,806 char)

| N label | html chars | data URL chars (encodeURIComponent) | KB |
|--------:|-----------:|------------------------------------:|----:|
| 1  | 319,573 | 348,528 | 340.4 |
| 6  | 373,661 | 417,760 | 408.0 |
| 12 | 436,871 | 498,780 | 487.1 (sebelumnya 3,978,555) |
| 24 | 561,186 | 660,717 | 645.2 (sebelumnya 7,936,980) |

Semua < 2,097,152. n=12 < 700 KB, n=24 < 800 KB (asumsi smoke).

## 5. Hasil Smokes

### 5.1 Measurement smoke (`label_dataurl_fix_smoke/measure.cjs`, pure node) — **30 PASS, 0 FAIL**
Per N: `data:image/` count === 1; tidak ada `label-logo-img`; definisi `--label-logo-url: url(` === 1; referensi `var(--label-logo-url, none)` === 1; nilai penuh == logo data URI; N div `.label-logo` kosong (rendering via CSS); dataURL < 2,097,152.

### 5.2 Electron real `loadURL` (`label_dataurl_fix_smoke/main.cjs`) — **2 PASS, 0 FAIL**
n=12 OK dan n=24 OK (sebelumnya n=12 FAIL `ERR_INVALID_URL`). Menguji jalur nyata yang sama dengan `printHtml` (data URL + Chromium).

### 5.3 Regression — **semua PASS**
| Smoke | Kasus | Hasil |
|-------|------:|:-----:|
| `label_visual_smoke/main.cjs` | 12 label, 1 halaman, A4 594.960×841.920pt | **12/12 PASS** |
| `p0_1_print_hardening_smoke/main.cjs` | 4 kasus + regresi label (margins none, tanpa pageSize) | **6/6 PASS** |
| `borrow_card_print_fix_smoke/main.cjs` | printBorrowCard A6 105×148 + PDF regression 298.080×420.000pt | **17/17 PASS** |

## 6. Lint & Build

- `npm run lint` — PASS (tsc node + web).
- `npm run build` — PASS (main 2,440.58 kB · preload 13.24 kB · renderer 1,291.04 kB).

## 7. Files Changed

| File | Perubahan |
|------|-----------|
| `src/main/services/label.service.ts` | **FIX OPTION A** — `labelLogoHtml` return `''` saat logo ada; injeksi `:root { --label-logo-url: url(...) }` sekali di `<style>`; `.label-logo` `background-image: var(...)`, `background-color`, print-color-adjust; komentar OPSI A. |
| `electron/main/services/print.service.ts` | pre-existing P0-1 print hardening (`printHtml` timeout + margins none) — dipertahankan, tidak diubah WO ini. |

New (smoke/harness): `label_dataurl_fix_smoke/measure.cjs`, `label_dataurl_fix_smoke/main.cjs`. Untracked WO lain (BAM audits, P0-1 hardening, investigation) tidak diikutkan.

## 8. Out-of-Scope (TIDAK diubah)

DB & schema, migration, printer config / Windows printer, borrow & member logic, model buku, barcode generation, kartu peminjaman (110×60 layout, A6 print, PDF), versi aplikasi, installer, IPC security, `SettingService`, `enrichLabelData`, `LABEL_PRINT_CONFIG` (byte-identical), preview renderer (`LabelPreviewPage` — tidak URL-limited).

## 9. Batasan

- Preview (dangerouslySetInnerHTML) tidak terpengaruh (DOM, bukan URL).
- Cetak label tetap A4 default — di luar scope.
- `--label-logo-url` muncul dua kali di HTML (definisi di `:root` + referensi di rule `.label-logo`); smoke membedakan keduanya.

## 10. Status

**DONE - READY review PO.** STOP — tidak commit/push, menunggu UAT PO (lihat `label_dataurl_fix_smoke/main.cjs` untuk harness pengujian).
