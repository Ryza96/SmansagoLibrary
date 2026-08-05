# WORK ORDER — MEMBER CLASS DISPLAY (Daftar Siswa Kolom "Kelas")
**Laporan Implementasi**
Status: DONE — menunggu review PO · Tanggal: 2026-08-05

## 1. Latar Belakang

Bug: kolom **"Kelas"** pada **Anggota → Siswa (Daftar Siswa)** selalu menampilkan `-`, padahal 395 enrollment `ACTIVE` dan 13 kelas ada. Investigasi read-only (`STUDENT_CLASS_DISPLAY_BUG_REPORT.md`) menemukan root cause: **read model list tidak membaca enrollment** — `MemberService.findMany` hardcode `classInfo: null` dan `MemberRepository.findMany` tanpa `include` relasi.

## 2. Root Cause (acuan laporan investigasi)

- `MemberService.findMany` (member.service.ts:73) menetapkan `classInfo: null` untuk setiap baris.
- `MemberRepository.findMany` (member.repository.ts:88–94) memakai `prisma.member.findMany` **tanpa `include`** relasi enrollment/class.
- Satu-satunya jalur yang benar (`findById` → `toDTO` → `findActiveByMember`) tidak dipakai halaman list.
- Data DB sehat: 395 enrollment ACTIVE + 13 kelas → **murni defect read model list**.

## 3. Implementasi (BUG FIX ONLY — 2 file source)

### `src/main/repositories/member.repository.ts`
- Import `ACADEMIC_STATUS` dari `src/shared/config/academic-status` (definisi "ACTIVE" satu sumber).
- `findMany` sekarang menambahkan **`include.memberEnrollments`** dengan filter identik `findActiveByMember`:
  ```
  where: { status: ACADEMIC_STATUS.active, leftAt: null },
  include: { class: { include: { curriculum: true } }, academicYear: true },
  orderBy: { enrolledAt: 'desc' }
  ```
  → enrollment ACTIVE terbaru di posisi `memberEnrollments[0]`.

### `src/main/services/member.service.ts`
- Helper murni **`classInfoFrom(enrollment)`** memetakan enrollment → `MemberDTO['classInfo']` (pendekatan sama untuk list & detail → satu sumber label).
- `toDTO` (detail) kini memakai `classInfoFrom(enrollment)` — hasil **identik** dengan sebelumnya (preservasi nilai).
- `findMany` (list) kini memakai `classInfoFrom(m.memberEnrollments?.[0])` — menggantikan hardcode `null`.

### Konsisten dengan constraint
- **Source of Truth = `MemberEnrollment`** (ACTIVE + leftAt null). `Member.classId` **TIDAK dipakai** sebagai sumber label.
- **TIDAK diubah:** Import Siswa, Enrollment, Promotion, Borrow, Dashboard, UI, Schema, Migration, DTO public (`MemberDTO.classInfo` tidak berubah shape).

## 4. Validasi

| Gate | Hasil |
|------|-------|
| Smoke baru `member_class_display_smoke` | **18/18 PASS** |
| Regression Import (wo17_mi1 43 · wo18_mi2 37 · wo19_mi3 38 · wo20_mi4 24) | **142/142 PASS** |
| Regression Enrollment (wo13_e1 39 · wo15_e3 78 · wo16_e4 45) | **162/162 PASS** |
| Regression Member/Borrow/Dashboard (it1 34 · eligibility 7 · wo14_e2 36 · membership_first_borrow 20 · dashboard_phase1 30) | **127/127 PASS** |
| `npm run lint` | PASS |
| `npm run build` | PASS (main 1,845.29 kB · preload 9.47 kB · renderer 1,060.86 kB **identik baseline**) |
| `prisma migrate diff` (from-migrations & from-url) | empty migration |
| `prisma migrate status` | up to date (4 migrations) |

### Skenario smoke (bukti mandat fix)
1. **Daftar Siswa menampilkan kelas benar** — m1 (classId null, enrollment ACTIVE XI Merdeka 2) → label `"XI Merdeka 2"`.
2. **TIDAK pakai `Member.classId`** — m2 (classId legacy TERISI tapi tanpa enrollment) → `classInfo null`; m1 (classId null tapi enrollment ACTIVE) → `classInfo terisi`.
3. **Hanya Enrollment ACTIVE** — m3 (enrollment DROPPED/terminal) → `null`; m5 (2 enrollment: ACTIVE + DROPPED) → memakai yang ACTIVE.
4. **Semua tipe member** — guru (m4) dengan enrollment ACTIVE → label `"X Merdeka 1"`.
5. **Konsistensi list == detail** — `findMany` vs `findById` untuk m1 (label/curriculum/academicYear identik) dan m2 (keduanya null).
6. **Search & pagination tetap bekerja** — hasil tetap membawa `classInfo`.

## 5. Deliverable

- `src/main/services/member.service.ts` (modifikasi)
- `src/main/repositories/member.repository.ts` (modifikasi)
- `member_class_display_smoke/smoke.ts` (baru, 18 assertion)
- `WORK_ORDER_MEMBER_CLASS_DISPLAY_REPORT.md` (ini)
- `MEMBER_CLASS_DISPLAY_FINAL_REVIEW.md`
- `MEMBER_CLASS_DISPLAY_RELEASE_REPORT.md`
- `AGENTS.md` (sesi)
