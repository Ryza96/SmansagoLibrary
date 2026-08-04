# BORROW WO-1 RELEASE REPORT — BORROW CARD ENGINE

## 1. Status
**READY — Release.** WO-1 disetujui untuk dirilis: seluruh quality gate hijau, perubahan di-commit sebagai **ONE FINAL COMMIT** dan di-push.

## 2. Perubahan (commit final)
| File | Jenis |
|------|-------|
| `src/main/services/borrow-card.service.ts` | baru — engine (assembler + template tunggal + pagination) |
| `src/shared/config/borrow-status.ts` | baru — BORROW_STATUS + deriveBorrowStatus |
| `src/shared/dto/borrow-card.ts` | baru — BorrowCardData contract |
| `src/main/services/barcode.service.ts` | modifikasi — +generateQrCodeSvg (bcid qrcode) |
| `borrow_card_wo1_smoke/smoke.ts` | baru — smoke murni |
| `BORROW_RECEIPT_DISCOVERY_REPORT.md`, `BORROW_RECEIPT_ARCHITECTURE.md`, `BORROW_RECEIPT_WIREFRAME.md`, `BORROW_RECEIPT_DESIGN_AMENDMENT.md` | desain (source of truth) |
| `WORK_ORDER_BORROW_WO1_IMPLEMENTATION_REPORT.md`, `BORROW_WO1_FINAL_REVIEW.md`, `BORROW_WO1_RELEASE_REPORT.md` | laporan |
| `AGENTS.md` | update entri WO-1 |

## 3. Regression Summary
Smoke WO-1 **101/101** · `it1_borrow_return` 34/34 · `it_borrow_eligibility` 7/7 · `wo14_e2` 36/36 → **total 178 PASS**.

## 4. Artefak Build
`npm run build` PASS → `out/main/index.js` 1,819.55 kB · `out/preload/index.js` 9.02 kB · renderer `index-M9uMOWcD.js` 1,044.75 kB. **Identik baseline IT-1** — membuktikan WO-1 berdiri sendiri (belum ada wiring Preview/Print/PDF; itu WO-2..4).

## 5. Notes
- Tidak ada perubahan schema/migration → `prisma migrate diff` no-drift; tidak perlu re-deploy DB.
- WO-1 = pondasi; `generateBorrowCardHtml`/`buildBorrowCardData` siap dikonsumsi WO-2 (Preview) tanpa modifikasi template.
- WO berikutnya menunggu review Product Owner.
