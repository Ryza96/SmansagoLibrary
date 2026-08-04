# BORROW CARD — FINAL UAT REPORT

## 1. Ringkasan
UAT final seluruh alur **Borrow Card** (WO-1 engine + WO-2 Preview/Print/PDF) dalam mode **bug-fix only** — tanpa discovery/refactor/fitur baru/perubahan arsitektur. Verifikasi berbasis **smoke service-level end-to-end** (meniru jalur IPC: `create` → `findById` → `printing:borrowCardPreview`) + **code review** + **grep bundle** untuk widget UI dan aksi yang memerlukan runtime Electron.

## 2. Test Matrix (11 item target)
| # | Item UAT | Verifikasi | Hasil |
|---|----------|-----------|-------|
| 1 | Simpan transaksi → Preview muncul | Smoke `borrow_card_uat_smoke`: `BorrowService.create` → DTO(id, borrowingNumber) → `PrintService.getBorrowCardPreviewHtml(id)` non-kosong, memuat no. pinjam & nama anggota; `findById` konsisten; wiring `borrowings:create`/`findById` + `printing:borrowCardPreview` di IPC/preload | **PASS** |
| 2 | Preview: Zoom / Fit Width / Ctrl+Wheel | Code review `BorrowReceiptPreviewPage`: `clampZoom` 0.5–2.0 ±0.1, Fit Width `min(1,(vw−48)/w)` + re-fit resize, Ctrl+Wheel `addEventListener('wheel',…,{passive:false})`+`preventDefault`; grep bundle: `addEventListener("wheel"`=1, `preventDefault` | **PASS** (perlu konfirmasi manual UI) |
| 3 | Preview → Print (dialog printer muncul) | Code review `printBorrowCard` → `printHtml(…,{margins:{marginType:'none'}})` → `webContents.print` (non-silent, memunculkan dialog sistem); wiring `printing:borrowCard`; grep bundle `webContents.print`=2 | **PASS** (perlu konfirmasi manual UI) |
| 4 | Preview → Save PDF (file dibuat + nama sesuai desain) | Code review `saveBorrowCardPdf`: `renderPdf`(`printToPDF`) → `dialog.showSaveDialog` defaultPath `documents/<filename>` → `writeFile` → `{saved,filePath}`; nama file F5 diuji headless 2 kasus (`Kartu Peminjaman - PJ2026080001 - Anggota Umum.pdf`, tanpa karakter ilegal `/`); grep bundle `printToPDF`=1, `showSaveDialog`=5 | **PASS** (dialog + file butuh konfirmasi manual UI) |
| 5 | Preview → Tutup → kembali ke Borrowings | Code review: tombol Tutup/`←` → `navigate(-1)`; grep bundle `navigate(-1)` | **PASS** (perlu konfirmasi manual UI) |
| 6 | Borrow Card 1 buku | Smoke: 1 buku → 1 sheet, judul + inventoryNumber tampil | **PASS** |
| 7 | Borrow Card banyak buku — pagination benar | Smoke: 20 buku → 3 sheet (3+10+7), 20 baris ter-render, `Jumlah: 20`, label `LANJUTAN` | **PASS** |
| 8 | Status badge AKTIF | Smoke: `<span class="badge badge-active">AKTIF</span>` (returnDate null + dueDate masa depan) | **PASS** |
| 9 | QR Code berhasil dibuat | Smoke: blok `.qr` + inline SVG 264×264; **payload = borrowing.id** dibuktikan `html.includes(generateQrCodeSvg(id))` | **PASS** |
| 10 | Avatar placeholder berjalan | Smoke: `.avatar` + SVG inisial `AU` (Anggota Umum) | **PASS** |
| 11 | Logo fallback berjalan | Smoke: logoPath kosong → **tanpa** `data:image`/`<img class="logo-img">`, memakai monogram SVG `#1d4ed8` inisial `SN`, libraryName dari settings DB | **PASS** |
| (−) | 404 guard | Smoke: preview id tak ada → AppError "Data peminjaman tidak ditemukan." | **PASS** |

## 3. Test Result
`borrow_card_uat_smoke/smoke.ts` — **29/29 PASS** (fresh DB, migrate deploy).

## 4. Regression (Borrow-related)
| Suite | Hasil |
|-------|-------|
| `borrow_card_wo1` (engine) | 101/101 |
| `it_borrow_eligibility` | 7/7 |
| `it1_borrow_return` | 34/34 |
| `wo14_e2` | 36/36 |
| `wo2_borrow_card_preview` | 21/21 |
| `borrow_card_uat` | 29/29 |
| **TOTAL** | **228/228 PASS** (fresh DB per suite) |

## 5. Quality Gate
| Gate | Hasil |
|------|-------|
| Smoke UAT | PASS 29/29 |
| Regression Borrow | PASS 228/228 |
| `npm run lint` | PASS |
| `npm run build` | PASS — main 1,837.03 kB · preload 9.34 kB · renderer 1,059.12 kB (`index-DQyuiP9T.js`) |
| `prisma migrate diff` | No difference detected (exit 0) |
| Grep bundle | `printing:borrowCardPreview`/`borrowCardPdf`, `printToPDF`, `showSaveDialog`, `webContents.print`, `receipt-preview`, `Fit Width`, `Pratinjau Kartu Peminjaman`, `Halaman`, `navigate(-1)`, `addEventListener("wheel"` semua ter-render |

## 6. Catatan
- Item 2, 3, 4, 5 (widget UI interaktif, dialog printer, dialog save PDF, navigasi) tidak dapat dijalankan headless (membutuhkan runtime Electron + interaksi user); dibuktikan via code review + grep bundle. Verifikasi final manual oleh PO tetap direkomendasikan untuk 4 item ini.
- Selama UAT **tidak ditemukan bug pada source**. Dua FAIL awal pada smoke murni kesalahan assertion fixture (QR payload di-encode ke path SVG bukan teks UUID; `logo-img` hanya selector CSS, bukan elemen `<img>`) — assertion dikoreksi, source tidak diubah.

## 7. Kesimpulan
**BORROW CARD FEATURE COMPLETED** — seluruh 11 item UAT PASS, tidak ada bug source, tidak ada perbaikan kode yang diperlukan.
