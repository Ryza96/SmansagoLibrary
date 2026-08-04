# IT-1 Final Review — Borrow/Return Transaction Integrity

## Ringkasan Eksekusi

IT-1 mengimplementasikan Single Decision Authority untuk transisi status `BookCopy` dan memindahkan seluruh mutasi status (borrow, return, decommission) ke stack baru (`src/main/`). Seluruh 5 keputusan PO terimplementasi.

## Verification Matrix

| # | Mandat | Status | Bukti |
|---|--------|--------|-------|
| 1 | `HILANG` → `BookCopy.status = 'LOST'`, `conditionBack` tetap `'HILANG'` | ✅ | `it1_smoke STEP 5`: status LOST, conditionBack HILANG |
| 2 | `BORROWED → REMOVED` ditolak decommission | ✅ | `it1_smoke STEP 3`: rejected "sedang dipinjam" |
| 3 | Condition sync OUT of scope | ✅ | Tidak ada perubahan condition sync |
| 4 | Semua status mutations pindah ke stack baru (satu PrismaClient) | ✅ | `decommissionCopy` → `src/main/services/book-copy.service.ts`; IPC rewired; legacy stub throw |
| 5 | SATU otoritas transisi (`book-copy-status.ts`) | ✅ | Leaf config `src/shared/config/book-copy-status.ts` dipakai borrow.repo, return.repo, decommission svc |

## Quality Gates

| Gate | Result |
|------|--------|
| `npm run lint` | ✅ PASS |
| `npm run build` | ✅ PASS (main 1,819.24 kB · preload 9.02 kB · renderer 1,044.75 kB) |
| `prisma migrate diff --exit-code` | ✅ "No difference detected" |
| `it1_borrow_return_smoke` | ✅ 34/34 PASS |
| `wo14_e2_smoke` (regression) | ✅ 36/36 PASS (unmodified) |

## File Changes Summary

| File | Perubahan |
|------|-----------|
| `src/shared/config/book-copy-status.ts` | **BARU** — SATU otoritas: 4 status + matriks transisi + `canTransitionStatus()` |
| `electron/main/shared/book-copy-status.ts` | **BARU** — shim backward-compat untuk legacy `addCopies` |
| `src/main/repositories/book-copy.repository.ts` | +`findByIdWithHistory()`, +`updateStatusIf()` (guarded write) |
| `src/main/repositories/borrow.repository.ts` | `createWithItems`: atomic guard AVAILABLE→BORROWED (all-or-nothing rollback); `processReturn`: guarded LOST/AVAILABLE via `canTransitionStatus` + predikat status |
| `src/main/services/book-copy.service.ts` | **BARU** — `decommissionCopy()` dengan guard BORROWED→REMOVED ditolak + canTransitionStatus + delete/REMOVED logic |
| `electron/main/services/book-copy.service.ts` | Hapus `ALLOWED_TRANSITIONS`, `validateStatusTransition`, `updateStatus`, `updateCondition`; `decommissionCopy` jadi throwing stub |
| `electron/ipc/book-copy.ipc.ts` | `decommissionCopy` rewired ke `newBookCopyService` |
| `src/components/books/BookDetail.tsx` | Error surfacing `try/catch` + `window.alert(message)` |
| `it1_borrow_return_smoke/smoke.ts` | **BARU** — 34 assertions: double-borrow, atomic rollback, decommission guards, HILANG→LOST, no-resurrection, matriks transisi |

## Keputusan Teknis

1. **Atomic borrow guard**: `createWithItems` memindahkan `updateMany` (status AVAILABLE→BORROWED) ke DALAM transaksi, SETELAH `borrow.create + detail.createMany`. Jika `count !== items.length`, throw → Prisma rollback seluruh tx → tidak ada Borrow/Detail parsial.
2. **Decommission policy**: AVAILABLE tanpa history → `delete`; AVAILABLE/LOST dengan history → `updateStatusIf(REMOVED)`; BORROWED → AppError 400.
3. **No-resurrection**: `processReturn` hanya menulis status bila `canTransitionStatus(current, target)` → REMOVED tidak pernah kembali AVAILABLE.
4. **Guard predikat**: `updateStatusIf(id, fromStatus, toStatus)` pakai `updateMany({ where: { id, status: fromStatus } })` — concurrent-safe tanpa lock.

## Technical Debt (dicatat, bukan blokir)

- Legacy `ALLOWED_TRANSITIONS`/`validateStatusTransition`/`updateStatus`/`updateCondition` dihapus. Method repo legacy (`BookCopyRepository.updateStatus`/`updateCondition`) masih ada (unused) — cleanup WO terpisah.
- `AppError` di-import dari `electron/main/errorHandler` dalam `src/main/repositories/borrow.repository.ts` — cross-boundary import (pola existing).
- `BookCopyService.decommissionCopy` legacy stub masih ada (throw error) — defensive guard; hapus saat cleanup legacy.
