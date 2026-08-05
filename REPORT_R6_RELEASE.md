# R-6 — RELEASE: Laporan Koleksi Buku

## Ringkasan Rilis
- **Fitur:** Laporan Koleksi Buku — UI baru + backend aditif (4 keputusan PO G-2/G-4/G-5/G-6).
- **Backend aditif:** `CollectionReportRowDTO` +4 field; repository per-row counts via groupBy; `getCollectionSummary` search-aware & non-REMOVED; search OR title/isbn/author/publisher.
- **UI:** `CollectionReportPage.tsx` (filter Kategori + Search server-side, 3 kartu statistik, tabel 11 kolom, pagination 20/halaman) + kartu ReportsPage + route + nav + labels.
- **Tanpa wiring IPC baru** (channel `reports:collections` reused), **tanpa schema/migration**.

## Artifak
| Item | Detail |
|------|--------|
| Smoke | `report_r6_smoke` 30/30 |
| Regression | Report 7 suite fresh DB **290 PASS** |
| lint | PASS |
| build | main 1,872.87 kB · preload 9.95 kB (identik) · renderer 1,137.66 kB |
| migrate diff | "This is an empty migration." |
| Grep bundle | main `reports:collections`=1; renderer marker UI ter-render |

## Catatan Rilis
- WO ini memakai baseline R-5 (commit `ca7b7f0`). Semua perubahan di working tree.
- File untracked milik WO lain (BORROW_ENROLLMENT_DISCOVERY, INTEGRATION_TEST_PHASE1_DISCOVERY, IT1_DISCOVERY_REPORT, MEMBERSHIP_STATUS_BUG_REPORT, MEMBER_STATUS_ALIGNMENT_PLAN, MEMBER_STATUS_FINAL_AUDIT, PACKAGE_BUILD_ROOT_CAUSE, STUDENT_CLASS_DISPLAY_BUG_REPORT, r4_po_repro_smoke) TIDAK diikutkan dalam commit R-6.
