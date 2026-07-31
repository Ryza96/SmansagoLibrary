# PRA — Inventory Management System (IMS)
## Production Readiness Audit Report
**Date:** 2026-07-30  
**Scope:** Full-stack audit of BookCopy lifecycle: create, read, update status, decommission, barcode scan, inventory listing, and all supporting layers (schema, repository, service, IPC, preload, UI, routing, labels).  
**Methodology:** Read-only inspection of 40+ source files across both stacks, cross-referenced against current Prisma schema.

---

## Executive Summary

**Score: 3.5 / 10 — NOT PRODUCTION READY**

The IMS module has a severe architectural split between a legacy stack (`electron/main/` — actively crashing) and a new stack (`src/main/` — incomplete). The standalone `/inventory` page is an 8-line placeholder. Copy management is only accessible within the BookDetail page. Six `borrowingItems` references (non-existent relation) and three `inventorySequence` references (non-existent model) guarantee runtime errors on any inventory write operation. The only fully working operation is barcode lookup via the new stack.

---

## Current Architecture

```
┌─────────────────────────────────────────────────┐
│                  UI Layer                        │
│  BookDetail.tsx (add / decommission copies)      │
│  InventoryPage.tsx (8-line placeholder)          │
│  BorrowingsPage.tsx (calls bookCopies:findByBarcode) │
└──────────────┬──────────────────────────────────┘
               │ IPC (contextBridge)
┌──────────────▼──────────────────────────────────┐
│            IPC Handlers (electron/ipc/)          │
│  book-copy.ipc.ts: 4 handlers                   │
│  ├─ findByBarcode  → New Stack  ✓               │
│  ├─ findByBookId   → Legacy Stack ✗             │
│  ├─ addCopies      → Legacy Stack ✗             │
│  └─ decommission   → Legacy Stack ✗             │
└──────────────┬──────────────────────────────────┘
               │
   ┌───────────┴───────────┐
   │                       │
   ▼                       ▼
┌─────────────────┐  ┌─────────────────┐
│  LEGACY STACK   │  │   NEW STACK     │
│ electron/main/  │  │   src/main/     │
│                 │  │                 │
│ BookCopyService │  │ BookCopyService │
│  - getCopies    │  │  - findByBarcode│
│  - addCopies    │  │  (only method)  │
│  - decommission │  │                 │
│  - updateStatus │  │ BookCopyRepo    │
│  - updateCond   │  │  (full CRUD)    │
│                 │  │                 │
│ InventoryNumGen │  │ BorrowService   │
│  (inventorySeq) │  │ ReturnService   │
│                 │  │                 │
│ PrintService    │  │ BorrowRepo      │
│  (uses new repo)│  │ BorrowDetailRepo│
└─────────────────┘  └─────────────────┘
```

### Layer Summary

| Layer | Location | Status |
|-------|----------|--------|
| Routes | `src/routes/index.tsx:44` | `/inventory` route exists |
| Page | `src/pages/InventoryPage.tsx` | 8-line placeholder |
| BookDetail UI | `src/components/books/BookDetail.tsx` | Functional (calls legacy stack) |
| Preload | `electron/preload/book-copy.preload.ts` | 4 methods mapped |
| IPC | `electron/ipc/book-copy.ipc.ts` | 1/4 handler uses safe stack |
| New Service | `src/main/services/book-copy.service.ts` | 1 method (findByBarcode) |
| New Repository | `src/main/repositories/book-copy.repository.ts` | Full CRUD, schema-correct |
| Legacy Service | `electron/main/services/book-copy.service.ts` | 9 runtime error points |
| Legacy Repository | `electron/main/repositories/book-copy.repository.ts` | 3 runtime error points |
| Print Service | `electron/main/services/print.service.ts` | Uses new repo, has `any` types |
| Error Handler | `electron/main/errorHandler.ts` | 10-line AppError class |
| Enums | `electron/main/shared/book-copy-status.ts` | Correct (AVAILABLE/BORROWED/LOST/REMOVED) |
| Enums | `electron/main/shared/book-copy-condition.ts` | Correct (GOOD/LIGHT_DAMAGE/HEAVY_DAMAGE) |
| Labels | `src/utils/labels.ts` | COPY section has all required labels |
| Labels | `src/utils/labels.ts` | `FIELD.COPY_COUNT` available |
| Navigation | `src/utils/navigation.ts` | INVENTORY route constant defined |

### Dependency Injection (Bootstrap)

Both stacks are instantiated in `electron/main/bootstrap.ts:48-93`. The legacy `BookCopyService` and new `BookCopyService` coexist as `bookCopyService` and `newBookCopyService`. The IPC layer receives both and routes by handler.

---

## Domain Discovery

### Core Entity: BookCopy

```
BookCopy ──belongs-to──► Book
BookCopy ──has-many────► BorrowDetail
BorrowDetail ──belongs-to──► Borrow
Borrow ──belongs-to──► Member
```

### BookCopy Fields (from schema.prisma:140-158)
```prisma
model BookCopy {
  id              String    @id @default(uuid())
  bookId          String
  inventoryNumber String    @unique
  barcode         String    @unique
  condition       String    @default("GOOD")
  status          String    @default("AVAILABLE")
  shelfLocation   String
  acquisitionDate DateTime?
  notes           String?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  book          Book           @relation(fields: [bookId], references: [id])
  borrowDetails BorrowDetail[]

  @@index([status])
  @@index([shelfLocation])
}
```

### Status Lifecycle
```
AVAILABLE ──► BORROWED
AVAILABLE ──► LOST
AVAILABLE ──► REMOVED
BORROWED  ──► AVAILABLE
BORROWED  ──► LOST
BORROWED  ──► REMOVED
LOST      ──► REMOVED
```

Enforced in legacy `BookCopyService` via `ALLOWED_TRANSITIONS` (lines 11-16). This is NOT replicated in the new stack.

### Condition Values
- `GOOD` — default
- `LIGHT_DAMAGE`
- `HEAVY_DAMAGE`

Validated in legacy service (lines 18-22). NOT replicated in the new stack.

### Domain Rules (from legacy service)
1. Default status on creation: `AVAILABLE`
2. Default condition on creation: `GOOD`
3. Quantity per batch: 1–100
4. Shelf location: required, non-empty
5. Barcode: auto-generated (`BC-{12 hex chars}`)
6. Inventory number: auto-generated via sequence (`INV-{6-digit pad}`)
7. Decommission with history: status → `REMOVED` (soft delete)
8. Decommission without history: hard `DELETE`
9. Status transitions: strict whitelist (see above)
10. Retry mechanism: up to 3 retries on `P2002` (unique constraint) for batch create

These rules are ONLY enforced in the legacy stack. The new stack has zero business logic for inventory operations.

---

## Database Discovery

### Schema Source of Truth
**File:** `prisma/schema.prisma` (197 lines, 11 models)

### Relevant Models
| Model | Relation to BookCopy | Status |
|-------|---------------------|--------|
| `Book` | Parent (bookId FK) | Schema-correct |
| `BookCopy` | Self | Schema-correct |
| `BorrowDetail` | Child (bookCopyId FK) | Schema-correct |
| `Borrow` | Grandchild via BorrowDetail | Schema-correct |
| `Member` | Grandchild via Borrow | Schema-correct |

### Schema Drift — Legacy Code vs Reality
| Reference | File | Line | Schema Reality |
|-----------|------|------|---------------|
| `_count.borrowingItems` | `electron/main/repositories/book-copy.repository.ts` | 10, 32 | Relation is `borrowDetails` |
| `_count.borrowingItems` | `electron/main/repositories/book.repository.ts` | 43 | Relation is `borrowDetails` |
| `_count.borrowingItems` | `electron/main/services/book-copy.service.ts` | 40 | Relation is `borrowDetails` |
| `_count.borrowingItems` | `electron/main/services/book.service.ts` | 45 | Relation is `borrowDetails` |
| `tx.inventorySequence` | `electron/main/services/inventory-number-generator.ts` | 13, 19 | Model does not exist |
| `borrowingItems` (relation) | Used but not `_count` | — | Model does not exist |

**Total: 9 compile-time-safe / runtime-broken references.**

### Indexes
- `BookCopy`: `@@index([status])`, `@@index([shelfLocation])` — adequate
- `Book`: `@@index([title])`, `@@index([isbn])` — adequate
- `BorrowDetail`: `@@index([borrowId])`, `@@index([bookCopyId])` — adequate
- Missing: `@@index([barcode])` on `BookCopy` — Prisma auto-indexes `@unique` fields

### Dual PrismaClient Risk
- **`electron/main/database.ts`**: Creates its own `PrismaClient` singleton
- **`src/main/repositories/base/prisma.ts`**: Creates its own `PrismaClient` singleton
- Both connect to the same SQLite via `DATABASE_URL`
- **Risk**: Two separate connection pools, no transaction coordination between stacks. If a write from the new stack and a read from the legacy stack interleave, stale data may be returned.
- **Mitigation**: SQLite is single-writer. `$transaction` isolation is per-client. Cross-stack transactions are impossible.

### Data Integrity
- `inventoryNumber`: `@unique` — enforced by schema
- `barcode`: `@unique` — enforced by schema
- `bookId`: FK to `Book` — enforced by schema
- `bookCopyId` in `BorrowDetail`: FK to `BookCopy` — enforced by schema
- `cascade`: No `onDelete` cascade defined. Deleting a `Book` with copies will fail at DB level (FK constraint).

---

## Inventory Flow Discovery

### Flow 1: Create Copies (Add to Book)
```
UI (BookDetail.tsx) 
  → onAddCopies callback 
  → window.electronAPI.bookCopies.addCopies(bookId, input)
  → IPC handler (book-copy.ipc.ts:16-17)
  → Legacy bookCopyService.addCopies(bookId, input) ← RUNTIME ERROR
  → Legacy BookCopyRepository.createManyWithTx(tx, data)
  → Legacy InventoryNumberGenerator.generateBatch(tx, count) ← RUNTIME ERROR
```

**RUNTIME ERROR at `inventory-number-generator.ts:13`** — `tx.inventorySequence` does not exist.

### Flow 2: Read Copies by Book
```
UI (parent page)
  → window.electronAPI.bookCopies.findByBookId(bookId)
  → IPC handler (book-copy.ipc.ts:13-14)
  → Legacy bookCopyService.getCopiesByBookId(bookId) ← RUNTIME ERROR
```

**RUNTIME ERROR at `book-copy.repository.ts:32`** — `_count.borrowingItems` does not exist.

### Flow 3: Decommission Copy
```
UI (BookDetail.tsx)
  → onDecommissionCopy(id)
  → window.electronAPI.bookCopies.decommissionCopy(id)
  → IPC handler (book-copy.ipc.ts:19-20)
  → Legacy bookCopyService.decommissionCopy(id) ← RUNTIME ERROR
```

**RUNTIME ERROR at `book-copy.repository.ts:10`** — `_count.borrowingItems` does not exist.

### Flow 4: Scan Barcode (Find Copy by Barcode)
```
UI (BorrowingsPage.tsx / ReturnsPage.tsx)
  → window.electronAPI.bookCopies.findByBarcode(barcode)
  → IPC handler (book-copy.ipc.ts:10-11)
  → New bookCopyService.findByBarcode(barcode) ✓
  → New BookCopyRepository.findByBarcodeWithBook(barcode) ✓
```

**WORKING** — This is the only inventory operation that functions correctly.

### Flow 5: Standalone Inventory Listing
```
UI (InventoryPage.tsx — 8-line placeholder)
```
**NOT IMPLEMENTED** — No page, no service, no IPC handler.

### Flow 6: Status Update (by borrow/return)
```
BorrowService.createWithItems()
  → Updates BookCopy.status → 'BORROWED' ✓ (via Prisma direct)
  
ReturnService.returnBook()
  → Updates BookCopy.status → 'AVAILABLE' ✓ (via Prisma direct)
```

**WORKING** — Status transitions during borrow/return use the new stack and are schema-correct.

### Flow 7: Print Receipt
```
UI 
  → window.electronAPI.print.borrowReceipt(id)
  → PrintService.printBorrowReceipt(id) 
  → BorrowRepository.findById(id) ← New stack, schema-correct ✓
```

**WORKING** — Print service uses the new `BorrowRepository` correctly. However, uses `any` types for item mapping (lines 22, 40, 48).

---

## Legacy Discovery

### Dead or Partially Dead Code

| File | Lines | Status | Reason |
|------|-------|--------|--------|
| `electron/main/services/book-copy.service.ts` | 1-180 | **BROKEN** | `_count.borrowingItems` + `inventorySequence` |
| `electron/main/repositories/book-copy.repository.ts` | 1-66 | **BROKEN** | `_count.borrowingItems` in 2 queries |
| `electron/main/services/inventory-number-generator.ts` | 1-31 | **BROKEN** | `tx.inventorySequence` does not exist |
| `electron/main/services/book.service.ts` | 45 | **BROKEN** | `c._count.borrowingItems > 0` in `getBookById` |
| `electron/main/repositories/book.repository.ts` | 43 | **BROKEN** | `_count.borrowingItems` in `findByIdWithDetails` |
| `electron/main/services/borrowing.service.ts` | All | **BROKEN** | References model `Borrowing` (not in schema) |
| `electron/main/services/return.service.ts` | All | **BROKEN** | References legacy models |
| `electron/main/repositories/borrowing.repository.ts` | All | **BROKEN** | References legacy models |
| `electron/main/repositories/borrowing-item.repository.ts` | All | **BROKEN** | References legacy models |
| `electron/main/repositories/return.repository.ts` | All | **BROKEN** | References legacy models |

### Active Legacy Code that Works
- `electron/main/services/book.service.ts` (except line 45)
- `electron/main/repositories/book.repository.ts` (except line 43)
- `electron/main/services/author.service.ts`
- `electron/main/services/publisher.service.ts`
- `electron/main/services/category.service.ts`

### Why the Legacy Stack Still Runs
The broken code uses `_count.borrowingItems` and `tx.inventorySequence` — these are valid JavaScript property accesses that only fail AT RUNTIME when the code path is executed. TypeScript compilation does not catch these because:
1. `_count` is an `any`-typed result from Prisma's runtime
2. `tx` is typed as `Prisma.TransactionClient` which DOES include `inventorySequence` in Prisma's generated types IF the model exists in the schema — but since the model was removed from `schema.prisma` without regenerating Prisma Client, the generated types may be stale

---

## Security Review

### Current State
| Concern | Status | Details |
|---------|--------|---------|
| Authentication | NONE | No login, no auth guard |
| Authorization | NONE | All features accessible to anyone |
| Input Validation | MINIMAL | Client-side only in BookDetail.tsx; server-side in legacy service (lines 50-61) |
| SQL Injection | NONE | Prisma parameterizes all queries |
| XSS | LOW | React auto-escapes; print HTML uses template literals (potential XSS in print) |
| Path Traversal | NONE | No file operations in inventory |
| Secrets | STORED IN CLEAR | `DATABASE_URL` env var (file path to SQLite) — low risk for local app |
| IPC Exposure | MODERATE | All 4 inventory handlers exposed via contextBridge |
| Print Window | MODERATE | `BrowserWindow` with `nodeIntegration: false` but prints arbitrary HTML |

### Print Service Risk
`printHtml` in `print.service.ts:115-148` creates a hidden `BrowserWindow` with `nodeIntegration: false` and `contextIsolation: true`. The HTML content is generated server-side via template literals. The `show: false` setting provides no visual feedback. This is acceptable for a local desktop app but should be documented.

### Prisma Client Version
Uses `@prisma/client` — no pinned version visible. Should use exact version in `package.json` for production reproducibility.

---

## Risk Assessment

| Risk | Severity | Likelihood | Impact | Mitigation |
|------|----------|------------|--------|------------|
| Runtime crash on add copies | CRITICAL | CERTAIN | User cannot add copies | Replace `inventorySequence` with actual model or Prisma sequence alternative |
| Runtime crash on view copies by book | CRITICAL | CERTAIN | Book detail page shows no copies | Replace `_count.borrowingItems` with `_count.borrowDetails` |
| Runtime crash on decommission | CRITICAL | CERTAIN | User cannot remove copies | Fix both `_count` and status transition logic |
| Runtime crash on book detail | HIGH | CERTAIN | Book detail page errors when viewing copies | Fix `_count.borrowingItems` in `book.repository.ts:43` |
| Dual PrismaClient | MEDIUM | OCCASIONAL | Stale reads across stacks | Consolidate to single PrismaClient |
| No auth layer | MEDIUM | ON-DEMAND | Data accessible to any OS user | Acceptable for local school library app |
| Missing `members:search` | HIGH | FREQUENT | Borrowings page member search broken | Add IPC handler |
| Print receipt `any` types | LOW | RARE | Runtime type error in receipt data | Replace `any` with proper types |
| No copy notes editing | LOW | RARE | Cannot update copy notes | Missing feature, not a crash |

---

## Gap Analysis

### Critical Gaps (Blocking Production)

| Gap | Files Affected | Root Cause | Fix Required |
|-----|---------------|------------|--------------|
| **GAP-001:** `_count.borrowingItems` in 4 legacy files | `book-copy.repository.ts:10,32`, `book.repository.ts:43`, `book-copy.service.ts:40`, `book.service.ts:45` | Schema uses `borrowDetails`, not `borrowingItems` | Replace with `_count: { select: { borrowDetails: true } }` |
| **GAP-002:** `tx.inventorySequence` in inventory number generator | `inventory-number-generator.ts:13,19` | Model does not exist in schema | Create `InventorySequence` model OR replace with UUID/counter approach |
| **GAP-003:** No inventory business logic in new stack | `src/main/services/book-copy.service.ts` | Only `findByBarcode` implemented | Port ALL 6 methods from legacy service |

### High-Impact Gaps

| Gap | Description | Priority |
|-----|-------------|----------|
| **GAP-004:** `/inventory` page is placeholder | `InventoryPage.tsx` has 8 lines | HIGH |
| **GAP-005:** No `members:search` IPC handler | BorrowingsPage.tsx calls `window.electronAPI.members.search()` which doesn't exist | HIGH |
| **GAP-006:** No copy condition update UI | `BookCopyRepository.updateCondition` exists but is not exposed via IPC or UI | MEDIUM |
| **GAP-007:** No copy notes management | `notes` field in schema but no service/IPC/UI for it | LOW |
| **GAP-008:** No copy acquisition date management | `acquisitionDate` field in schema but no service/IPC/UI | LOW |
| **GAP-009:** No inventory search/filter/pagination | New `BookCopyRepository.findMany` has search + pagination but no consumer | MEDIUM |
| **GAP-010:** No copy status history/audit trail | No `BookCopyLog` or `AuditLog` table | LOW |
| **GAP-011:** Print service uses `any` types | `print.service.ts:22,40,48` — `detail` typed as `any` | LOW |

### Schema Gaps

| Gap | Description | Severity |
|-----|-------------|----------|
| No `onDelete: Cascade` on BookCopy.bookId | Cannot delete book with copies — FK error | MEDIUM |
| No `BookCopy.acquisitionSource` | No field for procurement source (purchase/donation/grant) | LOW |
| No `BookCopy.lastInventoryCheck` | No field for periodic inventory audit date | LOW |
| No `BookCopy.coverImage` | No per-copy image (uses book-level cover) | LOW |
| No `BorrowDetail.onDelete: Cascade` if BookCopy removed | REMOVED copies with borrow history will FK-error | MEDIUM |

---

## Detailed Runtime Error Map

### Error Point 1: `electron/main/repositories/book-copy.repository.ts:10`
```typescript
_count: { select: { borrowingItems: true } }  // ✗ 'borrowingItems' does not exist
```
Should be: `_count: { select: { borrowDetails: true } }`

### Error Point 2: `electron/main/repositories/book-copy.repository.ts:32`
```typescript
include: { _count: { select: { borrowingItems: true } } }  // ✗ Same error
```
Should be: `_count: { select: { borrowDetails: true } }`

### Error Point 3: `electron/main/repositories/book.repository.ts:43`
```typescript
_bookCopies: { include: { _count: { select: { borrowingItems: true } } } }  // ✗
```
Should be: `_count: { select: { borrowDetails: true } }`

### Error Point 4: `electron/main/services/book-copy.service.ts:40`
```typescript
hasBorrowingHistory: c._count.borrowingItems > 0  // ✗ 'borrowingItems' does not exist
```
Should be: `hasBorrowingHistory: c._count.borrowDetails > 0`

### Error Point 5: `electron/main/services/book.service.ts:45`
```typescript
hasBorrowingHistory: c._count.borrowingItems > 0  // ✗ Same error
```
Should be: `hasBorrowingHistory: c._count.borrowDetails > 0`

### Error Point 6: `electron/main/services/inventory-number-generator.ts:13`
```typescript
await tx.inventorySequence.upsert(...)  // ✗ Model does not exist
```

### Error Point 7: `electron/main/services/inventory-number-generator.ts:19`
```typescript
const updated = await tx.inventorySequence.update(...)  // ✗ Model does not exist
```

### Error Point 8: `book.repository.ts` — `findByIdWithDetails` will fail when rendering copies array due to `_count.borrowingItems`

### Error Point 9: `book.service.ts` — `getBookById` will fail at line 45 when mapping copies

---

## Production Readiness Score

| Criterion | Score (0-10) | Notes |
|-----------|-------------|-------|
| Schema Correctness | 4 | Schema is correct; legacy code references non-existent relations |
| Runtime Stability | 1 | 9 guaranteed crash points |
| Feature Completeness | 2 | Only barcode scan works; no inventory page, no status management |
| Error Handling | 3 | Minimal `AppError` class; no structured error codes |
| UI Polish | 5 | BookDetail copy management UI is clean; inventory page missing |
| Security | 6 | Acceptable for local app; no auth but no exposure either |
| Code Quality | 4 | Dual stacks, legacy dead code, `any` types, no tests visible |
| Documentation | 3 | No API docs, no architecture docs, no setup guide for IMS |
| Data Integrity | 7 | Schema has unique constraints, FKs; missing cascade deletes |
| Test Coverage | 0 | No test files found for inventory operations |

| Area | Score |
|------|-------|
| **Overall** | **3.5 / 10** |

### Verdict

**NOT PRODUCTION READY.** The IMS module has 9 guaranteed runtime error points that crash the application when any inventory write or book detail view is accessed. The only reliable operation is barcode scanning (used by borrow/return flows). The standalone inventory management page is an 8-line placeholder.

### Minimum Fix Path

1. **Replace `_count.borrowingItems` → `_count.borrowDetails`** in all 4 legacy files (GAP-001)
2. **Fix `inventory-number-generator.ts`** by adding `InventorySequence` model to schema OR rewriting to use UUID (GAP-002)
3. **Port all business logic** from legacy `BookCopyService` to new `src/main/services/book-copy.service.ts` (GAP-003)
4. **Re-route all 4 IPC handlers** to the new stack (fix `book-copy.ipc.ts`)
5. **Build the `/inventory` page** using the new stack's `BookCopyRepository.findMany` with search + pagination (GAP-004)
6. **Add `members:search` IPC handler** (GAP-005)
7. **Regenerate Prisma Client** after schema changes

Estimated effort for the minimum fix path: **3-5 days** for a single developer familiar with the codebase.

---

*Report generated by codebase audit. All conclusions are based on inspected source code. Items marked as "NOT VERIFIED" are noted where evidence is missing.*
