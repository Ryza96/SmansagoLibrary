# WORK ORDER MI-2 — Import Write-Phase (Enrollment)

## Ringkasan

MI-2 mengubah write-phase import agar berorientasi Enrollment (RFC §12.1 step 5; WBS WO-18 MI-2):
impor menulis `Member` + `MemberEnrollment(ACTIVE)` dalam **satu `$transaction`**, `Member.classId`
**tidak lagi ditulis**, dan `MemberEnrollment` menjadi Source of Truth penempatan kelas.
Invarian "tidak ada Member tanpa Enrollment" dijamin oleh commit-once + rollback otomatis Prisma.

**Keputusan kunci:**
- `MemberImportService` bertambah 1 dependensi `EnrollmentRepository` (posisi argumen 5).
- Tahun enrollment diambil dari `classResult.academicYearId` (hasil resolver, termasuk fallback
  tahun aktif) — tahun enrollment **selalu sama** dengan tahun resolusi kelas (SSOT resolusi).
- `Member.status` tetap `INACTIVE` (RFC step 5); status keanggotaan tidak disentuh (MI-3/§12.2).
- Duplikat "member sudah ada → hanya enrollment" (RFC step 3 / PO #5) = **MI-3 (gate PO)**, bukan MI-2.

## Source of Truth

- `MASTER_DATA_AKADEMIK_ARCHITECTURE_RFC.md` (LOCKED) — §12.1 step 3/5, §6.3 (write dalam satu transaksi)
- `MASTER_DATA_AKADEMIK_WBS.md` (LOCKED) — WO-18 MI-2: "write-phase `Member + MemberEnrollment`;
  `Member.classId` tak ditulis"; validation "impor pertama; impor ulang tahun berikutnya; rollback"
- `WORK_ORDER_MI1_IMPLEMENTATION_REPORT.md`

## Deliverable

| File | Perubahan |
|------|-----------|
| `src/main/repositories/enrollment.repository.ts` | +`createManyWithTx(tx, rows)` — chunked (`MEMBER_IMPORT_WRITE_CHUNK`), tx-aware (pola `MemberRepository`) |
| `src/main/services/member-class-resolver.service.ts` | `MemberClassResolutionResult` +`academicYearId: string \| null` (tahun efektif yang DIPAKAI resolver, termasuk fallback) |
| `src/main/services/member-import.service.ts` | ctor +`EnrollmentRepository`; preflight mengembalikan `academicYearId`; `writePhase(rows, classIdByRow, academicYearId, onProgress)`; `buildMemberPayload` TANPA `classId`; createMany Member → lookup id → createMany Enrollment(ACTIVE) dalam satu tx |
| `electron/main/bootstrap.ts` | wiring +`enrollmentRepository` (arg 5) |
| `wo17_mi1_smoke/smoke.ts` | diperbarui ke kontrak baru (resolusi dibuktikan via `enrollment.classId`, `member.classId` null) — 44/44 |
| `wo18_mi2_smoke/smoke.ts` | **baru** — 37 assertion (6 step) |

### Tidak diubah

UI Import, IPC (`members:previewCheck`/`members:import` payload `(rows, scope?)` tetap),
preload, env.d.ts, Schema, Migration, `EnrollmentService` (enroll/close/repoint tidak disentuh),
Promotion, Reporting, Bulk Operation.

## Desain

### 1. Write-phase dalam SATU transaksi (RFC §12.1 step 5)
```
writePhase(rows, classIdByRow, academicYearId, onProgress):
  runTransaction(getPrisma(), tx => {
    numbers = allocateMemberNumbers(tx, n, STUDENT)          // di dalam tx
    createManyWithTx(tx, memberPayload)                      // Member TANPA classId, status INACTIVE
    created = tx.member.findMany({ memberNumber IN numbers })// lookup id per memberNumber
    enrollments = rows → { memberId, classId, academicYearId,
                           status: ACTIVE, note: null }
    createManyWithTx(tx, enrollments)                        // Enrollment ACTIVE
    return n
  })
```
Commit sekali di akhir `prisma.$transaction`. Exception apa pun (termasuk kegagalan write
enrollment) → **rollback penuh** → 0 Member + 0 Enrollment tersimpan.

### 2. Tahun enrollment = tahun resolusi kelas
Resolver kini mengembalikan `academicYearId` yang DIPAKAINYA (nilai eksplisit dari scope, atau hasil
`findActive` saat scope null). `writePhase` memakai nilai ini untuk `MemberEnrollment.academicYearId`,
sehingga tahun enrollment tidak mungkin menyimpang dari tahun tempat kelas di-resolve.

### 3. `Member.classId` tidak lagi ditulis
`buildMemberPayload` menghapus field `classId`. Kolom `Member.classId` (legacy, WO-006C) dibiarkan
null untuk semua baris impor; penempatan kelas hanya via `MemberEnrollment` (SSOT). Kolom itu tidak
dihapus dari schema (cutover penuh = WO terpisah, di luar scope MI-2).

### 4. Uji rollback (smoke STEP 5)
Enrollment write dipaksa gagal lewat stub `EnrollmentRepository` yang melempar exception pada
`createManyWithTx` — mensimulasikan kegagalan di tengah transaksi SETELAH Member ter-create.
Hasil: import reject, `count(Member)` dan `count(MemberEnrollment)` tidak berubah (rollback penuh).

## Validation

### 1. Lint — PASS
`npm run lint` (tsc node + web) bersih.

### 2. Build — PASS
`npm run build`: main **1,794.47 kB** · preload **8.62 kB** · renderer **999.83 kB**
(preload & renderer identik MI-1 = bukti frontend N/A; main +2.24 kB).

### 3. Smoke MI-2 — 37/37 PASS (fresh DB)
`wo18_mi2_smoke/smoke.ts` pada DB temp (fresh `prisma migrate deploy`, 4 migrations; dibersihkan):
- **Member berhasil dibuat:** import 2 baris scope `{yearA, k1}` → `success`, `created 2`,
  memberNumber `S-000001`/`S-000002`, status `INACTIVE`.
- **Member.classId tidak lagi ditulis:** kedua member `classId === null` padahal resolver sukses.
- **Enrollment ACTIVE berhasil dibuat:** 2 enrollment `status=ACTIVE`, `classId` = kelas scope
  (classA/classB), `academicYearId` = yearA, `leftAt=null`, `enrolledAt` terisi;
  invariant 1 Member = 1 Enrollment.
- **Histori Enrollment benar:** `findManyByMember` → 1 baris ACTIVE dengan classId/academicYearId
  benar; import ke tahun lain (yearB) → histori ber-`academicYearId=yearB` (tahun B, bukan tahun aktif).
- **Rollback bila Enrollment gagal:** stub melempar pada write enrollment → import reject,
  0 Member + 0 Enrollment baru (count sebelum == sesudah).
- **Backward-compat tanpa scope:** import tanpa scope → enrollment `academicYearId = tahun aktif`
  (yearA), classId dari kelas aktif; member.classId tetap null.

### 4. Regression smoke — PASS
`wo17_mi1_smoke` **44/44** (diperbarui: konstruktor service +`EnrollmentRepository`; resolusi
dibuktikan via `enrollment.classId`; `member.classId` null), `wo13_e1_smoke` **39/39**,
`wo14_e2_smoke` **36/36**, `wo15_e3_smoke` **78/78**, `wo16_e4_smoke` **45/45**.

### 5. Migrate diff — no drift
`prisma migrate diff --from-migrations --to-schema-datamodel --script` = empty migration (schema tidak disentuh).

## Kesimpulan

**READY.** Import kini menulis `Member` + `MemberEnrollment(ACTIVE)` atomik dalam satu transaksi;
`Member.classId` tidak ditulis; `MemberEnrollment` = Source of Truth. Rollback terbukti: kegagalan
enrollment tidak meninggalkan Member yatim.

## Technical Debt / Catatan

- Kolom `Member.classId` tetap ada di schema (legacy) dan bernilai null untuk baris impor; cutover
  lengkap ke enrollment (hapus kolom / alih baca penuh) bukan scope MI-2.
- "Member sudah ada → hanya buat enrollment" (RFC step 3, PO #5) dan strategi duplikat (§12.2) =
  **WO-19 MI-3 (GATE PO)** — saat ini `MemberDuplicateChecker` masih memblokir NISN yang sudah ada di DB.
- Dependensi `EnrollmentRepository` ditambah ke `MemberImportService` (bootstrap); smoke MI-1 ikut
  di-update karena konstruktor berubah (bukan perubahan kontrak IPC/payload).
