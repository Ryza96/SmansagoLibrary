# MASTER DATA AKADEMIK — WORK BREAKDOWN STRUCTURE (WBS REVISION 1)

**Peran:** Principal Software Architect
**Mode:** PLANNING ONLY — tidak ada perubahan RFC, tidak ada implementasi, tidak ada migration, tidak ada commit.
**Source of Truth:** `MASTER_DATA_AKADEMIK_ARCHITECTURE_RFC.md` (LOCKED)
**Status:** WBS APPROVED dengan revisi → revisi 1 ini menjawab seluruh 6 butir REVISI WAJIB.
**Aturan:** tiap WO mengikuti RFC; Implementation Flow + Gate wajib; audit ukuran dilakukan (7 WO dipecah, 2 WO baru ditambahkan).

**Total Work Order baru: 39** (perubahan & alasan di bagian 11).

---

## 0. ROADMAP SUMMARY (1 halaman — untuk Product Owner)

```
┌────────────────────────────────────────────────────────────────────────────┐
│ MILESTONE A — MASTER DATA AKADEMIK                                        │
│ "Operator bisa menyiapkan master data: Tahun Ajaran, Kurikulum, Kelas"     │
│                                                                            │
│  F1 Config ─► F2a Schema ─► F2b Backfill                                  │
│  AY-1a Guard ─► AY-1b Buka/Tutup Tahun ─► AY-2 UI Tahun Ajaran            │
│  C-1 UI Kurikulum                                                          │
│  CL-1 Guard Immutable ─► CL-2a UI Kelas ─► CL-2b Clone ke Tahun Baru       │
│                                                                            │
│  T-A Testing & UAT  ─►  PR-A Release Milestone A                          │
│  Gerbang: master data bisa diisi dari aplikasi; import lama tetap jalan.   │
│  (Enrollment belum dibangun — aman, schema additif)                        │
└────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────┐
│ MILESTONE B — ACADEMIC LIFECYCLE                                          │
│ "Riwayat akademik: enrollment, import ulang tahunan, promosi, massal"      │
│                                                                            │
│  E-1 Enroll Svc ─► E-2 Cutover ─► E-3 Status Sync ─► E-4 History UI        │
│  MI-1 Resolver ─► MI-2 Import Write ─► MI-3 Duplikat (gate PO) ─► MI-4 UI  │
│  P-1 Preview ─► P-2 Auto ─► P-3 Mapping ─► P-4 Retry ─► P-5a/P-5b UI       │
│  B-1 Engine ─► B-2a REASSIGN ─► B-2b CLOSE ─► B-3 Bulk UI                  │
│  R-1a/R-1b API Laporan ─► R-2a/R-2b UI Laporan                             │
│                                                                            │
│  T-1 Regresi Cutover ─► T-2 Matrix ─► T-3 F3 (hapus Member.classId)        │
│  PR-1 Re-audit Produksi ─► PR-2 Release Final                             │
│  Gerbang: seluruh alur akademik produksi + audit + artifact terverifikasi  │
└────────────────────────────────────────────────────────────────────────────┘
```

**Ringkasan untuk PO:** 2 milestone. **A** mengembalikan kemampuan inti yang saat ini blocker (isi master data lewat aplikasi). **B** membangun riwayat akademik di atasnya. A harus rilis dan direview PO sebelum B dimulai.

---

## 1. Milestones

### MILESTONE A — MASTER DATA AKADEMIK
| Isi | WO |
|-----|----|
| Foundation | F1, F2a, F2b |
| Academic Year | AY-1a, AY-1b, AY-2 |
| Curriculum | C-1 |
| Class | CL-1, CL-2a, CL-2b |
| Testing | T-A |
| PO Review | (gerbang Milestone A) |
| Milestone Release | PR-A |

**Tujuan:** operator sudah dapat membuat Tahun Ajaran, Kurikulum, dan Kelas serta menyiapkan Master Data dari aplikasi, **walaupun Enrollment belum dibuat**. Milestone A adalah fondasi yang aman (additif) dan menyelesaikan blocker impor anggota saat ini.

### MILESTONE B — ACADEMIC LIFECYCLE
| Isi | WO |
|-----|----|
| Enrollment | E-1, E-2, E-3, E-4 |
| Import Refactor | MI-1, MI-2, MI-3, MI-4 |
| Promotion Engine | P-1, P-2, P-3, P-4, P-5a, P-5b |
| Bulk Operation Engine | B-1, B-2a, B-2b, B-3 |
| Reporting | R-1a, R-1b, R-2a, R-2b |
| Regression | T-1, T-2, T-3 |
| Production Readiness | PR-1, PR-2 |

**Tujuan:** seluruh Academic Lifecycle produksi — enrollment sebagai SSOT, impor tahunan berulang, promosi 3 mode, bulk operation engine, reporting, dan penghapusan legacy `Member.classId`.

---

## 2. Roadmap (urutan implementasi per milestone)

**Fase A1 — Config & Schema:** F1 → F2a → F2b
**Fase A2 — Master Core (paralel):** AY-1a → AY-1b → AY-2  ∥  C-1  ∥  CL-1 → CL-2a → CL-2b
**Fase A3 — Closing A:** T-A → PR-A → **PO Review Milestone A** (gerbang rilis A)

**Fase B1 — Enrollment Core:** E-1 → E-2 → E-3 → E-4 (T-1 setelah E-2)
**Fase B2 — Import Refactor:** MI-1 → MI-2 → [MI-3 gate PO §12.2] → MI-4
**Fase B3 — Promotion & Bulk (paralel):** P-1 → P-2 → P-3 → P-4 → P-5a → P-5b ∥ B-1 → B-2a → B-2b → B-3
**Fase B4 — Reporting:** R-1a → R-2a ∥ R-1b → R-2b
**Fase B5 — Hardening:** T-2 → T-3 → PR-1 → PR-2 → **PO Review Milestone B**

---

## 3. Implementation Flow (WAJIB — dipakai SELURUH WO)

Urutan implementasi per WO, dari bawah ke atas:

```
Repository      (data access)
    ↓
Service         (business rules)
    ↓
IPC             (handler)
    ↓
Preload         (api surface)
    ↓
UI              (halaman/komponen)
    ↓
Testing         (unit + smoke + UAT)
    ↓
PO Review       (approval sebelum lanjut ke WO berikut)
```

**Aturan adaptasi:**
- **WO pure-config (F1):** Service-level konsumsi + Testing → PO Review (layer Repository/IPC/Preload/UI = N/A).
- **WO UI-only (AY-2, C-1, CL-2a, E-4, MI-4, P-5a/b, B-3, R-2a/b):** mulai dari konsumsi Preload → UI → Testing → PO Review (Repository/Service/IPC = sudah ada atau N/A).
- **WO testing (T-A, T-1, T-2):** Testing → PO Review.
- Semua layer yang dilewati harus dinyatakan N/A secara eksplisit di laporan WO (auditability).

---

## 4. Gate (WAJIB — untuk setiap Work Order)

Setiap WO TIDAK dianggap selesai sebelum kelima item berikut PASS:

1. **lint PASS** — `npm run lint` tanpa error.
2. **build PASS** — `npm run build` tanpa error (main/preload/renderer).
3. **manual test PASS** — skenario yang disetujui PO (dokumentasi di laporan WO).
4. **documentation updated** — AGENTS.md / laporan WO / env.d.ts / DTO konsisten dengan perubahan.
5. **PO Approval** — review PO sebelum WO berikutnya dimulai.

Schema/migration WO menambah: `migrate deploy` fresh PASS + `migrate status` hijau + `migrate diff` = no difference.

---

## 5. Work Order List (39)

| # | ID | Work Order | Milestone | Kompleksitas |
|----|-----|------------|-----------|--------------|
| 1 | F1 | Shared Domain Config (MemberType + EducationLevel) | A | LOW |
| 2 | F2a | Schema + Migration (MemberEnrollment, PromotionRun, PromotionRunItem) | A | MEDIUM |
| 3 | F2b | Backfill + reconciliation (Member.classId → enrollment) | A | LOW |
| 4 | AY-1a | AcademicYear exclusive-active guard | A | LOW |
| 5 | AY-1b | Operasi Buka/Tutup Tahun Ajaran | A | MEDIUM |
| 6 | AY-2 | Academic Year Master UI | A | MEDIUM |
| 7 | C-1 | Curriculum Master UI | A | LOW |
| 8 | CL-1 | Class immutability guard (rename = row baru) | A | MEDIUM |
| 9 | CL-2a | Class Master UI (CRUD per tahun/kurikulum) | A | HIGH |
| 10 | CL-2b | Clone kelas ke tahun baru (service + UI) | A | MEDIUM |
| 11 | T-A | Testing & UAT Milestone A | A | MEDIUM |
| 12 | PR-A | Release Milestone A (build/repackage/verify) | A | LOW |
| 13 | E-1 | EnrollmentRepository + EnrollmentService (satu-ACTIVE) | B | MEDIUM |
| 14 | E-2 | Cutover reads ke enrollment (classInfo, snapshot, guard) | B | MEDIUM |
| 15 | E-3 | Sinkronisasi Member.status lifecycle | B | LOW |
| 16 | E-4 | Enrollment history UI (detail anggota) | B | MEDIUM |
| 17 | MI-1 | Resolver import skop (academicYearId, curriculumId) | B | MEDIUM |
| 18 | MI-2 | Import write-phase berorientasi enrollment | B | HIGH |
| 19 | MI-3 | Duplikat per-tahun + strategi §12.2 (GATE PO) | B | MEDIUM |
| 20 | MI-4 | Import UI (tahun/kurikulum target + kelas tersedia) | B | MEDIUM |
| 21 | P-1 | Promotion decision function + Preview | B | MEDIUM |
| 22 | P-2 | Automatic mode executor (transaction + audit) | B | MEDIUM |
| 23 | P-3 | Mapping mode (1→N, N→1, repeat) | B | MEDIUM |
| 24 | P-4 | Retry strategy (state-based idempotency) | B | LOW |
| 25 | P-5a | Promotion UI: preview + automatic run | B | MEDIUM |
| 26 | P-5b | Promotion UI: mapping + history | B | MEDIUM |
| 27 | B-1 | BulkOperationEngine (abstraksi + refactor) | B | MEDIUM |
| 28 | B-2a | Operation REASSIGN via engine | B | MEDIUM |
| 29 | B-2b | Operation CLOSE (graduation/transfer/drop) via engine | B | MEDIUM |
| 30 | B-3 | Bulk Edit UI | B | MEDIUM |
| 31 | R-1a | Reporting API: anggota per kelas + rekap tahunan | B | MEDIUM |
| 32 | R-1b | Reporting API: peminjaman per kelas + statistik mutasi | B | MEDIUM |
| 33 | R-2a | Reporting UI: laporan demografi | B | MEDIUM |
| 34 | R-2b | Reporting UI: laporan operasional | B | MEDIUM |
| 35 | T-1 | Post-cutover regression (borrow/member/import) | B | MEDIUM |
| 36 | T-2 | Test matrix promotion/import/retry | B | MEDIUM |
| 37 | T-3 | F3: hapus Member.classId + cleanup legacy | B | HIGH |
| 38 | PR-1 | Production Readiness re-audit + UAT | B | MEDIUM |
| 39 | PR-2 | Release packaging + verifikasi artifact | B | LOW |

---

## 6. Detail setiap Work Order

Template: **Objective / Scope / Dependency / Deliverable / Validation / Exit Criteria / Implementation Flow / Kompleksitas.**

### WO-1 F1 — Shared Domain Config
- **Objective:** Satu sumber `MemberType` (label, prefix S/G/U, borrowRights, hasAcademicRecord) + `EducationLevel` (`levelOrder`) — RFC §2.3, §5.
- **Scope:** `src/shared/config/member-type.ts` + `education-level.ts`; konsumen tersebar (labels, number-generator) mengacu ke config. Tanpa schema, tanpa perubahan perilaku.
- **Dependency:** —
- **Deliverable:** 2 file config + referensi baru.
- **Validation:** lint+build; unit `levelOrder` & tabel MemberType; prefix tetap S/G/U.
- **Exit Criteria:** tidak ada literal tipe terduplikasi; konsumen memakai config.
- **Flow:** Service-konsumsi → Testing → PO Review. (Repo/IPC/Preload/UI = N/A)
- **Kompleksitas:** LOW

### WO-2 F2a — Schema + Migration
- **Objective:** Entity `MemberEnrollment`, `PromotionRun`, `PromotionRunItem` additif — RFC §2.1–2.2.
- **Scope:** `schema.prisma` (+ index/relasi), migration baru, `prisma generate`. **TIDAK** termasuk backfill (WO-3).
- **Dependency:** F1
- **Deliverable:** Schema + migration.
- **Validation:** fresh DB `migrate deploy` PASS; `migrate status` hijau; `migrate diff` = no difference; smoke insert/query; lint+build.
- **Exit Criteria:** fresh & dev DB konsisten; entity bisa dibaca/ditulis.
- **Flow:** Repository (via Prisma) → Testing → PO Review. (Service/IPC/Preload/UI = N/A)
- **Kompleksitas:** MEDIUM

### WO-3 F2b — Backfill + reconciliation
- **Objective:** Backfill idempoten `Member.classId → MemberEnrollment(ACTIVE)` memakai `class.academicYearId` — RFC §15 F1.
- **Scope:** Script one-time + verifikasi; data live 0 member → no-op, tetap generik; laporan hasil.
- **Dependency:** F2a
- **Deliverable:** Script + laporan reconciliation.
- **Validation:** jalankan pada DB uji berskema lama; count cocok; ulangi (idempoten); lint+build.
- **Exit Criteria:** setiap `Member.classId != null` → tepat 1 enrollment ACTIVE; run ulang tidak menambah.
- **Flow:** Repository → Testing → PO Review. (Service/IPC/Preload/UI = N/A)
- **Kompleksitas:** LOW

### WO-4 AY-1a — AcademicYear exclusive-active guard
- **Objective:** tepat satu `isActive=true` selalu — RFC §2.4, §17.
- **Scope:** `academic-year.service.ts` — create/update/aktivasi menonaktifkan tahun lain dalam transaksi.
- **Dependency:** —
- **Deliverable:** Guard + test negatif.
- **Validation:** unit: aktivasi B menonaktifkan A; dua aktif mustahil; lint+build.
- **Exit Criteria:** `findActive()` ≤ 1 record.
- **Flow:** Service → Testing → PO Review. (Repo/…/UI = N/A — repo sudah ada)
- **Kompleksitas:** LOW

### WO-5 AY-1b — Operasi Buka/Tutup Tahun
- **Objective:** operasi eksplisit Buka Tahun (guard aktif) & Tutup Tahun — RFC §2.4, §5 (prasyarat promosi).
- **Scope:** service + IPC `academic-years:activate` (dan hook clone di sisi CL-2b); validasi tanggal/semester.
- **Dependency:** AY-1a
- **Deliverable:** endpoint buka/tutup + test.
- **Validation:** unit: buka tahun baru → aktif; tutup → nonaktif; lint+build.
- **Exit Criteria:** transisi tahun ajaran terkontrol, selalu 1 aktif.
- **Flow:** Service → IPC → Testing → PO Review. (Repo/Preload/UI = N/A)
- **Kompleksitas:** MEDIUM

### WO-6 AY-2 — Academic Year Master UI
- **Objective:** halaman CRUD Tahun Ajaran + tandai aktif.
- **Scope:** menu Master Data + route + halaman list/form; konsumsi `academic-years:*`.
- **Dependency:** AY-1b
- **Deliverable:** UI Tahun Ajaran.
- **Validation:** UAT manual CRUD+aktivasi; lint+build.
- **Exit Criteria:** operator membuat/mengaktifkan Tahun Ajaran dari aplikasi.
- **Flow:** Preload → UI → Testing → PO Review. (Repo/Service/IPC = N/A)
- **Kompleksitas:** MEDIUM

### WO-7 C-1 — Curriculum Master UI
- **Objective:** halaman CRUD Kurikulum (backend `curricula:*` ada).
- **Scope:** menu + route + halaman; delete diblokir bila dipakai kelas.
- **Dependency:** —
- **Deliverable:** UI Kurikulum.
- **Validation:** UAT manual; lint+build.
- **Exit Criteria:** operator mengelola Kurikulum dari aplikasi.
- **Flow:** Preload → UI → Testing → PO Review.
- **Kompleksitas:** LOW

### WO-8 CL-1 — Class immutability guard
- **Objective:** `educationLevel`/`parallel` immutable; rename = row baru — RFC §8.
- **Scope:** `class.service.ts` tolak update 2 kolom; validasi level via F1; test negatif.
- **Dependency:** F1
- **Deliverable:** Guard + test.
- **Validation:** unit: update parallel → error; level invalid → error; lint+build.
- **Exit Criteria:** tidak ada jalur mengubah nama kelas eksisting.
- **Flow:** Service → Testing → PO Review.
- **Kompleksitas:** MEDIUM

### WO-9 CL-2a — Class Master UI (CRUD)
- **Objective:** halaman Kelas per Tahun Ajaran + Kurikulum (CRUD) — blokir produksi saat ini.
- **Scope:** menu + route + halaman list/form; pilih tahun+kurikulum; konsumsi `classes:*`.
- **Dependency:** AY-2, C-1, CL-1
- **Deliverable:** UI Kelas.
- **Validation:** UAT manual; smoke create/delete (guard); lint+build.
- **Exit Criteria:** operator mengisi kelas tahun aktif dari aplikasi.
- **Flow:** Preload → UI → Testing → PO Review.
- **Kompleksitas:** HIGH

### WO-10 CL-2b — Clone kelas ke tahun baru
- **Objective:** helper "clone struktur kelas ke tahun baru" (tanpa enrollment) — RFC §7 prasyarat promosi.
- **Scope:** `class.service.cloneToYear(...)` + tombol UI + validasi unique komposit.
- **Dependency:** CL-2a
- **Deliverable:** Clone service + UI + test.
- **Validation:** smoke: clone menghasilkan row kelas baru; duplikat diblokir; lint+build.
- **Exit Criteria:** clone aman & idempoten per tahun.
- **Flow:** Service → IPC → Preload → UI → Testing → PO Review.
- **Kompleksitas:** MEDIUM

### WO-11 T-A — Testing & UAT Milestone A
- **Objective:** buktikan Milestone A: master data terisi & alur legacy (import) terbantu.
- **Scope:** E2E: buat tahun→kurikulum→kelas→clone→guard; impor legacy dengan master terisi; regresi menu lama.
- **Dependency:** CL-2b
- **Deliverable:** laporan UAT Milestone A.
- **Validation:** seluruh skenario PASS; lint+build.
- **Exit Criteria:** Milestone A siap review PO.
- **Flow:** Testing → PO Review.
- **Kompleksitas:** MEDIUM

### WO-12 PR-A — Release Milestone A
- **Objective:** build + repackage + verifikasi artifact Milestone A (pelajaran WO-2).
- **Scope:** `npm run build` → electron-builder → grep `app.asar` (menu master) → smoke install.
- **Dependency:** T-A
- **Deliverable:** artifact A + laporan verifikasi.
- **Validation:** grep fitur masuk; aplikasi berjalan.
- **Exit Criteria:** artifact yang direview PO berisi Milestone A.
- **Flow:** Testing → PO Review.
- **Kompleksitas:** LOW

### WO-13 E-1 — Enrollment core
- **Objective:** aggregate enrollment (enroll/close/repoint/findActiveByMember + satu-ACTIVE) — RFC §1.2, §6, §11.
- **Scope:** repository + service + DTO + IPC/preload `enrollments:*` + env.d.ts; status akademik enum terpusat.
- **Dependency:** F2a
- **Deliverable:** EnrollmentService penuh.
- **Validation:** unit+DB smoke: enroll/close/repoint (2 baris setahun); blokir double-ACTIVE; fresh DB; lint+build.
- **Exit Criteria:** seluruh §6 lolos; satu-ACTIVE terjamin.
- **Flow:** Repository → Service → IPC → Preload → Testing → PO Review. (UI = N/A)
- **Kompleksitas:** MEDIUM

### WO-14 E-2 — Cutover reads
- **Objective:** semua pembaca "kelas sekarang" pindah ke enrollment — RFC §1.3, §12.
- **Scope:** `member.service` (classInfo), `borrow.service:170` (snapshot), guard hapus kelas (enrollment.count); `Member.classId` berhenti ditulis.
- **Dependency:** E-1
- **Deliverable:** cutover + DTO `classInfo` tetap shape.
- **Validation:** smoke: tanpa enrollment → null; dengan aktif → label; snapshot benar; guard blokir; lint+build.
- **Exit Criteria:** tidak ada produksi membaca `Member.classId` untuk tampil/snapshot/guard.
- **Flow:** Service → Testing → PO Review.
- **Kompleksitas:** MEDIUM

### WO-15 E-3 — Member.status lifecycle sync
- **Objective:** status akademik terminal men-drive status sistem — RFC §4.3.
- **Scope:** rule service (GRADUATED/TRANSFERRED/DROPPED → INACTIVE; lainnya tetap ACTIVE) dipicu EnrollmentService.close.
- **Dependency:** E-1
- **Deliverable:** sinkronisasi + matriks test.
- **Validation:** unit matriks §4.1 100%; lint+build.
- **Exit Criteria:** tiap terminal → transisi sistem benar.
- **Flow:** Service → Testing → PO Review.
- **Kompleksitas:** LOW

### WO-16 E-4 — Enrollment history UI
- **Objective:** riwayat enrollment di detail anggota — RFC §6, §14.
- **Scope:** API `enrollments:historyByMember` + tampilan (tahun, kelas, status, tanggal).
- **Dependency:** E-2, E-3
- **Deliverable:** UI riwayat.
- **Validation:** UAT manual; smoke 2-baris-setahun; lint+build.
- **Exit Criteria:** label historis tak berubah walau rename tahun lain.
- **Flow:** IPC → Preload → UI → Testing → PO Review.
- **Kompleksitas:** MEDIUM

### WO-17 MI-1 — Resolver skop tahun/kurikulum
- **Objective:** `MemberClassResolver.resolve(rows, academicYearId, curriculumId)` — RFC §7, §12.1.
- **Scope:** signature baru; filter kelas; classNotFound/classAmbiguous tetap BLOCKER.
- **Dependency:** E-1
- **Deliverable:** resolver + unit test.
- **Validation:** unit: aktif vs spesifik; 0 kelas → notFound; >1 → ambiguous; lint+build.
- **Exit Criteria:** resolusi selalu untuk tahun/kurikulum pilihan.
- **Flow:** Service → Testing → PO Review.
- **Kompleksitas:** MEDIUM

### WO-18 MI-2 — Import write-phase enrollment
- **Objective:** impor menulis Member + MemberEnrollment; member ada → hanya enrollment — PO #5.
- **Scope:** `member-import.service.writePhase` (satu `$transaction`): lookup identitas, createMany Member + Enrollment; `Member.classId` tak ditulis.
- **Dependency:** MI-1
- **Deliverable:** import baru + DTO progress tetap.
- **Validation:** DB smoke: impor pertama; impor ulang tahun berikutnya (enrollment baru); rollback; lint+build.
- **Exit Criteria:** PO #5 terpenuhi; impor tahunan berulang sukses.
- **Flow:** Repository → Service → Testing → PO Review. (IPC/Preload/UI tetap, payload sama)
- **Kompleksitas:** HIGH

### WO-19 MI-3 — Duplikat per-tahun + §12.2 (GATE PO)
- **Objective:** aturan duplikat per-tahun + strategi "sudah ACTIVE tahun sama" — RFC §12.2.
- **Scope:** implementasi strategi terpilih (Skip/Overwrite/Block/Merge) — **menunggu keputusan PO**.
- **Dependency:** MI-2 (+ keputusan PO)
- **Deliverable:** rule + test sesuai strategi.
- **Validation:** matrix strategi; lint+build.
- **Exit Criteria:** perilaku sesuai keputusan PO, terdokumentasi.
- **Flow:** Service → Testing → PO Review.
- **Kompleksitas:** MEDIUM

### WO-20 MI-4 — Import UI target tahun/kurikulum
- **Objective:** dialog impor memilih tahun+kurikulum, menampilkan kelas tersedia.
- **Scope:** `MemberImportDialog` + preflight format kelas + hasil.
- **Dependency:** MI-2
- **Deliverable:** UI impor.
- **Validation:** UAT manual; smoke preflight; lint+build.
- **Exit Criteria:** impor ke tahun/kurikulum pilihan + error per baris terlihat.
- **Flow:** Preload → UI → Testing → PO Review.
- **Kompleksitas:** MEDIUM

### WO-21 P-1 — Promotion decision + Preview
- **Objective:** fungsi keputusan deterministik + `PromotionPreviewDTO` — RFC §8.
- **Scope:** `PromotionPreviewService` read-only: counts + items; `decide(item)` murni.
- **Dependency:** E-1, F1
- **Deliverable:** preview service + DTO + unit test.
- **Validation:** unit: X→XI, XI→XII, XII→GRADUATED, NO_TARGET, repeat; preview==execute; lint+build.
- **Exit Criteria:** ringkasan §8 lengkap & akurat.
- **Flow:** Service → Testing → PO Review.
- **Kompleksitas:** MEDIUM

### WO-22 P-2 — Automatic executor
- **Objective:** eksekusi mode Automatic satu transaksi + audit — RFC §7A, §9.
- **Scope:** `PromotionRun`/`PromotionRunItem`; tutup/buka enrollment; update Member.status (E-3); all-or-nothing.
- **Dependency:** P-1, CL-1, E-3
- **Deliverable:** executor + IPC `promotions:run`.
- **Validation:** DB smoke: run utuh; item tercatat; NO_TARGET dilaporkan; lint+build.
- **Exit Criteria:** mode A produksi-benar + audit penuh.
- **Flow:** Service → IPC → Testing → PO Review. (Preload/UI = N/A)
- **Kompleksitas:** MEDIUM

### WO-23 P-3 — Mapping mode
- **Objective:** source→target eksplisit (1→N, N→1, repeat) — RFC §7B.
- **Scope:** TargetResolver MAPPING; validasi target; split rata/daftar siswa.
- **Dependency:** P-2
- **Deliverable:** executor MAPPING + test.
- **Validation:** DB smoke 36→18+18; merge; repeat; lint+build.
- **Exit Criteria:** seluruh bentuk mapping §7B berfungsi.
- **Flow:** Service → Testing → PO Review.
- **Kompleksitas:** MEDIUM

### WO-24 P-4 — Retry strategy
- **Objective:** run ulang hanya delta (state-based idempotency) — RFC §9.
- **Scope:** filter sumber ACTIVE; single-flight; re-validate dalam transaksi; `SKIPPED_ALREADY_PROCESSED`; tanpa undo.
- **Dependency:** P-2
- **Deliverable:** retry + test idempotensi.
- **Validation:** unit/DB: run ke-2 = 0 perubahan; retry hanya NO_TARGET; lint+build.
- **Exit Criteria:** §9 butir 1–7.
- **Flow:** Service → Testing → PO Review.
- **Kompleksitas:** LOW

### WO-25 P-5a — Promotion UI: preview + automatic
- **Objective:** UI preview (5 angka ringkasan + detail) + run automatic.
- **Scope:** modal promosi (mode automatic), preview wajib sebelum execute.
- **Dependency:** P-2, P-4
- **Deliverable:** UI preview/run automatic.
- **Validation:** UAT manual; lint+build.
- **Exit Criteria:** preview→execute→retry untuk mode A dari aplikasi.
- **Flow:** Preload → UI → Testing → PO Review.
- **Kompleksitas:** MEDIUM

### WO-26 P-5b — Promotion UI: mapping + history
- **Objective:** UI mode mapping (target table 1→N) + riwayat run.
- **Scope:** form mapping + daftar `PromotionRun`.
- **Dependency:** P-3, P-5a
- **Deliverable:** UI mapping/history.
- **Validation:** UAT manual; lint+build.
- **Exit Criteria:** 3 mode lengkap di aplikasi.
- **Flow:** Preload → UI → Testing → PO Review.
- **Kompleksitas:** MEDIUM

### WO-27 B-1 — BulkOperationEngine
- **Objective:** generalisasi eksekutor jadi engine (operation × selection × targetResolver × mode) — RFC §10.
- **Scope:** refactor P-2/P-3; kontrak `BulkOperationConfig`; reuse PromotionRun sebagai audit.
- **Dependency:** P-2, P-3
- **Deliverable:** engine + refactor tanpa perubahan perilaku.
- **Validation:** semua test P-2/P-3 tetap PASS; lint+build.
- **Exit Criteria:** engine dipakai AUTOMATIC & MAPPING, hasil identik.
- **Flow:** Service → Testing → PO Review.
- **Kompleksitas:** MEDIUM

### WO-28 B-2a — Operation REASSIGN
- **Objective:** operation REASSIGN (pindah kelas) via engine.
- **Scope:** config operation + targetResolver PER_ITEM; menulis 2 baris setahun saat mutasi tengah tahun.
- **Dependency:** B-1
- **Deliverable:** REASSIGN + test.
- **Validation:** DB smoke: reassign 2 baris setahun; lint+build.
- **Exit Criteria:** reassign lengkap + audit.
- **Flow:** Service → Testing → PO Review.
- **Kompleksitas:** MEDIUM

### WO-29 B-2b — Operation CLOSE
- **Objective:** operation CLOSE (graduation/transfer/drop) via engine.
- **Scope:** config operation + outcome terminal; men-drive Member.status (E-3).
- **Dependency:** B-1
- **Deliverable:** CLOSE + test.
- **Validation:** DB smoke: close → status sistem benar; lint+build.
- **Exit Criteria:** CLOSE lengkap + audit.
- **Flow:** Service → Testing → PO Review.
- **Kompleksitas:** MEDIUM

### WO-30 B-3 — Bulk Edit UI
- **Objective:** UI bulk edit per-item (seleksi→preview→confirm).
- **Scope:** modal bulk edit; ringkasan per outcome; laporan error.
- **Dependency:** B-2a, B-2b
- **Deliverable:** UI bulk edit.
- **Validation:** UAT manual; lint+build.
- **Exit Criteria:** semua mutasi massal lewat engine + audit.
- **Flow:** Preload → UI → Testing → PO Review.
- **Kompleksitas:** MEDIUM

### WO-31 R-1a — Reporting API demografi
- **Objective:** anggota per kelas per tahun + rekap tahunan — RFC §14.
- **Scope:** service + IPC/preload `reports:*` read-only; tanpa entity baru.
- **Dependency:** E-2
- **Deliverable:** 2 API laporan + smoke.
- **Validation:** DB smoke data seeded benar; lint+build.
- **Exit Criteria:** 2 laporan demografi akurat.
- **Flow:** Service → IPC → Preload → Testing → PO Review.
- **Kompleksitas:** MEDIUM

### WO-32 R-1b — Reporting API operasional
- **Objective:** peminjaman per kelas (snapshot+aktif) + statistik mutasi (`PromotionRunItem.outcome`).
- **Scope:** service + IPC/preload read-only.
- **Dependency:** E-2, P-2
- **Deliverable:** 2 API laporan + smoke.
- **Validation:** DB smoke benar; lint+build.
- **Exit Criteria:** 2 laporan operasional akurat.
- **Flow:** Service → IPC → Preload → Testing → PO Review.
- **Kompleksitas:** MEDIUM

### WO-33 R-2a — Reporting UI demografi
- **Objective:** halaman Laporan (bagian demografi).
- **Scope:** ReportsPage bagian 2 laporan R-1a; filter tahun/kelas.
- **Dependency:** R-1a
- **Deliverable:** UI laporan demografi.
- **Validation:** UAT manual; lint+build.
- **Exit Criteria:** operator melihat 2 laporan demografi.
- **Flow:** Preload → UI → Testing → PO Review.
- **Kompleksitas:** MEDIUM

### WO-34 R-2b — Reporting UI operasional
- **Objective:** halaman Laporan (bagian operasional).
- **Scope:** ReportsPage bagian 2 laporan R-1b.
- **Dependency:** R-1b, R-2a
- **Deliverable:** UI laporan operasional.
- **Validation:** UAT manual; lint+build.
- **Exit Criteria:** 4 laporan lengkap dari aplikasi.
- **Flow:** Preload → UI → Testing → PO Review.
- **Kompleksitas:** MEDIUM

### WO-35 T-1 — Post-cutover regression
- **Objective:** buktikan cutover E-2 tidak merusak alur produksi.
- **Scope:** smoke E2E: borrow/return, member CRUD, import, snapshot, hapus dengan riwayat.
- **Dependency:** E-2
- **Deliverable:** laporan regresi.
- **Validation:** seluruh smoke PASS (WO-006/007 + import).
- **Exit Criteria:** alur produksi eksisting hijau.
- **Flow:** Testing → PO Review.
- **Kompleksitas:** MEDIUM

### WO-36 T-2 — Test matrix baru
- **Objective:** matriks uji promotion/import/retry (unit + DB smoke fresh DB per run).
- **Scope:** promosi 3 mode, retry, impor tahunan, §12.2 strategi terpilih, pre-check F3.
- **Dependency:** MI-2, P-4, B-1
- **Deliverable:** matriks + hasil.
- **Validation:** fresh DB deploy + smoke PASS.
- **Exit Criteria:** matriks hijau sebelum rilis.
- **Flow:** Testing → PO Review.
- **Kompleksitas:** MEDIUM

### WO-37 T-3 — F3 removal
- **Objective:** hapus kolom `Member.classId` + konsumen legacy setelah cutover stabil — RFC §15 F3.
- **Scope:** migration drop; hapus `member.repository.countByClass`/`member.class` include; rapikan DTO/env.d.ts; regresi.
- **Dependency:** E-2, T-1
- **Deliverable:** migration F3 + cleanup + laporan.
- **Validation:** fresh+dev `migrate status` hijau; lint+build; T-1 smoke PASS.
- **Exit Criteria:** tidak ada referensi `Member.classId`/`classInfo` dari `member.class`; produksi stabil.
- **Flow:** Repository → Service → Testing → PO Review.
- **Kompleksitas:** HIGH

### WO-38 PR-1 — Production Readiness re-audit
- **Objective:** verifikasi kelayakan produksi setelah seluruh WO inti.
- **Scope:** fresh DB deploy; `migrate status/diff`; lint+build; UAT end-to-end; teknis (satu-ACTIVE, retry, import tahunan).
- **Dependency:** T-2, T-3, B-3, MI-4, P-5b, R-2b
- **Deliverable:** `PRODUCTION_READINESS_AUDIT_MASTER_DATA.md`.
- **Validation:** semua item hijau; risiko sisa terdokumentasi.
- **Exit Criteria:** audit menyimpulkan READY (atau daftar blocker eksplisit).
- **Flow:** Testing → PO Review.
- **Kompleksitas:** MEDIUM

### WO-39 PR-2 — Release packaging
- **Objective:** repackage & verifikasi artifact final (pelajaran WO-2).
- **Scope:** `npm run build` → electron-builder → grep `app.asar` → smoke install.
- **Dependency:** PR-1
- **Deliverable:** artifact final + laporan verifikasi.
- **Validation:** grep fitur masuk; aplikasi berjalan.
- **Exit Criteria:** artifact yang diserahkan berisi seluruh Master Data Akademik.
- **Flow:** Testing → PO Review.
- **Kompleksitas:** LOW

---

## 7. Dependency Graph

```
MILESTONE A
F1 ─► F2a ─► F2b
AY-1a ─► AY-1b ─► AY-2 ─┐
C-1 ─────────────────────┼─► CL-2a ─► CL-2b ─► T-A ─► PR-A ─► [GATE A]
CL-1 ─► (dipakai P-2)    ┘

MILESTONE B
F2a ─► E-1 ─┬─► E-2 ─┬─► E-3 ─► E-4
            │         └─► T-1 ─► T-3
            ├─► MI-1 ─► MI-2 ─┬─► MI-3 (gate PO) ─► MI-4
            └─► P-1 ─► P-2 ─► P-3 ─► P-5b
                          │    └─► B-1 ─┬─► B-2a ─► B-3
                          ├─► P-4 ─► P-5a      └─► B-2b ─┘
E-2 ─► R-1a ─► R-2a
P-2 ─► R-1b ─► R-2b ─► PR-1 (dengan T-2, T-3, B-3, MI-4, P-5b) ─► PR-2
```

Arah panah = "bergantung pada". Tidak ada cycle; setiap WO mulai setelah pendahulu lolos Gate.

---

## 8. Validation Strategy

1. **Gate wajib** (§4): lint PASS + build PASS + manual test PASS + documentation updated + PO Approval.
2. **Schema/migration (F2a, T-3):** fresh DB `migrate deploy` PASS + `migrate status` hijau + `migrate diff` = no difference + smoke Prisma client (pola WO13).
3. **Service (E, MI, P, B, R):** DB smoke dengan **fresh DB per run** (pola WO-8) memakai `DATABASE_URL` absolute sementara; skenario negatif (double-ACTIVE, block, NO_TARGET).
4. **UI (AY-2, C-1, CL-2a/b, E-4, MI-4, P-5a/b, B-3, R-2a/b):** UAT manual + grep renderer memastikan fitur ter-render.
5. **Gerbang milestone:** T-A + PR-A (A); T-1/T-2/T-3 + PR-1/PR-2 (B) → review PO sebelum lanjut.

---

## 9. Production Strategy

- **Additif dulu, breaking belakangan:** seluruh WO sebelum T-3 tidak memecah produksi; `Member.classId` hanya dihapus setelah cutover (E-2) + regresi (T-1) terbukti.
- **Milestone A rilis dulu:** PR-A menyerahkan artifact yang direview PO sebelum Enrollment dimulai — risiko terkecil, umpan balik paling awal.
- **Audit penuh:** semua operasi massal tercatat di `PromotionRun`/`PromotionRunItem`.
- **Gate PO terbuka:** MI-3 menunggu keputusan §12.2; fase B2 tidak tuntas tanpa itu.
- **Verifikasi artifact:** repackage + grep `app.asar` di PR-A dan PR-2 (pelajaran WO-2).

---

## 10. Milestone Review

### Milestone A — MASTER DATA AKADEMIK
**Expected Deliverables:**
- Master data dapat diisi dari aplikasi: Tahun Ajaran (dengan guard 1-aktif + Buka/Tutup Tahun), Kurikulum, Kelas (immutable + clone).
- Schema additif (MemberEnrollment, PromotionRun, PromotionRunItem) + backfill; dev & fresh DB hijau.
- Blocker impor anggota teratasi (kelas bisa dibuat).
- Artifact A terverifikasi (`app.asar` memuat fitur).

**Expected Risks:**
- UI Kelas paling besar (CL-2a, HIGH) → dipecah dari clone (CL-2b) agar satu konsep per WO.
- Konfirmasi unique komposit saat clone (duplikat) — dimitigasi validasi di CL-2b.
- Guard 1-aktif mengubah perilaku aktivasi — mitigasi test negatif di AY-1a.

**Release Decision:**
- **GO** bila T-A PASS (master data terisi + import legacy jalan) dan PR-A artifact terverifikasi.
- **NO-GO** → kembali ke WO yang gagal Gate; tidak memulai Milestone B.

### Milestone B — ACADEMIC LIFECYCLE
**Expected Deliverables:**
- Enrollment SSOT; cutover tanpa `Member.classId` (F3); import tahunan berulang; promosi 3 mode + preview + retry; Bulk Operation Engine; 4 laporan; audit lengkap.
- Regresi penuh (T-1/T-2/T-3) hijau.

**Expected Risks:**
- MI-3 terblokir menunggu keputusan PO §12.2 — risiko jadwal (bukan teknis).
- F3 (T-3) breaking → hanya setelah cutover stabil di lapangan.
- Engine (B-1) refactor berisiko regresi — mitigasi test P-2/P-3 tetap PASS.
- Retry (P-4) idempotensi — mitigasi uji delta run ke-2.

**Release Decision:**
- **GO** bila PR-1 audit READY dan PR-2 artifact final terverifikasi.
- **NO-GO** → daftar blocker eksplisit dari PR-1 dituntaskan sebelum rilis final.

---

## 11. Total Work Order & Perubahan

### Total Work Order baru: **39**
- Milestone A: **12** (F1, F2a, F2b, AY-1a, AY-1b, AY-2, C-1, CL-1, CL-2a, CL-2b, T-A, PR-A)
- Milestone B: **27** (E-1..E-4, MI-1..MI-4, P-1..P-5b, B-1..B-3, R-1a..R-2b, T-1..T-3, PR-1, PR-2)

### Perubahan dari WBS sebelumnya (30 → 39)
| Perubahan | Detail |
|-----------|--------|
| Milestone besar | 1 roadmap linier → **2 milestone** (A: Master Data; B: Academic Lifecycle) |
| F2 dipecah | F2 (schema+backfill) → **F2a** (schema) + **F2b** (backfill/reconciliation) |
| AY-1 dipecah | AY-1 (guard+Buka/Tutup) → **AY-1a** (guard) + **AY-1b** (operasi Buka/Tutup) |
| CL-2 dipecah | CL-2 (UI+clone) → **CL-2a** (CRUD UI) + **CL-2b** (clone) |
| P-5 dipecah | P-5 (UI 3 mode) → **P-5a** (preview+automatic) + **P-5b** (mapping+history) |
| B-2 dipecah | B-2 (REASSIGN+CLOSE) → **B-2a** (REASSIGN) + **B-2b** (CLOSE) |
| R-1 dipecah | R-1 (4 API) → **R-1a** (demografi) + **R-1b** (operasional) |
| R-2 dipecah | R-2 (UI 4 laporan) → **R-2a** (demografi) + **R-2b** (operasional) |
| WO baru | **T-A** (Testing & UAT Milestone A) + **PR-A** (Release Milestone A) |
| Framework | Ditambah **Implementation Flow** (§3) + **Gate** (§4) wajib untuk semua WO |
| Penutup | Ditambah **Roadmap Summary 1 halaman** (§0) + **Milestone Review** (§10) |

### Alasan perubahan
1. **Keamanan:** memisahkan schema (F2a) dari backfill (F2b) dan guard (AY-1a) dari operasi (AY-1b) membuat tiap WO independen & mudah diaudit; Milestone A yang additif dirilis lebih dulu sehingga produksi tetap berjalan sebelum perubahan breaking.
2. **Auditability:** tiap WO kini ≤ 1 konsep; Implementation Flow + Gate memberi jejak konsisten (Repository→Service→…→PO Review; lint/build/manual-test/docs/approval).
3. **Milestone jelas:** 2 milestone dengan gerbang release (PR-A, PR-2) dan Expected Deliverables/Risks/Release Decision — PO memantau pada titik rilis, bukan di tengah.
4. **Keseimbangan:** 39 tetap kecil dan dapat diuji sendiri; penambahan 9 WO (±4 untuk Milestone A, ±5 di Milestone B) dibayar dengan risiko per-WO yang lebih rendah dan review yang lebih sering.
