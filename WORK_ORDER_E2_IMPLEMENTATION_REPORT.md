# WORK ORDER E-2 — MemberEnrollment Cutover (MemberService + BorrowService + ClassService guard)

## Ringkasan

E-2 memindahkan seluruh pembacaan produksi "kelas akademik saat ini" agar menggunakan
**MemberEnrollment sebagai SSOT** (RFC §12 / WBS WO-14): `MemberService.classInfo`,
snapshot `className` di `BorrowService.create`, dan guard hapus kelas di
`ClassService.delete`. `MemberService.create/update` **berhenti menulis** `Member.classId`.
Kolom `Member.classId` dipertahankan sebagai **legacy compatibility** (nilai lama tetap
terbaca, tidak lagi dijadikan Source of Truth).

## Source of Truth

- `MASTER_DATA_AKADEMIK_ARCHITECTURE_RFC.md` (LOCKED) — §12 (cutover reads), §15 F1/F2
- `MASTER_DATA_AKADEMIK_WBS.md` (LOCKED) — WO-14 E-2 (baris 316–324)
- `MILESTONE_B_DISCOVERY_REPORT.md` (APPROVED) — Gap #2/#3/#4, §4.1 data flow
- Keputusan PO sesi ini: kerjakan HANYA tiga item (MemberService, BorrowService, Class
  delete guard); pekerjaan di luar tiga file dicatat Deferred, tidak dianalisis ulang.

## Deliverable

### File dimodifikasi (5)

| File | Perubahan |
|------|-----------|
| `src/main/repositories/enrollment.repository.ts` | include diperkaya `class.curriculum` (shape `classInfo` wajib punya curriculum); **baru** `countByClass` (count enrollment AKTIF per kelas) |
| `src/main/services/member.service.ts` | konstruktor + `EnrollmentRepository`; `classInfo` diambil dari `findActiveByMember` (bukan relasi `member.class`); `create/update` TIDAK lagi menulis `classId` |
| `src/main/services/borrow.service.ts` | konstruktor + `EnrollmentService`; snapshot `className` diambil dari `findActiveByMember` (bukan `member.class`) |
| `src/main/services/class.service.ts` | konstruktor: `MemberRepository` → `EnrollmentRepository`; guard `delete` memakai `enrollmentRepository.countByClass` (enrollment AKTIF) |
| `electron/main/bootstrap.ts` | reorder wiring: `enrollmentRepository` dibuat lebih awal; `enrollmentService` sebelum `borrowService`; konstruktor MemberService/BorrowService/ClassService diperbarui |

### File baru (1 smoke)

| File | Peran |
|------|-------|
| `wo14_e2_smoke/smoke.ts` | Smoke test 36/36 (fresh DB) |

## Desain

### 1. `MemberService.classInfo` — dari Enrollment, bukan relasi legacy
- `findById` memanggil `enrollmentRepository.findActiveByMember(id)` lalu `toDTO(member, enrollment)`.
- Shape DTO `classInfo` **tetap identik** (konsumen UI MembersPage/MemberListPage/MemberDetailPage
  tidak berubah): `{ id, educationLevel, parallel, academicYear:{id,name,isActive}, curriculum:{id,name} }`.
- `id` = `enrollment.classId`; `academicYear`/`curriculum` dibaca dari include enrollment
  (tidak lagi dari `member.class.academicYear`/`curriculum`).
- `findMany` (list) tidak berubah — tetap `classInfo: null` (perilaku existing; detail memakai `findById`).
- `MemberDTO.classId` tetap mengekspos nilai legacy `member.classId` (faithful ke kolom; DTO read
  tidak diubah per pola WO-1 F1).

### 2. `MemberService.create/update` — berhenti menulis `classId`
- Payload ke `memberRepository.create/update` menghapus field `classId`.
- Konsekuensi: anggota baru TIDAK memiliki `classId`; penempatan kelas hanya lewat Enrollment
  (`enrollments:enroll`). Update tidak lagi mengubah kolom legacy.

### 3. `BorrowService` snapshot `className`
- `const enrollment = await this.enrollmentService.findActiveByMember(input.memberId)`;
  `className = enrollment?.className`. Siswa ber-enrollment aktif → "X A"; tanpa enrollment
  → `undefined` (tersimpan null), **walau** `member.classId` legacy terisi.

### 4. `ClassService.delete` guard
- Guard memakai `enrollmentRepository.countByClass(id)` = count enrollment
  `status=ACTIVE AND leftAt=null` per kelas (bukan `member.countByClass` berbasis `member.classId`).
- Pesan error tetap: `Kelas ... tidak dapat dihapus karena masih memiliki N anggota`.

### 5. Wiring bootstrap
- `enrollmentRepository` dibuat sebelum `MemberService` & `ClassService`.
- `enrollmentService` (butuh `classRepository`) dibuat sebelum `borrowService`.
- Urutan: `newMemberRepository → numberGenerator → enrollmentRepository → memberService →
  ... → classRepository → classService → enrollmentService → borrowService`.

## TIDAK diubah (scope discipline)

- Schema + migration (kolom `Member.classId` tetap ada; penghapusan = T-3/F3).
- `MemberImportService` / `MemberClassResolver` (tetap memakai `classId` — MI-2, deferred).
- Promotion, UI, Reporting, DTO shape, `MemberRepository.findMany` mapping.
- `Member.status` sync (E-3).

## Validation

### 1. Lint — PASS
`npm run lint` (tsc node + web) bersih.

### 2. Build — PASS
`npm run build`: main **1,788.59 kB** · preload **8.49 kB** · renderer **987.29 kB**.
Renderer identik dengan E-1 (987.29) — tidak ada perubahan UI. Main naik tipis (+0.49 kB)
dari `countByClass` + wiring.

### 3. Smoke E-2 — 36/36 PASS (fresh DB)
`wo14_e2_smoke/smoke.ts` pada DB temp `file:C:/Users/hp/AppData/Local/Temp/opencode/wo14_e2_smoke/smoke.db`
(fresh `prisma migrate deploy`, 4 migrations; DB dibersihkan setelah run). Kasus:
- **classInfo null** tanpa enrollment; **classInfo dari enrollment** (id/level/parallel/AY isActive/curriculum).
- **Legacy classId diabaikan:** member ber-classId namun tanpa enrollment → classInfo null.
- **create/update tidak menulis classId** (DTO & DB null; update tidak menimpa nilai legacy).
- **repoint → classInfo mengikuti enrollment baru; close → classInfo null.**
- **Borrow snapshot** dari enrollment ("X A"); snapshot MENGABAIKAN classId legacy (null).
- **Borrow regression:** member tidak aktif ditolak; findById totalItems/status; bookCopy → BORROWED.
- **Delete guard** berbasis enrollment aktif (count 1 → 400 "masih memiliki 1 anggota");
  guard hanya menghitung AKTIF (closed → 0); kelas tanpa enrollment terhapus.
- **Regression E-1:** enroll non-siswa/kelas-nope ditolak; findActive; invariant satu-ACTIVE.
- **Regression ClassService CRUD:** create normalisasi level, findById displayName, update.

### 4. Regression smoke E-1 — 39/39 PASS
`wo13_e1_smoke/smoke.ts` di-re-run pada fresh DB (include enrollment diperkaya curriculum
tidak mengubah perilaku E-1).

### 5. Migrate diff — no drift
`prisma migrate diff --from-migrations --to-schema-datamodel` = empty migration
(tidak ada perubahan schema).

## Kesimpulan

**READY.** Seluruh pembacaan produksi "kelas saat ini" kini bersumber dari MemberEnrollment;
tidak ada produksi yang menjadikan `Member.classId` sebagai Source of Truth untuk
tampil/snapshot/guard. `Member.classId` tetap dibaca hanya sebagai nilai legacy compatibility
(`MemberDTO.classId`) dan tetap ditulis oleh jalur import (MI-2, deferred).

## Deferred (dictatat, TIDAK dianalisis ulang)

1. `MemberImportService`/`MemberClassResolver` masih memakai `classId` (MI-2).
2. `MemberRepository.countByClass` legacy kini tanpa caller produksi (penghapusan = WBS T-3).
3. Eager-load `memberInclude.class` masih ada tapi tidak lagi dipakai `classInfo` (cleanup T-3).
4. Penghapusan kolom `Member.classId` (T-3/F3 migration drop).
5. Smoke historis `wo7_cl1_smoke`/`wo8_cl2a_smoke`/`wo9_cl2b_smoke` mengkonstruksi
   `ClassService` dengan signature lama (butuh update bila di-re-run; bukan bagian WO ini).
6. Kelas yang hanya memiliki enrollment DITUTUP lolos guard (count 0) namun penghapusan
   fisiknya tetap ditolak FK RESTRICT (P2003) karena baris MemberEnrollment tidak pernah
   dihapus — perilaku DB pre-existing (tercatat MILESTONE_B), bukan regresi E-2.
7. `Member.status` sync saat close = E-3.

## Technical Debt / Catatan

- Definisi "aktif" di guard & classInfo konsisten: `status=ACTIVE AND leftAt=null`
  (RFC §1.3) — dipakai `findActiveByMember`, `countActiveByMember`, `countByClass`.
- DTO input `CreateMemberDTO/UpdateMemberDTO.classId` dibiarkan ada (tidak dihapus);
  nilainya kini diabaikan service. Penghapusan kontrak bisa dilakukan bersama cutover UI
  enrollment (E-4) / T-3.
