# E-1 — Final Review

## Status: READY — menunggu review Product Owner

## Verdict per kriteria arsitektur

| Kriteria | Hasil |
|----------|-------|
| Business rules sesuai RFC §6.1/§6.2 (§1.2 aggregate) | ✅ enroll/close/repoint/findActiveByMember + satu-ACTIVE persis kontrak |
| MemberEnrollment = SSOT; tidak pernah DELETE | ✅ close set terminal + `leftAt`; repoint tutup+buka (2 baris) |
| Guard satu-ACTIVE di Service (bukan DB) | ✅ `countActiveByMember` sebelum create; SQLite partial-unique tidak digunakan |
| Hanya siswa punya enrollment (`hasAcademicRecord`) | ✅ guru/umum ditolak 400 |
| Kelas divalidasi milik tahun ajaran input | ✅ `class.academicYearId === input.academicYearId` |
| Close hanya untuk ACTIVE + status terminal | ✅ guard berlapis; error 400 terarah |
| Repoint transaksional (close+enroll atomik) | ✅ `runTransaction(getPrisma(), ...)` rollback otomatis |
| Status akademik enum terpusat (RFC §4) | ✅ `src/shared/config/academic-status.ts` (leaf node, tanpa import) |
| Status sistem `Member.status` TIDAK disentuh E-1 | ✅ ditunda ke E-3 (scope discipline) |
| Schema/migration/legacy `Member.classId` tidak berubah | ✅ `migrate diff` empty; `git status` hanya file E-1 + discovery report |
| API cross-boundary lengkap (DTO + IPC + preload + env.d.ts) | ✅ 4 channel ter-register di bundle main & preload |

## Cek kualitas

- **Lint:** `npm run lint` PASS (tsc node + web).
- **Build:** PASS — main 1,788.10 kB · preload 8.49 kB · renderer 987.29 kB.
- **Smoke:** 39/39 PASS pada fresh DB (migrate deploy 4 migrations; DB temp dibersihkan
  setelah run; DB live dev tidak pernah disentuh).
- **Tipe data:** `status` wajib di repository `CreateEnrollmentData` (no-DB-default → tidak
  boleh `undefined`); DTO input `CreateEnrollmentDTO.status` tidak ada (Service menetapkan ACTIVE).
- **Pesan error kontrak smoke:** AppError message adalah kontrak (diuji `msg.includes`),
  konsisten pola WO-4/5/6/7.

## Sisa risiko (bukan blocker E-1)

1. **Auto-close saat enroll** belum diputuskan (E-2/MI-2). Saat ini enroll memblokir bila ada
   ACTIVE dan menyarankan repoint — aman dan eksplisit.
2. **`findActiveByMember` memakai `leftAt: null`** sebagai definisi aktif; tanpa data lama
   dengan anomali, tidak berdampak.
3. **Sinkronisasi `Member.status`** (GRADUATED/TRANSFERRED/DROPPED → INACTIVE) adalah E-3 —
   sampai E-3 selesai, penutupan enrollment tidak mengubah status sistem member.

## Rekomendasi

Lanjut ke **E-2 (cutover reads)** setelah persetujuan PO. E-2 adalah WO berikutnya di WBS
Milestone B dan satu-satunya konsumen langsung yang membutuhkan E-1 sebagai prasyarat.
