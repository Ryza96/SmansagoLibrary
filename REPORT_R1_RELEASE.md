# REPORT R-1 — RELEASE REPORT

## Ringkasan Rilis
Fondasi **Report Module v1.0** (R-1): kontrak DTO 5 laporan + `ReportRepository` + `ReportService` + IPC `reports:*` + preload + `env.d.ts` + Bootstrap. Backend-only; UI laporan = R-2 (tidak dibangun).

## Commit
- Satu final commit + push berisi: source (report.ts, report.repository.ts, report.service.ts, report.ipc.ts, report.preload.ts, env.d.ts, bootstrap.ts, ipc/index.ts, preload/index.ts), smoke (`report_r1_smoke`, `report_r1_service_smoke`), laporan (3 file + `REPORT_MODULE_DISCOVERY.md`), AGENTS.md.
- File untracked milik WO lain TIDAK diikutkan.

## Kontrak Publik (IPC)
| Channel | Method | Tipe |
|---------|--------|------|
| `reports:borrowings` | `reports.borrowings(filter)` | `BorrowingReportDTO` |
| `reports:returns` | `reports.returns(filter)` | `ReturnReportDTO` |
| `reports:overdues` | `reports.overdues(filter)` | `OverdueReportDTO` |
| `reports:members` | `reports.members(filter)` | `MemberReportDTO` |
| `reports:collections` | `reports.collections(filter)` | `CollectionReportDTO` |

Laporan Promosi (ke-6) memakai `promotions:findMany/findById` existing (P-3).

## Hasil Pengujian (fresh DB per suite)
| Suite | Hasil |
|-------|-------|
| `report_r1_service_smoke` (Service) | **52/52 PASS** |
| `report_r1_smoke` (Repository, regression) | **46/46 PASS** |
| lint (tsc node+web) | PASS |
| build | PASS — main 1,862.60 · preload 9.95 · renderer 1,060.86 kB (renderer identik baseline) |
| `prisma migrate diff` | "This is an empty migration." |

## Tanpa Perubahan
Schema, migration (4 migrations, up to date), repository domain, UI, routes, sidebar, labels, print channel.

## Status
**RELEASED (R-1).** Menunggu review Product Owner; tidak lanjut R-2.
