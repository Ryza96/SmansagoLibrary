# MEMBER CLASS DISPLAY — RELEASE REPORT
Tanggal: 2026-08-05 · Status: DONE — menunggu review PO

## Apa yang Dirilis

Bug **Daftar Siswa kolom "Kelas" selalu "-"** diperbaiki. Read model list kini memuat `classInfo` dari **`MemberEnrollment` ACTIVE** (Source of Truth) dan konsisten dengan `findById()`.

## Perubahan

| File | Tipe |
|------|------|
| `src/main/services/member.service.ts` | Modifikasi — helper `classInfoFrom` + `findMany` memakai `memberEnrollments[0]` |
| `src/main/repositories/member.repository.ts` | Modifikasi — `findMany` include enrollment ACTIVE (filter identik `findActiveByMember`) |
| `member_class_display_smoke/smoke.ts` | Baru (18 assertion) |
| `WORK_ORDER_MEMBER_CLASS_DISPLAY_REPORT.md` | Laporan |
| `MEMBER_CLASS_DISPLAY_FINAL_REVIEW.md` | Laporan |
| `MEMBER_CLASS_DISPLAY_RELEASE_REPORT.md` | Laporan |
| `AGENTS.md` | Sesi |

TIDAK ada perubahan: Import Siswa, Enrollment, Promotion, Borrow, Dashboard, UI, Schema, Migration, DTO public.

## Bukti Validasi

- Smoke baru: **18/18 PASS**
- Regression: **431/431 PASS** (Import 142 · Enrollment 162 · Member/Borrow/Dashboard 127)
- `npm run lint`: PASS
- `npm run build`: PASS — main 1,845.29 kB · preload 9.47 kB · renderer 1,060.86 kB (renderer identik baseline = UI tidak tersentuh)
- `prisma migrate diff` (from-migrations & from-url): empty migration
- `prisma migrate status`: up to date (4 migrations)

## Dampak ke Data

- **Tidak ada** perubahan data/schema. Data yang sudah benar (395 enrollment ACTIVE + 13 kelas) kini ditampilkan dengan benar di Daftar Siswa.
- `Member.classId` (kolom legacy) tidak lagi relevan untuk label kelas — SSOT tetap `MemberEnrollment`.

## Commit

SATU final commit (fix + smoke + laporan + AGENTS.md), di-push. File investigasi/untracked milik WO lain (STUDENT_CLASS_DISPLAY_BUG_REPORT, BORROW_ENROLLMENT_DISCOVERY, INTEGRATION_TEST_PHASE1_DISCOVERY, IT1_DISCOVERY_REPORT, MEMBERSHIP_STATUS_BUG_REPORT, MEMBER_STATUS_ALIGNMENT_PLAN, MEMBER_STATUS_FINAL_AUDIT) TIDAK diikutkan.
