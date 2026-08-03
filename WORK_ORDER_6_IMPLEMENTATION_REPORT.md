# WORK_ORDER_6_IMPLEMENTATION_REPORT

**WO-6 — C-1: Curriculum Master UI**
**Status: DONE — READY review PO**
**Tanggal: 2026-08-03**

---

## 1. Ringkasan

Implementasi WO-6 C-1 sesuai `WO6_DISCOVERY_REPORT.md` (APPROVED): **halaman CRUD Kurikulum** di aplikasi. Murni renderer — mengonsumsi API `curricula.*` yang sudah ada (Preload → UI → Testing, WBS §3).

**Tidak ada** perubahan Repository, Service, IPC, Preload, Bootstrap, env.d.ts, DTO, schema, maupun migration. AcademicYear/Class/Enrollment/Promotion tidak disentuh.

## 2. Deliverable

| File | Keterangan |
|------|-----------|
| `src/pages/master/CurriculumListPage.tsx` | **BARU** — list + search (debounce, `.data` dari paginated `findMany`) + tambah/edit/hapus |
| `src/pages/master/CurriculumFormPage.tsx` | **BARU** — halaman create/edit via `findById`/`create`/`update` |
| `src/components/master/CurriculumForm.tsx` | **BARU** — form satu field nama + simpan/batal (pola `AuthorForm`) |
| `src/routes/index.tsx` | +3 route `master/curricula`, `.../new`, `.../:id/edit` |
| `src/components/layout/Sidebar.tsx` | +item "Kurikulum" di grup Master Data |
| `src/utils/labels.ts` | +blok label `CURRICULUM` |
| `src/utils/navigation.ts` | +`ROUTES.MASTER_CURRICULUM_*` + `curriculumEditPath()` |
| `wo6_c1_smoke/smoke.ts` | Smoke DB UAT — **10/10 PASS** |

## 3. Perilaku UI

- **List:** kolom Nama; search server-side 300ms; tombol Tambah; edit/hapus per baris; `confirm` sebelum hapus; error guard ditampilkan via `alert(err.message)`.
- **Form (create):** satu field nama wajib.
- **Form (edit):** backfill dari `findById`; submit `update`.
- **Guard service (ditampilkan UI):** nama duplikat → 400; delete kurikulum yang dipakai kelas → 400 (`countByCurriculum`).

## 4. Hasil UAT Smoke (fresh DB) — 10/10 PASS

| # | Skenario | Hasil |
|---|----------|-------|
| 1 | Create kurikulum | PASS |
| 2 | Duplicate Name Guard (nama duplikat → 400) | PASS |
| 3 | Edit nama | PASS |
| 4 | Rename ke nama sendiri (no-op, tidak error) | PASS |
| 5 | Rename ke nama kurikulum lain → ditolak 400 | PASS |
| 6 | Delete kurikulum berkelas → ditolak 400 (Delete Guard) | PASS |
| 7 | Delete kurikulum tanpa kelas → sukses | PASS |
| 8 | `findMany` list 2 record | PASS |
| 9-10 | `findMany(search)` 1 record + total 1 | PASS |

## 5. Validation (semua PASS)

| # | Check | Hasil |
|---|-------|-------|
| 1 | lint | `npm run lint` (tsc node+web) exit 0 |
| 2 | build | `npm run build` — main 1,776.61 kB · preload 7.68 kB · renderer 959.90 kB |
| 3 | Manual CRUD PASS | smoke UAT 10/10 (create/read/update/delete) |
| 4 | Duplicate Name Guard PASS | create & update-to-lain ditolak 400; rename-ke-sendiri no-op |
| 5 | Delete Guard PASS | kurikulum berkelas ditolak 400; tanpa kelas terhapus |
| 6 | Renderer ter-build | grep bundle: `Kurikulum`, `master/curricula` = True |

## 6. Yang TIDAK dikerjakan (eksplisit)

- Repository / Service / IPC / Preload / Bootstrap / env.d.ts / DTO — N/A (sudah lengkap sejak WO-005, termasuk delete guard `countByCurriculum`).
- Schema `prisma/schema.prisma` + migration — tidak disentuh.
- AcademicYear / Class / MemberEnrollment / Promotion — tidak disentuh.
- WO sebelumnya (F1/F2a/F2b/AY-1a/AY-2) — tidak disentuh.

## 7. Catatan Teknis

- **Pola konsumsi paginated:** `curricula.findMany(search)` mengembalikan `{data,total,page,limit,totalPages}` — List page memakai `.data`.
- **Guard duplikat dua jalur di service:** create & update sama-sama cek `existsByName`; update mengecualikan nama sendiri (`name !== existing.name`) → rename-ke-nama-sendiri no-op (diverifikasi smoke).
- **WBS C-1:** Dependency `—`; Flow `Preload → UI → Testing → PO Review`; Kompleksitas LOW — dipenuhi tanpa blokade.
