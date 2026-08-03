# WORK ORDER E-1 — Enrollment Core (EnrollmentRepository + EnrollmentService)

## Ringkasan

E-1 membangun fondasi agregat Enrollment: `EnrollmentRepository`, `EnrollmentService`
(enroll/close/repoint/findActiveByMember + guard satu-ACTIVE), DTO, config status
akademik terpusat, IPC `enrollments:*`, preload, `env.d.ts`, dan wiring bootstrap.
Semua artefak konsumsi `Member.classId` legacy (E-2/E-3/F3) **tidak disentuh** — konsisten
dengan scope WBS.

## Source of Truth

- `MASTER_DATA_AKADEMIK_ARCHITECTURE_RFC.md` (LOCKED) — §1.2, §1.3, §2.1, §4, §6.1, §6.2, §11
- `MASTER_DATA_AKADEMIK_WBS.md` (LOCKED) — WO-13 E-1
- `MILESTONE_B_DISCOVERY_REPORT.md` (APPROVED) — Gap #1..#4 (HIGH blocker), §4.1 data flow

## Deliverable

### File baru (7 source + 1 smoke)

| File | Peran |
|------|-------|
| `src/shared/config/academic-status.ts` | Enum status akademik terpusat (`ACADEMIC_STATUS`), `isAcademicStatus`, `isTerminalAcademicStatus` |
| `src/shared/dto/enrollment.ts` | `EnrollmentDTO`, `CreateEnrollmentDTO`, `CloseEnrollmentDTO`, `RepointEnrollmentDTO` |
| `src/main/repositories/enrollment.repository.ts` | `create`, `findById`, `findActiveByMember`, `countActiveByMember`, `close` |
| `src/main/services/enrollment.service.ts` | `enroll`, `close`, `repoint`, `findActiveByMember` |
| `electron/ipc/enrollment.ipc.ts` | `enrollments:enroll/close/repoint/findActiveByMember` |
| `electron/preload/enrollment.preload.ts` | `enrollments.*` (invoke) |
| `wo13_e1_smoke/smoke.ts` | Smoke test 39/39 (fresh DB) |

### File dimodifikasi (4)

| File | Perubahan |
|------|-----------|
| `electron/preload/index.ts` | import + spread `enrollmentAPI` |
| `src/renderer/env.d.ts` | entry `enrollments` (4 method) |
| `electron/main/bootstrap.ts` | `EnrollmentService` + `EnrollmentRepository` di Container |
| `electron/ipc/index.ts` | `registerEnrollmentHandlers` + tipe di param `services` |

## Desain

### Guard satu-ACTIVE di Service, bukan DB
Schema F2a sengaja **tanpa** `@@unique([memberId, academicYearId])` (mendukung
REDISTRIBUTED 2-baris setahun). "Satu enrollment AKTIF per anggota" dijaga Service:
`enroll` memanggil `countActiveByMember` dan **memblokir** bila sudah ada ACTIVE
(pesan menyarankan repoint) — RFC §6.2 "tutup dulu bila ada / blokir".

### `repoint` = close(REDISTRIBUTED) + enroll dalam SATU transaksi
Pola `runTransaction(getPrisma(), ...)` + `tx.memberEnrollment.*` (pola WO-9 CL-2b).
Tahun ajaran baru = tahun ajaran enrollment lama. Guard: enrollment harus ACTIVE;
kelas target ada; kelas target milik tahun yang sama; kelas target ≠ kelas saat ini.
Seluruh histori dipertahankan (tidak pernah DELETE).

### Enroll validasi berlapis
1. Member ada (404) dan `memberType.hasAcademicRecord === true` (hanya siswa).
2. Kelas ada (404) dan `class.academicYearId === input.academicYearId`.
3. Tidak ada enrollment ACTIVE lain (400).

### Close validasi
- Enrollment ada (404), harus ACTIVE (400), dan `status` harus terminal
  (`isTerminalAcademicStatus`: PROMOTED/REPEATED/REDISTRIBUTED/TRANSFERRED/DROPPED/GRADUATED).
- Set `status` + `leftAt` + `note`. **Tidak** menyentuh `Member.status` — sinkronisasi
  status sistem adalah scope E-3 (WBS WO-15), di sini secara disiplin **tidak** diimplementasi.

## TIDAK diubah (scope discipline)

- Schema + migration (`MemberEnrollment` sudah ada sejak F2a; migration `20260803_wo2_f2a...`)
- `Member.classId`, `MemberService`, `BorrowService`, `ClassService`, `MemberImportService`
- UI Enrollment, Promotion, Bulk Operation, Reporting, cutover E-2

## Validation

### 1. Lint — PASS
`npm run lint` (tsc node + web) bersih.

### 2. Build — PASS
`npm run build`: main **1,788.10 kB** · preload **8.49 kB** · renderer **987.29 kB**.
(Baseline WO-9: 1,778.91 / 7.84 / 985.76 — kenaikan konsisten: service+repo di main,
preload baru, renderer hanya tipe env.d.ts.)

### 3. Smoke DB — 39/39 PASS (fresh DB)
`wo13_e1_smoke/smoke.ts` pada DB temp `file:C:/Users/hp/AppData/Local/Temp/opencode/e1-smoke/smoke.db`
(fresh `prisma migrate deploy`, 4 migrations). Kasus:
- **Enroll:** ACTIVE/leftAt-null/className/label; findActiveByMember; countActive.
- **Satu-ACTIVE:** enroll kedua ditolak 400.
- **Non-siswa:** guru & umum ditolak 400 (`hasAcademicRecord=false`).
- **Referensi:** member/kelas tidak ada → 404; kelas tahun lain → 400.
- **Close:** status non-terminal (ACTIVE/random) → 400; GRADUATED valid → status+leftAt+note;
  findActive null; count 0; close ulang → 400.
- **Repoint:** baris lama REDISTRIBUTED + leftAt; baris baru ACTIVE kelas target tahun sama;
  findActive → baris baru; histori 2 baris (tidak pernah DELETE); count aktif tetap 1;
  guard repoint (sudah ditutup / kelas tidak ada / tahun lain / kelas sama).
- **findActiveByMember:** tanpa enrollment → null; member tidak ada → null.
- **Invariant:** `groupBy` — setiap member ≤ 1 ACTIVE dengan leftAt null.

### 4. Migrate diff — no drift
`prisma migrate diff --from-migrations --to-schema-datamodel` pada DB temp = empty migration.

### 5. Verifikasi bundle
`out/main/index.js` dan `out/preload/index.js` memuat keempat channel `enrollments:*` (4+4 match).

## Kesimpulan

**READY.** Milestone B kini berdiri di atas fondasi Enrollment (semua WO hilir E-2/MI/P/B/R
bergantung pada E-1). Tidak ada defect, tidak ada deviasi dari RFC, tidak ada keputusan PO
baru yang diperlukan.

## Technical Debt / Catatan

- `EnrollmentRepository.findActiveByMember` memfilter `leftAt: null` (bukan hanya `status=ACTIVE`)
  sebagai definisi "aktif" — konsisten RFC §1.3. Data lama (sebelum E-1) yang statusnya ACTIVE
  tapi punya `leftAt` akan tetap dianggap aktif; tidak ada data seperti itu di praktik normal.
- `enroll` saat ini **memblokir** bila ada ACTIVE (tidak auto-close). Auto-close adalah
  keputusan E-2/MI-2; repoint adalah jalur eksplisit untuk mutasi tengah tahun.
