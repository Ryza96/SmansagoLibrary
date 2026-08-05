# R-5 FINAL REVIEW — Laporan Anggota

## Keputusan Review
- [x] **Architecture Gate — LULUS** (R-5 READY review PO, tidak lanjut R-6..R-9)
- Search server-side mengikuti pola aditif non-breaking R-2/R-3/R-4 (tidak mengubah kontrak R-1 yang sudah di-approve).
- Kolom tabel **5** (Nomor Anggota, Nama, Kelas, Status Keanggotaan, Tanggal Bergabung); tanpa Petugas (K1) & tanpa nominal denda (K2) — tidak relevan untuk anggota.

## Arsitektur (pola konsisten repo)
- **Renderer TIDAK menurunkan angka** — `membershipStatus`, `className`, `joinedAt`, `summary.total/active/nonActive` seluruhnya dihitung `ReportService`; renderer hanya memformat tanggal & badge. Filter dikirim sebagai `{search, status, classId, page, limit}` ke channel `reports.members`.
- **Tanggal Bergabung = FALLBACK `Member.createdAt`** — createdAt BUKAN definisi bisnis "Tanggal Bergabung"; domain belum memiliki field khusus, sehingga nilai ini hanya dipakai sementara (dikomentari di DTO, Service, dan smoke). Saat field khusus ditambahkan, ganti sumber nilai di `ReportService` tanpa mengubah kontrak DTO.
- **1 IPC `reports.members` reused** — TIDAK ada channel/preload/env.d.ts/bootstrap baru; DTO aditif auto-flow ke kontrak renderer.
- **Server-side search memakai kolom member** (`memberNumber`/`fullName` `contains`) pada `buildMemberReportWhere` — satu builder dipakai baris, ringkasan (`countMemberMembershipSummary`), dan jumlah per-tipe (`countMembersByType`), sehingga statistik konsisten dengan hasil pencarian.
- **Status Keanggotaan = `_count.memberEnrollments > 0`** — `memberReportInclude._count` (independen terhadap filter) dipakai Service untuk turunkan badge; ringkasan `active/nonActive` memakai count dengan builder yang sama.
- **Filter Status = Prisma relation filter**: AKTIF → `memberEnrollments: { some: {} }` (bila belum ada constraint kelas); NONAKTIF → `none: {}`. Kombinasi NONAKTIF + kelas → `some`+`none` di-AND Prisma → 0 baris (anggota berkelas pasti pernah enrollment) — perilaku didokumentasikan & diuji.

## Checklist Mandat
| Mandat | Bukti |
|--------|-------|
| Renderer tidak menghitung business logic | grep di `src/pages/report` — hanya format tanggal/badge; semua angka dari DTO |
| Backend additive, tidak refactor R-1 | `git diff` hanya +field (`status?`, `membershipStatus`, `joinedAt`, `active`, `nonActive`) +builder +method baru +pass-through; laporan lain 0 perubahan |
| Tidak menyentuh schema/migration | `prisma migrate diff` = "empty migration" (exit 0) |
| Tidak menyentuh domain lain | `MemberService`/`MemberRepository`, `EnrollmentService`, `BorrowService`, `ReturnService`, Dashboard, Promotion tidak diubah |
| Kontrak DTO dipertahankan | field baru semua **opsional/aditif** — caller lama aman (regression R-1 98/98) |
| Smoke membuktikan 6 VALIDASI PO | 46 kasus (jumlah-DB / status kontrak / kelas SSOT / joinedAt / search / filter / statistik ikut filter / pagination + skala) |

## Risiko / Catatan
- **Status Keanggotaan ≠ `Member.status`** — AKTIF berarti *pernah* memiliki `MemberEnrollment`; `Member.status` tidak dipakai sama sekali (seed membuktikan: `status=ACTIVE` tanpa enrollment → NONAKTIF; `status=INACTIVE` dengan enrollment → AKTIF). Ini kontrak yang disepakati dan berbeda dari "membership status" yang di-trigger by-borrow (WO Membership First Borrow) — dua domain berbeda.
- **Tanggal Bergabung masih FALLBACK `Member.createdAt`** — createdAt bukan definisi bisnis; pemakaian sementara sampai domain menyediakan field khusus (mis. `joinedDate`). Dikomentari di DTO, Service, dan smoke; jangan diangkat menjadi "definisi" di dokumentasi.
- **Kelas = SSOT `MemberEnrollment` ACTIVE**, bukan `Member.classId` legacy (yang sudah tidak ditulis import MI-2+). Enrollment terminal (DROPPED/GRADUATED) → `className null` walau membershipStatus AKTIF.
- **Ringkasan memakai 2 query count + 1 groupBy count** dengan builder yang sama — anti-pola B1 (fetch-all) dihindari; skala 21 baris + page 3 dibuktikan.
- **Kombinasi filter NONAKTIF + Kelas = 0 baris** adalah konsekuensi logika (some+none) — bukan bug; UI tidak memakainya sebagai kombinasi bermakna.
- 0 kegagalan smoke pada run final (46/46 langsung hijau).

## Hasil Gate
lint PASS · build PASS (main **1,870,596 B** · preload **9.95 kB** · renderer **1,120.02 kB**) · smoke R-5 46/46 · regression Report **214/214** (r1 46 · r1_service 52 · r2 35 · r3 41 · r4 40) + Member/Enrollment/Borrow/Dashboard **307/307** · `prisma migrate diff` no-drift · grep bundle ter-render.
