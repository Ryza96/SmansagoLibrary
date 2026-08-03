# WO6_RELEASE_REPORT

**WO-6 — C-1: Curriculum Master UI**
**Status: READY UNTUK RELEASE (menunggu review PO)**
**Tanggal: 2026-08-03**

---

## 1. Ringkasan Rilis

Fitur **Master Data → Kurikulum** (CRUD lengkap) ditambahkan ke aplikasi. Murni perubahan renderer; backend `curricula.*` sudah ada dan tidak diubah.

## 2. Konten Rilis

| Kategori | File |
|----------|------|
| Baru | `src/pages/master/CurriculumListPage.tsx` |
| Baru | `src/pages/master/CurriculumFormPage.tsx` |
| Baru | `src/components/master/CurriculumForm.tsx` |
| Baru | `wo6_c1_smoke/smoke.ts` |
| Diubah | `src/routes/index.tsx` (+3 route) |
| Diubah | `src/components/layout/Sidebar.tsx` (+item "Kurikulum") |
| Diubah | `src/utils/labels.ts` (+blok `CURRICULUM`) |
| Diubah | `src/utils/navigation.ts` (+`ROUTES.MASTER_CURRICULUM_*` + `curriculumEditPath`) |
| Laporan | `WO6_DISCOVERY_REPORT.md`, `WORK_ORDER_6_IMPLEMENTATION_REPORT.md`, `WO6_FINAL_REVIEW.md`, `WO6_RELEASE_REPORT.md` |

## 3. Validasi Rilis (pra-release checklist)

- [x] `npm run lint` PASS
- [x] `npm run build` PASS (main 1,776.61 kB · preload 7.68 kB · renderer 959.90 kB)
- [x] Smoke UAT `wo6_c1_smoke` 10/10 PASS (fresh DB temp)
- [x] DB live dev tidak disentuh (smoke memakai fresh DB temp, dibersihkan)
- [x] Tidak ada perubahan schema / migration
- [x] Tidak ada perubahan backend (Repository/Service/IPC/Preload/Bootstrap/env.d.ts/DTO)

## 4. Catatan Post-Release

- Setelah persetujuan PO, artifact (`dist/` electron-builder) perlu **di-rebuild & di-repackage** terpisah agar PO bisa menguji fitur di aplikasi terpasang (pelajaran WO-2 Investigation).
- Commit ONE FINAL (semua file WO-6) + push ke `origin/main` dilakukan sesuai gate.

## 5. Status

**DONE — menunggu review PO.** Tidak lanjut WO berikutnya (CL-1) sampai ada persetujuan.
