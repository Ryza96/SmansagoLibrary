# E-4 — Release Report

## Status: READY — menunggu review Product Owner

## Deliverable yang masuk rilis

### Backend (read-only, ammendment PO)
- `src/shared/dto/enrollment.ts` — `EnrollmentDTO.curriculumName: string | null` (aditif)
- `src/main/repositories/enrollment.repository.ts` — `findManyByMember` (order terbaru dulu)
- `src/main/services/enrollment.service.ts` — `historyByMember` + `toDTO` curriculum
- `electron/ipc/enrollment.ipc.ts` — `enrollments:historyByMember`
- `electron/preload/enrollment.preload.ts` — `enrollments.historyByMember`
- `src/renderer/env.d.ts` — entry baru

### Frontend
- `src/pages/EnrollmentHistoryPage.tsx` (baru) — halaman riwayat (tahun, kurikulum, kelas, status, bergabung, keluar, catatan)
- `src/pages/MemberDetailPage.tsx` — tombol "Riwayat Enrollment"
- `src/routes/index.tsx` — route `members/:id/enrollments`
- `src/utils/navigation.ts` — `ROUTES.MEMBER_ENROLLMENT_HISTORY` + `enrollmentHistoryPath`
- `src/utils/labels.ts` — blok `ENROLLMENT_HISTORY`

### Smoke
- `wo16_e4_smoke/smoke.ts` — 45 kasus

## Scope eksplisit TIDAK berubah
- **Schema / migration:** `migrate diff` empty (tanpa drift).
- **Guard/transaksi E-1/E-2/E-3:** `enroll/close/repoint/findActiveByMember` tidak diubah
  (hanya `toDTO` ditambah field).
- **Promotion / Import / Bulk Operation:** tidak disentuh.
- **Sidebar:** tidak ditambah (history konteks per-anggota; entry dari MemberDetailPage).

## Perilaku yang berubah (user-visible)
1. **Baru:** tombol "Riwayat Enrollment" di halaman detail anggota membuka halaman riwayat.
2. **Baru:** riwayat menampilkan Tahun Ajaran, Kurikulum, Kelas, Status, Bergabung, Keluar,
   Catatan — terurut terbaru dulu; baris dapat diperluas untuk Dibuat/Diperbarui.
3. Semua response enrollment kini menyertakan `curriculumName` (tidak merusak kontrak lama).

## Baseline validasi

| Gate | Hasil |
|------|-------|
| `npm run lint` | PASS |
| `npm run build` | PASS (main 1,749.07 kB · preload 8.39 kB · renderer 999.83 kB) |
| Smoke E-4 (`wo16_e4_smoke`) | 45/45 PASS |
| Regression E-1 (`wo13_e1_smoke`) | 39/39 PASS |
| Regression E-2 (`wo14_e2_smoke`) | 36/36 PASS |
| Regression E-3 (`wo15_e3_smoke`) | 78/78 PASS |
| `prisma migrate diff` | no drift |
| Smoke UI (grep bundle) | `Riwayat Enrollment`, `members/:id/enrollments`, `enrollments:historyByMember` ter-render |

## Rollback plan
Perubahan backend read-only + UI; tanpa migration. Rollback: revert channel/service/repo/DTO +
hapus route & page — UI lama (tanpa riwayat) pulih. Tidak ada data yang berubah.

## Release
Commit tunggal setelah approval review PO. Poin review:
- UI riwayat per anggota lengkap (WAJIB 7 field) + urutan terbaru dulu
- Exit criteria: label historis tak berubah walau rename tahun lain
- Channel read-only `enrollments:historyByMember` (ammendment) — tanpa mutation
