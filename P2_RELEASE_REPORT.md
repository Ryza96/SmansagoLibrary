# P2_RELEASE_REPORT

- **WO:** P-2 — Promotion Execute
- **Status:** IMPLEMENTED — READY Final Review (gate berhenti menunggu review PO)

---

## 1. Deliverable

| File | Kategori |
|------|----------|
| `src/main/services/promotion-execute.service.ts` | Service (executor Mode A, SATU `$transaction`) |
| `src/main/services/promotion-run.service.ts` | Service (audit run read-only) |
| `src/main/repositories/promotion.repository.ts` | Repository (tulis run+items dlm tx; baca audit) |
| `src/shared/dto/promotion.ts` | DTO (+`AutomaticPromotionExecuteInput`, `PromotionRunDTO`, `PromotionRunItemDTO`, `PromotionRunStatus`) |
| `src/main/repositories/enrollment.repository.ts` | Repository (+`findActiveByClassesWithTx`, `closeWithTx`, `createActiveWithTx`) |
| `src/main/repositories/class.repository.ts` | Repository (+`findByAcademicYearWithTx`) |
| `src/main/repositories/member.repository.ts` | Repository (+`updateStatusWithTx`) |
| `p2_execute_smoke/smoke.ts` | Smoke fresh DB (87/87) |
| `WORK_ORDER_P2_IMPLEMENTATION_REPORT.md`, `P2_FINAL_REVIEW.md`, `P2_RELEASE_REPORT.md` | Laporan |

## 2. Validation ringkas

- lint PASS · build PASS (main 1,799.72 kB · preload 8.62 kB · renderer 1,006.72 kB — preload/renderer tidak berubah) · `migrate diff` = empty.
- Smoke P-2 87/87 (Preview==Execute, re-validate, mutasi enrollment, Member.status sync, satu-ACTIVE, konsistensi run/item, **rollback all-or-nothing**, guard, state-based eligibility run ulang).
- Regression 10 suite fresh DB: P-1 decide 30 · P-1 preview 33 · E-1 39 · E-2 36 · E-3 78 · E-4 45 · MI-1 43 · MI-2 37 · MI-3 38 · MI-4 24 — semua PASS (total 490).

## 3. Dampak

- **Fitur baru:** executor promosi Mode A production-benar (all-or-nothing) + audit `PromotionRun`/`PromotionRunItem`.
- **Tidak ada perubahan perilaku aplikasi yang sudah ada** (hanya penambahan metode/kelas; preload/renderer identik).
- **Tidak ada** perubahan schema/migration/DB (additive service+repo saja).
- **Tidak ada** IPC/preload/UI (keputusan PO JANGAN; WBS `promotions:run` di-trim → menjadi WO UI/plumbing berikutnya).

## 4. Kontrak penting

- **Satu-satunya decision engine:** `decide()` di `src/main/services/promotion-preview.service.ts` (dipakai ulang P-2, tidak di-re-implement).
- **Status terminal sinkronisasi Member.status** via `memberStatusForTerminalAcademic` (config F1 `academic-status.ts`).
- **Audit:** `PromotionRun.status='SUCCESS'` + `summary=JSON(PromotionPreviewCounts)`; `PromotionRunItem.outcome ∈ {PROMOTED,REPEATED,REDISTRIBUTED,GRADUATED,NO_TARGET,ERROR}` + `targetClassId` + `message`.

## 5. Catatan rilis

- **PRASYARAT WO berikutnya:** P-4 (retry, RFC §9) dapat memakai `PromotionRunService.findById` + `executeAutomatic` (state-based eligibility). Plumbing IPC/preload/UI untuk eksekusi promosi dikerjakan di WO UI tersendiri (out of scope P-2).
