# BORROW WO-2 RELEASE REPORT — PREVIEW UI

## 1. Status
**READY — Release.** WO-2 disetujui untuk dirilis: seluruh quality gate hijau, perubahan di-commit sebagai **ONE FINAL COMMIT** dan di-push.

## 2. Perubahan (commit final)
| File | Jenis |
|------|-------|
| `src/pages/BorrowReceiptPreviewPage.tsx` | baru — halaman preview (zoom/Fit Width/Ctrl+Wheel/multi-page/print/pdf) |
| `electron/main/services/print.service.ts` | modifikasi — +buildBorrowCardHtml/previewHtml/printBorrowCard/saveBorrowCardPdf/renderPdf/buildBorrowCardPdfFilename/readFileAsDataUri |
| `electron/ipc/print.ipc.ts` | modifikasi — +3 channel borrowCardPreview/borrowCard/borrowCardPdf |
| `electron/preload/print.preload.ts` | modifikasi — +print.borrowCardPreview/borrowCard/borrowCardPdf |
| `src/renderer/env.d.ts` | modifikasi — +3 entry |
| `src/utils/labels.ts` | modifikasi — +RECEIPT_PREVIEW block |
| `src/utils/navigation.ts` | modifikasi — +BORROW_RECEIPT_PREVIEW route + receiptPreviewPath |
| `src/routes/index.tsx` | modifikasi — +route borrowings/:id/receipt-preview |
| `src/pages/BorrowingsPage.tsx` | modifikasi — navigate ke preview setelah create sukses |
| `wo2_borrow_card_preview_smoke/smoke.ts` | baru — smoke 21 kasus |
| `BORROW_PREVIEW_DISCOVERY.md`, `BORROW_PREVIEW_WIREFRAME.md`, `BORROW_PREVIEW_ARCHITECTURE.md`, `BORROW_PREVIEW_DESIGN_AMENDMENT.md` | desain (source of truth) |
| `WORK_ORDER_BORROW_WO2_IMPLEMENTATION_REPORT.md`, `BORROW_WO2_FINAL_REVIEW.md`, `BORROW_WO2_RELEASE_REPORT.md` | laporan |
| `AGENTS.md` | update entri WO-2 |

## 3. Regression Summary
Smoke WO-2 **21/21** · `borrow_card_wo1` 101/101 · `it1_borrow_return` 34/34 · `it_borrow_eligibility` 7/7 · `wo14_e2` 36/36 → **total 199 PASS**.

## 4. Artefak Build
`npm run build` PASS → main 1,837.03 kB · preload 9.34 kB · renderer `index-DQyuiP9T.js` 1,059.12 kB. Grep bundle: 3 channel `printing:borrowCard*` ter-render di main/preload; `receipt-preview`/`Pratinjau Kartu Peminjaman`/`Fit Width`/`Halaman` ter-render di renderer.

## 5. Notes
- Tidak ada perubahan schema/migration → `prisma migrate diff` = "No difference detected"; tidak perlu re-deploy DB.
- Preview memakai engine WO-1 (`generateBorrowCardHtml`/`buildBorrowCardData`) tanpa modifikasi; Cetak (WO-3) & PDF (WO-4) tinggal me-wire channel yang sama.
- `printBorrowCard`/`saveBorrowCardPdf` memerlukan runtime Electron sehingga tidak diuji headless; kontrak IPC/preload diverifikasi via grep bundle.
- WO berikutnya menunggu review Product Owner.
