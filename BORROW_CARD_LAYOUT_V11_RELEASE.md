# BORROW CARD LAYOUT v1.1 — RELEASE

## Deliverable
- **1 file source:** `src/main/services/borrow-card.service.ts` — layout v1.1 (header-info kanan-atas, footer kiri kosong, kapasitas 5+13, judul 8pt, baris 2.8mm, inv rata kanan).
- **2 smoke diperbarui:** `borrow_card_wo1_smoke/smoke.ts` (104), `borrow_card_uat_smoke/smoke.ts` (31).
- **2 smoke baru:** `borrow_card_layout_v11_smoke/smoke.ts` (58, murni), `borrow_card_layout_v11_smoke/geometry.cjs` (10, render nyata Electron).
- **Laporan:** `WORK_ORDER_BORROW_CARD_LAYOUT_V11_IMPLEMENTATION.md`, `BORROW_CARD_LAYOUT_V11_FINAL_REVIEW.md`, `BORROW_CARD_LAYOUT_V11_RELEASE.md` + update `AGENTS.md`.

## Scope check
- **TIDAK diubah:** DTO, Repository, Borrow/Return Service, IPC, preload, env.d.ts, schema, migration, `print.service.ts` (PDF fix WO sebelumnya tetap), Preview/Print pipeline, renderer UI.
- Bundle preload & renderer byte-identik baseline; `prisma migrate diff` empty.

## Validation Summary
- lint PASS · build PASS (main 1,883.01 kB · preload 9.95 kB · renderer 1,147.66 kB) · migrate diff empty.
- Smoke: wo1 104 · v11 58 · uat 31 · pdf 6 · geometry 10 → **209 PASS, 0 FAIL**.
- PDF tetap 110.067 × 59.944 mm (MediaBox 312.000×169.920pt).

## Catatan untuk PO
- Konfirmasi visual manual preview/print direkomendasikan (perbandingan kelegaan 5 buku di halaman 1).
- Tidak ada migration/backfill; fitur siap dipakai setelah review.
