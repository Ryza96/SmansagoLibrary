# WORK_ORDER_P1_IMPLEMENTATION_REPORT

- **WO:** P-1 — Promotion Foundation
- **Status:** IMPLEMENTED — READY Final Review
- **Source of Truth:** `MASTER_DATA_AKADEMIK_ARCHITECTURE_RFC.md` (LOCKED, §7/§7.1/§8/§9) + `MASTER_DATA_AKADEMIK_WBS.md` (LOCKED, WO-21 P-1) + `P1_DISCOVERY_REPORT.md` (APPROVED)
- **Keputusan arsitektur PO:** `decide()` = **Single Decision Engine**. P-2 WAJIB memakai fungsi yang sama; TIDAK boleh ada logika keputusan kedua.

---

## 1. Scope yang dikerjakan

| Deliverable WBS | File | Keterangan |
|-----------------|------|------------|
| DTO | `src/shared/dto/promotion.ts` (BARU) | `PromotionPreviewDTO` persis RFC §8 (mode + counts 6 + items), `PromotionDecision`, `PromotionDecideInput`, `PromotionTargetClassInput`, `PromotionPreviewItem`, `PromotionPreviewCounts`, `AutomaticPromotionPreviewInput` |
| Service | `src/main/services/promotion-preview.service.ts` (BARU) | `decide()` murni + `PromotionPreviewService.preview()` read-only |
| Unit Test | `p1_decide_smoke/decide.unit.ts` (BARU) | 30/30 PASS (tanpa DB — decide murni) |
| Smoke | `p1_preview_smoke/smoke.ts` (BARU) | 33/33 PASS (fresh DB, read-only) |

## 2. Layer per WBS §3 (auditability)

| Layer | Status | Catatan |
|-------|--------|---------|
| Repository | **N/A** | Preview baca via `getPrisma()` langsung (pola `enrollment.service.ts`) — tidak ada repository baru |
| Service | **DONE** | `PromotionPreviewService` + `decide()` |
| IPC | **N/A** | JANGAN (per keputusan PO) — P-2 yang akan menyambung |
| Preload | **N/A** | JANGAN (per keputusan PO) |
| UI | **N/A** | JANGAN (per keputusan PO) |
| Testing | **DONE** | Unit 30/30 + Smoke 33/33 + Regression (lihat §5) |
| PO Review | **PENDING** | Berhenti menunggu review |

## 3. Detail implementasi

### 3.1 `decide()` — Single Decision Engine (MURNI)

- **Murni:** tidak ada akses DB, tidak membaca state global, tidak menulis. Seluruh input via parameter `PromotionDecideInput` (member, sumber, kelas target lengkap + `repeat?`).
- **Deterministik:** untuk input identik → output identik (dibuktikan unit STEP 10/12).
- **Logika Mode A (RFC §7):**
  1. `levelOrder(sourceLevel)` invalid → `ERROR`.
  2. `repeat === true` (eksplisit, RFC §7 "kecuali dinyatakan REPEATED") → cari kelas tingkat SAMA + parallel + kurikulum sama → `REPEATED`; tak ada → `NO_TARGET`.
  3. `XII` → `GRADUATED` (tanpa target).
  4. selainnya → promosi ke `levelOrder+1`, cocokkan parallel + kurikulum SAMA (`X MERDEKA 1` → `XI MERDEKA 1`) → `PROMOTED`; tak ada → `NO_TARGET`.
- **Pencocokan otomatis:** `findTarget` menyamakan `levelOrder(expected)`, `parallel`, dan `curriculumId` — unique komposit kelas `(academicYearId, curriculumId, educationLevel, parallel)` menjamin maksimal 1 match → deterministik.
- **Outcome:** `PROMOTED | REPEATED | REDISTRIBUTED | GRADUATED | NO_TARGET | ERROR` (sama dengan `PromotionRunItem.outcome`, RFC §2.2).
- **P-2 readiness:** `decide()` di-export dari modul yang sama; P-2 cukup import dan memanggil ulang di dalam `$transaction` (RFC §7.1 re-validate) — tidak ada fungsi keputusan kedua.

### 3.2 `PromotionPreviewService.preview()` — READ-ONLY

- Validasi input: mode `AUTOMATIC` (MAPPING/BULK_EDIT → 400 "belum didukung — P-3/P-5"), `fromYearId`/`toYearId` ada (404), tahun sumber ≠ target (400), `fromClassId` opsional + milik tahun sumber (400).
- Baca: kelas sumber (`findByAcademicYear` / `findById`) + enrollment ACTIVE sumber (`getPrisma()` include member+class) + kelas target tahun target.
- Hitung: jalankan `decide()` untuk tiap item (fungsi SAMA dengan execute), agregasi `counts` (promoted/repeated/graduated/redistributed/noTarget/error).
- **Tidak menulis apa pun** — dibuktikan smoke STEP 3 (enrollment, promotionRun, promotionRunItem, member.status tidak berubah).

## 4. Keputusan teknis (bukan keputusan PO)

1. **Repeat ditempatkan sebelum GRADUATED:** `repeat` eksplisit menang atas GRADUATED otomatis (XII + repeat → REPEATED bila kelas XII tersedia). Sesuai teks RFC §7 "kecuali dinyatakan REPEATED". Unit STEP 8.
2. **Preview dibatasi Mode A** untuk P-1; MAPPING/BULK_EDIT di-return 400 agar gagal cepat, bukan implementasi siluman.
3. **`PromotionTargetClassInput` memuat `curriculumId`** — keputusan discovery (R5) untuk determinisme match antar kurikulum.
4. **Tidak ada repository/IPC/preload/bootstrap/env.d.ts/UI** — mengikuti keputusan JANGAN dari PO.

## 5. Validation

| Gate | Hasil |
|------|-------|
| Unit `decide()` | **30/30 PASS** (X→XI, XI→XII, XII→GRADUATED, NO_TARGET, kurikulum beda, REPEATED, repeat-no-target, XII+repeat, level invalid, determinisme, pure) |
| Smoke Preview (fresh DB) | **33/33 PASS** (counts, items, per-kelas, read-only, guard input, deterministik) |
| Regression | E-1 **39**, E-2 **36**, E-3 **78**, E-4 **45**, MI-1 **43**, MI-2 **37**, MI-3 **38**, MI-4 **24** — semua PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS (main 1,796.83 kB · preload 8.62 kB · renderer 1,006.72 kB — tidak berubah, konsisten N/A layer lain) |
| `prisma migrate diff` | = empty migration (schema tidak disentuh) |
| Grep bundle | `promotions:`/`Promotion` = 0 di main/preload/renderer → tidak ada wiring IPC/preload/UI |

## 6. File yang diubah

- **Baru:** `src/shared/dto/promotion.ts`, `src/main/services/promotion-preview.service.ts`, `p1_decide_smoke/decide.unit.ts`, `p1_preview_smoke/smoke.ts`, `WORK_ORDER_P1_IMPLEMENTATION_REPORT.md` (ini)
- **Dimodifikasi:** tidak ada.
- **Bukan target (tetap utuh):** schema, migration, repository, IPC, preload, env.d.ts, bootstrap, UI, `Member.classId`, `Member.status` (E-3), EnrollmentService.

## 7. Catatan risiko (per discovery)

- R1 (determinisme decide) → terpenuhi: decide murni + unit STEP 10/12.
- R2 (keputusan basi saat execute) → dijamin di P-2 dengan re-validate `decide()` dalam `$transaction` (RFC §7.1); P-1 menyediakan fungsi yang sama.
- R3 (no-DB-default) → P-1 tidak menulis; P-2 wajib mengisi mode/status/outcome eksplisit.
- R5 (`levelOrder` invalid) → decide mengembalikan `ERROR` (unit STEP 9), bukan silent skip.

---

**Status: DONE — melangkah ke Final Review.**
