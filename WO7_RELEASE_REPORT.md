# WO7_RELEASE_REPORT

**WO-7 — CL-1: Class Immutability Guard**
**Status: READY UNTUK RELEASE (menunggu review PO)**
**Tanggal: 2026-08-03**

---

## 1. Ringkasan Rilis

Guard immutability `Class` (`educationLevel` + `parallel`) + validasi level via F1 dikirim. **Tidak ada perubahan kontrak IPC/preload/DTO/schema** — fitur lama tidak terpengaruh.

## 2. Konten Rilis

| Kategori | File |
|----------|------|
| Diubah | `src/main/services/class.service.ts` (create: normalisasi+validasi level; update: blokir educationLevel/parallel) |
| Baru | `wo7_cl1_smoke/smoke.ts` |
| Baru | `WO7_DISCOVERY_REPORT.md`, `WORK_ORDER_7_IMPLEMENTATION_REPORT.md`, `WO7_FINAL_REVIEW.md`, `WO7_RELEASE_REPORT.md` |
| Diubah | `AGENTS.md` (section WO-7) |

## 3. Validasi Rilis (pra-release checklist)

- [x] `npm run lint` PASS
- [x] `npm run build` PASS (main 1,776.84 kB · preload 7.68 kB · renderer 959.90 kB)
- [x] Smoke `wo7_cl1_smoke` 16/16 PASS (fresh DB temp, dibersihkan)
- [x] DB live dev tidak disentuh
- [x] Tidak ada perubahan schema / migration
- [x] Tidak ada perubahan Repository / IPC / Preload / UI / DTO / env.d.ts / Bootstrap

## 4. Catatan Post-Release

- **Konsekuensi WBS-strict:** `academicYearId`/`curriculumId` tetap dapat diubah via `classes:update` (keputusan PO). Jika kelak perlu di-hardening, ajukan WO terpisah.
- CL-2a (Class Master UI) adalah WO berikutnya dan bergantung pada CL-1 — belum dikerjakan (menunggu review).
- Setelah persetujuan PO, artifact (`dist/` electron-builder) perlu di-rebuild & di-repackage terpisah (pelajaran WO-2 Investigation) agar PO bisa menguji di aplikasi terpasang.

## 5. Status

**DONE — menunggu review PO.** Tidak lanjut WO berikutnya (CL-2a) sampai ada persetujuan.
