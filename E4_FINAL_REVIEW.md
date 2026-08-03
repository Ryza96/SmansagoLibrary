# E-4 — Final Review

## Status: READY — menunggu review Product Owner

## Verdict per persyaratan WO

| Persyaratan | Hasil |
|-------------|-------|
| Enrollment History Page | ✅ `src/pages/EnrollmentHistoryPage.tsx` (route `members/:id/enrollments`) |
| Detail History | ✅ baris expandable (Dibuat/Diperbarui) + semua field WAJIB di kolom utama |
| Tampilkan Academic Year | ✅ kolom Tahun Ajaran (join per-baris, bukan tahun aktif) |
| Tampilkan Curriculum | ✅ `curriculumName` baru di DTO (smoke: MERDEKA vs K13) |
| Tampilkan Class | ✅ kolom Kelas (`X A`, `X B`) |
| Tampilkan Status | ✅ badge ACTIVE hijau / terminal abu; label Indonesia |
| Tampilkan Joined At | ✅ kolom Bergabung (`enrolledAt`) |
| Tampilkan Left At | ✅ kolom Keluar (`leftAt`, `-` bila aktif) |
| Tampilkan Note | ✅ kolom Catatan (`-` bila kosong) |
| Urutkan terbaru dulu | ✅ backend `enrolledAt desc, createdAt desc`; smoke memverifikasi |
| Routing / Navigation / Labels / Renderer | ✅ routes + `navigation.ts` + `labels.ts` + MemberDetailPage button |
| Smoke: urutan, status, joinedAt/leftAt, note, ACTIVE & terminal | ✅ 45/45 (STEP 2–5) |
| JANGAN ubah Schema / Migration / Promotion / Import / Bulk | ✅ `migrate diff` empty; tidak ada yang diubah |
| Business rule tetap backend | ✅ UI hanya konsumen `historyByMember` |

## Ammendment PO (dictum)
- Channel read-only `enrollments:historyByMember` disetujui (WAJIB tidak dapat dipenuhi tanpa
  data history; tidak ada channel/DTO eksisting).
- `EnrollmentDTO.curriculumName` aditif (WAJIB Kurikulum). Semua method enrollment kini
  mengembalikan field ini — regression E-1/E-2/E-3 PASS.

## Cek kualitas

- **Lint:** PASS (tsc node + web).
- **Build:** PASS — main 1,749.07 kB · preload 8.39 kB · renderer 999.83 kB.
- **Smoke E-4:** 45/45 PASS (fresh DB).
- **Regression:** E-1 39/39 · E-2 36/36 · E-3 78/78 PASS (fresh DB).
- **Migrate diff:** no drift.
- **Smoke UI:** grep bundle — halaman, route, dan channel ter-render (renderer + main).
- **DB temp** dibersihkan; DB live dev tidak disentuh.

## Sisa risiko (bukan blocker E-4)
1. History menampilkan nama tahun **join** (mengikuti rename tahun itu sendiri). Exit criteria WBS
   hanya menuntut rename *tahun lain* tak mengubah label — terbukti. Jika ingin snapshot nama
   permanen, butuh kolom denormalisasi (di luar scope E-4).
2. Pagination tidak diterapkan (riwayat per anggota kecil). Bila volume besar, `historyByMember`
   bisa diberi pagination di WO lanjutan.
3. Entry hanya dari MemberDetailPage (tidak ada item sidebar) — sesuai konteks per-anggota.

## Rekomendasi
Lanjut ke **MI-1 (MemberClassResolver skop tahun/kurikulum)** setelah persetujuan PO.
E-4 menuntaskan riwayat enrollment; resolver adalah prasyarat import anggota multi-tahun.
