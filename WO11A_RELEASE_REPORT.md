# WO11A — RELEASE REPORT (AY-1b Follow-up: UI Rewiring)

- **Release:** WO-11A AY-1b FOLLOW-UP — REVISION IMPLEMENTATION (menutup T1 WO-12)
- **Status:** **READY FOR RELEASE — menunggu review PO.** Satu commit final + push.

## Fitur yang Dirilis
- **Aksi Buka/Tutup Tahun dari aplikasi:** daftar Tahun Ajaran kini punya tombol **"Buka Tahun"** (tahun nonaktif) dan **"Tutup Tahun"** (tahun aktif), masing-masing dengan dialog konfirmasi dan pesan sukses — alur RFC §7 (create → clone → Buka Tahun) dapat dijalankan langsung di UI.
- **Form edit dibersihkan:** checkbox toggle "Aktif" dihapus dari payload (ditampilkan disabled + hint) sehingga UI tidak lagi memicu error K3 (`update(isActive)` ditolak service).
- **Preload & env.d.ts:** `academicYears.activate(id)` / `academicYears.deactivate(id)` diekspos ke renderer (channel `academic-years:activate`/`:deactivate` — sudah ada di IPC sejak WO-11).

## File yang Terkena
```
M electron/preload/academic-year.preload.ts
M src/renderer/env.d.ts
M src/utils/labels.ts
M src/components/master/AcademicYearForm.tsx
M src/pages/master/AcademicYearFormPage.tsx
M src/pages/master/AcademicYearListPage.tsx
M wo4_ay1a_smoke/smoke.ts
M wo5_ay2_smoke/smoke.ts
A WORK_ORDER_11A_IMPLEMENTATION_REPORT.md
A WO11A_FINAL_REVIEW.md
A WO11A_RELEASE_REPORT.md
```
Juga masuk commit (dokumentasi WO-12 yang belum ter-commit): `WO12_TEST_REPORT.md`, `WO12_UAT_REPORT.md`, `WO12_FINAL_REVIEW.md`.

## Validation Gate (final)
- `npm run lint` — PASS
- `npm run build` — PASS (main 1,780.16 kB · preload 7.84 kB · renderer 987.29 kB — Service/IPC/preload/main tidak berubah dari WO-11)
- Smoke fresh DB (tiap suite DB sendiri): **wo4 23/23**, **wo5 19/19**, **wo11 40/40**, regression **wo6 10/10 · wo7 16/16 · wo8 16/16 · wo9 26/26** — semua PASS.
- Grep bundle: `academic-years:activate` & `academic-years:deactivate` (main) ter-render; `Buka Tahun` / `Tutup Tahun` / `academicYears.activate` (renderer) ter-render.

## Catatan Rilis
- Tidak ada perubahan Schema/Migration/Repository/Service/IPC/DTO — tidak ada migration baru, tidak perlu deploy ulang DB.
- Operasi "Tutup Tahun" untuk satu-satunya tahun aktif tetap ditolak (K2) dengan pesan dari service yang tampil via `alert` — perilaku yang diminta PO.
- WO-12 T1 & T2 **tertutup**; T3 (delete guard legacy `Member.classId`) adalah WO E-2 (Milestone B).
- Commit final mencakup seluruh working tree agar repositori bersih. Setelah commit + push, BERHENTI menunggu review PO (tidak lanjut WO berikutnya).
