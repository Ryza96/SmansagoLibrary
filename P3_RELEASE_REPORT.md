# P3 — RELEASE REPORT — PROMOTION RUN HISTORY

## Deliverable
Riwayat Promotion Run READ-ONLY (audit):
- **List:** `/promotions` — Run, Tahun Ajaran, Tanggal, Total Member, Naik Kelas, Lulus, Tinggal Kelas, Alih Kelas, Pindah, Keluar, Tanpa Target, Error, Status (13 kolom).
- **Detail:** `/promotions/:id` — meta run (id, tahun sumber→target, tanggal, total, mode, status) + kartu 8 counts + tabel item (Member, Kelas Asal, Kelas Tujuan, Hasil, Catatan).
- Menu Sidebar "Riwayat Promosi".

## Business Rule (PO)
- History = audit. Data **hanya** dari `PromotionRun` + `PromotionRunItem` (termasuk `summary` JSON counts). **Tidak ada** perhitungan ulang keputusan promosi.
- Kolom Transferred/Dropped tampil (default 0) untuk kelengkapan Business Rule; sumber nilai tetap kolom `summary`.

## File Utama
- `src/main/services/promotion-run.service.ts` (mapping audit)
- `src/main/repositories/promotion.repository.ts` (include relasi + batch label kelas)
- `src/shared/dto/promotion.ts` (DTO history)
- `electron/ipc/promotion.ipc.ts`, `electron/preload/promotion.preload.ts`
- `src/pages/promotion/PromotionHistoryPage.tsx`, `src/pages/promotion/PromotionRunDetailPage.tsx`
- `p3_promotion_history_smoke/smoke.ts`

## Validation Summary
- lint PASS · build PASS · migrate diff = no drift
- Smoke P-3 75/75 · Regression 12 suite = 565 PASS, 0 FAIL

## Commit
Satu commit final setelah review PO:
`feat: promotion run history read-only audit UI (WO P-3)`
