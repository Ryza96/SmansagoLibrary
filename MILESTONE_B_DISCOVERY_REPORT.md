# MILESTONE B — DISCOVERY REPORT

**WORK ORDER B-1 — ENROLLMENT FOUNDATION**
**Peran:** Project Engineer
**Mode:** DISCOVERY ONLY — READ ONLY (tidak ada perubahan kode, schema, migration, commit, push)
**Source of Truth:** `MASTER_DATA_AKADEMIK_ARCHITECTURE_RFC.md` (LOCKED) + `MASTER_DATA_AKADEMIK_WBS.md` (LOCKED)
**Status Milestone A:** RELEASED (commit `b521824` "release: Milestone A (Master Data Akademik) final release (WO-13 PR-A)") — working tree bersih.

---

## 1. Current Architecture

### 1.1 Ringkasan status
Milestone A tuntas: **config F1**, **schema F2a**, **backfill F2b**, **AY-1a/b**, **AY-2**, **C-1**, **CL-1/2a/2b**, **T-A**, **PR-A** semuanya ada dan ter-release. Seluruh fondasi Enrollment di Milestone B (E-1..E-4) **BELUM ada di lapisan kode** — hanya artefak schema + backfill yang tersedia. Detail per lapisan:

### 1.2 Schema (`prisma/schema.prisma`) — SUDAH ADA (F2a, migration `20260803_wo2_f2a_master_data_akademik`)
| Model | Status | Catatan |
|-------|--------|---------|
| `MemberEnrollment` | ADA | `status` tanpa DEFAULT; `leftAt DateTime?`; `note String?`; indeks `(memberId, academicYearId)`, `(memberId, status)`, `(classId)`, `(academicYearId)`, `(status)`; **tanpa** `@@unique([memberId, academicYearId])` (mendukung 2 baris setahun untuk REDISTRIBUTED) |
| `PromotionRun` | ADA | `mode`/`status` tanpa DEFAULT; `summary String?` (JSON); `fromYearId`/`toYearId` → `AcademicYear` (relasi named `PromotionRunFromYear`/`PromotionRunToYear`); indeks `(fromYearId)`, `(toYearId)`, `(status)` |
| `PromotionRunItem` | ADA | `targetClassId String?` (null = NO_TARGET/ERROR); `outcome` tanpa DEFAULT; indeks `(promotionRunId)`, `(memberId)`, `(outcome)` |
| `Member` | ADA | `classId String?` **masih ada** (F3 belum dilakukan) + relasi `class` |
| `AcademicYear` | ADA | back-relations `memberEnrollments`, `promotionRunsFrom/To` |
| `Class` | ADA | back-relation `memberEnrollments`; `@@unique([academicYearId, curriculumId, educationLevel, parallel])` |

Semua FK academic `ON DELETE RESTRICT`. 4 migration aktif (baseline → WO13 → WO13-R1 → F2a); `prisma validate`/fresh deploy sudah diverifikasi di WO-2 F2a.

### 1.3 Repository (`src/main/repositories/`)
- **TIDAK ADA:** `enrollment.repository.ts`, `promotion-run.repository.ts`, `promotion-run-item.repository.ts`.
- **ADA:** `academic-year.repository.ts` (termasuk pola `createExclusiveActive`/`updateExclusiveActive` transaksional — template transaksi multi-step), `class.repository.ts` (`findByAcademicYear`, `findDuplicate`, `countByAcademicYear/Curriculum`), `curriculum.repository.ts`, `member.repository.ts` (legacy `countByClass`), `borrow.repository.ts` (+`createWithItems` transaksional), `borrow-detail.repository.ts`, dan repositori buku/koleksi.
- **Infrastruktur base:** `BaseRepository` (singleton `getPrisma()`), `runTransaction(prisma, fn)` di `base/transaction.ts`, `getPaginationParams`/`toPaginatedResult` di `base/pagination.ts` — seluruhnya siap dipakai EnrollmentRepository.

### 1.4 Service (`src/main/services/`)
- **TIDAK ADA:** `enrollment.service.ts`, `promotion.service.ts`/preview/executor, `bulk-operation-engine.ts`.
- **ADA yang beririsan dengan enrollment (konsumen legacy):**
  - `member.service.ts:23` — `classInfo` dibaca dari `member.class` (LEGACY, target cutover E-2).
  - `borrow.service.ts:170` — snapshot `className` dibaca dari `member.class` (LEGACY, target cutover E-2).
  - `class.service.ts:137` — delete guard memakai `memberRepository.countByClass` (LEGACY, target cutover E-2).
  - `member-import.service.ts:229` — write-phase menulis `Member.classId` (LEGACY, target refactor MI-2).
  - `member-class-resolver.service.ts:78` — `resolve(rows)` hanya memakai **tahun aktif** (tanpa param `academicYearId`/`curriculumId`, target MI-1).

### 1.5 IPC (`electron/ipc/`)
- **TIDAK ADA:** `enrollment.ipc.ts`, channel `enrollments:*`, `promotions:*`, `bulkOps:*`.
- **ADA:** `academic-year.ipc.ts` (`academic-years:*` incl. `activate`/`deactivate`), `class.ipc.ts` (`classes:*` incl. `cloneToYear`), `curriculum.ipc.ts` (`curricula:*`), `member.ipc.ts` (`members:*` + `members:import*`).

### 1.6 Preload (`electron/preload/`)
- **TIDAK ADA:** `enrollment.preload.ts`.
- **ADA:** `academicYearAPI`/`curriculumAPI`/`classAPI`/`memberAPI`/`memberImportAPI` — diagregasi di `preload/index.ts`.

### 1.7 DTO (`src/shared/dto/`)
- `academic.ts` hanya punya `AcademicYearDTO`, `CurriculumDTO`, `ClassDTO`, `CloneClassResult`. **TIDAK ADA** `EnrollmentDTO`, `PromotionRunDTO`, `PromotionRunItemDTO`, `PromotionPreviewDTO`.
- `member.ts` `MemberDTO.classInfo` masih dari `member.class` (shape ini dipertahankan saat cutover E-2).
- **TIDAK ADA** `src/shared/config/` untuk status akademik (RFC §4 nilai `ACTIVE/PROMOTED/.../GRADUATED` belum dijadikan konstanta terpusat).

### 1.8 `env.d.ts` (`src/renderer/env.d.ts`)
- **TIDAK ADA** entry `enrollments`, `promotions`, `bulkOps`.

### 1.9 UI (`src/pages/` + komponen)
- Master data lengkap: `AcademicYearListPage/FormPage`, `CurriculumListPage/FormPage`, `ClassListPage/FormPage` + `ClassCloneModal` (routes `master/academic-years|curricula|classes`).
- `MemberDetailPage.tsx:73` menampilkan label kelas dari `member.classInfo` (satu-satunya konsumen UI kelas-anggota saat ini). **TIDAK ada** tab riwayat enrollment.
- `MemberImportDialog` mengimpor ke **tahun aktif** saja (tanpa pemilih tahun/kurikulum) dan menulis `classId` — target MI-4/MI-2.
- **TIDAK ADA** halaman enrollment, promosi, bulk edit, laporan akademik.

### 1.10 `bootstrap.ts`
- Container hanya menginstansiasi service Milestone A. **TIDAK ada** wiring Enrollment/Promotion/Bulk/Rreport.

### 1.11 Backfill (`scripts/backfill-member-enrollment.ts`)
- F2b `runBackfillEnrollment(prisma)` — idempoten (`Member.classId → MemberEnrollment(ACTIVE)` memakai `class.academicYearId`), orphan dilaporkan+dilewati, satu `$transaction`. Sudah dijalankan & diverifikasi di WO-3 (28/28 smoke). Merupakan **satu-satunya kode produksi** yang menyentuh `MemberEnrollment`.

---

## 2. Files Impact Analysis

### 2.1 File BARU yang dibutuhkan Milestone B (belum ada)
| Lapisan | File | Dipakai WO |
|---------|------|-----------|
| Repository | `src/main/repositories/enrollment.repository.ts` | E-1 |
| Repository | `src/main/repositories/promotion-run.repository.ts` (+ item) | P-2 |
| Service | `src/main/services/enrollment.service.ts` | E-1 |
| Service | `src/main/services/promotion-preview.service.ts` | P-1 |
| Service | `src/main/services/promotion.executor` (Automatic/Mapping) | P-2/P-3 |
| Service | `src/main/services/bulk-operation-engine.ts` | B-1 |
| Service | `src/main/services/reporting.service.ts` | R-1a/R-1b |
| DTO | `src/shared/dto/enrollment.ts` (EnrollmentDTO, Create/Close/History, PromotionPreviewDTO, dst.) | E-1.. |
| Config | `src/shared/config/academic-status.ts` (enum status akademik terpusat) | E-1/E-3 |
| IPC | `electron/ipc/enrollment.ipc.ts` (`enrollments:*`) | E-1 |
| IPC | `electron/ipc/promotion.ipc.ts` (`promotions:*`) | P-2 |
| Preload | `electron/preload/enrollment.preload.ts` (+ agregasi index.ts) | E-1 |
| Preload | `electron/preload/promotion.preload.ts` | P-2 |
| UI | `src/pages/enrollment/...` atau tab `MemberDetailPage` | E-4 |
| UI | halaman promosi/bulk/report | P-5a/b, B-3, R-2a/b |
| `env.d.ts` | entry `enrollments`, `promotions`, `bulkOps`, `reports` | E-1.. |

### 2.2 File MODIFIKASI yang terdampak cutover (E-2) & import (MI)
| File | Perubahan | WO |
|------|-----------|----|
| `src/main/services/member.service.ts` | `classInfo` → baca enrollment aktif (`findActiveByMember`), shape tetap | E-2 |
| `src/main/services/borrow.service.ts:170` | snapshot `className` → baca enrollment aktif (1 query) | E-2 |
| `src/main/services/class.service.ts:137` | delete guard → `enrollment.countByClass` | E-2 |
| `src/main/repositories/member.repository.ts` | `countByClass` deprecated (hapus di T-3) | E-2/T-3 |
| `src/main/services/member-import.service.ts:229` | write-phase → `Member` + `MemberEnrollment`, `classId` berhenti ditulis | MI-2 |
| `src/main/services/member-class-resolver.service.ts:78` | `resolve(rows, academicYearId, curriculumId)` | MI-1 |
| `src/shared/dto/member.ts` | `classId` deprecated pada input | E-2 |
| `electron/main/bootstrap.ts` | wire service baru | E-1.. |

### 2.3 Tidak berubah
- `prisma/schema.prisma` + migration (additif sudah selesai F2a; F3 dihapus di T-3).
- `Borrow` snapshot model — tanpa migrasi.
- `Member.classId` dipertahankan sampai T-3.

---

## 3. Dependency Analysis

```
F1 config ─────────────► (levelOrder utk promosi; memberType.hasAcademicRecord utk "perlu enrollment?")
F2a schema ────────────► E-1 (enrollment) ──► E-2 (cutover reads) ──► E-3 (status sync) ──► E-4 (UI)
                              │                     └──────────────► T-1 (regresi) ──► T-3 (hapus classId)
                              ├──► MI-1 (resolver skop) ─► MI-2 (import write) ─► [MI-3 gate PO §12.2] ─► MI-4 (UI)
                              └──► P-1 (decision+preview) ─► P-2 (auto) ─► P-3 (mapping) ─► P-5a/b
                                                                    └─► B-1 (engine) ─► B-2a/B-2b ─► B-3
E-2 ─► R-1a ─► R-2a   ·   P-2 ─► R-1b ─► R-2b
```

Hubungan antar-aggregate:
- **AcademicYear** → parent `Class`; parent enrollment (`academicYearId`); relasi `fromYearId`/`toYearId` di `PromotionRun`. Guard 1-aktif (AY-1a) menjamin tahun aktif tunggal sebagai basis impor/promosi.
- **Curriculum** → parent `Class`; hanya terlibat di skop resolusi kelas impor (MI-1), bukan di enrollment.
- **Class** → target enrollment (`classId`); immutable (CL-1) → label historis stabil; `cloneToYear` (CL-2b) menyediakan kelas target promosi. **Prasyarat promosi sudah siap.**
- **Member** → source enrollment (`memberId`); `memberType` (config F1) menentukan `hasAcademicRecord` → hanya STUDENT punya enrollment (RFC §4); `Member.status` adalah **hasil derivasi** (E-3), bukan fakta.
- **MemberEnrollment** → SSOT penempatan; "satu ACTIVE" dijamin service (bukan DB).
- **PromotionRun (+Item)** → wadah audit semua operasi massal; `outcome`/`status`/`mode` adalah string bebas (validasi service).

**Catatan krusial:** seluruh dependensi hilir (E-2, MI, P, B, R) bergantung pada **E-1**. Milestone B berhenti sampai E-1 berdiri.

---

## 4. Data Flow

### 4.1 Alur ideal (RFC §6, §7, §11)
```
ENROLL (E-1)
  enroll(memberId, classId, academicYearId)
    ├─ validasi: member ada; class ada & class.academicYearId === academicYearId;
    ├─ validasi: TIDAK ada enrollment ACTIVE lain utk member (satu-ACTIVE);
    └─ create MemberEnrollment{ status:'ACTIVE', leftAt:null }

CLOSE (E-1 + E-3)
  close(enrollmentId, status, note)   // status ∈ terminal (PROMOTED/REPEATED/REDISTRIBUTED/
                                      //   TRANSFERRED/DROPPED/GRADUATED)
    ├─ guard: hanya utk enrollment ACTIVE
    ├─ set status + leftAt   (tidak pernah DELETE)
    └─ sync Member.status (E-3): terminal keluar → INACTIVE; sisanya tetap ACTIVE

REPOINT (mutasi tengah tahun)
  close(… REDISTRIBUTED) → enroll(…)   // 2 baris setahun, histori utuh

PROMOTION (P-1..P-4)
  preview (dry-run, decide() sama dgn execute) → hasil == execute
  execute: PromotionRun(RUNNING) → SATU $transaction:
     close(enroll lama) + enroll(enroll baru) + sync Member.status
  → PromotionRun.status = SUCCESS|PARTIAL|FAILED; items + summary tersimpan
  retry: state-based (hanya enrollment sumber masih ACTIVE yang diproses)

GRADUATION
  XII → close(GRADUATED); Member.status → INACTIVE

KONSUMSI "KELAS SEKARANG" (E-2)
  findActiveByMember(memberId) → label kelas
    ├─ MemberService.classInfo   (UI detail anggota)
    ├─ BorrowService.create      (snapshot className kuitansi)
    └─ ClassService.delete       (guard countByClass)
```

### 4.2 Alur saat ini (status quo — masih legacy)
```
Member.classId ──► MemberService.classInfo / Borrow snapshot / guard delete
MemberImportService ──► tulis Member.classId
MemberClassResolver.resolve(rows) ──► skop tahun aktif saja
MemberEnrollment ──► (hanya hasil backfill F2b; tidak dikonsumsi siapa pun)
```

---

## 5. Gap Analysis

| # | Gap | Lokasi | WO | Severity |
|---|-----|--------|----|----------|
| 1 | Tidak ada `EnrollmentRepository` | `src/main/repositories/` | E-1 | HIGH (blocker) |
| 2 | Tidak ada `EnrollmentService` (enroll/close/repoint/findActiveByMember + satu-ACTIVE) | `src/main/services/` | E-1 | HIGH (blocker) |
| 3 | Status akademik belum terpusat sebagai konstanta (RFC §4) | `src/shared/config/` | E-1/E-3 | MEDIUM |
| 4 | Tidak ada IPC `enrollments:*` + preload + env.d.ts + DTO | `electron/ipc`, `electron/preload`, `env.d.ts`, `src/shared/dto` | E-1 | HIGH (blocker) |
| 5 | Cutover reads belum: `classInfo` (member.service:23), snapshot (borrow.service:170), guard delete (class.service:137) | service | E-2 | HIGH |
| 6 | `Member.classId` masih ditulis oleh member-import.service:229 & member.service create/update | service | MI-2/E-2 | MEDIUM |
| 7 | `MemberClassResolver.resolve` tanpa skop `academicYearId`/`curriculumId` | resolver | MI-1 | MEDIUM |
| 8 | Tidak ada sinkronisasi `Member.status` dari status terminal | — | E-3 | MEDIUM |
| 9 | Tidak ada UI riwayat enrollment (MemberDetailPage hanya label kelas aktif) | UI | E-4 | MEDIUM |
| 10 | Strategi §12.2 (impor saat sudah ACTIVE di tahun sama) belum diputuskan PO | — | MI-3 | GATE PO |
| 11 | Promotion engine (preview/auto/mapping/retry) belum ada | service | P-1..P-4 | HIGH |
| 12 | Bulk Operation Engine belum ada | service | B-1..B-2b | HIGH |
| 13 | Reporting API/UI akademik belum ada | service+UI | R-1a..R-2b | MEDIUM |
| 14 | `Member.classId` masih ada + konsumen legacy | schema+code | T-3 | HIGH (breaking, F3) |

**Gap yang TIDAK menghalangi E-1:** #6–#14 semuanya hilir dari E-1. E-1 hanya butuh schema (ADA), config F1 (ADA), dan infrastruktur base (ADA).

---

## 6. Risk Analysis

| Risiko | Prob. | Dampak | Mitigasi |
|--------|-------|--------|----------|
| **Dua enrollment ACTIVE per anggota** (tanpa partial unique di SQLite) | Sedang | Tinggi | Guard service satu-ACTIVE + uji negatif (pola WO-4 exclusive-active) |
| **Hapus `Member.classId` sebelum cutover** | Rendah | Tinggi | WBS F2→F3 bertahap; T-3 hanya setelah E-2 + T-1 hijau |
| **Delete kelas gagal pesan salah saat cutover** | Sedang | Sedang | Selama `classId` berhenti ditulis (MI-2) namun guard masih `member.countByClass`, kelas ber-enrollment aktif bisa lolos guard → DB P2003 (FK RESTRICT) menggantikan AppError 400 yang rapi. **Mitigasi:** cutover guard (E-2) dilakukan BERSAMA/SESUDAH MI-2 |
| **Retry memproses ulang siswa** | Sedang | Sedang | State-based idempotency (§9); run ulang = delta |
| **`NO_TARGET` siswa tak terurus** | Sedang | Sedang | Wajib dilaporkan di preview/summary; enrollment lama tetap "kelas sekarang" |
| **String status bebas tanpa DEFAULT** | Sedang | Sedang | Enum terpusat di shared config (E-1) sebagai satu-satunya sumber; uji negatif |
| **Impor ulang tahunan dianggap duplikat** | Sedang | Sedang | Rule duplikat per-tahun (MI-2/MI-3); §12.2 menunggu keputusan PO |
| **E-3 mencampur status akademik vs sistem** | Rendah | Tinggi | Matriks §4 RFC (GRADUATED/TRANSFERRED/DROPPED → INACTIVE; lainnya → ACTIVE) |
| **B-1 refactor (engine) regresi P-2/P-3** | Sedang | Sedang | Test P-2/P-3 tetap harus PASS setelah refactor |
| **Mutu `PromotionRun.summary` (JSON string) tidak terstruktur** | Rendah | Rendah | DTO + parsing service; dokumentasi format |

---

## 7. Architecture Compliance

| Klausul RFC/WBS | Kondisi | Kepatuhan |
|-----------------|---------|-----------|
| RFC §2.1 `MemberEnrollment` tanpa `@@unique(memberId, academicYearId)` | schema MATCH | ✅ |
| RFC §2.2 `PromotionRun`/`PromotionRunItem` | schema MATCH | ✅ |
| RFC §2.4 / WBS: `Member.classId` dipertahankan sampai F3 | masih ada | ✅ (belum waktunya hapus) |
| RFC §4: status akademik ≠ status sistem; lokal di `MemberEnrollment` | belum ada kode (E-1) | ✅ (skema benar, impl belum) |
| RFC §5 / F1: `MemberType` + `hasAcademicRecord` | config ADA | ✅ |
| RFC §2.3 / F1: `EDUCATION_LEVELS` + `levelOrder` | config ADA | ✅ |
| RFC §15 F1: backfill idempoten | script ADA + smoke 28/28 | ✅ |
| RFC §15 F2: cutover reads ke enrollment | **belum** | ⏳ (E-2) |
| RFC §11: enroll/close/repoint/findActiveByMember | **belum** | ⏳ (E-1) |
| RFC §7/§8/§9: promotion 3 mode + preview + retry | **belum** | ⏳ (P) |
| RFC §10: Bulk Operation Engine | **belum** | ⏳ (B) |
| RFC §12: import berorientasi enrollment | **belum** (masih tulis `classId`) | ⏳ (MI) |
| RFC §16 / WBS §3: IPC/preload additif `enrollments:*`/`bulkOps:*` | **belum** | ⏳ |
| WBS §4 Gate: lint/build/manual/docs/PO per WO | diikuti pada WO Milestone A | ✅ |
| WBS §2 roadmap B: E-1 → E-2 → E-3 → E-4 → … | urutan belum mulai | ✅ (rencana konsisten) |
| RFC §19: strategi impor §12.2 menunggu keputusan PO | belum diputuskan | ⏳ (gate MI-3, bukan blocker E-1) |

Tidak ditemukan pelanggaran arsitektur. Kondisi "belum ada kode" di atas adalah **gap implementasi yang direncanakan WBS**, bukan deviasi.

---

## 8. Recommended Work Breakdown

Mengikuti WBS Milestone B (27 WO), dengan prioritas berdasar dependency. Usulan fokus untuk **Enrollment Foundation (B-1)**:

| Prioritas | WO (WBS) | Deliverable | Alasan |
|-----------|----------|-------------|--------|
| **1** | **E-1** Enrollment core | `EnrollmentRepository` + `EnrollmentService` (enroll/close/repoint/findActiveByMember, satu-ACTIVE) + DTO + IPC/preload `enrollments:*` + env.d.ts + config status akademik | **Fondasi seluruh Milestone B**; semua WO hilir bergantung |
| **2** | **E-2** Cutover reads | classInfo (member.service), snapshot (borrow.service:170), guard delete (class.service) → enrollment aktif; `classId` berhenti ditulis | Mematikan jalur legacy pembaca "kelas sekarang" |
| **3** | **E-3** Status lifecycle sync | sinkronisasi `Member.status` pada status terminal | Prasyarat P-2/B-2b/R-1b |
| **4** | **E-4** History UI | API `enrollments:historyByMember` + tab riwayat di MemberDetailPage | Konsumen pertama enrollment |
| **5** | T-1 regresi cutover | smoke borrow/member/import setelah E-2 | Jaminan produksi |
| **6** | MI-1 → MI-2 → [MI-3 gate PO] → MI-4 | resolver skop tahun/kurikulum; import write enrollment; duplikat per-tahun; UI target tahun | PO #5; berinteraksi dengan cutover |
| **7** | P-1 → P-2 → P-3 → P-4 → P-5a/b | decision+preview; automatic; mapping; retry; UI | Promotion engine |
| **8** | B-1 → B-2a → B-2b → B-3 | BulkOperationEngine; REASSIGN; CLOSE; UI | Generalisasi massal |
| **9** | R-1a/b → R-2a/b | 4 API + UI laporan | Reporting |
| **10** | T-2 → T-3 → PR-1 → PR-2 | matriks uji; F3 hapus `Member.classId`; audit; release | Penutup Milestone B |

**Prasyarat E-1 yang sudah terpenuhi:** schema F2a (dengan index + relasi + FK RESTRICT), config F1 (`EDUCATION_LEVELS`/`levelOrder`/`MEMBER_TYPES.hasAcademicRecord`), base repository/transaction, pola transaksi exclusive-active (AY-1a) sebagai referensi, backfill F2b. **E-1 tidak membutuhkan keputusan PO tambahan** (strategi §12.2 hanya gate MI-3).

---

## VERDICT

### ✅ READY FOR IMPLEMENTATION

**Alasan teknis:**
1. **Fondasi Milestone A lengkap & terverifikasi** — schema `MemberEnrollment`/`PromotionRun`/`PromotionRunItem` (F2a) sesuai persis RFC §2.1–2.2, backfill (F2b) 28/28, guard AY-1a, immutability CL-1, clone CL-2b, dan Milestone A telah dirilis (commit `b521824`) dengan working tree bersih.
2. **Tidak ada defect/blocker di kode existing yang menghalangi E-1.** Seluruh konsumen `member.class`/`classId` yang tersisa adalah **gap cutover yang direncanakan WBS (E-2/MI-2/T-3)**, bukan bug.
3. **E-1 hanya mengonsumsi artefak yang sudah ADA** (schema, config F1, base transaction/pagination, pola repo AY-1a) — tidak ada dependensi eksternal yang belum tersedia.
4. **Tidak ada REVISION WAJIB.** Satu-satunya keputusan PO yang belum diambil (strategi impor §12.2) hanya menjadi gate MI-3, jauh di hilir E-1; tidak memblokir Enrollment Foundation.

**Peringatan untuk urutan implementasi:** lakukan **E-2 bersamaan/sesudah MI-2** agar guard hapus kelas tidak transisi ke "pesan error DB (P2003) yang buruk" selama `Member.classId` berhenti ditulis namun guard masih legacy (§6 baris ke-3).

---

**Status: DONE — DISCOVERY COMPLETE.** Menunggu review Product Owner.
