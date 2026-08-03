# E-3 — Release Report

## Status: READY — menunggu review Product Owner

## Deliverable yang masuk rilis

### Dimodifikasi
- `src/shared/config/academic-status.ts` — matriks sync RFC §4.3 `memberStatusForTerminalAcademic()`
- `src/main/services/enrollment.service.ts` — `close` transaksional + sinkronisasi `Member.status`
- `src/main/repositories/enrollment.repository.ts` — hapus dead code `close`/`CloseEnrollmentData`

### Baru
- `wo15_e3_smoke/smoke.ts` — smoke E-3 (78 kasus)

## Scope eksplisit TIDAK berubah (mencegah regresi)
- **Schema / migration:** `migrate diff` = empty (tanpa drift)
- **DTO:** `CloseEnrollmentDTO` tetap `{ status, note }`
- **IPC / preload / env.d.ts:** channel `enrollments:enroll/close/repoint/findActiveByMember` dari E-1 tetap; tanpa channel baru
- **Bootstrap:** konstruktor service tidak berubah (MemberRepository sudah diinjeksi sejak E-2)
- **UI:** bundle renderer identik E-2 (987.29 kB) — tanpa perubahan renderer
- **MemberService / ClassService / BorrowService / Import / Promotion:** tidak disentuh

## Perilaku yang berubah (user-visible)
1. **Menutup enrollment** dengan status `TRANSFERRED`/`DROPPED`/`GRADUATED` kini otomatis
   men-set `Member.status = INACTIVE` dalam transaksi yang sama (sebelumnya tidak ada sinkronisasi —
   deferred E-1/E-2).
2. **Menutup enrollment** dengan status `PROMOTED`/`REPEATED`/`REDISTRIBUTED` mempertahankan
   `Member.status = ACTIVE` (tidak berubah).
3. Tidak ada perubahan pada `enroll`/`repoint` — guard dan transaksionalitas E-1 dipertahankan.

## Baseline validasi

| Gate | Hasil |
|------|-------|
| `npm run lint` | PASS |
| `npm run build` | PASS (main 1,789.83 kB · preload 8.49 kB · renderer 987.29 kB) |
| Smoke E-3 (`wo15_e3_smoke`) | 78/78 PASS |
| Regression E-1 (`wo13_e1_smoke`) | 39/39 PASS |
| Regression E-2 (`wo14_e2_smoke`) | 36/36 PASS |
| `prisma migrate diff` | no drift |

## Rollback plan
Perubahan terbatas pada 3 file source + 1 smoke; tidak ada migration. Bila perlu
rollback: `git checkout` ketiga file (config/service/repository) — seluruh perilaku
sebelumnya (tanpa sync Member.status) pulih; smoke E-3 dihapus.

## Release
Commit tunggal setelah approval review PO. Poin review:
- Matriks §4.3 (keluar-sistem → INACTIVE, tetap-sekolah → ACTIVE)
- Transaksionalitas close (enrollment + member atomik)
- Validasi transisi lengkap + invariant satu-ACTIVE + history append-only
