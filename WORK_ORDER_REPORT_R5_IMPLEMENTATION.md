# WORK ORDER R-5 — Laporan Anggota (Member Report UI)

## Status: DONE — READY review PO

## Ringkasan
Halaman **Laporan Anggota** dibangun end-to-end di atas fondasi R-1 (`ReportService` + `ReportRepository`) dengan **search server-side** (pola aditif non-breaking yang sama dengan R-2/R-3/R-4). WO ini adalah WO UI keempat dari modul Report (WBS R-5). **Status Keanggotaan** mengikuti kontrak yang disepakati: **AKTIF = anggota PERNAH memiliki `MemberEnrollment` (status apa pun)**, NONAKTIF = tidak pernah — **bukan** dari `Member.status` maupun pinjaman aktif. **Kelas** = SSOT `MemberEnrollment` ACTIVE (`status=ACTIVE && leftAt=null`).

## Keputusan PO (pra-implementasi)
1. **Filter minimal = Search + Status Keanggotaan + Kelas** (search **server-side**, pola aditif R-2/R-3/R-4: `MemberReportFilter.search?` opsional → filter identik di baris & ringkasan & count).
2. **Kolom tabel = 5**: Nomor Anggota · Nama · Kelas · Status Keanggotaan · Tanggal Bergabung.
3. **Statistik minimal 3 kartu**: Total Anggota · Aktif · Nonaktif (ditambah turunan jumlah per tipe: Siswa/Guru/Umum pada DTO, kartu menampilkan 3 utama).
4. **TIDAK ADA kolom Petugas** (K1) dan **TIDAK ADA nominal denda** (K2) — tidak relevan untuk laporan anggota.
5. **Status Keanggotaan** = AKTIF bila pernah memiliki `MemberEnrollment` (status apa pun termasuk terminal), NONAKTIF bila tidak pernah; **Kelas** = `MemberEnrollment` ACTIVE (bukan `Member.classId` legacy, bukan enrollment terminal); **Tanggal Bergabung** = `Member.createdAt`.

## Perubahan

### Backend (ADITIF non-breaking — status + joinedAt + ringkasan active/nonActive)
| File | Perubahan |
|------|-----------|
| `src/shared/dto/report.ts` | `MemberReportFilter` + `status?: 'ACTIVE' | 'INACTIVE'`; `MemberReportRowDTO` + `membershipStatus: 'ACTIVE' | 'INACTIVE'` + `joinedAt: string`; `MemberReportSummaryDTO` + `active: number` + `nonActive: number` (kontrak existing `total/students/teachers/general` tidak berubah; `total == active + nonActive`) |
| `src/main/repositories/report.repository.ts` | `MemberReportQuery` + `status?`; `memberReportInclude` + `_count: { select: { memberEnrollments: true } }` (independen terhadap filter — dipakai Service untuk turunkan `membershipStatus`); **baru** `buildMemberReportWhere(query)` — `OR` search (`memberNumber`/`fullName` `contains`), `memberType`, `classId`/`academicYearId` via `memberEnrollments: { some: { status: ACTIVE, leftAt: null, ... } }`, status ACTIVE → `some: {}` (hanya bila belum ada constraint kelas), status INACTIVE → `none: {}`; `findMembersReport` pakai builder; `countMembersByType(query?)` kini filter-aware; **baru** `countMemberMembershipSummary(query)` → `{ active, nonActive }` |
| `src/main/services/report.service.ts` | `getMemberReport` kini `Promise.all`(findMembersReport, countMemberMembershipSummary, countMembersByType); row `membershipStatus = m._count.memberEnrollments > 0 ? 'ACTIVE' : 'INACTIVE'`; `joinedAt = iso(m.createdAt)`; summary memuat `active`/`nonActive` |

### Renderer (UI)
| File | Perubahan |
|------|-----------|
| `src/pages/report/MemberReportPage.tsx` | **BARU** — filter Status Keanggotaan (Semua/Aktif/Nonaktif) + Kelas (fetch-all loop 100, filter relasi) + Search (teks); 3 kartu statistik (Total / Aktif / Nonaktif); tabel 5 kolom; badge status (hijau = Aktif, abu-abu = Nonaktif); pagination 20/halaman; loading & empty state; `api.reports.members({search, status, classId, page, limit})` |
| `src/pages/ReportsPage.tsx` | + kartu "Laporan Anggota" (ikon Users, indigo) |
| `src/routes/index.tsx` | + route `reports/members` |
| `src/utils/navigation.ts` | + `ROUTES.REPORT_MEMBERS = '/reports/members'` |
| `src/utils/labels.ts` | + `REPORT.MEMBERS/MEMBERS_DESC/TOTAL_MEMBERS/MEMBERSHIP_STATUS/MEMBERSHIP_ALL/MEMBERSHIP_ACTIVE/MEMBERSHIP_INACTIVE/CLASS_FILTER/CLASS_ALL/SEARCH_MEMBER/COL_MEMBER_NUMBER/COL_NAME/COL_JOINED` |

### Tidak diubah
- IPC/preload/env.d.ts/bootstrap (**channel `reports:members` reused** — DTO auto-flow, tidak ada wiring baru).
- `MemberService`/`MemberRepository`, `EnrollmentService`, `BorrowService`, `ReturnService`, Dashboard, Promotion.
- Schema, migration, laporan lain (`getBorrowingReport`/`getReturnReport`/`getOverdueReport`/`getCollectionReport`).

## Kontrak Data (R-1, dikonfirmasi di smoke)
- **Status Keanggotaan**: AKTIF = pernah memiliki `MemberEnrollment` (status apa pun — enrollment terminal seperti DROPPED tetap AKTIF); NONAKTIF = tidak pernah memiliki. **TIDAK** diturunkan dari `Member.status` (seed: member `status=ACTIVE` tanpa enrollment → NONAKTIF) dan **TIDAK** dari pinjaman aktif (seed: member NONAKTIF dengan pinjaman aktif → tetap NONAKTIF).
- **Kelas = SSOT `MemberEnrollment` ACTIVE** (`status=ACTIVE && leftAt=null`); enrollment terminal → `className null`; tanpa enrollment → `className null`.
- **Tanggal Bergabung = `Member.createdAt`** (ISO).
- **Ringkasan mengikuti filter** (search + status + kelas): `summary.total == summary.active + summary.nonActive == pagination.total`; `students/teachers/general` dari `countMembersByType` dengan filter yang sama; pagination murni view (summary stabil antar-halaman).
- **Kombinasi NONAKTIF + Kelas mengembalikan 0** (anggota dengan enrollment ACTIVE di kelas pasti pernah memiliki enrollment → tidak mungkin NONAKTIF; `some` + `none` di-AND Prisma).

## Validasi
| Gate | Hasil |
|------|-------|
| Smoke `report_r5_smoke` | **46/46 PASS** (fresh DB) |
| Regression R-1 repo `report_r1_smoke` | **46/46 PASS** |
| Regression R-1 service `report_r1_service_smoke` | **52/52 PASS** |
| Regression R-2 `report_r2_smoke` | **35/35 PASS** |
| Regression R-3 `report_r3_smoke` | **41/41 PASS** |
| Regression R-4 `report_r4_smoke` | **40/40 PASS** |
| Regression Member `member_class_display_smoke` | **18/18 PASS** |
| Regression `membership_first_borrow_smoke` | **20/20 PASS** |
| Regression Enrollment `wo13_e1_smoke` | **39/39 PASS** |
| Regression `wo15_e3_smoke` | **78/78 PASS** |
| Regression `wo16_e4_smoke` | **45/45 PASS** |
| Regression Borrow `it1_borrow_return_smoke` | **34/34 PASS** |
| Regression `it_borrow_eligibility_smoke` | **7/7 PASS** |
| Regression `wo14_e2_smoke` | **36/36 PASS** |
| Regression Dashboard `dashboard_phase1_smoke` | **30/30 PASS** |
| `npm run lint` | PASS |
| `npm run build` | PASS — main **1,870,596 B** (`reports:members`=1) · preload **9.95 kB** (identik) · renderer **1,120.02 kB** (`index-Dnx2t54A.js`) |
| `prisma migrate diff` | "This is an empty migration." (exit 0) — schema tidak disentuh |
| Grep bundle | main `reports:members`=1 · renderer `Laporan Anggota`=1 · `reports/members`=3 · `Status Keanggotaan`=3 · `Tanggal Bergabung`=1 |

## Smoke R-5 (46 kasus) — pemetaan VALIDASI PO
1. **Jumlah anggota sesuai database**: `pagination.total == prisma.member.count()`; `rows.length == total`; `summary.total == active + nonActive`.
2. **Status Keanggotaan sesuai kontrak**: `summary.active == count(memberEnrollments some {})`; m2 (enrollment DROPPED/terminal) → AKTIF (pernah); m3 (tanpa enrollment + **pinjaman aktif**) → NONAKTIF (bukan dari pinjaman); m5 (tanpa enrollment) → NONAKTIF.
3. **Kelas dari SSOT**: m1/m6 → `X Merdeka 1`, m4 → `XI Merdeka 2`; m2 (DROPPED) → null; m3/m5 → null.
4. **Tanggal Bergabung**: `joinedAt == createdAt.toISOString()`.
5. **Search server-side**: nama ("Sari", "Guru") & nomor ("G-0001"); tanpa match → 0 baris + summary nol.
6. **Filter Status**: AKTIF → 4 (m1,m2,m4,m6), semua badge ACTIVE; NONAKTIF → 2 (m3,m5); summary konsisten.
7. **Filter Kelas**: X → 2 (m1,m6) semua `X Merdeka 1`; XI → 1 (m4).
8. **Statistik ikut filter**: kelas X → total 2, active 2, nonActive 0, students 1 / teachers 1 / general 0; NONAKTIF → students 1 / teachers 1 / general 0; search "Guru" → active 1; kombinasi NONAKTIF+kelas → 0; kombinasi AKTIF+search "Eka" → m2.
9. **Pagination + skala**: bulk 15 → total 21; page1 → 10 baris; totalPages 3; page3 → 1 baris; summary stabil (bukan per halaman); kelas + page konsisten.
