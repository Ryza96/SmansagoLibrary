# WORK ORDER 2 (F2a) — DISCOVERY REPORT — Schema + Migration

**Peran:** Project Engineer
**Mode:** DISCOVERY ONLY — READ ONLY. Tidak ada perubahan kode, migration, implementasi, atau commit.
**Source of Truth:**
1. `MASTER_DATA_AKADEMIK_ARCHITECTURE_RFC.md` (LOCKED) — §2.1–2.2, §3, §15
2. `MASTER_DATA_AKADEMIK_WBS.md` (LOCKED) — WO-2 F2a

**Status:** **READY FOR IMPLEMENTATION** (lihat bagian 10)

---

## 0. Ringkasan Eksekutif

WO-2 F2a membangun **fondasi schema additif** program Master Data Akademik: tiga entity baru
`MemberEnrollment`, `PromotionRun`, `PromotionRunItem` sesuai RFC §2.1–2.2. Audit menemukan:

- **Sama sekali tidak ada** kode/entity yang menyentuh ketiga model ini saat ini (grep 0 match di luar dokumen).
- Schema aktif (13 model) sudah memiliki `AcademicYear`, `Curriculum`, `Class` (WO-005) dan `Member.classId` (belum dihapus — penghapusan di T-3/F3).
- Migration aktif 3 folder, semuanya ter-track git, dev DB **up to date** (`migrate status` hijau), live DB berisi **0 row** untuk AcademicYear/Curriculum/Class/Member.
- WO-2 **murni additive**: menambah 3 tabel + relasi/index. Tidak mengubah kolom eksisting, tidak menyentuh `Member.classId`, tidak mengubah perilaku. Backfill dilarang (WO-3).
- Layer Repository terpenuhi **via Prisma** (klien hasil `prisma generate`); kelas repository khusus (mis. `EnrollmentRepository`) **bukan** deliverable F2a — dialokasikan WBS ke E-1, P-2 (lihat bagian 6).
- Tidak ada pelanggaran RFC/WBS/SSOT/Domain Boundary. Titik keputusan desain minor (default value, index tambahan, relasi named) direkomendasikan di bagian 9 tanpa menyimpang dari RFC.

---

## 1. Current Architecture

### 1.1 Stack
- **Prisma 5.22 + SQLite** — `prisma/schema.prisma` (datasource `file:./aplibrary.db`, env `DATABASE_URL`), klien ke `@prisma/client` (node_modules, tidak ter-commit).
- **Dua stack proses:** `src/main/` (baru — akademik, member, borrow, import) + `electron/main/` (legacy — book, setting, dll). Domain akademik hidup di `src/main/`.
- **DI container:** `electron/main/bootstrap.ts` `createContainer()` — repo di-instantiate di sini; service akademik (AcademicYear/Curriculum/Class) memakai constructor-injection.
- **Repositori:** `src/main/repositories/` + `base/` (`BaseRepository` → `getPrisma()` singleton; `runTransaction()` untuk `$transaction`; `pagination.ts`/`repository.types.ts` untuk `FindOptions`).
- **Gate resmi WO:** `npm run lint` (tsc node+web) + `npm run build` (electron-vite) + smoke + docs (WBS §4).

### 1.2 Model terkait (kondisi sekarang)
| Model | Keterangan |
|-------|-----------|
| `AcademicYear` | `id/name(unique)/startDate/endDate/isActive/createdAt/updatedAt`; relasi `classes Class[]`. **Tanpa** guard 1-aktif (AY-1a). |
| `Curriculum` | `id/name(unique)`; relasi `classes Class[]`. |
| `Class` | `academicYearId/curriculumId/educationLevel/parallel/homeroomTeacher/isActive`; `@@unique([academicYearId, curriculumId, educationLevel, parallel])`; relasi `members Member[]`. |
| `Member` | `.../classId?/status("INACTIVE")`; relasi `class Class?` + `borrows Borrow[]`; `@@index([classId])`. **`Member.classId` masih ada — TIDAK disentuh WO-2** (penghapusan di T-3). |
| `Borrow` | Snapshot `className` string (tanpa FK ke Class) — tidak berubah. |

### 1.3 Migration & DB (kondisi sekarang)
- **Folder aktif:** `20260731_adr002_initial` (baseline 296 baris), `20260731_wo13_procurement_fields`, `20260731_wo13_revision1_source_detail` + `migration_lock.toml` — semuanya ter-track git (`.gitignore` menyatakan "MUST stay tracked for fresh-clone recovery").
- `prisma/migrations_archive/` (riwayat squash ADR-002) ter-track.
- `prisma migrate status` = **Database schema is up to date!** (dev DB).
- **Live DB counts (diverifikasi via Prisma client):** AcademicYear=0, Curriculum=0, Class=0, Member=0 → sejalan RFC §15 ("DB live 0 Member/Class/AcademicYear") → WO-2 tanpa risiko data.
- **Notasi migration:** baseline menggunakan `CREATE TABLE ... PRIMARY KEY`, FK `ON DELETE RESTRICT ON UPDATE CASCADE`; Prisma men-generate UUID di client (bukan DDL).

### 1.4 Praktik yang sudah mapan (pola implementasi WO berikut)
- Rename kolom SQLite → migration manual `RENAME COLUMN` (WO13-R1).
- Folder migration baru WAJIB sort **lexicographically setelah** folder terakhir (`20260731_...`) — fresh deploy memakai urutan nama folder (WO13).
- Flow migration baku: edit schema → `prisma migrate diff --from-migrations --to-schema-datamodel --script` → tulis folder → `prisma migrate deploy` (fresh + dev) → `prisma generate` → lint+build+smoke.
- Smoke DB wajib **fresh DB per run** dengan `DATABASE_URL` absolute `file:C:/...` (WO-8/WO13).

---

## 2. Files Impact Analysis

### 2.1 Modifikasi (1 file)
| File | Perubahan |
|------|-----------|
| `prisma/schema.prisma` | + 3 model baru; + back-relations pada `Member`, `Class`, `AcademicYear`. |

### 2.2 File baru (migration + testing + documentation)
| File | Keterangan |
|------|-----------|
| `prisma/migrations/20260803_wo2_f2a_master_data_akademik/migration.sql` | `CREATE TABLE` × 3 + `CREATE INDEX` (≈ 8–11 index). **Harus** sort setelah `20260731_wo13_revision1_source_detail`. |
| `wo2_f2a_smoke/smoke.ts` | Smoke insert/query fresh DB (pola `wo1_config_smoke/`, WO-1). |
| `WO2_IMPLEMENTATION_REPORT.md` | Wajib (aturan artefak WO-2). |
| `WO2_FINAL_REVIEW.md` | Wajib. |
| `WO2_RELEASE_REPORT.md` | Wajib. |

### 2.3 Modifikasi dokumentasi
| File | Perubahan |
|------|-----------|
| `AGENTS.md` | Ringkasan sesi WO-2 (Gate #4 WBS §4). |

### 2.4 TIDAK tersentuh (dinyatakan eksplisit)
- `src/main/repositories/*` (kecuali tiada perubahan), `src/main/services/*`, `electron/**/*`, `src/shared/**/*`, IPC, preload, `env.d.ts`, DTO, UI, routes, `bootstrap.ts`.
- **Tidak ada** perubahan `Member.classId`, `Borrow`, `BookCopy`/procurement, `InventorySequence`, `Setting`.
- `prisma generate` hanya menulis ke `node_modules/@prisma/client` (gitignored) — tidak ada diff git.

---

## 3. Dependency Analysis

### 3.1 Dependensi WO-2 (ke atas)
| Pendahulu | Sifat | Keterangan |
|-----------|-------|-----------|
| **F1** (Shared Domain Config) | Nominal (proses) | WBS menetapkan F1→F2a. Secara teknis F2a **tidak** mengimpor config F1 — nilai `status`/`educationLevel` tetap string di DB. Dependensi dipertahankan untuk urutan rilis. |
| Schema eksisting | Teknis | `MemberEnrollment` FK → `Member`/`Class`/`AcademicYear`; `PromotionRun` FK → `AcademicYear`; `PromotionRunItem` FK → `PromotionRun`/`Member`. Ketiga target sudah ada. |

### 3.2 Dependensi ke bawah (konsumen masa depan — WO yang bergantung pada F2a)
| WO | Konsumen |
|----|----------|
| WO-3 F2b | Backfill `Member.classId → MemberEnrollment(ACTIVE)` |
| WO-13 E-1 | `EnrollmentRepository` + `EnrollmentService` (enroll/close/repoint/findActiveByMember) |
| WO-17 MI-1 / WO-18 MI-2 | Import write-phase menulis `MemberEnrollment` |
| WO-21/22/23 P-1/P-2/P-3 | `PromotionRun` + `PromotionRunItem` (audit) |
| WO-27 B-1 | `PromotionRun` sebagai wadah audit Bulk Operation Engine (§10) |
| WO-31/32 R-1a/R-1b | Reporting via `MemberEnrollment` join `Class` join `AcademicYear`; `PromotionRunItem.outcome` |

### 3.3 Analisis relasi baru
```
Member        1──N MemberEnrollment N──1 Class
Member        1──N MemberEnrollment N──1 AcademicYear
PromotionRun  1──N PromotionRunItem N──1 Member
PromotionRun  N──1 AcademicYear (fromYearId)   — butuh named relation
PromotionRun  N──1 AcademicYear (toYearId)     — butuh named relation
```
- **Relasi ganda** `PromotionRun → AcademicYear` **mewajibkan** nama relasi eksplisit (`@relation("PromotionRunFromYear"...)` / `"PromotionRunToYear"`) — tanpa nama, Prisma gagal generate (ambiguity error).
- Semua FK bertipe RESTRICT (default Prisma untuk required relation) — **diinginkan**: mencegah orphan enrollment; menjadi dasar guard hapus kelas (E-2).
- **Tidak** ada `@@unique([memberId, academicYearId])` di `MemberEnrollment` (RFC §2.1 catatan; §18 A3 ditolak) — pembagian ulang tengah tahun = 2 baris; "satu-ACTIVE" dijaga di service (E-1), bukan DB.

### 3.4 Grep konfirmasi
`MemberEnrollment|PromotionRun|memberEnrollment|promotionRun` → 0 match di kode (`src/`, `electron/`); hanya muncul di dokumen RFC/WBS/AUDIT. Tidak ada bentrok nama simbol.

---

## 4. Risk Analysis

| # | Risiko | Prob. | Dampak | Mitigasi |
|---|--------|-------|--------|----------|
| R1 | **Folder migration urut salah** (di bawah baseline) → P3018 saat fresh deploy | Rendah | Tinggi | Nama folder `20260803_...` (sort setelah `20260731_`); verifikasi **fresh DB deploy** (WO13 lesson: dev DB menyembunyikan masalah urutan). |
| R2 | `prisma migrate diff` menghasilkan ALTER pada tabel eksisting (perubahan tidak sengaja) | Rendah | Sedang | Review SQL hasil diff: hanya `CREATE TABLE` + `CREATE INDEX`; bila muncul `ALTER` → stop & periksa. |
| R3 | Relasi ganda `PromotionRun→AcademicYear` ambiguity → `prisma generate` gagal | Sedang | Sedang | Named relation eksplisit (design-time, bukan runtime). |
| R4 | Prisma client basi setelah schema berubah → tipe baru tidak ada | Sedang | Sedang | Wajib `prisma generate`; smoke memakai klien ter-generate. |
| R5 | Dev DB drift (checksum/manual edit) | Rendah | Tinggi | Hanya `prisma migrate deploy`/`resolve` resmi; jangan edit `_prisma_migrations` (WO-PV-01). |
| R6 | FK RESTRICT menghalangi penghapusan Class/Member yang punya enrollment (perilaku baru) | Rendah | Sedang | Ini **diinginkan**; ekspektasi didokumentasikan & diuji di smoke (guard E-2 menangani UX). |
| R7 | Live DB sudah punya data → migration berat | Tidak ada | — | Live DB 0 row (diverifikasi) → migration murni DDL ringan. |
| R8 | `status` bebas string bisa diisi nilai liar | Sedang | Rendah | Nilai akademik dikontrol service (E-1, P-2); schema string adalah keputusan RFC (tanpa enum SQLite). Smoke hanya memakai nilai RFC. |

---

## 5. Architecture Compliance

| Aspek | Penilaian | Detail |
|-------|-----------|--------|
| **Architecture RFC** | ✅ Lulus | Model mengikuti §2.1 (`MemberEnrollment`: kolom + 5 index, tanpa `@@unique`), §2.2 (`PromotionRun`/`PromotionRunItem`), §3 (relasi ke Member/Class/AcademicYear). |
| **Additif (RFC §15 F1)** | ✅ Lulus | 3 tabel baru; `Member.classId` tetap ada; tidak ada konsumen membaca enrollment di F2a (cutover = F2/E-2). |
| **Single Source of Truth** | ✅ Lulus | Schema adalah satu-satunya definisi model; tidak ada duplikasi entity di kode. `MemberEnrollment` dibangun sebagai aggregate root SSOT histori. |
| **Domain Boundary** | ✅ Lulus | Entity akademik masuk schema tunggal (satu datasource) sesuai arsitektur eksisting; nilai string akademik tetap di DB, konstanta tingkat (`EducationLevel`) sudah terpusat di F1 (tidak diubah). |
| **WBS WO-2 F2a** | ✅ Lulus | Scope = schema + migration + `prisma generate`; **tidak** termasuk backfill (WO-3); Deliverable = Schema + migration; Repository via Prisma; Service/IPC/Preload/UI = N/A. |
| **Praktik repositori** | ✅ Lulus | Tidak menambah kelas repository (dialokasikan E-1/P-2); konsisten dengan "Repository (via Prisma)" pada flow WBS. |

---

## 6. Implementation Plan

Urutan implementasi standar per WBS §3 dengan penyesuaian F2a:

### Layer 1 — Repository (via Prisma)
- **Deliverable:** 3 model + relasi/index di `schema.prisma` → `prisma generate` → data access siap.
- **Alasan tidak membuat kelas repository baru di F2a:** WBS F2a *Scope/Deliverable* secara eksplisit hanya "Schema + migration"; WBS E-1 menyerahkan `EnrollmentRepository` dan P-2 memakai `PromotionRun`/`PromotionRunItem` di lapisan service-nya. Membuat kelas repository tanpa konsumen di F2a = scope creep + kode mati. Data access diuji langsung via klien Prisma (smoke) — inilah arti "Repository (via Prisma)" pada flow WBS.

### Layer 2 — Service
- **N/A.** Tidak ada business rule di F2a. `EnrollmentService` (enroll/close/repoint/satu-ACTIVE) = E-1; `PromotionPreviewService`/executor = P-1/P-2; guard import = MI-1/MI-2.

### Layer 3 — IPC
- **N/A.** Tidak ada handler baru. Tidak ada konsumen produksi yang perlu channel. Channel `enrollments:*`/`bulkOps:*` datang bersama service (E-1/B-1).

### Layer 4 — Preload
- **N/A.** Tidak ada API surface baru (`env.d.ts` tidak berubah).

### Layer 5 — UI
- **N/A.** F2a murni backend-schema. UI Tahun Ajaran (AY-2), Kurikulum (C-1), Kelas (CL-2a) sudah memiliki backend sendiri.

### Layer 6 — Testing
- Smoke fresh-DB (detail bagian 7) + `migrate deploy/status/diff` + `npm run lint` + `npm run build`.

### Layer 7 — Documentation
- `WO2_DISCOVERY_REPORT.md` (ini), `WO2_IMPLEMENTATION_REPORT.md`, `WO2_FINAL_REVIEW.md`, `WO2_RELEASE_REPORT.md`, update `AGENTS.md`.

### Urutan eksekusi teknis (detail)
1. **Schema:** tambah 3 model + back-relations (`Member`, `Class`, `AcademicYear`) di `schema.prisma`.
2. **Diff:** `npx prisma migrate diff --from-migrations --to-schema-datamodel --script` → review: hanya CREATE TABLE/INDEX.
3. **Migration:** tulis `prisma/migrations/20260803_wo2_f2a_master_data_akademik/migration.sql` (hasil diff).
4. **Deploy dev:** `npx prisma migrate deploy` (apply ke `prisma/aplibrary.db`) → `migrate status` hijau.
5. **Generate:** `npx prisma generate`.
6. **Fresh deploy:** DB temp baru → `migrate deploy` → `migrate status` → `migrate diff` = "No difference detected".
7. **Smoke:** `wo2_f2a_smoke/smoke.ts` (compile commonjs + `DATABASE_URL` absolute).
8. **Regression:** `npm run lint` + `npm run build`.
9. **Docs:** seluruh artefak WO-2 → **satu commit final** + push (aturan baru).

---

## 7. Validation Plan

| # | Gate | Cara | Target |
|---|------|------|--------|
| V1 | Fresh DB deploy | `prisma migrate deploy` pada DB temp (absolute `file:C:/...`), 4 migration berurutan (baseline → WO13 → WO13-R1 → F2a) | PASS |
| V2 | `migrate status` | fresh & dev | "up to date" |
| V3 | `migrate diff` | `--from-migrations --to-schema-datamodel` | "No difference detected" |
| V4 | Smoke insert/query | fixture AY+Curriculum+Class+Member → create `MemberEnrollment` (ACTIVE) → baca `include member/class/academicYear`; index query `[memberId,status]` & `[classId]` | baca balik benar |
| V5 | Smoke 2-baris setahun | 2 enrollment ACTIVE same member (pola REDISTRIBUTED tengah tahun) | berhasil (tanpa unique violation) |
| V6 | Smoke `PromotionRun` + `PromotionRunItem` | create run (from→to year) + items (outcome PROMOTED/GRADUATED/NO_TARGET) → baca `include items` + count per outcome | relasi & index bekerja |
| V7 | Smoke negatif FK | `MemberEnrollment` dengan `classId` palsu; delete `Class` ber-enrollment | P2003 (RESTRICT) |
| V8 | Lint | `npm run lint` | PASS |
| V9 | Build | `npm run build` (main/preload/renderer) | PASS |
| V10 | Artifact/komit | `git status` hanya berisi artefak WO-2 → satu commit → push | bersih |

---

## 8. Exit Criteria

1. **Fresh & dev DB konsisten** — fresh deploy 4 migration PASS, `migrate status` hijau, `migrate diff` = no difference.
2. **Entity bisa dibaca/ditulis** — smoke insert/query `MemberEnrollment`, `PromotionRun`, `PromotionRunItem` PASS (V4–V7).
3. **Additif terbukti** — migration SQL hanya `CREATE TABLE`/`CREATE INDEX`; tidak ada `ALTER` tabel eksisting; `Member.classId` dan seluruh model lama tak tersentuh.
4. **Gate WBS §4** — lint PASS, build PASS, docs updated, PO Approval.
5. **Artefak lengkap & satu commit** — 4 report WO-2 + smoke committed dalam SATU final commit, push `origin/main`; tidak ada commit tambahan dokumentasi.
6. Backfill TIDAK dieksekusi (menunggu WO-3).

---

## 9. Decision Points (rekomendasi — tidak menyimpang dari RFC)

| # | Titik | RFC | Rekomendasi | Dampak DDL |
|---|-------|-----|-------------|-----------|
| D1 | `PromotionRun.id` / `PromotionRunItem.id` | `String @id` (tanpa default) | `@default(uuid())` — konsisten seluruh model eksisting | **Nihil** (UUID di-generate client, bukan DDL) |
| D2 | `MemberEnrollment.status` | `String` (tanpa default) | `@default("ACTIVE")` — konsisten pola `Member.status`/`Class.isActive`; service E-1 selalu set eksplisit | `DEFAULT 'ACTIVE'` (additif) |
| D3 | `PromotionRun.mode`/`status` | `String` (tanpa default) | Tanpa default — dipaksa eksplisit saat create (integritas audit) | Nihil |
| D4 | Index `PromotionRun` | tidak dicantumkan | `@@index([fromYearId])`, `@@index([toYearId])`, `@@index([status])` | Index tambahan (additif) |
| D5 | Index `PromotionRunItem` | tidak dicantumkan | `@@index([promotionRunId])`, `@@index([memberId])`, `@@index([outcome])` — mendukung R-1b & retry §9 | Index tambahan (additif) |
| D6 | Relasi ganda `PromotionRun→AcademicYear` | skematik (§3) | Named relation `"PromotionRunFromYear"`/`"PromotionRunToYear"` + back-relations di `AcademicYear` | Nihil (murni relasi Prisma) |

Semua rekomendasi **additif** dan tidak mengubah semantik RFC; nilai akhir diserahkan pada keputusan implementasi di WO (didokumentasikan di Implementation Report).

---

## 10. Verdict

### ✅ **READY FOR IMPLEMENTATION**

**Alasan:**
1. **Tidak ada pelanggaran** terhadap Architecture RFC (§2.1–2.2, §3, §15), Single Source of Truth, Domain Boundary, atau WBS F2a — seluruh 5 aspek compliance lulus.
2. **Risiko terkendali** — live DB 0 row; migration murni additive; risiko utama (urutan folder, relasi ganda) sudah punya mitigasi konkret.
3. **Scope tegas** — schema + migration + generate + smoke + docs; backfill dilarang (WO-3); layer Service/IPC/Preload/UI = N/A dengan alasan jelas.
4. **Pola terbukti** — seluruh langkah mengikuti praktik mapan (WO13, WO-PV-01, WO-1) yang sudah tervalidasi.
5. Satu-satunya pertimbangan adalah 6 decision point minor (bagian 9) yang semuanya additive dan tidak memerlukan revisi RFC.

**Catatan:** WO-2 menunggu review PO sebelum implementasi; setelah seluruh artefak (Discovery/Implementation/Final Review/Release Report) selesai → SATU final commit → push. Tidak lanjut WO berikutnya sebelum persetujuan PO.
