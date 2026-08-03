# WORK ORDER MI-3 — Import Duplicate Strategy (Skip & Flag)

## Ringkasan

MI-3 mengimplementasikan **strategi A "Skip & flag"** (RFC §12.2) untuk baris import yang
NISN-nya sudah ada di database, sesuai **keputusan PO**:

- **Member BARU** (NISN tidak ada di DB) → buat `Member` + `MemberEnrollment(ACTIVE)` (create-member).
- **Member SUDAH ADA** tanpa enrollment ACTIVE di tahun target → **enrollment-only** (PO #5):
  TIDAK membuat Member baru; HANYA membuat `MemberEnrollment(ACTIVE)` di tahun target.
- **Member SUDAH ADA + SUDAH ACTIVE di tahun target** → **skip** (RFC §12.2 strategi A):
  baris dilewati, histori utuh, TIDAK ada dua enrollment ACTIVE per (member, tahun).

Semua routing terjadi dalam SATU `$transaction` (commit-once). Invarian "tidak ada dua ACTIVE
per member per tahun" dijaga; email hanya diblokir untuk member BARU.

**Keputusan kunci:**
- `MemberDuplicateChecker` tidak lagi memblokir NISN existing → mengembalikan `existingByRow`
  (routing) + hanya memblokir `email` untuk member baru.
- `MemberImportResultDTO` +`skipped` (jumlah baris dilewati strategi A).
- Preflight melakukan batch lookup ACTIVE-per-tahun (satu query untuk semua member existing),
  bukan query per baris (konsisten aturan performa import).
- Write-phase split 3 jalur; `allocateMemberNumbers` hanya dipanggil untuk baris `create-member`
  (count 0 aman → jalur enrollment-only/skip tanpa alokasi nomor).

## Source of Truth

- `MASTER_DATA_AKADEMIK_ARCHITECTURE_RFC.md` (LOCKED) — §12.1 step 3, §12.2 (strategi A–E),
  §5.2 (deteksi duplikat DB)
- `MASTER_DATA_AKADEMIK_WBS.md` (LOCKED) — WO-19 MI-3 (gate PO): "Duplikat per-tahun + §12.2";
  deliverable "rule + test sesuai strategi"; exit "perilaku sesuai keputusan PO, terdokumentasi"
- Keputusan PO sesi MI-3: **strategi A "Skip & flag"** untuk member yang sudah ACTIVE di tahun
  target; **enrollment-only** (PO #5) untuk member existing yang belum terdaftar tahun target.
- `WORK_ORDER_MI1_IMPLEMENTATION_REPORT.md`, `WORK_ORDER_MI2_IMPLEMENTATION_REPORT.md`

## Deliverable

| File | Perubahan |
|------|-----------|
| `src/main/services/member-duplicate-checker.service.ts` | NISN existing → BUKAN error lagi: `existingByRow: Map<rowNumber, ExistingMemberInfo>`; email hanya diblokir untuk baris member BARU (NISN tidak ada di DB) |
| `src/main/repositories/enrollment.repository.ts` | +`findMemberIdsActiveInYear(memberIds, year)` — batch lookup member yang sudah ACTIVE di tahun target (Set<memberId>) |
| `src/main/services/member-import.service.ts` | `RowRouting` (`create-member`/`enrollment-only`/`skip`) + routing di preflight; `writePhase(rows, routingByRow, existingMemberIdByRow, classIdByRow, academicYearId)` split 3 jalur dalam satu tx; result +`skipped` |
| `src/shared/dto/member.ts` | `MemberImportResultDTO` +`skipped: number` (aditif) |
| `wo19_mi3_smoke/smoke.ts` | **baru** — 38 assertion (8 step) |

### Tidak diubah

UI Import, IPC (`members:previewCheck`/`members:import` payload `(rows, scope?)` tetap),
preload, env.d.ts, Schema, Migration, `EnrollmentService` (enroll/close/repoint tidak disentuh),
`Member.status` sync (E-3), Promotion, Reporting, Bulk Operation.

## Desain

### 1. Routing per baris (RFC §12.1 step 3 + §12.2)
```
preflight(rows, scope):
  duplicateResult = duplicateChecker.checkDatabase(rows)   // existingByRow + errors (email-only-untuk-baru)
  classResult     = classResolver.resolve(rows, scope)
  blockRows       = baris dengan error (class / email member baru)
  activeMemberIds = enrollmentRepo.findMemberIdsActiveInYear(existingIds, year)   // 1 query batch
  untuk tiap baris:
    existing (NISN ada di DB)?
      ACTIVE di tahun target  -> skip        (RFC §12.2 strategi A)
      belum ACTIVE            -> enrollment-only (PO #5; existingMemberId di-map)
    tidak ada existing        -> create-member
```

### 2. Write-phase 3 jalur dalam SATU transaksi
```
writePhase(rows, routingByRow, existingMemberIdByRow, classIdByRow, year):
  runTransaction(getPrisma(), tx => {
    createRows = baris create-member
    if (createRows.length > 0)
      numbers = allocateMemberNumbers(tx, createRows.length, STUDENT)   // di dalam tx
      createManyWithTx(tx, memberPayload)                               // Member TANPA classId
      idByNumber = lookup tx.member.findMany(memberNumber IN numbers)
    enrollmentRows = create-member → {memberId: idByNumber[memberNumber]}
                   + enrollment-only → {memberId: existingMemberIdByRow[row]}
    enrollments = enrollmentRows → { memberId, classId, academicYearId, status: ACTIVE, note: null }
    if (enrollments.length > 0) createManyWithTx(tx, enrollments)
    return { created: enrollments.length, skipped: skipCount }
  })
```
Commit sekali di akhir. Exception apa pun (termasuk kegagalan enrollment) → **rollback penuh**
(all-or-nothing) → tidak ada data parsial (Member yatim, enrollment sebagian).

### 3. Email hanya diblokir untuk member BARU
`MemberDuplicateChecker` melanjutkan baris dengan NISN existing (tidak ada konflik — tidak ada
Member baru yang dibuat). Untuk baris NISN baru, email milik member lain tetap BLOCKER
(`memberImport.duplicateEmailInDb`).

### 4. Performa
Batch lookup ACTIVE-per-tahun via `findMemberIdsActiveInYear` (sekali query untuk semua id
existing), bukan query per baris — konsisten aturan performa WO-5 P2.

## Validation

### 1. Lint — PASS
`npm run lint` (tsc node + web) bersih.

### 2. Build — PASS
`npm run build`: main **1,797.87 kB** · preload **8.62 kB** · renderer **999.83 kB**
(renderer & preload identik MI-2 = bukti frontend N/A; main +3.40 kB).

### 3. Smoke MI-3 — 38/38 PASS (fresh DB)
`wo19_mi3_smoke/smoke.ts` pada DB temp (fresh `prisma migrate deploy`, 4 migrations; dibersihkan):
- **Member baru** → created 2, member+enrollment ACTIVE dibuat.
- **Member existing tanpa ACTIVE di tahun target** → enrollment-only: created 1, **tidak ada Member
  baru**, enrollment ACTIVE di yearB dengan classId benar; total enrollment member bertambah tanpa
  membuat member.
- **Member existing SUDAH ACTIVE di tahun target** → skip: created 0, skipped 1, total enrollment
  tetap (tidak ada duplikat).
- **Email BLOCKER hanya member baru** → NISN baru + email bentrok → success:false,
  `memberImport.duplicateEmailInDb`, existingMemberNumber terisi.
- **Email bentrok pada baris NISN existing TIDAK memblokir** → created 1 (enrollment-only).
- **Campuran dalam satu batch** (1 baru + 2 existing-ACTIVE) → created 1, skipped 2.
- **Invarian satu-ACTIVE per (member, tahun)** → tidak ada pasangan dengan count > 1.
- **Rollback batch campuran** (stub enrollment gagal) → import reject, count Member & Enrollment
  tidak berubah (0 data parsial).

### 4. Regression smoke — PASS
`wo17_mi1_smoke` **44/44**, `wo18_mi2_smoke` **37/37**, `wo13_e1_smoke` **39/39**,
`wo14_e2_smoke` **36/36**, `wo15_e3_smoke` **78/78**, `wo16_e4_smoke` **45/45**.

### 5. Migrate diff — no drift
`prisma migrate diff --from-migrations --to-schema-datamodel --script` = empty migration
(schema tidak disentuh).

## Kesimpulan

**READY.** Strategi duplikat per-tahun (§12.1 step 3 + §12.2 strategi A) terimplementasi:
member existing tidak lagi diblokir; hanya enrollment yang ditulis untuk member lama;
member yang sudah ACTIVE di tahun target dilewati (skip) tanpa melanggar invarian satu-ACTIVE;
semua routing transaksional tanpa data parsial.

## Technical Debt / Catatan

- Strategi **B (Overwrite/repoint)** dan **D (Merge + banding)** tidak diimplementasikan — PO
  memilih A untuk MI-3. Bila kelak diperlukan, `EnrollmentService.repoint` (E-1) adalah titik
  ekstensi (close REDISTRIBUTED + enroll baru) namun saat ini satu-ACTIVE per tahun didefinisikan
  sebagai skip, bukan repoint.
- "Flag" strategi A disajikan sebagai hitungan `skipped` pada `MemberImportResultDTO`; belum ada
  daftar per-baris (kontrak result tetap counts-only, konsisten keputusan WO-2: renderer tidak
  menurunkan business logic).
- `Member.status` (INACTIVE) untuk member yang di-enrollment via enrollment-only tidak diubah di
  MI-3 (sync status keanggotaan = scope E-3/terpisah).
