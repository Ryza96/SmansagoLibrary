# IT-1 BORROW ELIGIBILITY — RELEASE REPORT

**Date:** 2026-08-04  
**Status:** APPROVED FOR RELEASE

## What Changed

1. `BorrowService.create`: enrollment-based guard replaces `Member.status == ACTIVE`
2. `BorrowingsPage.tsx`: lowercase bug fix (`'active'` → `'ACTIVE'`)
3. Unknown `MemberType` → rejected with validation error

## Verification

- Smoke 7/7 PASS (all mandatory cases including TRANSFERRED, DROPPED, UNKNOWN)
- Regression wo14_e2_smoke 36/36 PASS, it1_borrow_return_smoke 34/34 PASS
- Lint PASS, Build PASS (main 1,819.55 kB), migrate diff = no difference

## No Schema/Migration Changes

Business rule enforcement lives entirely in Service layer (no DB changes).

## Ready for Commit
