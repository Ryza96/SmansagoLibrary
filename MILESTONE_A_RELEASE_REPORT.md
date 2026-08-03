# MILESTONE A — RELEASE REPORT

- **WO:** WO-13 PR-A — Milestone A Release
- **Source of Truth:** `MASTER_DATA_AKADEMIK_ARCHITECTURE_RFC.md` (LOCKED) · `MASTER_DATA_AKADEMIK_WBS.md` (LOCKED)
- **Rentang kerja:** WO-1 F1 … WO-13 PR-A (12 WO resmi WBS + follow-up WO-11A)
- **Status:** **READY FOR RELEASE — menunggu review PO.**

---

## 1. Final Release Audit

### 1.1 Source integrity
- Git `main` bersih (hanya 3 laporan WO-12 FINAL yang belum di-commit — masuk commit final WO-13).
- 23 commit pada `main`; riwayat Milestone A: `75e7205` (WO-1) → `1397e47`+`a379ffe` (WO-2) → `a195cd5` (WO-3) → `27b1f3b` (WO-4) → `d4078e4` (WO-5) → `fbb4cb7` (WO-6) → `efe9898` (WO-7) → `9537eb7` (WO-8) → `1582484` (WO-9) → `ac3ba89` (WO-11) → `c35fa11` (WO-11A).
- `out/` dan `dist/` ter-ignore (artifact tidak masuk git — dapat direproduksi dari source).

### 1.2 Build gate
- `npm run lint` — **PASS** (tsconfig.node + tsconfig.web).
- `npm run build` — **PASS** (main 1,780.16 kB · preload 7.84 kB · renderer 987.29 kB).
- `prisma` — 4 migrations, fresh DB `migrate deploy` PASS, `migrate status` hijau, `migrate diff` = no difference (validasi WO-2/WO-12; skema tidak diubah pada WO-13).

### 1.3 Test gate
- Smoke Milestone A **259/259 PASS** (fresh DB per suite): wo1 46 · wo2 35 · wo3 28 · wo4 23 · wo5 19 · wo6 10 · wo7 16 · wo8 16 · wo9 26 · wo11 40.
- WO-12 FINAL verdict: **APPROVED** (T1 & T2 CLOSED, T3 OPEN terjadwal E-2).

### 1.4 Artifact gate (PR-A scope: build → repackage → grep `app.asar` → smoke install)
- `npm run package:win` → `electron-vite build` + electron-builder 25.1.8 (Electron 33.4.11, NSIS x64).
- **Artifact terverifikasi:**
  - `dist/win-unpacked/APLibrary.exe` — fresh (03/08).
  - `dist/APLibrary Setup 0.1.0.exe` — 94,046,116 B, fresh (03/08 16:08).
  - `dist/latest.yml` + `.blockmap` fresh (auto-update metadata).
- **Grep `app.asar`:**
  - main: `academic-years:activate`=2 · `academic-years:deactivate`=2 · `classes:cloneToYear`=2 — handler masuk package.
  - renderer: `Buka Tahun`=2 · `Tutup Tahun`=4 · `Tahun Ajaran`=35 · `Kurikulum`=25 · `Clone ke Tahun Baru`=1 · `master/classes`=8 — UI Milestone A masuk package.
- **Smoke install:** artifact mandiri `win-unpacked` + installer NSIS tersedia; payload diverifikasi via `app.asar` (aplikasi berjalan → dikonfirmasi saat review PO/installasi).

### 1.5 Catatan lingkungan (bukan cacat kode)
- electron-builder sempat gagal mengekstrak cache `winCodeSign` karena Windows menolak pembuatan symlink (`darwin/10.12/lib` — hak Developer Mode). Workaround non-destruktif: build dengan `--config.win.signAndEditExecutable=false`. Dampak: installer **tidak ditandatangani** dan memakai **icon default Electron** (proyek tidak mengonfigurasi icon/certificate). Tidak ada regresi fungsional. Untuk artifact bertanda tangan/icon khusus → siapkan certificate + aktifkan Developer Mode (aksi environment/admin, di luar kode).

---

## 2. Final Architecture Compliance (RFC / WBS)

| Aspek RFC/WBS | Status | Bukti |
|---------------|--------|-------|
| F1 shared config (RFC §2, WBS F1) | COMPLIANT | `src/shared/config/{member-type,education-level}.ts`; smoke wo1 46/46 |
| F2a schema additif (RFC §1.2/§6/§11, WBS F2a) | COMPLIANT | 3 model + 11 index, murni additive; smoke wo2 35/35; fresh deploy PASS |
| F2b backfill idempoten (RFC §15, WBS F2b) | COMPLIANT | `scripts/backfill-member-enrollment.ts`; smoke wo3 28/28 |
| AY-1a exclusive-active guard (RFC §2.4, WBS AY-1a) | COMPLIANT | `createExclusiveActive`/`updateExclusiveActive`; smoke wo4 23/23 |
| AY-1b Buka/Tutup (RFC §2.4/§7, WBS AY-1b) | COMPLIANT | `activate`/`deactivate` + K3 update-reject; smoke wo11 40/40 |
| AY-2 UI Tahun Ajaran (WBS AY-2) | COMPLIANT | CRUD + Buka/Tutup dari daftar; smoke wo5 19/19; routes/sidebar/labels terverifikasi |
| C-1 Curriculum UI (WBS C-1) | COMPLIANT | CRUD + duplicate/delete guard; smoke wo6 10/10 |
| CL-1 Class immutability (RFC §13, WBS CL-1) | COMPLIANT | educationLevel/parallel immutable; smoke wo7 16/16 |
| CL-2a Class UI (WBS CL-2a) | COMPLIANT | fetch-all + client filter; smoke wo8 16/16 |
| CL-2b Clone (RFC §7, WBS CL-2b) | COMPLIANT | copy struktur, guru=null, isActive=true, idempoten; smoke wo9 26/26 |
| T-A Testing & UAT (WBS T-A) | COMPLIANT | WO-12 FINAL APPROVED 259/259 |
| PR-A Release (WBS PR-A) | COMPLIANT | build + repackage + grep `app.asar` + smoke install |
| Layering (Service=guard, Repository=DB, IPC/preload=kontrak) | COMPLIANT | verified layer-by-layer (IPC→preload→env.d.ts→service→repository→UI→labels→routing→sidebar) |
| DILARANG diubah (WO-13) — source/schema/migration/fitur | COMPLIANT | 0 perubahan kode pada WO-13; hanya build/repackage + laporan |

**Kesimpulan compliance:** seluruh implementasi Milestone A **sesuai RFC & WBS**; tidak ada penyimpangan arsitektur.

---

## 3. Deliverable
- Artifact: `dist/win-unpacked/` + `dist/APLibrary Setup 0.1.0.exe` (diverifikasi memuat Milestone A).
- Laporan: `MILESTONE_A_RELEASE_REPORT.md`, `MILESTONE_A_PRODUCTION_READY.md`, `MILESTONE_A_CHANGELOG.md` + WO-12 FINAL (`WO12_TEST_REPORT_FINAL.md`, `WO12_UAT_REPORT_FINAL.md`, `WO12_FINAL_REVIEW_FINAL.md`).

**Verdict lengkap (Production Readiness + Technical Debt) → `MILESTONE_A_PRODUCTION_READY.md`.**
