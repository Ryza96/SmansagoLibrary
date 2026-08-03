# P1_RELEASE_REPORT

- **WO:** P-1 — Promotion Foundation
- **Status:** READY TO RELEASE (menunggu review PO — gate berhenti, satu commit di bawah)

---

## 1. Deliverable

| File | Kategori |
|------|----------|
| `src/shared/dto/promotion.ts` | DTO (kontrak shared) |
| `src/main/services/promotion-preview.service.ts` | Service (decide + preview) |
| `p1_decide_smoke/decide.unit.ts` | Unit test decide (30/30) |
| `p1_preview_smoke/smoke.ts` | Smoke preview fresh DB (33/33) |
| `WORK_ORDER_P1_IMPLEMENTATION_REPORT.md`, `P1_FINAL_REVIEW.md`, `P1_RELEASE_REPORT.md` | Laporan |

## 2. Validation ringkas

- lint PASS · build PASS (bundles tidak berubah) · migrate diff = empty.
- Unit decide 30/30 · Smoke preview 33/33 · Regression E-1..E-4 + MI-1..MI-4 semua PASS.

## 3. Dampak

- **Tidak ada perubahan perilaku aplikasi yang sudah ada** (bundles identik).
- Tidak ada perubahan schema / migration / DB.
- Tidak ada IPC / preload / UI baru (keputusan PO: P-2 menyambung executor).

## 4. Komit & push

- Satu commit final: `feat: promotion foundation with pure decide() and preview (WO P-1)`.
- Push ke `origin/main`.

## 5. Catatan rilis

- **PRASYARAT WO berikutnya:** P-2 (executor Mode A, `promotions:run`) dapat langsung mengimpor `decide()` dari `src/main/services/promotion-preview.service.ts` — fungsi keputusan tunggal sudah dikunci.
