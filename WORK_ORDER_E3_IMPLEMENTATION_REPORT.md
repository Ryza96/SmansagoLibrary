# WORK ORDER E-3 — Enrollment Lifecycle (validasi transisi + Member.status sync)

## Ringkasan

E-3 menuntaskan lifecycle Enrollment (WBS WO-15 E-3): seluruh transisi `enroll` / `repoint` /
`close` tervalidasi (invalid transition ditolak), histori append-only, invariant satu-ACTIVE,
dan **sinkronisasi `Member.status`** dari status akademik terminal (RFC §4.3) dipicu
`EnrollmentService.close` dalam SATU transaksi.

**Keputusan PO sesi ini:**
1. Nama status tetap `DROPPED` (RFC LOCKED §4/§6.1, WBS, komentar schema, config E-1) — `DROPPED_OUT` di teks WO dianggap salah ketik.
2. Sertakan sinkronisasi `Member.status` (WBS WO-15 E-3, item deferred E-1/E-2).
3. Pertahankan `REDISTRIBUTED` sebagai status terminal valid (dipakai `repoint`/rename tengah tahun).

## Source of Truth

- `MASTER_DATA_AKADEMIK_ARCHITECTURE_RFC.md` (LOCKED) — §4.3 (matriks sinkronisasi), §6.1 (status akademik), §6.2 (alur penutupan)
- `MASTER_DATA_AKADEMIK_WBS.md` (LOCKED) — WO-15 E-3 "Member.status lifecycle sync" (baris 326–334)
- `WORK_ORDER_E1_IMPLEMENTATION_REPORT.md` (fondasi enroll/repoint/close + satu-ACTIVE)
- `WORK_ORDER_E2_IMPLEMENTATION_REPORT.md` (cutover reads; deferred: "sinkronisasi Member.status = E-3")

## Deliverable

### File dimodifikasi (3)

| File | Perubahan |
|------|-----------|
| `src/shared/config/academic-status.ts` | **baru** `memberStatusForTerminalAcademic()` — matriks RFC §4.3 (GRADUATED/TRANSFERRED/DROPPED → `INACTIVE`; PROMOTED/REPEATED/REDISTRIBUTED → `ACTIVE`; non-terminal → `null`) |
| `src/main/services/enrollment.service.ts` | `close` → SATU `runTransaction`: update enrollment terminal + sinkronisasi `Member.status` bila berbeda; guard 500 bila baris hilang setelah transaksi |
| `src/main/repositories/enrollment.repository.ts` | hapus `close` + tipe `CloseEnrollmentData` (kini dead code — close transaksional pindah ke service, pola E-1 `repoint`) |

### File baru (1 smoke)

| File | Peran |
|------|-------|
| `wo15_e3_smoke/smoke.ts` | Smoke test 78/78 (fresh DB) |

### Tidak diubah (dokumentasi scope)

DTO (`CloseEnrollmentDTO` tetap `{ status, note }`), IPC (`enrollments:close` signature tetap),
preload, `env.d.ts`, bootstrap (konstruktor `EnrollmentService` sudah punya `MemberRepository`),
schema, migration.

## Desain

### 1. Matriks sinkronisasi RFC §4.3 (config leaf-node)
`memberStatusForTerminalAcademic(academicStatus)` adalah satu-satunya sumber aturan
"sistem mengikuti akademik". Status terminal **keluar sistem** (`GRADUATED`/`TRANSFERRED`/`DROPPED`)
men-drive `Member.status = INACTIVE`; status terminal **tetap sekolah**
(`PROMOTED`/`REPEATED`/`REDISTRIBUTED`) mempertahankan `ACTIVE`. Nilai non-terminal → `null`
(tidak ada sinkronisasi). Helper murni (tanpa import), mengembalikan tipe literal.

### 2. `close` transaksional + sinkronisasi
- Guard tetap E-1: enrollment ada (404), harus `ACTIVE` (400), status harus terminal (400).
- `runTransaction(getPrisma(), ...)`:
  1. `tx.memberEnrollment.update` → status terminal + `leftAt` + `note` (tidak pernah DELETE).
  2. Bila matriks memberi target (`INACTIVE`/`ACTIVE`) dan `Member.status` berbeda → `tx.member.update`.
  - Gagal di langkah manapun → rollback penuh (tidak ada window "enrollment tertutup tapi member
    masih aktif" untuk status keluar-sistem).
- `repoint` TIDAK berubah: close internal `REDISTRIBUTED` → matriks `ACTIVE` (member memang ACTIVE
  karena memiliki enrollment ACTIVE) → tidak ada write status. `enroll` juga tidak berubah
  (sinkronisasi hanya dipicu close, sesuai WBS).

### 3. Transisi lifecycle (validasi E-1 dipertahankan, diverifikasi smoke E-3)
| Operasi | Dari → Ke | Validasi |
|---------|-----------|----------|
| `enroll` | (none) → `ACTIVE` | member ada + `hasAcademicRecord` (siswa); kelas ada + milik tahun; satu-ACTIVE |
| `close` | `ACTIVE` → terminal | enrollment ACTIVE; status terminal; transaksional + sync §4.3 |
| `repoint` | `ACTIVE` → `REDISTRIBUTED` + `ACTIVE`(baru) | enrollment ACTIVE; target ada; target tahun sama; target ≠ kelas kini; transaksional |

## Validation

### 1. Lint — PASS
`npm run lint` (tsc node + web) bersih.

### 2. Build — PASS
`npm run build`: main **1,789.83 kB** · preload **8.49 kB** · renderer **987.29 kB**.
Renderer identik E-2 (987.29) — tidak ada perubahan UI. Main naik tipis (+1.24 kB dari E-2)
dari matriks sync + close transaksional.

### 3. Smoke E-3 — 78/78 PASS (fresh DB)
`wo15_e3_smoke/smoke.ts` pada DB temp `file:C:/Users/hp/AppData/Local/Temp/opencode/wo15_e3_smoke/smoke.db`
(fresh `prisma migrate deploy`, 4 migrations; DB dibersihkan setelah run). Kasus:
- **Matriks §4.3 (config unit):** 3 → INACTIVE, 3 → ACTIVE, ACTIVE → null.
- **Enroll:** ACTIVE; member.status tidak berubah; invalid transition (satu-ACTIVE, non-siswa,
  member/kelas 404, kelas tahun lain 400).
- **Close lifecycle penuh (6 status terminal):** status tersimpan, leftAt set, note tersimpan,
  **member.status sesuai matriks** (PROMOTED/REPEATED/REDISTRIBUTED → ACTIVE;
  TRANSFERRED/DROPPED/GRADUATED → INACTIVE), findActive null, row tidak dihapus.
- **Invalid close:** enrollment sudah ditutup ditolak; status non-terminal (ACTIVE/random) ditolak;
  enrollment tidak ada 404.
- **Repoint:** REDISTRIBUTED + baru ACTIVE; member.status tetap ACTIVE; histori 2 baris;
  guard (sudah ditutup / target sama / tahun lain / target tidak ada).
- **Invariant satu-ACTIVE:** `groupBy` status ACTIVE + leftAt null → ≤ 1 per member.
- **History append-only:** tidak ada DELETE.
- **Regression E-2:** `MemberService.findById` classInfo (level/parallel/curriculum/AY) saat
  enrollment; classInfo null + `Member.status` INACTIVE setelah close GRADUATED.

### 4. Regression smoke E-1 & E-2 — 39/39 + 36/36 PASS
`wo13_e1_smoke/smoke.ts` (39/39) dan `wo14_e2_smoke/smoke.ts` (36/36) di-re-run pada fresh DB
masing-masing — sinkronisasi Member.status tidak merusak alur E-1/E-2.

### 5. Migrate diff — no drift
`prisma migrate diff --from-migrations --to-schema-datamodel` = empty migration
(schema tidak berubah).

## Kesimpulan

**READY.** Lifecycle enrollment lengkap: semua transisi tervalidasi, invalid transition ditolak,
invariant satu-ACTIVE dan histori append-only dipertahankan, dan `Member.status` kini
ter-sinkronisasi otomatis dari status akademik terminal dalam transaksi yang sama dengan close.
RFC §4.3 matrix = matriks test 100% (WBS WO-15 exit criteria).

## Technical Debt / Catatan

- `memberStatusForTerminalAcademic` mengembalikan `ACTIVE` untuk PROMOTED/REPEATED/REDISTRIBUTED;
  service hanya menulis bila nilai berbeda — idempoten, tidak ada write no-op.
- `enroll`/`repoint` tidak men-sync member (sesuai WBS "dipicu close"); re-enroll anggota yang
  pernah DROPPED/TRANSFERRED tidak otomatis mengaktifkan kembali `Member.status` (di luar scope E-3;
  dihandle alur re-registrasi/UI bila ada).
- `EnrollmentRepository.close` dihapus karena menjadi dead code (close transaksional kini di service).
