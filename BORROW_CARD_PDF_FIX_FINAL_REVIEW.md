# BORROW CARD PDF FIX — FINAL REVIEW

## Mandat WO (dari Product Owner)
Perbaiki jalur **Save PDF** (`printToPDF`) agar menghasilkan halaman PDF **110mm × 60mm** sesuai ukuran kartu. Scope HANYA Save PDF. Dilarang: mengubah template kartu, layout, Preview, dan Print (`webContents.print()`).

## Checklist Mandat

| # | Mandat | Bukti | Status |
|---|--------|-------|--------|
| 1 | Fix di `electron/main/services/print.service.ts` `renderPdf()` | `printToPDF({ printBackground: true, preferCSSPageSize: true })` — `print.service.ts:136` | PASS |
| 2 | Memakai `preferCSSPageSize: true` (hasil investigasi) | Flag ada di panggilan `printToPDF`; kontrol negatif tanpa flag = Letter 792×612pt | PASS |
| 3 | Template kartu TIDAK diubah | `borrow-card.service.ts` tak tersentuh; `@page { size: 110mm 60mm }` utuh di HTML 9964 chars | PASS |
| 4 | Layout TIDAK diubah | Tidak ada diff selain `print.service.ts` (git status: 1 file M) | PASS |
| 5 | Preview TIDAK diubah | `BorrowReceiptPreviewPage.tsx` tak tersentuh; bundle renderer IDENTIK baseline (1,147.66 kB) | PASS |
| 6 | Print (`webContents.print()`) TIDAK diubah | `printBorrowCard`/`printHtml` tak tersentuh; tidak membuka WO PRINT | PASS |

## Validation Gate

| Gate | Hasil | Detail |
|------|-------|--------|
| `npm run lint` | PASS | tsc node + web, exit 0 |
| `npm run build` | PASS | main 1,882.57 kB (+0.03) · preload 9.95 kB (identik) · renderer 1,147.66 kB (identik) |
| `prisma migrate diff` | PASS | "This is an empty migration." (no difference) |
| Generate PDF + ukuran halaman | PASS | `[0 0 312.000 169.920]` pt = **110.067 × 59.944 mm** (≈110×60); kontrol tanpa flag = 792×612 pt (Letter) |

## Bukti PDF (MediaBox)
- **Fix (renderPdf asli):** 312.000 × 169.920 pt = 110.067 × 59.944 mm — bukan A4 (595×842 pt), bukan Letter (792×612 pt).
- **Kontrol negatif (tanpa flag):** 792.000 × 612.000 pt = Letter — membuktikan Root Cause `PRINT_PIPELINE_INVESTIGATION.md` #3/#7 dan bahwa perbaikan berasal dari `preferCSSPageSize`, bukan kebetulan ukuran default printer.
- Konversi: 110mm = 311.811pt, 60mm = 170.079pt; Chromium membulatkan → 312.000/169.920 (deviasi < 0.5pt).

## Scope Compliance
- HANYA 1 file source berubah: `electron/main/services/print.service.ts` (1 baris).
- Tidak ada perubahan dependency/schema/migration/IPC/preload/bootstrap/UI.
- WO PRINT **tidak dibuka**; `webContents.print()` tidak disentuh.

## Kesimpulan
**APPROVED untuk release.** Fix minimal, sasaran tercapai: PDF Save kini 110×60mm sesuai kartu. Klik dialog Simpan PDF membutuhkan runtime Electron (UI) — verifikasi visual manual PO direkomendasikan; bukti teknis ukuran halaman sudah diverifikasi dari file PDF hasil `renderPdf` asli.
