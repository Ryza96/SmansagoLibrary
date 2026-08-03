# E-1 — Release Report

## Deliverable

Fondasi Enrollment (WO-13 E-1 WBS Milestone B):
`EnrollmentRepository` + `EnrollmentService` (enroll/close/repoint/findActiveByMember,
satu-ACTIVE) + DTO + config status akademik + IPC `enrollments:*` + preload + env.d.ts + wiring.

## Status validasi

| Gate | Hasil |
|------|-------|
| `npm run lint` | PASS |
| `npm run build` | PASS (main 1,788.10 kB · preload 8.49 kB · renderer 987.29 kB) |
| Smoke fresh DB (`wo13_e1_smoke/smoke.ts`) | 39/39 PASS |
| `prisma migrate diff` | no drift (empty migration) |
| Channel di bundle (main & preload) | 4/4 `enrollments:*` |

## File

Baru: `src/shared/config/academic-status.ts`, `src/shared/dto/enrollment.ts`,
`src/main/repositories/enrollment.repository.ts`, `src/main/services/enrollment.service.ts`,
`electron/ipc/enrollment.ipc.ts`, `electron/preload/enrollment.preload.ts`,
`wo13_e1_smoke/smoke.ts`.
Dimodifikasi: `electron/preload/index.ts`, `src/renderer/env.d.ts`,
`electron/main/bootstrap.ts`, `electron/ipc/index.ts`.
Juga di working tree (belum commit): `MILESTONE_B_DISCOVERY_REPORT.md` (artefak discovery Milestone B).

## Batasan scope (dipertahankan)

- Schema & migration TIDAK berubah; `Member.classId` legacy TIDAK disentuh.
- `Member.status` sync = E-3; cutover reads = E-2; UI enrollment = E-4.
- Konsumen `member.class` (MemberService/BorrowService/ClassService/Import) tetap legacy.

## Repo state

- 5 commit Milestone A ter-release di atas `b521824`.
- WO E-1 seluruhnya belum di-commit (menunggu instruksi commit + push).

## Command smoke (referensi)

```
$env:DATABASE_URL="file:C:/Users/hp/AppData/Local/Temp/opencode/e1-smoke/smoke.db"
npx prisma migrate deploy
npx tsc --module commonjs --target es2022 --moduleResolution node --esModuleInterop --skipLibCheck --outDir <tmp>\out --rootDir . wo13_e1_smoke/smoke.ts
$env:NODE_PATH="<repo>\node_modules"; node <tmp>\out\wo13_e1_smoke\smoke.js
```
