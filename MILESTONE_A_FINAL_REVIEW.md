# MILESTONE A — FINAL REVIEW

- **Tanggal:** 2026-08-03
- **Mode:** READ ONLY / AUDIT ONLY (tidak ada perubahan source, schema, migration, commit)
- **Peran:** Project Engineer → untuk keputusan Product Owner
- **Source of Truth:** `MASTER_DATA_AKADEMIK_ARCHITECTURE_RFC.md` (LOCKED) + `MASTER_DATA_AKADEMIK_WBS.md` (LOCKED)
- **Ruang lingkup audit:** WO-1 s.d. WO-9 (F1 → F2b → AY-1a → AY-2 → C-1 → CL-1 → CL-2a → CL-2b)

---

## 1. RINGKASAN EKSEKUTIF

| Aspek | Hasil |
|---|---|
| Work Order diaudit | 9 (WO-1..WO-9) |
| Komitmen git | 10 (9 feature + 1 release WO-2), `origin/main` sinkron |
| Working tree | **BERSIH** |
| Schema vs Migration (`prisma migrate diff`) | **No difference detected** |
| `npm run lint` | **PASS** |
| `npm run build` | **PASS** (main 1,778.91 kB · preload 7.84 kB · renderer 985.76 kB) |
| Smoke (fresh DB per WO) | WO-1 46/46 · WO-2 35/35 · WO-3 28/28 · WO-4 21/21 · WO-5 14/14 · WO-6 10/10 · WO-7 16/16 · WO-8 16/16 · WO-9 26/26 |
| Produksi membaca `Member.classId` | Hanya guard hapus kelas + `member.service.classInfo` (cutover dijadwalkan E-2/WO-14) |
| Sisa `any` di `src/main` | 1 (borrow.service.ts:104, di luar scope Milestone A) |
| **Kesimpulan** | **APPROVED WITH NOTES** untuk scope WO-1..WO-9; Milestone A per WBS **belum sepenuhnya tertutup** (AY-1b, T-A, PR-A tersisa) |

---

## 2. ARCHITECTURE COMPLIANCE (RFC / WBS / Layering / Dependency)

### 2.1 WBS compliance
- Semua 9 WO dieksekusi mengikuti urutan & scope WBS Fase A1–A2.
- **Catatan sequencing:** WBS WO-5 = AY-1b (Operasi Buka/Tutup Tahun) **BELUM dikerjakan** (tidak ada endpoint `academic-years:activate` di kode). PO memerintahkan AY-2 (sesi diberi nomor WO-5) didahulukan karena hanya mengonsumsi API yang sudah ada (`update(isActive:true)` yang ter-guard AY-1a). Tidak ada pelanggaran desain; AY-1b tetap harus dijadwalkan ulang sebelum Milestone A dinyatakan tuntas.
- **Gerbang tersisa per WBS:** WO-11 T-A (Testing & UAT) dan WO-12 PR-A (Release Milestone A) **belum dieksekusi**.

### 2.2 Layering & dependency
- Konsisten: `src/main/services/*` memanggil `src/main/repositories/*`; IPC (`electron/ipc/*`) hanya mem-bridge service/repo; preload (`electron/preload/*`) hanya ekspos API; renderer hanya konsumsi `window.electronAPI.*`.
- WO-9 (CL-2b) menambah 1 channel IPC + 1 preload + 1 env.d.ts sesuai persetujuan PO — tidak melanggar constrain "repo/IPC/preload diubah" karena WBS CL-2b sendiri mensyaratkan IPC/preload.
- F1 config (`src/shared/config/member-type.ts`, `education-level.ts`) = leaf node tanpa import; dikonsumsi main + renderer tanpa duplikasi. Literal `'student'/'teacher'/'general'` hanya ada di config (0 match di tempat lain).
- Guard akademik hidup di Service (bukan DB): AY-1a exclusive-active via repository transaksional, CL-1 immutability di service, CL-2b clone idempoten di service.

### 2.3 Kesesuaian RFC
- `MemberEnrollment.status`/`PromotionRun.mode`/`status`/`PromotionRunItem.outcome` = string bebas tanpa DEFAULT (validasi di Service, bukan DB) — sesuai pola & keputusan RFC/WO-2.
- `(memberId, academicYearId, classId)` tidak unique → mendukung REDISTRIBUTED (2 baris setahun) — sesuai RFC.
- FK `ON DELETE RESTRICT` seluruh relasi akademik — data terproteksi.

---

## 3. SOURCE CODE CONSISTENCY

### 3.1 Kontrak lintas layer (Service ↔ Repository ↔ IPC ↔ Preload ↔ env.d.ts ↔ DTO)
- Tiga blok akademik di `src/renderer/env.d.ts` (academicYears:136, curricula:149, classes:162) cocok dengan preload & handler IPC (`academicYears.findMany/findById/create/update/delete`, `curricula.*`, `classes.*` + `classes.cloneToYear`).
- DTO (`src/shared/dto/academic.ts` + re-export `src/shared/types/dtos/academic.ts`) menyediakan `CloneClassResult` (WO-9) dan seluruh payload akademik; semua typed (tanpa `any`).
- Bootstrap (`electron/main/bootstrap.ts`) me-wire 11+ service termasuk akademik + `MemberClassResolver`; `electron/ipc/index.ts` + `electron/preload/index.ts` sebagai agregator — konsisten.
- UI: routes + Sidebar Master Data (Tahun Ajaran / Kurikulum / Kelas) + `navigation.ts` (`ROUTES.MASTER_*` + `classEditPath`/`academicYearEditPath`) + `labels.ts` (block CLASS + CLONE_*) selaras.

### 3.2 Invarian WO-1 (single source of truth)
- `MEMBER_TYPE_PREFIX`, `MEMBER_TYPE_LABEL`, `MEMBER_RIGHTS[...]` → tidak ada sisa hardcode; semuanya men-delegasi ke config F1.
- `EDUCATION_LEVELS` digunakan resolver (`MemberClassResolver`) & validasi CL-1 (normalisasi `trim().toUpperCase()`).

### 3.3 Dead code / sisa
- **Legacy member stack** `electron/main/services/member.service.ts` + `electron/main/repositories/member.repository.ts`: **tidak ada importer** (bootstrap & ipc memakai `src/main/services/member.service`). Housekeeping (WO-007I) belum dieksekusi.
- `electron/main/services/print.service.ts` tetap aktif (dipakai print label, WO-8) — bukan dead code.

---

## 4. DATABASE

| Item | Hasil |
|---|---|
| Model akademik | `AcademicYear`, `Curriculum`, `Class`, `MemberEnrollment`, `PromotionRun`, `PromotionRunItem` — alignment dengan schema `@prisma/client` |
| Migration aktif | 4: `adr002_initial` → `wo13_procurement_fields` → `wo13_revision1_source_detail` → `wo2_f2a_master_data_akademik` (sort lexicographic benar) |
| Migration archive | 11 dir dipindah ke `prisma/migrations_archive/` (dokumentasi, tetap tracked di git) |
| Fresh DB deploy | PASS (urutan baseline → WO13 → R1 → F2a) |
| `migrate diff` | **No difference detected** (replay vs schema) |
| `migrate status` | up to date (dev + fresh) |
| Constraint | `@@unique` AY/Curriculum; `@@unique([academicYearId,curriculumId,educationLevel,parallel])` Class; FK RESTRICT; index akademik berdokumen (11) |
| Kompatibilitas Milestone B | Skema murni additif; `Member.classId` tetap ada → E-1/E-2 (WO-13/WO-14) tinggal menambah + cutover tanpa breaking change |

---

## 5. VALIDATION

### 5.1 Rerun audit (bukan hanya laporan)
- `npm run lint` (tsc node + web) — **PASS**.
- `npm run build` — **PASS**: main 1,778.91 kB, preload 7.84 kB, renderer 985.76 kB (cocok dengan angka WO-9).
- `npx prisma migrate diff --from-migrations ./prisma/migrations --to-schema-datamodel ./prisma/schema.prisma --shadow-database-url ...` — **No difference detected**.
- `git status` — bersih; `git log --oneline -12` menunjukkan 10 komit WO-1..WO-9 + release.

### 5.2 Smoke per WO (fresh DB temp; DB live dev tidak disentuh)
| WO | Smoke | Hasil |
|---|---|---|
| WO-1 F1 | config.smoke | 46/46 |
| WO-2 F2a | f2a_smoke | 35/35 |
| WO-3 F2b | f2b_smoke | 28/28 |
| WO-4 AY-1a | ay1a_smoke | 21/21 |
| WO-5 AY-2 | ay2_smoke | 14/14 |
| WO-6 C-1 | c1_smoke | 10/10 |
| WO-7 CL-1 | cl1_smoke | 16/16 |
| WO-8 CL-2a | cl2a_smoke | 16/16 |
| WO-9 CL-2b | cl2b_smoke | 26/26 |

**Total: 212/212 PASS.**

### 5.3 Catatan
- `npm run lint:eslint` memiliki error pre-existing (`react-hooks/set-state-in-effect` di MembersPage:34 / MemberListPage:42) di baris di luar scope WO-1..WO-9; gate resmi tiap WO = `npm run lint` (tsc) yang PASS.

---

## 6. TECHNICAL DEBT

### Critical
- **Tidak ada** item Critical yang menghambat scope WO-1..WO-9.

### High
- **AY-1b belum diimplementasikan** (operasi eksplisit Buka/Tutup Tahun; channel `academic-years:activate` belum ada). Saat ini "tandai aktif" memakai `update(isActive:true)` → `updateExclusiveActive`. **Wajib** dijadwalkan untuk menutup Milestone A per WBS.

### Medium
- **`getMemberBorrowingStats` logic di IPC handler** (`electron/ipc/borrow.ipc.ts:26-29`) memanggil repository langsung (menembus Service layer) — pelanggaran layering; usulan WO-007C (port ke Service) belum dieksekusi.
- **`bootstrap.ts` = hub fan-in besar** (semua service di-instantiate di satu tempat) — maintainability menurun seiring banyaknya domain.
- **`Member.classId` masih dibaca produksi** untuk guard hapus kelas (`class.service.ts:137 countByClass`) dan `member.service.classInfo` — cutover ke enrollment dijadwalkan E-2 (WO-14), bukan bug.
- **Env contract manual** (`src/renderer/env.d.ts`) harus dijaga sinkron dengan preload — risk drift antar-WO.

### Low
- **Legacy member stack mati** (`electron/main/services/member.service.ts`, `electron/main/repositories/member.repository.ts`) — housekeeping (WO-007I) belum dijalankan; 0 importer.
- **`(b: any)`** di `src/main/services/borrow.service.ts:104` — melanggar prinsip WO-001 ("hapus `any`"); di luar scope Milestone A.
- **WO-8 fetch-all + filter client-side** di `ClassListPage` (`findMany` loop limit 100) — tidak scalable untuk data kelas sangat besar; acceptable utk master data.
- **`Setting.barcodeFormat` tidak dikonsumsi** (WO-8) — field dipertahankan.
- **Renderer bundle 985.76 kB** terus membesar antar-WO (952→960→978→985) — pertimbangkan code-splitting di masa depan.
- **`npm run lint:eslint` pre-existing error** (set-state-in-effect) belum dibersihkan.

---

## 7. PRODUCTION READINESS (scope WO-1..WO-9)

Status: **APPROVED WITH NOTES** — lihat `MILESTONE_A_PRODUCTION_READINESS_REPORT.md`.

Alasan inti:
1. 9 WO selesai & tervalidasi (lint/build/smoke 212/212, fresh DB per smoke).
2. Schema vs migration = zero drift; fresh deploy 4 migration PASS; working tree bersih.
3. Tidak ada pelanggaran RFC/WBS pada kode; duplikasi config F1 hilang total.
4. **Namun** Milestone A per WBS belum 100% tertutup: AY-1b (WBS WO-5), T-A (WO-11), PR-A (WO-12) masih pending.

---

## 8. REKOMENDASI

1. **Approve** scope WO-1..WO-9 (F1, F2a, F2b, AY-1a, AY-2, C-1, CL-1, CL-2a, CL-2b) untuk direview PO.
2. **Jadwalkan ulang** AY-1b (Buka/Tutup Tahun eksplisit) sebagai WO tersisa Milestone A — dependency AY-1a sudah terpenuhi.
3. Eksekusi **T-A** (UAT E2E Milestone A: tahun→kurikulum→kelas→clone→guard + regresi menu lama) lalu **PR-A** (build → electron-builder → verifikasi `app.asar`) sebelum gerbang rilis Milestone A.
4. Masukkan item Medium/Low ke backlog: port `getMemberBorrowingStats` ke Service, hapus legacy member stack, bersihkan `any` di borrow.service, perbaiki lint:eslint.
