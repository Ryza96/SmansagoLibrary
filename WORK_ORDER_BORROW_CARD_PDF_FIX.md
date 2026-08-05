# WORK ORDER — BORROW CARD PDF FIX (Save PDF 110×60mm)

## Ringkasan
- **Sumber acuan:** `PRINT_PIPELINE_INVESTIGATION.md` (**APPROVED**) — temuan #3/#7: `renderPdf()` memanggil `printToPDF({ printBackground: true })` **tanpa** `preferCSSPageSize` (default `false`) sehingga CSS `@page { size: 110mm 60mm }` pada template kartu diabaikan dan PDF jatuh ke ukuran default (Letter/A4).
- **Fix (1 baris, jalur Save PDF SAJA):** `electron/main/services/print.service.ts` `renderPdf()` → `printToPDF({ printBackground: true, preferCSSPageSize: true })`.
- **Scope dipatuhi ketat:** HANYA jalur Save PDF (`printToPDF`). Template kartu, layout, Preview, dan `webContents.print()` (jalur Cetak) **tidak diubah**.

## Perubahan
### Source (1 file)
`electron/main/services/print.service.ts:136`
```ts
// SEBELUM
const pdf = await printWindow.webContents.printToPDF({ printBackground: true })
// SESUDAH
const pdf = await printWindow.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true })
```
- `preferCSSPageSize: true` (Electron 33) → `@page { size: 110mm 60mm; margin: 0 }` di `borrow-card.service.ts` menjadi SSOT ukuran halaman PDF.
- `printBackground: true` dipertahankan (background kartu/logo tetap tercetak).

### TIDAK diubah
- `borrow-card.service.ts` (template `generateBorrowCardHtml` / `@page` / `.borrow-card` 110×60mm).
- `BorrowReceiptPreviewPage.tsx` (Preview / zoom) — layout & data path utuh.
- `printBorrowCard` / `printHtml` → `webContents.print()` (jalur Cetak fisik) TIDAK disentuh (di luar scope; tidak membuka WO PRINT).
- Schema / migration / IPC / preload / env.d.ts / bootstrap / renderer.
- `package.json` (tidak ada dependency baru).

## Validation
### 1. `npm run lint` — PASS
```
> tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit
```
(exit 0, tanpa output error)

### 2. `npm run build` — PASS
```
out/main/index.js    1,882.57 kB   (+0.03 kB — perubahan 1 baris)
out/preload/index.js 9.95 kB       (IDENTIK baseline — tidak ada wiring)
out/renderer/assets/index-BtTFigCP.js 1,147.66 kB  (IDENTIK baseline — UI tidak disentuh)
```

### 3. `prisma migrate diff` — "This is an empty migration." (no difference)
```
npx prisma migrate diff --from-migrations .\migrations --to-schema-datamodel .\schema.prisma --script
```

### 4. Generate PDF + verifikasi ukuran halaman — **PASS (110mm × 60mm)**
**Metode:** smoke Electron headless (`borrow_card_pdf_fix_smoke/main.cjs`) yang memanggil **`PrintService.renderPdf()` ASLI** (kelas ter-compile dari `print.service.ts` yang sudah diperbaiki) pada HTML kartu asli (`generateBorrowCardHtml` dengan data nyata + QR `generateQrCodeSvg`). Kontrol negatif dibuat dengan memanggil `printToPDF` flag `false` untuk membuktikan perbedaan berasal dari flag.

Hasil ekstraksi `/MediaBox` dari file PDF:

| Jalur | MediaBox (pt) | mm | Status |
|-------|---------------|-----|--------|
| **renderPdf (fix, preferCSSPageSize:true)** | `[0 0 312.000 169.920]` | **110.067 × 59.944 mm** | PASS (≈ 110×60) |
| Kontrol negatif (tanpa flag) | `[0 0 792.000 612.000]` | 279.4 × 215.9 mm (Letter) | PASS (bukti flag penyebab) |

- **point (pt):** 312.000 × 169.920 pt (ekspektasi teoretis 110mm=311.811pt, 60mm=170.079pt; Chromium membulatkan ke kelipatan 0.08pt — selisih < 0.5pt, toleransi PASS).
- **millimeter (mm):** 110.067 × 59.944 mm (110mm/25.4×72; deviasi < 0.1mm).
- Kontrol tanpa flag = Letter 792×612 pt → membuktikan Root Cause: tanpa `preferCSSPageSize` Chromium mengabaikan `@page` dan memakai ukuran default.

Log smoke (ringkas):
```
PASS | html dimuat (template asli) | 9964 chars
PASS | html memuat @page 110mm 60mm | SSOT ukuran kartu ada di template
PASS | renderPdf (preferCSSPageSize:true) menghasilkan 114338 bytes
PASS | PDF fix punya MediaBox | [{"x0":0,"y0":0,"x1":312,"y1":169.92}]
PASS | Ukuran halaman 110mm x 60mm | w=312.000pt (110.067mm) h=169.920pt (59.944mm)
PASS | Kontrol: tanpa flag = A4/Letter (bukan kartu) | w=792.000pt h=612.000pt
SMOKE_RESULT=PASS
```

**Regresi scaffold (bukan bug):** smoke headless pertama gagal karena `bwip-js/node` tidak ter-resolve dari folder temp (`electron` tidak membaca `NODE_PATH`) dan proses menggantung saat load error. Perbaikan prosedural: compile output ditempatkan DI DALAM repo (`borrow_card_pdf_fix_smoke/out/`) agar Node resolution naik ke `node_modules` root, plus guard `uncaughtException` → `app.exit(1)`. Kode aplikasi tidak berubah; hasil akhir 6/6 PASS.

## Output
- `WORK_ORDER_BORROW_CARD_PDF_FIX.md` (ini)
- `BORROW_CARD_PDF_FIX_FINAL_REVIEW.md`
- `BORROW_CARD_PDF_FIX_RELEASE.md`
- `AGENTS.md` (diperbarui)
- `borrow_card_pdf_fix_smoke/main.cjs` (harness reproduksi, ter-compile pada saat run)

## Status
**DONE — menunggu review PO.** Tidak membuka WO PRINT. `webContents.print()` tidak diubah.
