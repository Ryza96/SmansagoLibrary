# LABEL_PRINT_ARCHITECTURE_AUDIT.md — Audit Fitur Cetak Label Buku

**Tanggal:** 01 Agustus 2026
**Mode:** READ ONLY — tidak ada kode diubah, tidak ada staging/commit.
**Status:** **COMPLETE — LAPORAN SIAP, BELUM ADA IMPLEMENTASI**

---

## 1. Architecture — Diagram Alur Lengkap

```
┌──────────────────────────────────────────────────────────────────────┐
│ RENDERER (Chromium)                                                  │
│                                                                      │
│  BookDetailPage.tsx (load copies)                                    │
│      └─ BookDetail.tsx:159-166  [Button "Cetak Label"]               │
│            └─ handlePrintLabels()  (BookDetail.tsx:79-94)            │
│                 └─ window.electronAPI.print.bookLabels({             │
│                      bookTitle, items[{barcode, inventoryNumber,     │
│                      shelfLocation}] })                              │
│                       │                                             │
│                       ▼                                             │
│  PRELOAD (contextBridge, contextIsolation=ON)                        │
│  print.preload.ts:8  ipcRenderer.invoke('printing:bookLabels', data) │
│                       │                                             │
│                       ▼                                             │
│  IPC MAIN                                                            │
│  print.ipc.ts:12-14  ipcMain.handle('printing:bookLabels',           │
│                       (e, data) => printService.printBookLabels)     │
│                       │                                             │
│                       ▼                                             │
│  SERVICE — electron/main/services/print.service.ts:14-17            │
│  printBookLabels(data) → generateLabelsHtml(data)                    │
│                          │                                          │
│                          ▼                                          │
│  GENERATOR — src/main/services/label.service.ts:25-95               │
│  generateLabelsHtml → template HTML A4 + per-item labelHtml          │
│      └─ per item: labelItemHtml (label.service.ts:13-23)             │
│            └─ src/main/services/barcode.service.ts:3-13             │
│                 generateBarcodeSvg → bwip-js.toSVG (Code128)         │
│                          │                                          │
│                          ▼                                          │
│  PRINT — print.service.ts:131-164  printHtml()                      │
│  1. new BrowserWindow({show:false})                                  │
│  2. loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`) │
│  3. did-finish-load → webContents.print({margins, printBackground})  │
│  4. callback success/failure → resolve/reject → close window         │
│                       │                                             │
│                       ▼                                             │
│  PRINTER (dialog sistem Windows — default, TIDAK silent)            │
└──────────────────────────────────────────────────────────────────────┘
```

**Alur lengkap (berurutan):**
1. **Button:** `BookDetail.tsx:160` `onClick={handlePrintLabels}`, disabled bila `copies.length === 0`.
2. **Renderer handler:** `BookDetail.tsx:79-94` — map `copies` → `{barcode: copy.barcode ?? copy.inventoryNumber, inventoryNumber, shelfLocation}`; `try/await window.electronAPI.print.bookLabels(...)`; `catch → alert(message)`.
3. **Preload:** `electron/preload/print.preload.ts:8` — `bookLabels: (data) => ipcRenderer.invoke('printing:bookLabels', data)`.
4. **IPC:** `electron/ipc/print.ipc.ts:12-14` — `ipcMain.handle('printing:bookLabels', ...)` → `printService.printBookLabels(data)`.
5. **Service:** `electron/main/services/print.service.ts:14-17` — `const html = generateLabelsHtml(data); await this.printHtml(html, { margins: { marginType: 'none' } })`.
6. **Generator:** `label.service.ts` — bangun HTML lengkap (head + CSS + body label), setiap label memanggil `generateBarcodeSvg`.
7. **Barcode:** `barcode.service.ts` — `bwipjs.toSVG({bcid:'code128', text, scale:3, height:10, includetext:true, textsize:9})` → string SVG.
8. **Print:** `print.service.ts:131-164` — hidden `BrowserWindow` → `loadURL(data:text/html)` → `webContents.print({ margins: {marginType:'default'}, printBackground:true, ...printOptions })` → sistem print dialog.

---

## 2. Seluruh File yang Terlibat

| Layer | File | Peran |
|-------|------|-------|
| Renderer (Button) | `src/components/books/BookDetail.tsx` | Tombol "Cetak Label" (baris 159-166) + `handlePrintLabels` (79-94) |
| Renderer (Page) | `src/pages/BookDetailPage.tsx` | Memuat `copies` via `api.bookCopies.findByBookId`, merender `<BookDetail>` |
| Renderer (Types) | `src/renderer/env.d.ts` | Deklarasi `electronAPI.print.bookLabels` (baris 124-128) |
| Preload | `electron/preload/print.preload.ts` | `bookLabels` invoke channel |
| Preload (aggregator) | `electron/preload/index.ts` | Spread `printAPI` ke `electronAPI` |
| IPC | `electron/ipc/print.ipc.ts` | Handler `printing:bookLabels` (+ 2 handler receipt) |
| IPC (registrasi) | `electron/ipc/index.ts` | `registerPrintHandlers(services.printService)` |
| Service | `electron/main/services/print.service.ts` | `printBookLabels` + `printHtml` + `generateReceiptHtml` |
| DI | `electron/main/bootstrap.ts` | `new PrintService(borrowRepository, settingService)` |
| Generator | `src/main/services/label.service.ts` | `generateLabelsHtml`, `labelItemHtml`, `escapeHtml` |
| Barcode | `src/main/services/barcode.service.ts` | `generateBarcodeSvg` via bwip-js |
| DTO | `src/shared/dto/print.ts` | `BookLabelData`, `BookLabelItemData` |
| Labels | `src/utils/labels.ts` | `LABELS.COPY.PRINT_LABELS` = 'Cetak Label' (baris 174) |
| Dep | `package.json` | `bwip-js@^4.11.2` (baris 24) |

---

## 3. Format Output Saat Ini

**HTML** (string) — **BUKAN PDF.**

- `generateLabelsHtml` menghasilkan dokumen HTML penuh dengan inline CSS, disembunyikan di `BrowserWindow` lalu dikirim ke printer langsung via `webContents.print`.
- Barcode berupa **SVG inline** (dari bwip-js) di dalam HTML.
- **Tidak ada** langkah PDF (`printToPDF` tidak dipakai — grep = 0), **tidak ada** canvas rendering, **tidak ada** ZPL/ESC/POS.
- Alur receipt (borrow/return) juga HTML + `webContents.print` (path terpisah di file yang sama).

---

## 4. Library Barcode

**`bwip-js`** (v^4.11.2) — satu-satunya library barcode.

- Import khusus: `import bwipjs from 'bwip-js/node'` (`barcode.service.ts:1`) — wajib `/node` karena conditional exports paket (pelajaran WO-8).
- Simbologi: **Code128** (`bcid: 'code128'`), `scale: 3`, `height: 10`, `includetext: true`, `textxalign: 'center'`, `textsize: 9`.
- Nilai barcode = `inventoryNumber` (keputusan WO-8; `copy.barcode ?? copy.inventoryNumber` di renderer, fallback di `labelItemHtml`).
- Library lain (JsBarcode/QRCode) **tidak ada**.

---

## 5. Lokasi Template Label

**Hardcoded** — template HTML sebagai **string template literal** di dalam `src/main/services/label.service.ts` (`generateLabelsHtml`, baris 25-95).

- Bukan file `.html` eksternal, bukan PDF template, bukan canvas layout.
- Inline CSS di dalam `<style>` (A4, flex wrap 2 kolom, `.label` dll).
- Layout = **dynamic** hanya pada jumlah label (`items.map`); struktur & styling statis.
- `escapeHtml` (label.service.ts:4-11) dipakai untuk `inventoryNumber`, `bookTitle`, `shelfLocation`.

---

## 6. Penentuan Ukuran Label

**Campuran mm + persen** (CSS), tidak memakai dpi.

- `@page { size: A4; margin: 0; }` — kertas A4 (210mm × 297mm).
- `.label { width: 50%; height: 63mm; }` — **2 kolom × 4 baris = 8 label/halaman** (297/63 ≈ 4.7 → 4 baris penuh).
- `* { box-sizing: border-box }` agar border 1px tidak menambah lebar.
- Barcode: `height: 34mm` kontainer + `scale: 3` (dalam unit bwip-js).
- Print options: `margins: { marginType: 'none' }` (dari `printBookLabels`) — **tanpa margin**, label sampai tepi.
- `Setting.reportPaperSize` (ada di settings) **tidak dikonsumsi** — A4 hardcoded.

---

## 7. Proses Print

**Electron `webContents.print()`** (dialog interaktif, BUKAN silent, BUKAN PDF-dahulu).

- `printHtml` (print.service.ts:131-164):
  - `new BrowserWindow({ width:800, height:600, show:false, contextIsolation:true, nodeIntegration:false })` — window tersembunyi.
  - `loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))`.
  - `did-finish-load` → `webContents.print({ margins:{marginType:'default'}, printBackground:true, ...printOptions }, callback)`.
  - callback: `success` → `resolve()`; `false` → `reject(new Error(failureReason ?? 'Gagal mencetak'))`; window selalu `close()` (jika belum destroyed).
  - `did-fail-load` → close + `reject('Gagal memuat halaman cetak: ...')`.
- Karena `silent` **tidak di-set** (default `false`), sistem **menampilkan print dialog** — user memilih printer. `deviceName` tidak dipakai (pakai default pilihan user).
- **Bukan** browser print (window.print) — murni Electron API di main process.

---

## 8. Production Readiness

**Status: PRODUCTION-READY (jalur utama) dengan 7 catatan.** Fitur bekerja; namun ada kelemahan & debt yang harus dicatat.

### Kelemahan / Potensi Bug

| # | Area | Risiko | Detail |
|---|------|--------|--------|
| W1 | **Injection HTML di SVG barcode** | RENDAH | `barcodeValue` dimasukkan **mentah** ke `bwipjs.toSVG` lalu SVG di-embed langsung. Nilai barcode = `INV-...` (aman) tapi tidak ada escaping/penggantian karakter khusus di sisi label. Bila barcode berisi `&`, `<`, `"` → bisa merusak HTML/SVG. (Receipt path lebih parah: `generateReceiptHtml` TIDAK escape apapun — nama anggota, judul, libraryName di-interpolasi raw.) |
| W2 | **Print dialog dibatalkan = alert error** | RENDAH | `webContents.print` callback `success=false` dengan `failureReason='cancelled'` → `reject` → renderer `alert('Gagal mencetak')`. User yang sengaja membatalkan dialog dapat pesan error yang membingungkan. |
| W3 | **Margin nol (`marginType:'none'`)** | SEDANG | Label dicetak tanpa margin fisik. Banyak printer inkjet/laser punya **unprintable area** → potongan tepi label (kolom kanan / baris bawah) bisa terpotong. Perlu uji fisik di printer target PO. |
| W4 | **A4 hardcoded** | SEDANG | Ukuran kertas, orientasi, jumlah label/halaman dikunci di CSS. `reportPaperSize` setting tersedia tapi tidak dipakai. Perubahan kebutuhan kertas = ubah source. |
| W5 | **Tanpa preview** | RENDAH | Tidak ada pratinjau sebelum cetak (hidden window). User tidak bisa memverifikasi layout sebelum dialog print. |
| W6 | **Tidak ada timeout/cleanup load** | RENDAH | Jika `did-finish-load`/`did-fail-load` tidak pernah fire (hang), promise menggantung & window hidden bocor (tidak ada `setTimeout`). |
| W7 | **Receipt path = duplikasi HTML & tanpa escaping** | SEDANG | `generateReceiptHtml` (print.service.ts:77-129) memakai `any`, interpolasi tanpa escape, dan tidak via label service — pemeliharaan terpisah, risiko XSS dari data. Di luar scope cetak label, tapi berbagi `printHtml`. |

### Technical Debt

- Template label = string HTML hardcoded di service → perubahan desain = edit kode + rebuild, tanpa tooling (tidak ada partial/template engine).
- Ukuran/posisi label tidak dikonfigurasi (tidak pakai setting `barcodeFormat`/`reportPaperSize`; `Setting.barcodeFormat` sengaja dibiarkan tidak dikonsumsi — keputusan WO-8).
- `printHtml` dipakai bersama receipt; opsi margin disebar (label paksa `none`, receipt `default`) — kontrak implicit.
- Bundle main membesar (1,753 kB) karena bwip-js ikut ter-bundle (hanya `@prisma/client` yang di-external di electron.vite.config.ts:11).

---

## 9. Dependency — Penggunaan yang Benar

| Dependency | Status | Keterangan |
|------------|--------|------------|
| `bwip-js@^4.11.2` | **Digunakan dengan benar** | `toSVG` Code128; import `bwip-js/node` (wajib, conditional exports). |
| `electron` `webContents.print` | **Digunakan dengan benar** | Print interaktif + `printBackground`; callback ditangani. |
| `pdfkit` | **TIDAK ada** di dependencies | Tidak dibutuhkan (tidak ada jalur PDF) — bukan dependency yang kurang dipakai. |
| `printer` / npm printer lib | **TIDAK ada** | Tidak dibutuhkan — memakai Electron print dialog. |
| `read-excel-file`, `lucide-react`, `react-router-dom` | Tidak terkait fitur | Dipakai modul lain. |

**Kesimpulan:** tidak ada dependency yang terpasang-tapi-tidak-terpakai untuk fitur ini; tidak ada dependency yang hilang. Satu catatan kecil: `bwip-js` ikut ter-bundle (bukan externalized) → menambah ukuran `out/main/index.js`, tapi tidak salah.

---

## 10. Diagram Arsitektur Sederhana

```
[BookDetail.tsx] Button "Cetak Label" (disabled bila 0 copy)
      │
      ▼  window.electronAPI.print.bookLabels(data)
[Preload: print.preload.ts]  ipcRenderer.invoke('printing:bookLabels')
      │
      ▼
[IPC: print.ipc.ts]  handler → PrintService.printBookLabels
      │
      ▼
[PrintService]  generateLabelsHtml(data)
      │  └── [LabelService]  label HTML (escapeHtml)
      │        └── [BarcodeService]  bwip-js → SVG Code128
      │
      ▼
[printHtml]  hidden BrowserWindow → loadURL(data:text/html)
      │
      ▼
[webContents.print]  print dialog → PRINTER (A4, 2×4 label)
```

---

## 11. Recommendation (untuk WO berikutnya — BELUM dieksekusi)

| # | Rekomendasi | Prioritas |
|---|-------------|-----------|
| R1 | **Escape barcode** di `labelItemHtml` (atau validasi charset Code128) sebelum masuk `bwipjs.toSVG`; escape penuh untuk `generateReceiptHtml` | HIGH (keamanan/injection) |
| R2 | **Perlakukan cancel dialog print** sebagai non-error (jangan `alert`); atau tawarkan `silent` + pilihan printer deviceName | HIGH (UX) |
| R3 | **Uji fisik printer target** untuk margin tepi (W3); jika terpotong, tambah `margin` kecil / setel `marginType` sesuai printer | HIGH (kualitas cetak) |
| R4 | Jadikan ukuran label & kertas **terkonfigurasi** (reuse `Setting.reportPaperSize` / label size setting) — hapus hardcode A4/63mm | MEDIUM |
| R5 | Tambah **print preview** (tampilkan `BrowserWindow` `show:true` sebelum dialog, atau renderer preview) | MEDIUM |
| R6 | Add **timeout & resource cleanup** di `printHtml` (close window bila gagal/hang) | LOW |
| R7 | Refactor `printHtml` agar margin tidak disebar di pemanggil (kontrak eksplisit: `printOptions` opsional tetap, tapi default masuk akal) | LOW |

**Kesimpulan:** Fitur Cetak Label Buku arsitekturnya **kokoh dan production-ready untuk jalur utama** (HTML→hidden window→Electron print dialog). Barcode Code128 via bwip-js di-generate dengan benar; escaping sudah ada untuk teks label; error ditangani di renderer. Catatan perbaikan utama sebelum rilis: **escaping barcode (R1), penanganan cancel print (R2), dan uji margin fisik printer (R3)**.

**Status: AUDIT COMPLETE — BERHENTI, menunggu keputusan Product Owner.**
