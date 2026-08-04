# IT-1 FINAL REVIEW — Borrow Member Status Eligibility (Hotfix)

**Status:** READY FOR FINAL REVIEW  
**Date:** 2026-08-04  
**Predecessor:** IT-1 (Borrow/Return Transaction Integrity) — commit `d4ce83b`

---

## Scope

Hotfix pada `BorrowService.create`: mengganti guard `Member.status == ACTIVE` dengan enrollment-based eligibility check, sesuai keputusan PO.

## Business Rules (PO Approved)

| Tipe Anggota | Syarat Meminjam |
|---|---|
| Student (SISWA) | WAJIB punya `MemberEnrollment` dengan `status=ACTIVE` |
| Teacher (GURU) | Tidak membutuhkan Enrollment |
| General (UMUM) | Tidak membutuhkan Enrollment |
| Unknown (tidak dikenal) | **DITOLAK** — Tipe anggota tidak valid |

## File Diubah

| File | Perubahan |
|---|---|
| `src/main/services/borrow.service.ts` | Ganti `member.status !== 'ACTIVE'` → `getMemberType()` + `enrollmentService.findActiveByMember()`. Unknown type → ditolak. |
| `src/pages/BorrowingsPage.tsx:256-257` | Fix lowercase `'active'` → `'ACTIVE'` (badge status) |

## File Regression Updated

| File | Perubahan |
|---|---|
| `wo14_e2_smoke/smoke.ts` | STEP 9: gunakan teacher dengan `classId` legacy (bukan student) untuk buktikan className=null. STEP 10: message `'tidak aktif'` → `'tidak memiliki enrollment aktif'`. |
| `it1_borrow_return_smoke/smoke.ts` | Seed: tambah `curriculum`, `academicYear`, `class`, dan `MemberEnrollment` untuk m1 & m2 (student wajib punya enrollment). |

## Smoke (7/7 PASS)

| # | Case | Expected | Result |
|---|---|---|---|
| 1 | Student + Enrollment ACTIVE | PASS (borrow ok) | PASS |
| 2 | Student + GRADUATED enrollment | FAIL (ditolak) | PASS |
| 3 | Student + TRANSFERRED enrollment | FAIL (ditolak) | PASS |
| 4 | Student + DROPPED enrollment | FAIL (ditolak) | PASS |
| 5 | Teacher (tanpa enrollment) | PASS (borrow ok) | PASS |
| 6 | General (tanpa enrollment) | PASS (borrow ok) | PASS |
| 7 | UNKNOWN MemberType | **FAIL (Validation Error)** | PASS |

## Regression

| Suite | Result |
|---|---|
| `it_borrow_eligibility_smoke` | **7/7 PASS** (fresh DB) |
| `wo14_e2_smoke` | **36/36 PASS** (fresh DB) |
| `it1_borrow_return_smoke` | **34/34 PASS** (fresh DB) |
| **Total** | **77 PASS** |

## Quality Gates

| Gate | Result |
|---|---|
| `npm run lint` | **PASS** (tsc node + web) |
| `npm run build` | **PASS** (main 1,819.55 kB · preload 9.02 kB · renderer 1,044.75 kB) |
| `prisma migrate diff --exit-code` | **"No difference detected"** |

## Pelajaran (retain)

- **`Member.status` TIDAK mencerminkan eligibility peminjaman** — SISWA eligibility ditentukan oleh keberadaan `MemberEnrollment.status=ACTIVE`, bukan `Member.status`. Guru/Umum tidak membutuhkan enrollment sama sekali.
- **Unknown `MemberType` harus ditolak secara eksplisit** — `getMemberType()` mengembalikan `null` untuk tipe tak dikenal; BorrowService menolak dengan pesan `"Tipe anggota tidak valid"` sebelum pengecekan enrollment.
- **Enrollment check hanya dilakukan untuk `hasAcademicRecord=true`** — `getMemberType()` dari `src/shared/config/member-type.ts` menjadi SATU otoritas untuk menentukan apakah enrollment diperlukan.
- **Case sensitivity badge UI** — `BorrowingsPage.tsx` membandingkan status dengan string; pastikan konsisten dengan enum DB (`'ACTIVE'`, bukan `'active'`).
- **Regression suite yang menggunakan `BorrowService` wajib punya seed enrollment untuk student** — dua regression smoke (wo14_e2, it1) harus di-update untuk menyediakan `MemberEnrollment` di seed.
