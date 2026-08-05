# BORROW_CARD_PRINT_FINAL_REVIEW.md

**WO:** BORROW CARD PRINT PIPELINE FIX — default paper size cetak 110×60mm
**Status:** READY Final Review
**Tanggal:** 2026-08-05

---

## 1. Ringkasan Review

| Dimensi | Hasil |
|---------|-------|
| Tujuan WO | **TERPENUHI** — default paper size cetak = 110×60mm |
| Scope | Terjaga — HANYA jalur Print (`PrintService.printBorrowCard`) |
| Perubahan | 1 file source, aditif & non-breaking |
| Regression | 250 PASS + 2 geometry, 0 FAIL |
| Lint / Build / Diff | PASS / PASS / no difference |

## 2. Konfirmasi Tujuan

Sebelum WO ini, tombol **Cetak** kartu peminjaman memicu `webContents.print()` tanpa opsi `pageSize` → Chromium/default printer memakai **A4**; kartu 110×60mm tidak dicetak pada media yang benar tanpa konfigurasi manual.

Sesudah WO ini, `printBorrowCard` meneruskan `pageSize: { width: 110000, height: 60000 }` (110×60mm dalam mikron). Dialog printer kini menampilkan ukuran kertas **110×60mm sebagai default**.

**Bukti runtime (Electron smoke):** `PRINT_PAGE_SIZE=110000x60000`.

## 3. Konfirmasi Scope (Yang TIDAK disentuh)

- ✅ **Preview** — `getBorrowCardPreviewHtml` tidak berubah; HTML preview = template asli `@page 110mm 60mm`.
- ✅ **PDF** — `renderPdf` (`preferCSSPageSize: true`) tidak berubah; MediaBox tetap 312.000×169.920 pt.
- ✅ **Template kartu / Layout** — `borrow-card.service.ts` tidak dimodifikasi (import `BORROW_CARD_LAYOUT` bersifat read-only).
- ✅ **Business Logic / DTO / Repository / Service lain** — tidak disentuh.
- ✅ **Jalur label buku & bukti legacy (A4)** — `printHtml` tidak diubah; smoke membuktikan label buku TIDAK memuat `pageSize`.

## 4. Kualitas Teknis

- **SSOT dimensi kartu** — nilai mikron di-derive dari `BORROW_CARD_LAYOUT.pageWidthMm/pageHeightMm` (110×60) dikali 1000, bukan hardcode di print service. Perubahan dimensi kartu cukup 1 tempat.
- **Perubahan per-jalur, bukan global** — `pageSize` diteruskan hanya di `printBorrowCard` melalui `printOptions`; `printHtml` (helper bersama) tetap netral → tidak ada efek pada label A4 / bukti.
- **Bukti runtime via intercept** — smoke meng-intercept `webContents.print` (patch `BrowserWindow.prototype.loadURL`) sehingga opsi cetak ASLI dapat ditangkap tanpa membuka dialog printer sistem; ini memvalidasi kode produksi persis, bukan duplikat.

## 5. Risiko & Catatan

| Item | Keterangan |
|------|------------|
| **Keterbatasan printer** | `pageSize` menyetel ukuran job; hasil fisik bergantung driver/printer mendukung custom paper 110×60mm. Bila tidak, driver mem-substitute ukuran terdekat — keterbatasan perangkat, terdokumentasi di investigasi. |
| **Dialog printer** | `webContents.print` non-silent menampilkan dialog sistem; ukuran 110×60mm jadi default yang bisa diubah user — perilaku sesuai desain. |
| **UI print dialog** | Tidak bisa diuji headless (butuh runtime OS); dibuktikan via intercept opsi + code review. |

## 6. Verdict

**DONE — READY Final Review.** Implementasi sesuai investigasi yang APPROVED, scope terjaga, seluruh validasi & regression hijau.
