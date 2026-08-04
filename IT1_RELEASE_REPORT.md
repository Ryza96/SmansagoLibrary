# IT-1 Release Report — Borrow/Return Transaction Integrity

## Rilis: 2026-08-04

## Quality Gates — FINAL

| Gate | Status | Detail |
|------|--------|--------|
| `npm run lint` (tsc node+web) | ✅ PASS | 0 errors |
| `npm run build` (electron-vite) | ✅ PASS | main 1,819.24 kB · preload 9.02 kB · renderer 1,044.75 kB |
| `prisma migrate diff --exit-code` | ✅ PASS | "No difference detected" |
| `it1_borrow_return_smoke` | ✅ PASS | 34/34 (fresh DB) |
| `wo14_e2_smoke` (regression) | ✅ PASS | 36/36 unmodified |

## Deliverables

### New Files (3 source + 1 smoke)
| File | Purpose |
|------|---------|
| `src/shared/config/book-copy-status.ts` | Single authority: `BOOK_COPY_STATUS`, `ALLOWED_STATUS_TRANSITIONS`, `canTransitionStatus()` |
| `electron/main/shared/book-copy-status.ts` | Backward-compat shim (re-export for legacy `addCopies`) |
| `src/main/services/book-copy.service.ts` | New-stack `BookCopyService` with `findByBarcode()` + `decommissionCopy()` |
| `it1_borrow_return_smoke/smoke.ts` | 34 assertions: atomic borrow, decommission guards, HILANG→LOST, no-resurrection |

### Modified Files (6)
| File | Change |
|------|--------|
| `src/main/repositories/book-copy.repository.ts` | +`findByIdWithHistory()`, +`updateStatusIf()` |
| `src/main/repositories/borrow.repository.ts` | Atomic guard in `createWithItems` (all-or-nothing); guarded status transition in `processReturn` |
| `electron/main/services/book-copy.service.ts` | Remove `ALLOWED_TRANSITIONS`, `validateStatusTransition`, `updateStatus`, `updateCondition`; `decommissionCopy` → throwing stub |
| `electron/ipc/book-copy.ipc.ts` | Rewire `bookCopies:decommissionCopy` → `newBookCopyService` |
| `src/components/books/BookDetail.tsx` | Error surfacing: `try/catch` + `window.alert(message)` |

## PO Decisions — Verification

| # | Decision | Implemented |
|---|----------|-------------|
| 1 | `HILANG` → `status = 'LOST'`, `conditionBack` tetap `'HILANG'` | ✅ |
| 2 | `BORROWED → REMOVED` ditolak | ✅ AppError 400 |
| 3 | Condition sync out of scope | ✅ |
| 4 | Semua status mutations ke stack baru | ✅ Single PrismaClient |
| 5 | SATU otoritas transisi | ✅ `book-copy-status.ts` |

## Smoke Test Matrix

| STEP | Scenario | Expected | Actual |
|------|----------|----------|--------|
| 0 | Seed 6 copies AVAILABLE | OK | PASS |
| 1 | Double-borrow (service guard) | Rejected "sedang tidak tersedia" | PASS |
| 2 | Atomic in-tx guard (bypass pre-check) | Rollback: 0 borrow, copy2 AVAILABLE | PASS |
| 3 | Decommission BORROWED | Rejected "sedang dipinjam" | PASS |
| 4 | Return normal BAIK → AVAILABLE | Status AVAILABLE, COMPLETED | PASS |
| 5 | Return HILANG → LOST + conditionBack HILANG | Status LOST, conditionBack HILANG | PASS |
| 6 | Decommission LOST → REMOVED | Status REMOVED (row exists) | PASS |
| 7 | Decommission AVAILABLE (no history) → DELETE | Row null | PASS |
| 8 | Decommission AVAILABLE (with history) → REMOVED | Status REMOVED | PASS |
| 9 | Return on REMOVED → no resurrection | Status tetap REMOVED | PASS |
| 10 | Return not-borrowed | Rejected "tidak sedang dipinjam" | PASS |
| 11 | Transition matrix unit tests | 10 cases | PASS |
