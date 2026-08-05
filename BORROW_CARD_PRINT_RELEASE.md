# BORROW_CARD_PRINT_RELEASE.md

**WO:** BORROW CARD PRINT PIPELINE FIX — default paper size cetak 110×60mm
**Status:** RELEASED
**Tanggal:** 2026-08-05

---

## 1. Deliverable

### 1.1 File source diubah (1)

| File | Perubahan |
|------|-----------|
| `electron/main/services/print.service.ts` | `printBorrowCard()` kini meneruskan `pageSize: { width: BORROW_CARD_LAYOUT.pageWidthMm * 1000, height: BORROW_CARD_LAYOUT.pageHeightMm * 1000 }` (= `{ width: 110000, height: 60000 }` mikron) ke `printHtml` → `webContents.print`. Import +`BORROW_CARD_LAYOUT`. |

### 1.2 File smoke baru (1)

`borrow_card_print_fix_smoke/main.cjs` — Electron smoke yang menjalankan jalur cetak asli dengan `webContents.print` di-intercept (menangkap opsi tanpa dialog). **11/11 PASS.**

### 1.3 Laporan

`WORK_ORDER_BORROW_CARD_PRINT_FIX.md` · `BORROW_CARD_PRINT_FINAL_REVIEW.md` · `BORROW_CARD_PRINT_RELEASE.md` · AGENTS.md diperbarui.

## 2. Validation Matrix

| Gate | Hasil |
|------|-------|
| `npm run lint` | PASS |
| `npm run build` | PASS — main 1,883.46 kB (+0.41) · preload 9.95 kB identik · renderer 1,147.66 kB identik |
| `prisma migrate diff --from-migrations` | "This is an empty migration." |
| Smoke WO (Electron, intercept) | **11/11 PASS** (`PRINT_PAGE_SIZE=110000x60000`, `PDF_PAGE_SIZE=312.000x169.920`) |
| Regression | WO-1 104 · v11 60 · v12 38 · UAT 31 · pdf_fix 6 · geometry v11/v12 PASS → **250 + 2, 0 FAIL** |

## 3. Konten Rilis

- **Print** kartu peminjaman kini memakai **default paper size 110×60mm** (dialog printer menampilkan ukuran tersebut).
- **Preview** tidak berubah (template asli `@page 110mm 60mm`).
- **PDF** tidak berubah (110×60mm, `preferCSSPageSize`).
- **Jalur lain tidak terpengaruh** (label buku & bukti legacy tetap A4).

## 4. Catatan Operasional

- Untuk kualitas cetak, rekomendasikan printer label/kartu 110×60mm (thermal) atau printer dengan custom paper; hasil fisik bergantung driver printer (keterbatasan perangkat, bukan software).
- Struktur `borrow_card_print_fix_smoke/out/` adalah hasil compile (gitignored, pola `out/`); hanya `main.cjs` yang di-commit.

## 5. Status

**RELEASED.** BERHENTI — tidak membuka WO baru.
