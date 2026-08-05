# R-5 RELEASE REPORT — Laporan Anggota

## Status: RELEASED (2026-08-05) — READY review PO

## Deliverable
| Item | Path |
|------|------|
| Halaman Laporan Anggota | `src/pages/report/MemberReportPage.tsx` |
| Landing modul Laporan | `src/pages/ReportsPage.tsx` (+ kartu) |
| Route + nav + labels | `src/routes/index.tsx`, `src/utils/navigation.ts`, `src/utils/labels.ts` |
| Backend (aditif) | `src/shared/dto/report.ts`, `src/main/repositories/report.repository.ts`, `src/main/services/report.service.ts` |
| Smoke | `report_r5_smoke/smoke.ts` (46/46) |

## Fitur (UI)
- Filter **Status Keanggotaan** (Semua / Aktif / Nonaktif) + **Kelas** (dropdown, server-side) + **Pencarian** (nomor anggota / nama) — server-side.
- 3 kartu statistik dari `summary` DTO: **Total Anggota · Aktif · Nonaktif**.
- Tabel 5 kolom: Nomor Anggota · Nama · Kelas (SSOT `MemberEnrollment` ACTIVE) · **Status Keanggotaan (badge Aktif / Nonaktif)** · **Tanggal Bergabung** (`Member.createdAt`).
- Pagination server-side (20/halaman), loading & empty state.

## Akses
`Laporan` (sidebar) → kartu **Laporan Anggota** → `/reports/members`.

## Kontrak Status Keanggotaan
- **AKTIF** = anggota *pernah* memiliki `MemberEnrollment` (status apa pun, termasuk terminal seperti DROPPED/GRADUATED).
- **NONAKTIF** = tidak pernah memiliki `MemberEnrollment`.
- **Bukan** dari `Member.status` dan **bukan** dari pinjaman aktif (dibuktikan smoke: `status=ACTIVE` tanpa enrollment → NONAKTIF; tanpa enrollment + pinjaman aktif → NONAKTIF).
- Kelas = `MemberEnrollment` dengan `status=ACTIVE && leftAt=null`; enrollment terminal → kelas kosong.

## Regression
- `report_r5_smoke` **46/46** · `report_r1_smoke` **46/46** · `report_r1_service_smoke` **52/52** · `report_r2_smoke` **35/35** · `report_r3_smoke` **41/41** · `report_r4_smoke` **40/40** · `member_class_display` **18/18** · `membership_first_borrow` **20/20** · `wo13_e1` **39/39** · `wo15_e3` **78/78** · `wo16_e4` **45/45** · `it1_borrow_return` **34/34** · `it_borrow_eligibility` **7/7** · `wo14_e2` **36/36** · `dashboard_phase1` **30/30** (fresh DB temp) — **567 PASS, 0 FAIL**.
- lint PASS · build PASS (main **1,870,596 B** · preload **9.95 kB** · renderer **1,120.02 kB** `index-Dnx2t54A.js`) · `prisma migrate diff` "This is an empty migration." (schema & migration TIDAK disentuh).

## Komit
- Satu final commit: source (DTO + repository + service + page + wiring) + smoke + 3 laporan + AGENTS.md.
- File untracked milik WO lain TIDAK diikutkan.
