# E-2 — Final Review

## Status: READY — menunggu review Product Owner

## Verdict per kriteria arsitektur (WBS WO-14 E-2 / RFC §12)

| Kriteria | Hasil |
|----------|-------|
| `member.service` `classInfo` dibaca dari Enrollment (SSOT) | ✅ `findActiveByMember` + include enrollment (AY & curriculum); shape DTO tidak berubah |
| `borrow.service` snapshot kelas dari Enrollment | ✅ `enrollmentService.findActiveByMember().className`; classId legacy diabaikan |
| Guard hapus kelas memakai `enrollment.count` (bukan `member.classId`) | ✅ `enrollmentRepository.countByClass` (status ACTIVE + leftAt null) |
| `Member.classId` berhenti ditulis (create/update) | ✅ payload repository tidak lagi membawa `classId`; smoke membuktikan DB null |
| Exit criteria: tidak ada produksi membaca `Member.classId` untuk tampil/snapshot/guard | ✅ satu-satunya pemakaian tersisa = `MemberDTO.classId` (nilai legacy) + jalur import (MI-2, deferred) |
| Konsumen UI (shape `classInfo`) tetap kompatibel | ✅ MembersPage:112, MemberListPage:131, MemberDetailPage:73 memakai `educationLevel`/`parallel` yang sama |
| Wiring bootstrap konsisten (dependency order) | ✅ enrollmentRepository/enrollmentService dibuat sebelum konsumennya |
| Schema/migration/UI/Import/Promotion tidak berubah | ✅ `migrate diff` empty; renderer bundle identik E-1 (987.29 kB) |

## Cek kualitas

- **Lint:** `npm run lint` PASS (tsc node + web).
- **Build:** PASS — main 1,788.59 kB · preload 8.49 kB · renderer 987.29 kB.
- **Smoke E-2:** `wo14_e2_smoke/smoke.ts` 36/36 PASS pada fresh DB.
- **Regression E-1:** `wo13_e1_smoke/smoke.ts` 39/39 PASS pada fresh DB (include enrollment
  diperkaya curriculum tidak mengubah perilaku E-1).
- **Migrate diff:** no drift (empty migration).
- **DB temp** dibersihkan setelah run; DB live dev tidak pernah disentuh.

## Sisa risiko (bukan blocker E-2)

1. **Import anggota masih menulis `classId`** (MI-2) — setelah E-2, nilai `classId` dari
   import tetap tersimpan sebagai legacy namun tidak lagi dibaca untuk tampil/snapshot/guard.
2. **Kelas dengan enrollment tertutup tidak bisa dihapus** — guard lolos (count 0) tetapi
   FK RESTRICT (P2003) menolak karena baris MemberEnrollment tak pernah dihapus. Perilaku DB
   pre-existing; mitigasi ditangani WO migrasi/histori (deferred), bukan E-2.
3. **`Member.status` sync** saat close/graduation = E-3.
4. **Smoke historis wo7/8/9** mengkonstruksi `ClassService` dengan signature lama — tidak
   di-re-run pada WO ini (out of scope); perlu update konstruktor bila ingin di-re-run.

## Rekomendasi

Lanjut ke **E-3 (Member.status sync)** setelah persetujuan PO. E-2 selesai; seluruh pembacaan
produksi "kelas saat ini" kini berbasis MemberEnrollment.
