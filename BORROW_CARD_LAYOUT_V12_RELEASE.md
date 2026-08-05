# RELEASE — BORROW CARD LAYOUT REFINEMENT v1.2

## Deliverables
- `src/main/services/borrow-card.service.ts` — refinemen visual v1.2 (7.5pt judul, inv mengikuti judul 13mm, separator abu terang 1px + margin 1mm; body 17mm, avatar 17mm, baris 2.7mm).
- `borrow_card_layout_v11_smoke/smoke.ts` — regression suite hidup v1.1+v1.2 (STEP 5 disesuaikan).
- `borrow_card_layout_v12_smoke/smoke.ts` — smoke structural v1.2 (37 checks, tanpa DB/Electron).
- `borrow_card_layout_v12_smoke/geometry.cjs` — geometry bounding-box di render Electron nyata (18 checks).
- Laporan: `WORK_ORDER_BORROW_CARD_LAYOUT_V12.md`, `BORROW_CARD_LAYOUT_V12_FINAL_REVIEW.md`, `BORROW_CARD_LAYOUT_V12_RELEASE.md`.

## Validation Ringkas
- lint PASS · build PASS (main +0.05 kB; preload/renderer identik) · migrate diff empty.
- Smoke: **266 PASS, 0 FAIL** (wo1 104 · v11 60 · v12 37 · uat 31 · v11-geom 10 · v12-geom 18 · pdf 6).
- PDF tetap 110×60mm (312.000×169.920pt).

## Batasan Rilis
- Status: **DONE - menunggu review PO**.
- Tidak membuka WO baru. Perubahan visual lain (mis. menambah baris per halaman, resize kartu, ubah print/PDF) = WO terpisah yang harus dikonsultasikan dengan PO.
