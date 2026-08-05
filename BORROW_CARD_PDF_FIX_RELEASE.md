# BORROW CARD PDF FIX — RELEASE

## Fitur
Perbaikan jalur **Save PDF** Kartu Peminjaman: halaman PDF kini **110mm × 60mm** (sesuai ukuran kartu), bukan Letter/A4.

## Perubahan
- `electron/main/services/print.service.ts` (`renderPdf`): `printToPDF({ printBackground: true, preferCSSPageSize: true })` — 1 baris, jalur Save PDF saja.

## Validation (semua PASS)
1. `npm run lint` — tsc node + web.
2. `npm run build` — main 1,882.57 kB · preload 9.95 kB (identik) · renderer 1,147.66 kB (identik).
3. `prisma migrate diff` — "This is an empty migration." (no difference).
4. PDF via `renderPdf` asli — MediaBox `[0 0 312.000 169.920]` pt = **110.067 × 59.944 mm**; kontrol tanpa flag = Letter 792×612 pt.

## Lingkup yang TIDAK diubah
Template kartu, layout, Preview, Print (`webContents.print()`), schema, migration, IPC, preload, env.d.ts, bootstrap, renderer, dependency.

## Artefak
- `WORK_ORDER_BORROW_CARD_PDF_FIX.md`
- `BORROW_CARD_PDF_FIX_FINAL_REVIEW.md`
- `BORROW_CARD_PDF_FIX_RELEASE.md` (ini)
- `borrow_card_pdf_fix_smoke/main.cjs` (harness reproduksi Electron smoke)
- `AGENTS.md` (diperbarui)

## Status
**DONE — menunggu review PO.** Tidak membuka WO PRINT.
