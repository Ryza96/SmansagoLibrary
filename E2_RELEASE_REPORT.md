# E-2 — Release Report

## Deliverable

Cutover membaca "kelas akademik saat ini" ke **MemberEnrollment** (WBS WO-14 E-2):
`MemberService.classInfo` (dari `findActiveByMember`), snapshot `className` di
`BorrowService.create` (dari enrollment), guard hapus kelas di `ClassService.delete`
(dari `enrollmentRepository.countByClass`). `MemberService.create/update` berhenti
menulis `Member.classId`. Kolom `Member.classId` dipertahankan sebagai legacy
compatibility (nilai lama tetap terbaca, tidak lagi Source of Truth).

## Status validasi

| Gate | Hasil |
|------|-------|
| `npm run lint` | PASS |
| `npm run build` | PASS (main 1,788.59 kB · preload 8.49 kB · renderer 987.29 kB) |
| Smoke E-2 fresh DB (`wo14_e2_smoke/smoke.ts`) | 36/36 PASS |
| Regression E-1 fresh DB (`wo13_e1_smoke/smoke.ts`) | 39/39 PASS |
| `prisma migrate diff` | no drift (empty migration) |

## File

Dimodifikasi (5): `src/main/repositories/enrollment.repository.ts`,
`src/main/services/member.service.ts`, `src/main/services/borrow.service.ts`,
`src/main/services/class.service.ts`, `electron/main/bootstrap.ts`.
Baru (1): `wo14_e2_smoke/smoke.ts`.

## Batasan scope (dipertahankan)

- Schema & migration TIDAK berubah; kolom `Member.classId` tetap ada (penghapusan = T-3/F3).
- `MemberImportService`/`MemberClassResolver` tetap memakai `classId` (MI-2, deferred).
- UI, Promotion, Reporting, DTO shape TIDAK berubah; `Member.status` sync = E-3.
- Smoke historis wo7/8/9 (konstruktor `ClassService` lama) tidak di-re-run (deferred).

## Repo state

- WO E-1 (`aba87d6`) sudah ter-commit & ter-push ke `origin/main`.
- WO E-2 seluruhnya di working tree, BELUM di-commit (menunggu instruksi commit + push).

## Command smoke (referensi)

```
$tmp = "C:\Users\hp\AppData\Local\Temp\opencode\wo14_e2_smoke"
npx tsc --module commonjs --target es2022 --moduleResolution node --esModuleInterop --skipLibCheck --rootDir . --outDir "$tmp\out" wo14_e2_smoke/smoke.ts
$env:DATABASE_URL = "file:C:/Users/hp/AppData/Local/Temp/opencode/wo14_e2_smoke/smoke.db"
npx prisma migrate deploy
$env:NODE_PATH = "<repo>\node_modules"; node "$tmp\out\wo14_e2_smoke\smoke.js"
```
