# P1_RELEASE_REPORT

- **WO:** P-1 — Promotion Foundation
- **Status:** REVISED (Review PO, 2 poin dibereskan) — READY Final Review (gate berhenti menunggu approval)

---

## 1. Deliverable

| File | Kategori |
|------|----------|
| `src/shared/dto/promotion.ts` | DTO (kontrak shared) |
| `src/main/services/promotion-preview.service.ts` | Service (decide + preview) |
| `src/main/repositories/enrollment.repository.ts` | Repository (+`findActiveByClasses` — revisi PO poin 1) |
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

## 4. Revisi Review PO (2 poin — COMPLETE)

1. **Service akses Prisma langsung → dibereskan:** preview baca enrollment via `EnrollmentRepository.findActiveByClasses()` (baru); `getPrisma` dihapus dari service.
2. **repeat vs graduated → GRADUATED menang:** analisis RFC menyimpulkan "XII → GRADUATED" tanpa syarat; REPEATED hanya X→X/XI→XI. `decide()` kini cek XII sebelum repeat; unit STEP 8 = `XII + repeat → GRADUATED`.

## 5. Catatan rilis

- **PRASYARAT WO berikutnya:** P-2 (executor Mode A, `promotions:run`) dapat langsung mengimpor `decide()` dari `src/main/services/promotion-preview.service.ts` — fungsi keputusan tunggal sudah dikunci.
