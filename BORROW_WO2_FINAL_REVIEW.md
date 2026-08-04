# BORROW WO-2 FINAL REVIEW — PREVIEW UI

## 1. Status
**READY — Final Review.** Seluruh quality gate hijau. Perubahan mematuhi FINAL PREVIEW DESIGN DECISION (`BORROW_PREVIEW_DESIGN_AMENDMENT.md`, F1–F13) **tanpa penyimpangan** → siap ONE FINAL COMMIT.

## 2. Mandat Periksa (exit criteria WO-2)
| Mandat | Bukti |
|--------|-------|
| Route `/borrowings/:id/receipt-preview` (F1) | `src/routes/index.tsx` route `borrowings/:id/receipt-preview`; `BorrowingsPage` menavigasi via `receiptPreviewPath(result.id)` setelah `create()` sukses |
| Zoom 50–200% ±10% (F2) | `clampZoom` MIN_ZOOM 0.5/MAX_ZOOM 2.0/ZOOM_STEP 0.1; toolbar − / % / + / reset |
| Fit Width hanya `min(1,(viewportW−48px)/sheetW)` (F3) | `handleFitWidth` + re-fit saat resize; `fitModeRef` mencegah bentrok dengan zoom manual; tidak pernah >100% |
| Ctrl+Wheel (F4) | `addEventListener('wheel',…,{passive:false})` + `preventDefault()` ±0.1/notch hanya saat `e.ctrlKey` |
| Nama file PDF (F5) | `buildBorrowCardPdfFilename` di main: sanitize `/[<>:"/\\|?*\u0000-\u001f]/g` + collapse spasi + fallback `'PEMINJAMAN'`/`'Anggota'` + truncate 40; smoke 6 kasus PASS |
| Cetak system dialog (F6) | `printBorrowCard` → `printHtml(html,{margins:{marginType:'none'}})` → `webContents.print` non-silent |
| Setelah cetak halaman tetap terbuka (F7) | busy reset, sukses silent, error `alert(err.message)`; tanpa auto-close |
| Multi-page chip + chevron (F8) | `Halaman {activePage} / {totalPages}` + ChevronLeft/Right hanya bila `totalPages>1`; active page dari scroll offset (tanpa IntersectionObserver); template WO-1 tidak diubah |
| `←`/Tutup → `navigate(-1)` (F9) | tombol Tutup & panah browser |
| Navigasi setelah create (F10) | `BorrowingsPage` `navigate(receiptPreviewPath(result.id))`; kotak hijau legacy tetap |
| 3 channel IPC (preview/print/pdf) | `printing:borrowCardPreview`, `printing:borrowCard`, `printing:borrowCardPdf` di IPC/preload/env.d.ts; grep bundle ter-render |
| BorrowCardService (engine) TIDAK diubah | `prisma migrate diff` no-drift; grep: `borrow-card.service.ts` tanpa diff pada WO-2 |
| Smoke sesuai spesifikasi | 21/21 (lihat §3) |

## 3. Smoke Result — 21/21 PASS (fresh DB)
STEP 1 seed (1) · STEP 2 preview HTML 1 halaman (8) · STEP 3 multi-page 20 buku → 3 sheet + 20 baris + judul relasi + LANJUTAN (5) · STEP 4 PDF filename (6) · STEP 5 404 AppError (1).

## 4. Regression — 178 PASS (fresh DB)
`borrow_card_wo1` 101/101 · `it1_borrow_return` 34/34 · `it_borrow_eligibility` 7/7 · `wo14_e2` 36/36.

## 5. Quality Gate
| Gate | Hasil |
|------|-------|
| Smoke WO-2 | **PASS** 21/21 |
| Regression borrow | **PASS** 178/178 |
| `npm run lint` | **PASS** |
| `npm run build` | **PASS** — main 1,837.03 kB · preload 9.34 kB · renderer 1,059.12 kB |
| `prisma migrate diff` | **No difference detected** |
| Grep bundle (main) | `printing:borrowCardPreview`=1 · `printing:borrowCard`=3 · `printing:borrowCardPdf`=1 |
| Grep bundle (renderer) | `receipt-preview`=3 · `Pratinjau Kartu Peminjaman`=1 · `Fit Width`=1 · `Halaman`=6 |

## 6. Deviation Check
**TIDAK ADA penyimpangan** dari FINAL PREVIEW DESIGN DECISION. Tidak ada perubahan `BorrowCardService`/`BorrowService`/Repository/schema/migration; `print.service.ts` hanya menambah metode baru (non-breaking); fitur PDF filename di-generate di main (F5), bukan renderer.
