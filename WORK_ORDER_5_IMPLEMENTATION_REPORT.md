# WORK_ORDER_5_IMPLEMENTATION_REPORT

**WO-5 — AY-2: Academic Year Master UI**
**Status: DONE — READY review PO**
**Tanggal: 2026-08-03**

---

## 1. Ringkasan

Implementasi WO-5 AY-2 sesuai `WO5_DISCOVERY_REPORT.md` (APPROVED) dan RFC §2.4: **halaman CRUD Tahun Ajaran + tandai aktif** di aplikasi. Murni renderer — mengonsumsi API `academicYears.*` yang sudah ada (Preload → UI → Testing, WBS §3).

**Tidak ada** perubahan Repository, Service, IPC, Preload, Bootstrap, env.d.ts, DTO, schema, maupun migration. Curriculum/Class/Enrollment/Promotion tidak disentuh.

## 2. Deliverable

| File | Keterangan |
|------|-----------|
| `src/pages/master/AcademicYearListPage.tsx` | **BARU** — list + search (debounce, `.data` dari paginated `findMany`) + tambah/edit/hapus + badge status |
| `src/pages/master/AcademicYearFormPage.tsx` | **BARU** — halaman create/edit via `findById`/`create`/`update` |
| `src/components/master/AcademicYearForm.tsx` | **BARU** — form nama + tanggal mulai/selesai (input date) + toggle aktif + warning guard |
| `src/routes/index.tsx` | +3 route `master/academic-years`, `.../new`, `.../:id/edit` |
| `src/components/layout/Sidebar.tsx` | +item "Tahun Ajaran" di grup Master Data |
| `src/utils/labels.ts` | +blok label `ACADEMIC_YEAR` |
| `src/utils/navigation.ts` | +`ROUTES.MASTER_ACADEMIC_YEAR_*` + `academicYearEditPath()` |
| `wo5_ay2_smoke/smoke.ts` | Smoke DB UAT — **14/14 PASS** |

## 3. Perilaku UI

- **List:** kolom Nama Tahun, Tanggal Mulai, Tanggal Selesai, Status (badge hijau "Aktif" / abu-abu "Nonaktif"); search server-side 300ms; tombol Tambah; edit/hapus per baris.
- **Form (create):** nama + tanggal mulai/selesai (wajib) + checkbox aktif. Saat checkbox aktif dicentang, tampil `ACTIVATE_WARNING` ("Mengaktifkan akan menonaktifkan tahun ajaran lain").
- **Form (edit):** backfill data dari `findById`; toggle aktif sama; submit `update`.
- **Delete:** konfirmasi; service menolak (AppError 400) bila tahun dipakai kelas — List page menampilkan `err.message` via `alert`.
- **Validasi client:** nama wajib; tanggal mulai & selesai wajib; selesai tidak sebelum mulai.

## 4. Hasil UAT Smoke (fresh DB) — 14/14 PASS

| # | Skenario | Hasil |
|---|----------|-------|
| 1 | Create tahun nonaktif (tersimpan, count aktif=0) | PASS |
| 2 | Create tahun kedua AKTIF → tahun pertama nonaktif (Active Year Guard) | PASS |
| 3 | Edit tahun + toggle aktif → tahun lain nonaktif (guard tetap) | PASS |
| 4 | Delete tahun berkelas → ditolak 400 (Delete Guard) | PASS |
| 5 | Delete tahun tanpa kelas → sukses | PASS |
| 6 | `findMany` list 2 record, total 2 | PASS |
| 7 | Nama duplikat ditolak | PASS |

## 5. Validation (semua PASS)

| # | Check | Hasil |
|---|-------|-------|
| 1 | lint | `npm run lint` (tsc node+web) exit 0 |
| 2 | build | `npm run build` — main 1,776.61 kB · preload 7.68 kB · renderer 952.31 kB |
| 3 | Manual CRUD PASS | smoke UAT 14/14 (create/read/update/delete) |
| 4 | Active Year Guard PASS | mengaktifkan satu tahun menonaktifkan tahun lain (guard AY-1a) |
| 5 | Delete Guard PASS | tahun berkelas ditolak 400; tanpa kelas terhapus |
| 6 | Renderer ter-build | grep bundle: `Tahun Ajaran`, `master/academic-years` = True |

## 6. Yang TIDAK dikerjakan (eksplisit)

- Repository / Service / IPC / Preload / Bootstrap / env.d.ts / DTO — N/A (sudah lengkap sejak WO-005 + guard AY-1a).
- Schema `prisma/schema.prisma` + migration — tidak disentuh.
- Operasi Buka/Tutup Tahun (AY-1b) — tidak disentuh; tetap WO terpisah.
- Curriculum / Class / MemberEnrollment / Promotion — tidak disentuh.
- WO sebelumnya (F1/F2a/F2b/AY-1a) — tidak disentuh.

## 7. Catatan Teknis

- **Sequencing WBS:** `AY-1a → AY-1b → AY-2`. PO memerintahkan AY-2 lebih dulu (dilabeli WO-5). Tidak ada blokade fungsional karena "tandai aktif" diimplementasikan via `update(isActive:true)` yang sudah di-route ke `updateExclusiveActive` (guard transaksional AY-1a). Tidak ada pelanggaran RFC/WBS pada desain; AY-1b tetap dijadwalkan.
- **Pola konsumsi paginated:** `academicYears.findMany(search)` mengembalikan `{data,total,page,limit,totalPages}` — List page memakai `.data` (server-side search), bukan filter client.
- **Konversi tanggal:** input `type="date"` menghasilkan `YYYY-MM-DD` → dikonversi ke ISO saat submit (`new Date(v).toISOString()`); backfill edit memakai `iso.slice(0,10)`.
