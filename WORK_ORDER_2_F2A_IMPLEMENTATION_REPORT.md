# WORK_ORDER_2_F2A_IMPLEMENTATION_REPORT

**WO-2 — F2a: Schema + Migration Master Data Akademik**
**Status: DONE — READY review PO**
**Tanggal: 2026-08-03**

---

## 1. Ringkasan

Implementasi WO-2 F2a sesuai `WO2_DISCOVERY_REPORT.md` (APPROVED) dan `MASTER_DATA_AKADEMIK_ARCHITECTURE_RFC.md` (LOCKED). Hanya lapisan **Schema + Migration** yang dikerjakan. Repository/Service/IPC/Preload/UI **tidak disentuh** (layer berikutnya, sesuai WBS).

## 2. Perubahan Schema (`prisma/schema.prisma`)

### 2.1 Model baru (3)

| Model | Tujuan (RFC) | Relasi & Catatan |
|-------|-------------|------------------|
| `MemberEnrollment` | §2.1 — SSOT penempatan anggota di kelas per tahun ajaran | memberId, classId, academicYearId (semua FK RESTRICT); `status` **tanpa DEFAULT** |
| `PromotionRun` | §2.2, §10 — audit operasi massal/promosi | `fromYearId`/`toYearId` named relations `PromotionRunFromYear`/`PromotionRunToYear`; `mode` & `status` **tanpa DEFAULT** |
| `PromotionRunItem` | Detail per-anggota dalam satu run | `targetClassId` nullable (GRADUATED/NO_TARGET); `outcome` **tanpa DEFAULT** |

### 2.2 Back-relations ditambahkan (4)

| Model | Field back-relation |
|-------|---------------------|
| `AcademicYear` | `memberEnrollments`, `promotionRunsFrom`, `promotionRunsTo` |
| `Class` | `memberEnrollments` |
| `Member` | `memberEnrollments`, `promotionRunItems` |

`Curriculum` tidak butuh back-relation (tidak ada model baru yang mereferensinya).

### 2.3 Prinsip desain

- **Business rule TIDAK pindah ke DB**: `MemberEnrollment.status`, `PromotionRun.mode`, `PromotionRun.status`, `PromotionRunItem.outcome` tanpa `DEFAULT` — nilai deterministik Service di Work Order berikutnya. Hanya timestamp audit (`enrolledAt`, `startedAt`, `createdAt`) yang memakai `DEFAULT CURRENT_TIMESTAMP`.
- **Semua id**: `@default(uuid())` (konsisten dengan model existing).
- **FK**: `ON DELETE RESTRICT` (konsisten: kelas ber-enrollment / run ber-item tidak boleh dihapus).
- **Nullable** hanya untuk data yang memang opsional: `leftAt`, `note`, `runBy`, `summary`, `finishedAt`, `targetClassId`, `message`.

## 3. Index — Business Purpose (11 index baru)

| # | Index | Business Purpose |
|---|-------|------------------|
| 1 | `MemberEnrollment_memberId_academicYearId_idx` | Lookup seluruh enrollment seorang anggota dalam satu tahun ajaran (riwayat & redistribusi tengah tahun) |
| 2 | `MemberEnrollment_memberId_status_idx` | Cek status aktif anggota (mis. masih di kelas A di tahun berjalan) |
| 3 | `MemberEnrollment_classId_idx` | Daftar anggota satu kelas (roster kelas) |
| 4 | `MemberEnrollment_academicYearId_idx` | Semua penempatan pada satu tahun ajaran (basis snapshot promosi) |
| 5 | `MemberEnrollment_status_idx` | Aggregate enrollment per status (contoh: jumlah PROMOTED/REPEATED) |
| 6 | `PromotionRun_fromYearId_idx` | Riwayat run dari tahun ajaran sumber |
| 7 | `PromotionRun_toYearId_idx` | Riwayat run ke tahun ajaran tujuan |
| 8 | `PromotionRun_status_idx` | Listing run per status (SUCCESS/PARTIAL/FAILED) |
| 9 | `PromotionRunItem_promotionRunId_idx` | Seluruh item milik satu run (detail hasil promosi) |
| 10 | `PromotionRunItem_memberId_idx` | Riwayat naik kelas seorang anggota lintas run |
| 11 | `PromotionRunItem_outcome_idx` | Aggregate item per outcome (PROMOTED/REPEATED/...) |

Semua index mengikuti pola komposit-minimal (kolom paling selektif lebih dulu) dan konsisten dengan gaya index existing di schema.

## 4. Migration

- **Folder**: `prisma/migrations/20260803_wo2_f2a_master_data_akademik/`
- **Sort order**: `20260803_wo2_f2a_...` mengurut benar setelah `20260731_wo13_revision1_source_detail` (verifikasi fresh deploy).
- **Isi**: murni additive — 3 `CREATE TABLE`, 11 `CREATE INDEX`, **tanpa ALTER**, tanpa DEFAULT workflow fields.
- **Dibuat via** `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --script` lalu ditulis sebagai file migration resmi.
- Baseline `20260731_adr002_initial` dan migration WO13 **tidak dimodifikasi**.

## 5. Validation (semua PASS)

| Check | Hasil |
|-------|-------|
| `prisma validate` | PASS |
| `prisma migrate deploy` (dev DB) | PASS — "All migrations have been successfully applied" (4 migrations) |
| `prisma migrate status` (dev DB) | PASS — "Database schema is up to date!" |
| `prisma generate` | PASS (dev server dihentikan sementara — lock DLL) |
| `prisma migrate deploy` (fresh DB) | PASS — urutan baseline → WO13 → WO13-R1 → F2a |
| `prisma migrate status` (fresh DB) | PASS — up to date |
| `prisma migrate diff` (fresh DB) | "No difference detected" (empty migration) |
| Fresh DB Smoke Test | **35/35 PASS** |
| `npm run lint` | PASS |
| `npm run build` | PASS (preload 7.68 kB · renderer 940.40 kB; main tidak berubah — tidak ada kode TS disentuh) |

## 6. Smoke Test (`wo2_f2a_smoke/smoke.ts`)

Fresh DB absolute (`file:C:/...`), 35 assertion:

- **Fixtures**: AcademicYear ×2, Curriculum, Class ×2, Member — create & baca relasi.
- **MemberEnrollment**: create ACTIVE; read via `include` (member/class/academicYear); query `@@index([memberId,status])`, `@@index([classId])`, `@@index([memberId,academicYearId])`; **2 baris setahun tanpa unique violation** (pola REDISTRIBUTED); FK RESTRICT delete Class ber-enrollment → P2003; FK invalid → P2003.
- **PromotionRun + Item**: create run AUTOMATIC/SUCCESS; 3 item (PROMOTED dengan target, GRADUATED & NO_TARGET tanpa target); read via `include` (items/fromYear/toYear); query `@@index([promotionRunId]/[memberId]/[outcome])`; FK invalid → P2003.
- **Tidak ada DB default** (bukti dua lapis): client Prisma menolak create tanpa `status`/`mode`/`outcome` (validasi client-side), DAN raw SQL insert yang meng-omit kolom → `NOT NULL constraint failed` (bukti di level DB).

## 7. Yang TIDAK dikerjakan (scope berikutnya)

- Repository/Service/IPC/Preload/UI untuk member enrollment & promosi (WO berikutnya, sesuai WBS).
- Backfill data (dilarang di WO-3).
- `Member.classId` tidak disentuh (eksisting, di luar scope F2a).
- Tidak ada perubahan RFC/WBS.

## 8. Catatan Proses

- `prisma generate` sempat gagal `EPERM` karena dev server (`npm run dev` — electron-vite) memegang `query_engine-windows.dll.node`. Dev server dihentikan sementara atas persetujuan PO, generate sukses, lalu hasil verifikasi. **Mulai sekarang, sebelum `prisma generate` pastikan tidak ada dev server yang berjalan.**
- Smoke DB wajib **fresh DB per run** (hasil run sebelumnya menyebabkan unique constraint pada fixture).
- Nama file diberi suffix `_F2A_` karena `WORK_ORDER_2_IMPLEMENTATION_REPORT.md` sudah dipakai laporan sprint Import Anggota (tidak boleh overwrite).
