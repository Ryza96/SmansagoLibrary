# WO-2 BORROW CARD PREVIEW — IMPLEMENTATION REPORT

## 1. Ringkasan
Implementasi **Preview UI Kartu Peminjaman** sesuai `BORROW_PREVIEW_DESIGN_AMENDMENT.md` (FINAL PREVIEW DESIGN DECISION, F1–F13). Membuka alur **Buku → Peminjaman → buat sukses → Pratinjau Kartu Peminjaman** dengan toolbar zoom 50–200%, **Fit Width**, Ctrl+Wheel, navigasi multi-halaman (chip "Halaman 1 / 3"), cetak via system dialog, dan simpan PDF (dialog nama file). `BorrowCardService` (engine WO-1) dipakai apa adanya — **TIDAK diubah**.

Source of truth: `BORROW_PREVIEW_DESIGN_AMENDMENT.md` (FINAL PREVIEW DESIGN DECISION) + `BORROW_PREVIEW_DISCOVERY.md` + `BORROW_PREVIEW_WIREFRAME.md` + `BORROW_PREVIEW_ARCHITECTURE.md`.

## 2. File Baru / Diubah
| File | Jenis | Isi |
|------|-------|-----|
| `src/pages/BorrowReceiptPreviewPage.tsx` | **baru** | Halaman preview: zoom (MIN 0.5 / MAX 2.0 / step 0.1), **Fit Width** (`min(1,(viewportW−48px)/sheetW)`, re-fit saat resize), Ctrl+Wheel (`addEventListener('wheel',…,{passive:false})` + `preventDefault()` ±0.1/notch), scroll-based active page (tanpa IntersectionObserver), chip "Halaman {x} / {y}" + chevron prev/next hanya bila `totalPages>1`, tombol Cetak (system dialog, non-silent, halaman tetap terbuka), Simpan PDF, Tutup → `navigate(-1)`, error → `alert(err.message)`, `dangerouslySetInnerHTML` pada `<div class="preview-sheet">` |
| `electron/main/services/print.service.ts` | **modifikasi** | `+buildBorrowCardPdfFilename` (sanitize `/[<>:"/\\|?*\u0000-\u001f]/g` + collapse spasi + fallback `'PEMINJAMAN'`/`'Anggota'` + truncate 40); `+readFileAsDataUri` (map `IMAGE_MIME` png/jpg/jpeg/gif/svg/webp/bmp/ico); `+buildBorrowCardHtml(borrowingId)` (Promise.all findById+settings, 404 AppError "Data peminjaman tidak ditemukan.", `buildBorrowCardData(…,{readFileAsDataUri})`, `generateBorrowCardHtml`); `+getBorrowCardPreviewHtml`; `+printBorrowCard` (`printHtml(html,{margins:{marginType:'none'}})`); `+saveBorrowCardPdf` (readonly pair, `renderPdf`, `dialog.showSaveDialog` defaultPath `documents/<filename>` filter PDF, `writeFile` → `{saved,filePath}`/`{saved:false}`); private `renderPdf(html)` (hidden BrowserWindow `contextIsolation:true,nodeIntegration:false`, `printToPDF({printBackground:true})`, did-fail-load → reject) |
| `electron/ipc/print.ipc.ts` | **modifikasi** | `+printing:borrowCardPreview` → `getBorrowCardPreviewHtml`; `+printing:borrowCard` → `printBorrowCard`; `+printing:borrowCardPdf` → `saveBorrowCardPdf` |
| `electron/preload/print.preload.ts` | **modifikasi** | `+print.borrowCardPreview` / `borrowCard` / `borrowCardPdf` (PDF → `Promise<{saved:boolean; filePath?:string}>`) |
| `src/renderer/env.d.ts` | **modifikasi** | `+borrowCardPreview → Promise<string>`, `+borrowCard → Promise<void>`, `+borrowCardPdf → Promise<{saved:boolean; filePath?:string}>` |
| `src/utils/labels.ts` | **modifikasi** | `+RECEIPT_PREVIEW` block (TITLE, LOADING, NO_DATA, BORROW_NOT_FOUND, ERROR, ZOOM_OUT/IN/RESET, FIT_WIDTH, PRINT/PRINTING, SAVE_PDF/SAVING_PDF, CLOSE, PAGE, PREV_PAGE/NEXT_PAGE, PDF_SAVED, PRINT_ERROR, PDF_ERROR) |
| `src/utils/navigation.ts` | **modifikasi** | `+BORROW_RECEIPT_PREVIEW: '/borrowings/:id/receipt-preview'` + `receiptPreviewPath(id)` |
| `src/routes/index.tsx` | **modifikasi** | `+route borrowings/:id/receipt-preview` → `BorrowReceiptPreviewPage` |
| `src/pages/BorrowingsPage.tsx` | **modifikasi** | setelah `create()` sukses → `navigate(receiptPreviewPath(result.id))`; kotak hijau legacy tetap ada (F10) |
| `wo2_borrow_card_preview_smoke/smoke.ts` | **baru** | Smoke DB 21 kasus (preview HTML 1 halaman, multi-page 20 buku → 3 sheet, PDF filename 6 kasus, 404) |

## 3. Keputusan Final (F1–F13) yang Diimplementasikan
| ID | Implementasi |
|----|--------------|
| F1 | Route `/borrowings/:id/receipt-preview` — `BorrowingsPage` menavigasi setelah create sukses |
| F2 | Zoom 50–200% ±10% (step 0.1), clamp via `clampZoom`, tombol − / % / + / reset |
| F3 | Fit Width HANYA `min(1,(viewportW−48px)/sheetW)` (tidak pernah >100%), re-fit otomatis saat resize, `fitModeRef` mencegah bentrok dengan zoom manual |
| F4 | Ctrl+Wheel: `addEventListener('wheel',…,{passive:false})` + `preventDefault()` ±0.1/notch, hanya saat `e.ctrlKey` |
| F5 | Nama file PDF `Kartu Peminjaman - <borrowNumber> - <Nama Anggota>.pdf` — sanitasi karakter ilegal Windows + collapse spasi + fallback + truncate 40 (di main) |
| F6 | Cetak via system print dialog (`webContents.print` non-silent) — tanpa custom preview |
| F7 | Setelah cetak: halaman preview tetap terbuka, busy reset, sukses silent, error → alert |
| F8 | Multi-page: chip `Halaman 1 / 3` + chevron prev/next hanya bila `totalPages>1`; renderer scroll-based (tanpa IntersectionObserver); template tidak diubah |
| F9 | `←`/Tutup → `navigate(-1)` |
| F10 | `BorrowingsPage` navigasi setelah `create()` sukses; kotak hijau legacy dipertahankan |
| F11–F13 | Loading saat fetch; error 404 "Data peminjaman tidak ditemukan" + fallback label; semua string via `labels.ts` (`RECEIPT_PREVIEW.*`) — tanpa hardcode |

## 4. Arsitektur — Preview memakai engine tunggal (tidak mengubah template)
```
BorrowingsPage.create() sukses
   │ navigate(receiptPreviewPath(id))                       (F10)
   ▼
BorrowReceiptPreviewPage (renderer)
   │ print.borrowCardPreview(id)                            (IPC printing:borrowCardPreview)
   ▼
PrintService.buildBorrowCardHtml(borrowingId)               (electron/main)
   │ Promise.all(BorrowRepository.findById, SettingService.get)
   ▼
buildBorrowCardData(...) + generateBorrowCardHtml(...)      (borrow-card.service — WO-1, TIDAK diubah)
   ▼
HTML string → <div class="preview-sheet" dangerouslySetInnerHTML>
```
- **Preview / Cetak / PDF berbagi template yang sama** (`generateBorrowCardHtml`) — WO-1 engine adalah satu-satunya sumber (D2).
- PDF: `saveBorrowCardPdf` → `renderPdf` (hidden BrowserWindow `printToPDF`) → `dialog.showSaveDialog` (F5) → `writeFile`. UI hanya menerima `{saved, filePath}`.

## 5. Scope Discipline (TIDAK Diubah)
`BorrowCardService` (engine WO-1), `BorrowService`, `ReturnService`, Repository borrow, schema/migration (`prisma migrate diff` = "No difference detected"), `Setting` schema, channel print legacy (`printBookLabels`/`printHtml`), dependency baru (tidak ada), DTO borrow-card, config borrow-status. Hanya tambahan non-breaking pada `print.service.ts` (metode baru; metode lama tidak disentuh).

## 6. Validation
| Gate | Hasil |
|------|-------|
| Smoke `wo2_borrow_card_preview_smoke` | **21/21 PASS** (fresh DB: preview HTML berisi DOCTYPE/@page 110×60mm/nomor pinjam/nama anggota/no. anggota/judul buku/blok QR/1 sheet; 20 buku → 3 sheet + 20 baris ter-render + judul dari relasi + label LANJUTAN; PDF filename 6 kasus: dasar, sanitasi, collapse, truncate 40, fallback nama kosong, fallback nomor kosong; 404 AppError) |
| Regression borrow (fresh DB) | `borrow_card_wo1` 101/101 · `it1_borrow_return` 34/34 · `it_borrow_eligibility` 7/7 · `wo14_e2` 36/36 = **178 PASS** |
| `npm run lint` | **PASS** (tsc node + web) |
| `npm run build` | **PASS** — main 1,837.03 kB · preload 9.34 kB · renderer 1,059.12 kB (`index-DQyuiP9T.js`) |
| `prisma migrate diff` | **No difference detected** (schema tidak disentuh) |
| Grep bundle | main: `printing:borrowCardPreview`/`borrowCard`/`borrowCardPdf` ter-render; renderer: `receipt-preview`, `Pratinjau Kartu Peminjaman`, `Fit Width`, `Halaman` ter-render |

## 7. Catatan Teknis
- Smoke di-compile `--module node16 --moduleResolution node16` (import `bwip-js` via `print.service` → `borrow-card.service` → `barcode.service`), dijalankan dengan `DATABASE_URL` absolute `file:C:/...` + `NODE_PATH=<repo>\node_modules`; fresh DB per run (`prisma migrate deploy` workdir `prisma/`), dibersihkan setelah run.
- 1 bug fixture smoke diperbaiki saat run pertama: STEP 3 meng-assert `bookTitle` snapshot (`Buku Panjang N`) padahal template menampilkan judul **dari relasi** `bookCopy.book.title` (`Buku Panjang`). Ini perilaku template yang benar (WO-1, prioritas relasi > snapshot) — assertion diubah menjadi count 20 baris + judul relasi.
- `printBorrowCard`/`saveBorrowCardPdf` membutuhkan runtime Electron (`BrowserWindow`/`dialog`/`app`) sehingga tidak diuji headless; yang diuji adalah filename generator (murni), preview HTML (murni string), dan kontrak IPC/preload (grep bundle).
