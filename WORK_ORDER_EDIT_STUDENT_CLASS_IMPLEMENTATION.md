# WORK ORDER "EDIT STUDENT CLASS PLACEMENT" — IMPLEMENTATION REPORT

## Ringkasan

Edit Siswa kini dapat mengubah **Tahun Ajaran** dan **Kelas** langsung dari halaman Edit Anggota. Penempatan kelas tetap dikelola oleh domain **MemberEnrollment** (SSOT); `Member.classId`/`Member.status` TIDAK disentuh.

- Kelas berubah dalam **tahun yang sama** → `enrollments.repoint()` (jalur eksisting, REDISTRIBUTED).
- Tahun Ajaran berubah (**cross-year**) → **`enrollments.transfer()` BARU** — operasi atomik SATU transaksi DB (tutup enrollment lama dengan status terminal `TRANSFERRED` + buat enrollment ACTIVE di tahun/kelas target). UI TIDAK melakukan `close() → enroll()` dua langkah.
- Siswa belum punya enrollment ACTIVE → `enrollments.enroll()`.
- Tidak ada perubahan (Tahun & Kelas tetap) → **tidak ada operasi enrollment** (hanya scalar `members.update`).

## Keputusan Arsitektur

1. **Transfer = operasi BACKEND atomik**, bukan dua panggilan UI. Alasan: skenario UI `close() → enroll()` dua langkah memiliki jendela kegagalan — bila close sukses lalu enroll gagal, siswa kehilangan enrollment ACTIVE (tidak eligible, tidak punya kelas). `transfer()` membungkus close+create dalam SATU `runTransaction` → kegagalan apa pun me-rollback SELURUHNYA.
2. **Sejarah tidak pernah dihapus.** Enrollment lama di-close dengan status terminal `TRANSFERRED` + `leftAt` diisi (pola repoint `REDISTRIBUTED`, close `GRADUATED`). Tidak ada DELETE baris.
3. **Tidak pernah dua ACTIVE.** Transisi mematikan transisi `ACTIVE → terminal` sebelum membuat yang baru, dalam transaksi yang sama (invarian "satu ACTIVE" dijaga Prisma rollback bila create gagal).
4. **`ACADEMIC_STATUS.transferred` = status terminal** (config `academic-status.ts`) — tidak bisa di-close ulang, tidak pernah aktif kembali.
5. **Tahun yang sama → paksa repoint.** `transfer()` MENOLAK `targetAcademicYearId === academicYearId` (AppError 400 "gunakan repoint") — mencegah pembuatan baris kedua yang redundant dan menjaga semantik redistribusi.
6. **DTO input terpisah, `dto/member.ts` dan `member.service.update()` TIDAK diubah** — kelas/tahun tetap domain enrollment, konsisten WO E-1..E-4 & member list classInfo.
7. **Guard kelas milik tahun** diperiksa terhadap `Class.academicYearId` (404/400), konsisten `enroll()`/`repoint()`.
8. **Tidak ada perubahan repository/schema/migration** — `transfer()` memakai metode tx eksisting `closeWithTx`/`createActiveWithTx`.

## Implementasi — Backend

### `src/shared/dto/enrollment.ts` (+`TransferEnrollmentDTO`)
```ts
export interface TransferEnrollmentDTO {
  targetAcademicYearId: string
  targetClassId: string
  note?: string
}
```

### `src/main/services/enrollment.service.ts` (+`transfer()`)
Di dalam `runTransaction(getPrisma(), ...)`:
1. Validasi (di luar tx, fast-fail):
   - Enrollment ada → 404 `Enrollment <id> tidak ditemukan`
   - `status === ACTIVE` dan `leftAt === null` → 400 `tidak aktif`
   - `targetAcademicYearId !== existing.academicYearId` → 400 `harus berbeda dari tahun ajaran saat ini — gunakan repoint`
   - Kelas target ada → 404 `Kelas target <id> tidak ditemukan`
   - `targetClass.academicYearId === targetAcademicYearId` → 400 `bukan milik tahun ajaran`
2. Dalam SATU transaksi:
   - `closeWithTx(tx, enrollmentId, ACADEMIC_STATUS.transferred, input.note ?? '')`
   - `createActiveWithTx(tx, { memberId, classId, academicYearId, note: input.note })`
3. Setelah commit → `findActiveByMember()` → `toDTO()` (className/academicYearName/memberNumber).

Tidak ada akses Prisma langsung dari Service (pola E-1/P-2: `runTransaction` di base, repository menerima `tx`).

### Wiring
- `electron/ipc/enrollment.ipc.ts` — handler `enrollments:transfer` (+import `TransferEnrollmentDTO`).
- `electron/preload/enrollment.preload.ts` — `transfer(id, dto)`.
- `src/renderer/env.d.ts` — typing `enrollments.transfer`.

## Implementasi — Renderer

### `src/components/members/MemberForm.tsx`
- `FormData` + `academicYearId?`/`classId?`; props + `activeEnrollment?: Pick<EnrollmentDTO,'id'|'academicYearId'|'classId'> | null`.
- State di-seed dari `editInitial` (diisi MemberEditPage dari enrollment ACTIVE).
- **`validate()`**: cek `academicYearId`/`classId` wajib utk SISWA di mode create DAN edit (early-return `if (isEditMode)` yang lama dihapus — validasi kelas tidak lagi di-skip saat edit); NIP tetap create-only.
- **`handleSubmit` edit**: `members.update` scalar dulu, lalu untuk siswa:
  - `!activeEnrollment` → `enrollments.enroll({memberId, classId, academicYearId})`
  - `academicYearId` berubah → `enrollments.transfer(activeEnrollment.id, {targetAcademicYearId, targetClassId})`
  - hanya `classId` berubah (tahun sama) → `enrollments.repoint(activeEnrollment.id, {targetClassId})`
  - tanpa perubahan → tanpa operasi
- `MemberClassSection` dirender di edit maupun create (self-gate `isStudent` di dalam komponen; tidak ada `!isEditMode &&` lagi).

### `src/pages/MemberEditPage.tsx`
- `Promise.all([members.findById(id), enrollments.findActiveByMember(id)])`.
- `initialData` + `academicYearId: active?.academicYearId ?? ''` / `classId: active?.classId ?? ''`.
- Meneruskan `activeEnrollment` ke `MemberForm`.

### `src/components/members/MemberClassSection.tsx` — TIDAK diubah
- Preset dihormati via `setAcademicYearId((prev) => prev || active.id)` → enrollment aktif selalu ter-pre-fill.

## Atomicity (TEST 4 — CRITICAL)

Smoke meng-override `EnrollmentRepository.prototype.createActiveWithTx` untuk throw **di dalam** transaksi transfer. Bukti:

- `transfer()` ditolak (error `forced failure`).
- Enrollment lama **TETAP ACTIVE**, `leftAt` tetap `null`.
- Histori siswa **tetap 1 baris** (tidak ada baris baru).
- `countActiveByMember == 1`.
- Siswa **tetap eligible** (`findActiveByMember` mengembalikan enrollment lama yang sama).

Artinya: kegagalan create target me-rollback penutupan lama — TIDAK ada jendela "nol ACTIVE", TIDAK ada kehilangan eligibility. Prisma interactive transaction membatalkan seluruh efek callback.

## Invariants (9, semuanya diverifikasi smoke)

| # | Invariant | Bukti |
|---|-----------|-------|
| 1 | Maksimal satu ACTIVE per member | groupBy `status=ACTIVE,leftAt=null` → count==1 tiap member |
| 2 | Tidak pernah dua ACTIVE simultan | transisi close→create dalam satu transaksi |
| 3 | Histori tidak pernah di-delete | count baris enrollment bertambah (1→2→3), tidak pernah berkurang |
| 4 | Kelas harus milik tahun ajaran yang dipilih | transfer/enroll menolak `bukan milik tahun ajaran` |
| 5 | Cross-year atomik | TEST 4 rollback penuh |
| 6 | Gagal → old enrollment tetap ACTIVE | TEST 4 (status ACTIVE, leftAt null, eligible) |
| 7 | Sistem membaca ACTIVE enrollment utk kelas | `findActiveByMember` → className `X C` |
| 8 | Transfer = transisi terminal (bukan update baris) | `oldRow.status === TRANSFERRED`, `leftAt != null` |
| 9 | Same-year = repoint (bukan close+enroll) | `transfer()` menolak tahun yang sama → paksa repoint |

## Test Coverage (TEST 1–8 WO)

| Test | Cakupan | Hasil |
|------|---------|-------|
| TEST 1 | Edit tanpa perubahan → tanpa operasi enrollment | Static UI: cabang `!activeEnrollment` / `academicYearId !== ...` / `classId !== ...` + komentar "tanpa perubahan → tidak ada operasi" |
| TEST 2 | Same-year class change → repoint | Backend: REDISTRIBUTED, satu ACTIVE, histori 2 |
| TEST 3 | Cross-year → transfer | Backend: ACTIVE tahun B, lama TRANSFERRED, histori 3 |
| TEST 4 | Atomicity rollback | Backend: override `createActiveWithTx` throw → rollback penuh |
| TEST 5 | Siswa tanpa ACTIVE → enroll | Backend: `enroll` sukses ACTIVE |
| TEST 6 | Student tanpa Tahun/Kelas di edit → gagal validasi | Static UI: cek REQUIRED_STUDENT ×2, early-return isEditMode dihapus |
| TEST 7 | Guru/Umum → section & enrollment tidak tersentuh | Backend + Static UI: self-gate `!isStudent`, render tanpa `!isEditMode`, `findActive` null, histori 0 |
| TEST 8 | Kelas bukan milik tahun → ditolak | Backend: `bukan milik tahun ajaran` + guard lain (404/400/sama-tahun) |

## Validation

- Smoke `edit_student_class_smoke/smoke.ts` — fresh DB temp (`file:C:/...`, `prisma migrate deploy` workdir `prisma/`, 8 migrations): **54 passed, 0 failed**.
- `npm run lint` — PASS (tsc node + web).
- `npm run build` — PASS. Bundle: main **2,422.17 kB** · preload **12.57 kB** · renderer **1,285.41 kB** (`index-76nF-NB2.js`, CSS 43.62 kB).
- `prisma migrate diff --from-migrations --to-schema-datamodel --script` → **"This is an empty migration."** (tidak ada perubahan schema; WO tidak menambah migration).
- DB live dev TIDAK disentuh (smoke memakai DB temp, dibersihkan setelah run).

## Scope Discipline

TIDAK mengubah: `schema.prisma`, migration, `dto/member.ts`, `member.service.update()`, `MemberClassSection.tsx`, repository (transfer memakai metode tx eksisting), Book Cover / Book Import / Member Import / Barcode / borrowing / backup-restore. Seluruh perubahan Book Cover WO (di working tree) dibiarkan apa adanya.

## Git Status

```
 M electron/ipc/enrollment.ipc.ts
 M electron/preload/enrollment.preload.ts
 M src/components/members/MemberForm.tsx
 M src/main/services/enrollment.service.ts
 M src/pages/MemberEditPage.tsx
 M src/renderer/env.d.ts
 M src/shared/dto/enrollment.ts
?? edit_student_class_smoke/
```

File Book Cover WO (book.ipc.ts, book.service.ts, book.preload.ts, bootstrap.ts, prisma/schema.prisma, BookDetail, BookForm, bookImport.template.ts, book-import.service.ts, book.ts, labels.ts, wo11e/wo21/wo4/wo5/wo6 smoke, migrations/20260810_wo_book_cover, cover.ts, asset.*, wo_book_cover_smoke/) tetap di working tree dan TIDAK diikutkan.

## Manual UAT (untuk PO, runtime Electron)

1. Jalankan aplikasi → menu **Anggota → Siswa** → buka detail/edit seorang siswa yang punya enrollment aktif (kelas ter-fill otomatis dari enrollment ACTIVE).
2. Edit nama → Simpan: hanya data anggota berubah, kelas/tahun tetap.
3. Ganti **Kelas** dalam tahun yang sama → Simpan: enrollment lama `REDISTRIBUTED`, kelas baru aktif; riwayat kelas tetap tampil.
4. Ganti **Tahun Ajaran** + pilih kelas tahun tersebut → Simpan: enrollment lama `TRANSFERRED`, enrollment baru ACTIVE di tahun baru.
5. Pilih tahun yang TIDAK memiliki kelas → dropdown kelas kosong (hint "Tidak ada kelas"), Simpan tertahan validasi.
6. Edit siswa yang BELUM pernah di-enroll → pilih tahun+kelas → Simpan: enrollment ACTIVE dibuat.
7. Edit guru/umum → tidak ada section Tahun/Kelas, simpan tidak menyentuh enrollment.
8. Buka kembali siswa tadi → tahun & kelas ter-fill dari enrollment ACTIVE (persist).
9. (Opsional) Dashboard/daftar siswa menampilkan kelas yang benar setelah pindah.

## FINAL VERDICT

Fitur **EDIT STUDENT CLASS PLACEMENT** selesai: backend `transfer()` atomik, UI Edit Anggota menangani semua jalur (enroll/repoint/transfer/no-op), validasi kelas wajib di kedua mode, 54 smoke PASS + lint + build PASS + no schema drift. Siap review Product Owner. Belum di-commit (menunggu instruksi, mengikuti pola WO yang tidak di-commit).
