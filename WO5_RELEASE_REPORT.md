# WO5_RELEASE_REPORT

**WO-5 — AY-2: Academic Year Master UI**
**Tanggal: 2026-08-03**
**Status: DONE — READY review PO**

---

## Isi Rilis

| Komponen | File | Deskripsi |
|----------|------|-----------|
| List Page | `src/pages/master/AcademicYearListPage.tsx` | List + search + tambah/edit/hapus + badge status |
| Form Page | `src/pages/master/AcademicYearFormPage.tsx` | Create/edit via `findById`/`create`/`update` |
| Form Component | `src/components/master/AcademicYearForm.tsx` | Nama + tanggal mulai/selesai + toggle aktif + warning guard |
| Routes | `src/routes/index.tsx` | +3 route `master/academic-years[...]` |
| Sidebar | `src/components/layout/Sidebar.tsx` | +item "Tahun Ajaran" (Master Data) |
| Labels | `src/utils/labels.ts` | +blok `ACADEMIC_YEAR` |
| Navigation | `src/utils/navigation.ts` | +`ROUTES.MASTER_ACADEMIC_YEAR_*` + `academicYearEditPath` |
| Smoke | `wo5_ay2_smoke/smoke.ts` | UAT 14/14 PASS (fresh DB) |
| Laporan | `WORK_ORDER_5_IMPLEMENTATION_REPORT.md`, `WO5_FINAL_REVIEW.md`, `WO5_RELEASE_REPORT.md` | Dokumentasi WO-5 |
| Discovery (referensi) | `WO5_DISCOVERY_REPORT.md` | Dasar implementasi (APPROVED) |

## Ringkasan Perilaku

| Fitur | Cara kerja |
|-------|-----------|
| List | Kolom Nama/Tanggal Mulai/Tanggal Selesai/Status; search server-side 300ms; badge Aktif/Nonaktif |
| Create | Nama + tanggal (wajib) + checkbox aktif; warning saat mengaktifkan |
| Edit | Backfill dari `findById`; toggle aktif; `update` |
| Tandai aktif | Via `update(isActive:true)` → guard AY-1a menonaktifkan tahun lain (transaksional) |
| Delete | Ditolak 400 bila tahun dipakai kelas; sukses bila tidak |

## Hasil Validasi

| # | Check | Hasil |
|---|-------|-------|
| 1 | lint | `npm run lint` PASS |
| 2 | build | `npm run build` PASS (renderer 952.31 kB) |
| 3 | Manual CRUD | smoke 14/14 PASS |
| 4 | Active Year Guard | PASS (1 aktif selalu) |
| 5 | Delete Guard | PASS (tahun berkelas ditolak) |
| 6 | Renderer ter-build | grep `Tahun Ajaran`/`academic-years` = True |

## Hal yang Perlu Diketahui Reviewer

1. **Murni UI** — tidak ada perubahan backend, schema, migration, DTO; seluruh channel `academic-years:*` sudah ada sejak WO-005 dan guard AY-1a.
2. **Sequencing WBS:** AY-2 dikerjakan sebelum AY-1b atas instruksi PO. Tidak ada blokade fungsional ("tandai aktif" via guard AY-1a). AY-1b tetap dijadwalkan sebagai WO terpisah.
3. **Pola UI** mengikuti eksisting (`MasterTable`, `AuthorForm`, `labels.ts`, `navigation.ts`) — konsisten dan mudah direview.

## Status

**READY.** Menunggu review Product Owner sebelum lanjut ke Work Order berikutnya (C-1).
