# WORK_ORDER_3_F2B_IMPLEMENTATION_REPORT

**WO-3 — F2b: Backfill + Reconciliation**
**Status: DONE — READY review PO**
**Tanggal: 2026-08-03**

---

## 1. Ringkasan

Implementasi WO-3 F2b sesuai `WO3_DISCOVERY_REPORT.md` (APPROVED) dan RFC §15 F1: backfill idempoten `Member.classId → MemberEnrollment(ACTIVE)` dengan `academicYearId` dari `class.academicYearId`. **Tidak ada** perubahan schema, migration, Repository, Service, IPC, atau UI (WBS WO-3: Service/IPC/Preload/UI = N/A).

## 2. Deliverable

| File | Keterangan |
|------|-----------|
| `scripts/backfill-member-enrollment.ts` | Script one-time: ekspor `runBackfillEnrollment(prisma)` + CLI (`require.main === module`). Logika idempoten + laporan reconciliation. |
| `wo3_f2b_smoke/smoke.ts` | Smoke DB: fresh DB, seed gaya skema lama, backfill, verifikasi count/idempotensi/orphan. **28/28 PASS** |

## 3. Logika Backfill (`runBackfillEnrollment`)

1. `findMany` semua `Member` dengan `classId != null` + `include: { class: true }`.
2. Per member:
   - Sudah punya `MemberEnrollment` ACTIVE (`status=ACTIVE AND leftAt=null`) → `skippedAlreadyActive++` (idempotensi, aturan "satu ACTIVE" RFC §1.2/§2.1).
   - `class == null` (orphan / classId menggantung) → masuk `orphanMembers`, dilewati (tanpa insert).
   - Selainnya → `MemberEnrollmentCreateManyInput`: `memberId`, `classId`, `academicYearId = class.academicYearId`, `status: 'ACTIVE'`.
3. Seluruh insert dalam **satu `$transaction`** via `runTransaction` (all-or-nothing).
4. Hasil reconciliation dicetak CLI: `membersWithClassId / enrollmentsCreated / skippedAlreadyActive / orphanMembers / totalEnrollments`.

## 4. Hasil Reconciliation

### 4.1 Smoke (fresh DB, DB uji skema lama)
Seed: AcademicYear ×1, Curriculum ×1, Class ×2, Member ×4 (M1→classA, M2→classB, M3 tanpa classId, M4 orphan via raw SQL `PRAGMA foreign_keys=OFF`).

| Metrik | Run 1 | Run 2 (idempotensi) |
|--------|-------|---------------------|
| membersWithClassId | 3 | 3 |
| enrollmentsCreated | 2 | 0 |
| skippedAlreadyActive | 0 | 2 |
| orphanMembers | 1 | 1 |
| totalEnrollments | 2 | 2 (tidak bertambah) |

Verifikasi per-member (Run 1): M1 & M2 → tepat 1 enrollment ACTIVE, `leftAt=null`, `enrolledAt` terisi, `academicYearId == class.academicYearId`; M3 (tanpa classId) → 0; M4 (orphan) → 0, dilaporkan.

### 4.2 Empty DB (no-op) — DB live dev (`prisma/aplibrary.db`)
```
membersWithClassId: 0
enrollmentsCreated: 0
skippedAlreadyActive: 0
orphanMembers: 0
totalEnrollments: 0
EXIT=0
```
Konfirmasi RFC §15: DB live kosong → backfill **no-op**, tanpa perubahan data.

## 5. Validation (semua PASS)

| # | Check | Hasil |
|---|-------|-------|
| 1 | Fresh DB PASS | `prisma migrate deploy` (4 migrations) + smoke 28/28 |
| 2 | Idempotency PASS | Run 2 = 0 created, total tetap 2 |
| 3 | Orphan PASS | Orphan dilaporkan (`m-orphan`, `CLASS-GHOST`), tanpa insert, tanpa error |
| 4 | Empty DB (no-op) PASS | CLI pada DB live 0 member, exit 0 |
| 5 | lint PASS | `npm run lint` (tsc node+web) |
| 6 | build PASS | `npm run build` (main/preload/renderer) |

## 6. Yang TIDAK dikerjakan (eksplisit)

- Schema `prisma/schema.prisma` — tidak disentuh.
- Migration — tidak ada migration baru.
- Repository/Service/IPC/Preload/UI — N/A (WBS WO-3).
- `Member.classId` — tetap ada (F1 additive; penghapusan di T-3/F3).
- WO berikutnya (AY-1a dsb.) — tidak disentuh.

## 7. Catatan Teknis

- **Orphan tidak mungkin dibuat lewat Prisma normal** — FK `Member.classId → Class` di-enforce SQLite (insert classId palsu → `FOREIGN KEY constraint failed`). Orphan hanya muncul dari data legacy/direct-DB; cabang defensif diuji dengan seed raw SQL `PRAGMA foreign_keys=OFF` pada koneksi Prisma yang sama.
- **Kolom ter-map `@map("number")`** (bukan `memberNumber`) — raw SQL untuk seed orphan wajib memakai nama kolom fisik (pelajaran WO-006B).
- `PRAGMA foreign_keys=OFF` adalah **no-op di dalam transaction** (SQLite) — untuk seed orphan dipakai di luar `$transaction`.
- `prisma generate` tidak diperlukan (tanpa perubahan schema); engine DLL lock tidak relevan di WO-3.
