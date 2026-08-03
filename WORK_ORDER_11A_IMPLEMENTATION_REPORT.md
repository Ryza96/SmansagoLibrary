# WO-11A — IMPLEMENTATION REPORT (AY-1b Follow-up: UI Rewiring)

- **WO:** WO-11A AY-1b FOLLOW-UP — REVISION IMPLEMENTATION (menutup gap T1 dari WO-12)
- **Source of Truth:** `MASTER_DATA_AKADEMIK_ARCHITECTURE_RFC.md` (LOCKED, §2.4/§7) + `MASTER_DATA_AKADEMIK_WBS.md` (LOCKED) + `WO12_TEST_REPORT.md` / `WO12_UAT_REPORT.md` / `WO12_FINAL_REVIEW.md` (READ ONLY audit, verdict REVISION REQUIRED)
- **Status:** **COMPLETE — READY untuk review PO.**

## Latar Belakang
WO-12 (Testing & UAT) menemukan **T1 (HIGH)**: setelah WO-11, jalur `update(isActive)` ditutup (K3), tetapi `activate`/`deactivate` belum diekspos di preload/env.d.ts dan UI AY-2 masih memakai toggle checkbox yang kini ditolak service → **tidak ada cara membuka tahun dari aplikasi**. WO-11A menutup gap ini. **Bukan fitur baru** — fungsionalitas sudah ada di Service/IPC (WO-11).

## Scope
- **Diizinkan:** `electron/preload/academic-year.preload.ts`, `src/renderer/env.d.ts`, UI Academic Year, `wo4_ay1a_smoke`, `wo5_ay2_smoke`.
- **DILARANG (tidak diubah):** Repository, Service, IPC, DTO, Schema, Migration, Curriculum, Class, Enrollment, Promotion.

## Deliverable

### 1. Preload — ekspos operasi Buka/Tutup
`electron/preload/academic-year.preload.ts`:
- `academicYears.activate(id)` → `ipcRenderer.invoke('academic-years:activate', id)`
- `academicYears.deactivate(id)` → `ipcRenderer.invoke('academic-years:deactivate', id)`

### 2. env.d.ts — tipe kontrak renderer
`src/renderer/env.d.ts` blok `academicYears`:
- `activate: (id: string) => Promise<AcademicYearDTO>`
- `deactivate: (id: string) => Promise<AcademicYearDTO>`

### 3. UI Academic Year
- `src/utils/labels.ts` blok `ACADEMIC_YEAR`: hapus `ACTIVATE_WARNING`; tambah `ACTIVATE: 'Buka Tahun'`, `DEACTIVATE: 'Tutup Tahun'`, `ACTIVATE_CONFIRM`, `DEACTIVATE_CONFIRM`, `ACTIVATED`, `DEACTIVATED`.
- `src/components/master/AcademicYearForm.tsx`: **checkbox toggle aktif dihapus** dari state & payload (form kini hanya `name` + `startDate` + `endDate`); dirender sebagai info disabled + hint "Status aktif diubah melalui aksi 'Buka Tahun' / 'Tutup Tahun' pada daftar tahun ajaran." — tidak ada lagi input `isActive` dari UI.
- `src/pages/master/AcademicYearFormPage.tsx`: interface `AcademicYearFormValue` jadi `{ name; startDate; endDate }` (konsisten payload create/update).
- `src/pages/master/AcademicYearListPage.tsx`: kolom aksi baru — tombol **"Buka Tahun"** (untuk tahun nonaktif) dan **"Tutup Tahun"** (untuk tahun aktif), masing-masing dengan konfirmasi (`ACTIVATE_CONFIRM` / `DEACTIVATE_CONFIRM`), memanggil `api.academicYears.activate/deactivate`, alert sukses (`ACTIVATED` / `DEACTIVATED`), lalu refresh list (`fetchYears()`).

### 4. Smoke wo4 & wo5 — selaraskan ke kontrak baru
- `wo4_ay1a_smoke/smoke.ts` **23/23 PASS**: pertahankan semua guard create-exclusive (STEP 1-3, 7-8); ganti jalur `update(isActive)` → `service.activate(id)` (STEP 4-5); tambah asersi K3 update-isActive ditolak (STEP 6).
- `wo5_ay2_smoke/smoke.ts` **19/19 PASS**: UAT 3 toggle `update(isActive:true)` → `service.activate`; tambah UAT 3b (update nama tanpa isActive — regresi) & UAT 3c (update isActive ditolak 400); UAT 7 duplikat nama mengikuti rename UAT 3b.

## TIDAK Diubah (konfirmasi scope)
Repository, Service (`academic-year.service.ts`), IPC (`academic-year.ipc.ts`), DTO, Schema, Migration, bootstrap, env.ts, Curriculum/Class/Enrollment/Promotion, `wo11_ay1b_smoke`, laporan WO-11/WO-12.

## Validation
- `npm run lint` — **PASS**.
- `npm run build` — **PASS** (main 1,780.16 kB · preload 7.84 kB · renderer **987.29 kB** — renderer naik karena label/aksi baru; main/preload tidak berubah dari WO-11 = bukti Service/IPC N/A).
- Smoke fresh DB (deploy 4 migrations, tiap suite DB sendiri, dibersihkan):
  - wo4 23/23, wo5 19/19, wo11 40/40 (kontrak), wo6 10/10, wo7 16/16, wo8 16/16, wo9 26/26 — **regression PASS**.
- Grep bundle: `academic-years:activate` & `:deactivate` (main) = 1/1; `Buka Tahun`/`Tutup Tahun`/`academicYears.activate` (renderer) = 2/3/1 — ter-render.

## Laporan Terkait
`WO11A_FINAL_REVIEW.md`, `WO11A_RELEASE_REPORT.md`. Status: **DONE — menunggu review PO** (tidak lanjut WO berikutnya).
