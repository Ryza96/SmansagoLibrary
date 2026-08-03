# MILESTONE A — CHANGELOG

- **WO:** WO-13 PR-A — Milestone Summary
- **Versi:** APLibrary 0.1.0 (Milestone A — Master Data Akademik)
- **Status:** **READY — menunggu review PO.**

---

## Fitur baru (Milestone A — Master Data Akademik)

### Tahun Ajaran
- CRUD lengkap (list/search, form create/edit, hapus).
- **Exclusive-active guard (WO-4 AY-1a):** hanya satu Tahun Ajaran aktif; mengaktifkan yang lain menonaktifkan sisanya dalam satu transaksi (rollback otomatis).
- **Buka/Tutup Tahun (WO-11 AY-1b):** aksi Buka/Tutup dari daftar + kartu; tahun nonaktif dilarang dibuka kembali (K3 update-reject); delete hanya saat tanpa kelas.
- UI: `master/academic-years`, sidebar "Master Data → Tahun Ajaran", badges status.

### Kurikulum
- CRUD lengkap; guard duplikat nama; delete hanya saat tidak dipakai kelas.
- UI: `master/curricula`, sidebar "Kurikulum".

### Kelas
- CRUD lengkap; **immutability** tingkat (X/XI/XII) & paralel saat edit (WO-7 CL-1).
- **Clone ke Tahun Baru (WO-9 CL-2b):** salin `curriculumId`/`educationLevel`/`parallel`, guru dikosongkan, `isActive=true`, idempoten (skip duplikat).
- Fetch-all + filter client-side (tahun/kurikulum/search) — WO-8 CL-2a.
- UI: `master/classes`, sidebar "Kelas", modal Clone.

### Fondasi arsitektur
- **F1 shared config (WO-1):** `src/shared/config/member-type.ts` + `education-level.ts` — source of truth lintas main/renderer.
- **F2a schema (WO-2):** model `MemberEnrollment`, `PromotionRun`, `PromotionRunItem` + 11 index (murni additive; 4 migrations total).
- **F2b backfill (WO-3):** `scripts/backfill-member-enrollment.ts` — `Member.classId → MemberEnrollment(ACTIVE)` idempoten, orphan dilaporkan.

---

## Bug fix / hardening
- **WO-11A:** UI AY-1b di-rewire — handler, preload, env.d.ts, page, labels, route props sinkron (menutup T1/T2 WO-12).
- Guard service dua lapis (service + repo transaksional) untuk invarian 1-aktif; delete-guard master data di service layer.

---

## Deliverable & verifikasi
- **Testing:** smoke per-WO 259/259 PASS (fresh DB): wo1 46 · wo2 35 · wo3 28 · wo4 23 · wo5 19 · wo6 10 · wo7 16 · wo8 16 · wo9 26 · wo11 40; UAT WO-12 FINAL **APPROVED**.
- **Gate:** `npm run lint` PASS · `npm run build` PASS (main 1,780.16 kB · preload 7.84 kB · renderer 987.29 kB).
- **Migrations:** 4 migrations; fresh DB `migrate deploy` PASS; `migrate status` hijau; `migrate diff` = no difference.
- **Artifact:** `dist/win-unpacked/APLibrary.exe` + `dist/APLibrary Setup 0.1.0.exe` (94.0 MB, fresh 03/08 16:08) + `latest.yml`; `app.asar` diverifikasi memuat seluruh fitur (grep main: `academic-years:activate/deactivate`, `classes:cloneToYear`; renderer: `Buka Tahun`, `Tutup Tahun`, `Tahun Ajaran`, `Kurikulum`, `Clone ke Tahun Baru`, routes `master/*`).

---

## Perubahan pada WO-13 (PR-A) saja
- Tidak ada perubahan source/schema/migration/fitur.
- Build & repackage artifact (electron-builder, `signAndEditExecutable=false` — unsigned/default-icon, sama dengan release sebelumnya; lihat catatan lingkungan di `MILESTONE_A_RELEASE_REPORT.md` §1.5).
- 3 laporan Milestone A + 3 laporan WO-12 FINAL di-commit sebagai **ONE FINAL COMMIT** lalu push.

---

## Riwayat commit Milestone A
`75e7205` WO-1 F1 · `1397e47`+`a379ffe` WO-2 F2a · `a195cd5` WO-3 F2b · `27b1f3b` WO-4 AY-1a · `d4078e4` WO-5 AY-2 · `fbb4cb7` WO-6 C-1 · `efe9898` WO-7 CL-1 · `9537eb7` WO-8 CL-2a · `1582484` WO-9 CL-2b · `ac3ba89` WO-11 AY-1b · `c35fa11` WO-11A · **(baru)** WO-13 PR-A release.

---

## Ke depan (Milestone B — sudah dirancang, belum dikerjakan)
- Enrollment (E-1/E-2): cutover delete-guard `Member.classId → enrollment.count` (menutup T3/debt M1) → hapus kolom `Member.classId` (F3).
- Promotion (P-1/P-2): workflow naik kelas (naik/tinggal/redistribusi), Buka/Tutup terhubung, clone AY.
- Resolusi debt Medium/Low sesuai track (lihat `MILESTONE_A_PRODUCTION_READY.md` §2).
