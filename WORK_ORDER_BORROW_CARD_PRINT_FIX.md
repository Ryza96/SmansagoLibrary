# WORK_ORDER_BORROW_CARD_PRINT_FIX.md

**WO:** BORROW CARD PRINT PIPELINE FIX — default paper size cetak 110×60mm
**Status:** COMPLETE — READY review PO
**Tanggal:** 2026-08-05
**Source of Truth:** `PRINT_PIPELINE_INVESTIGATION.md` (APPROVED)
**Keputusan PO:** Perbaiki PRINT PIPELINE agar default paper size cetak 110×60mm; HANYA jalur Print.

---

## 1. LATAR BELAKANG

| Jalur | Sebelum | Sesudah |
|-------|---------|---------|
| Preview | 110×60mm (benar) | 110×60mm (benar, tidak disentuh) |
| Simpan PDF | **A4** (kartu kecil di tengah) | 110×60mm — diperbaiki di WO sebelumnya (`preferCSSPageSize: true`, print.service.ts:136) |
| **Cetak** | **A4/default** (dialog printer) | **110×60mm** (WO ini) |

Gejala yang ditutup WO ini: dialog **Cetak** memakai A4/default paper, bukan 110×60mm, sehingga user harus mengatur ukuran kertas secara manual.

## 2. ROOT CAUSE

Audit `PRINT_PIPELINE_INVESTIGATION.md` menyimpulkan pola sama pada dua jalur: **parameter paper size TIDAK diteruskan ke API cetak**.

- **Simpan PDF** (`print.service.ts:136`): `printToPDF` dipanggil tanpa `preferCSSPageSize` → Chromium mengabaikan `@page { size: 110mm 60mm }`. **SUDAH DIPERBAIKI** di WO `BORROW CARD PDF FIX`.
- **Cetak** (`print.service.ts` `printHtml` → `webContents.print`): opsi `pageSize` tidak pernah diset → dialog/default printer memakai A4. **WO INI.**

`webContents.print` TIDAK memiliki `preferCSSPageSize` (hanya `printToPDF` yang punya); opsi yang tersedia = `pageSize: ('A0'..'Tabloid') | Size` (mikron). Template `@page` tidak mempengaruhi dialog cetak fisik — ukuran job ditentukan opsi `pageSize`.

## 3. IMPLEMENTASI

### 3.1 Perubahan (1 file source)

`electron/main/services/print.service.ts` — `printBorrowCard()`:

```ts
async printBorrowCard(borrowingId: string): Promise<void> {
  const html = await this.buildBorrowCardHtml(borrowingId)
  await this.printHtml(html, {
    margins: { marginType: 'none' },
    // default paper size cetak 110×60mm (mikron: 110mm=110000, 60mm=60000).
    // Nilai diambil dari BORROW_CARD_LAYOUT agar SSOT dimensi kartu tetap 1 tempat.
    pageSize: {
      width: BORROW_CARD_LAYOUT.pageWidthMm * 1000,
      height: BORROW_CARD_LAYOUT.pageHeightMm * 1000
    }
  })
}
```

- Import +`BORROW_CARD_LAYOUT` dari `borrow-card.service.ts` (read-only import, modul tidak dimodifikasi).
- Nilai mikron di-derive dari layout (`pageWidthMm 110 × 1000 = 110000`, `pageHeightMm 60 × 1000 = 60000`) — SSOT dimensi kartu tetap satu tempat.
- `printHtml` TIDAK diubah (helper bersama untuk label buku A4 & bukti legacy) — `pageSize` diteruskan per-jalur via `printOptions`.

### 3.2 TIDAK diubah (scope)

- Preview (`getBorrowCardPreviewHtml`, `BorrowReceiptPreviewPage`) — tidak disentuh.
- PDF (`renderPdf`/`saveBorrowCardPdf`/`preferCSSPageSize`) — tidak disentuh.
- Template kartu (`borrow-card.service.ts` `generateBorrowCardHtml`, `@page`) — tidak disentuh.
- Layout, Business Logic, DTO, Repository, Service selain `PrintService.printBorrowCard` — tidak disentuh.
- Jalur label buku (`printBookLabels`) & bukti pinjam/kembali (A4) — tetap tanpa `pageSize`.

## 4. VALIDATION

### 4.1 Lint & Build

| Gate | Hasil |
|------|-------|
| `npm run lint` | PASS (tsc node + web) |
| `npm run build` | PASS — main **1,883.46 kB** (+0.41) · preload **9.95 kB identik** · renderer **1,147.66 kB identik** |
| `prisma migrate diff --from-migrations` | "This is an empty migration." (no schema change) |

Preload & renderer byte-identik = bukti tidak ada wiring/perubahan UI.

### 4.2 Smoke Electron (BARU) — `borrow_card_print_fix_smoke/main.cjs` — **11/11 PASS**

Menjalankan jalur cetak ASLI (`PrintService.printBorrowCard` → `buildBorrowCardHtml` → `printHtml` → `webContents.print`) dengan `webContents.print` di-intercept (patch `BrowserWindow.prototype.loadURL` → spy `wc.print`; menangkap opsi tanpa membuka dialog).

| # | Assertion | Hasil |
|---|-----------|-------|
| 1 | `printBorrowCard` memicu `webContents.print` | PASS |
| 2 | opsi cetak berisi `margins`/`printBackground`/`pageSize` | PASS |
| 3 | **`pageSize = { width: 110000, height: 60000 }`** (mikron) | PASS |
| 4 | pageSize ≠ A4 (210000×297000) | PASS |
| 5 | `margins.marginType = 'none'` dipertahankan | PASS |
| 6 | `printBackground = true` dipertahankan | PASS |
| 7 | jalur label buku tetap memicu cetak | PASS |
| 8 | **label buku TANPA `pageSize`** (scope terbatas kartu) | PASS |
| 9 | HTML preview = template asli `@page 110mm 60mm` | PASS |
| 10 | identitas kartu ter-render di template | PASS |
| 11 | **Regression PDF tetap 110×60mm** (312.000×169.920 pt) | PASS |

`PRINT_PAGE_SIZE=110000x60000`, `PDF_PAGE_SIZE=312.000x169.920`, `SMOKE_RESULT=PASS`.

### 4.3 Regression

| Suite | Hasil |
|-------|-------|
| `borrow_card_wo1_smoke` (engine) | **104/104 PASS** |
| `borrow_card_layout_v11_smoke` (layout) | **60/60 PASS** |
| `borrow_card_layout_v12_smoke` (layout) | **38/38 PASS** |
| `borrow_card_uat_smoke` (fresh DB temp) | **31/31 PASS** |
| `borrow_card_pdf_fix_smoke` (Electron, fresh compile) | **6/6 PASS** |
| `borrow_card_layout_v11_smoke/geometry.cjs` (Electron) | PASS |
| `borrow_card_layout_v12_smoke/geometry.cjs` (Electron) | PASS |

**Total: 250 PASS eksplisit + 2 geometry, 0 FAIL.**

## 5. UAT

- **Preview tetap benar** — `getBorrowCardPreviewHtml` mengembalikan template asli `@page 110mm 60mm`; data kartu ter-render (smoke #9–10).
- **PDF tetap 110×60mm** — `renderPdf` asli: MediaBox 312.000×169.920 pt (110.067×59.944 mm), regression pdf_fix 6/6.
- **Print memakai 110×60mm** — opsi `webContents.print` memuat `pageSize: { width: 110000, height: 60000 }` (smoke #3). Dialog printer menampilkan ukuran kertas 110×60mm sebagai default.
- **Tidak ada regresi** — seluruh suite borrow card + PDF hijau.

### Keterbatasan (terdokumentasi investigasi)

Hasil fisik cetak tetap bergantung pada driver/printer yang mendukung custom paper 110×60mm (printer label/kartu, atau printer dengan custom size). Bila printer tidak mendukung, driver mem-substitute ukuran terdekat — ini keterbatasan perangkat, bukan software. `pageSize` kini menyetel ukuran job dengan benar sebagai default.

## 6. OUTPUT & STATUS

- **File source diubah (1):** `electron/main/services/print.service.ts`
- **File smoke baru (1):** `borrow_card_print_fix_smoke/main.cjs`
- **Laporan:** `WORK_ORDER_BORROW_CARD_PRINT_FIX.md` · `BORROW_CARD_PRINT_FINAL_REVIEW.md` · `BORROW_CARD_PRINT_RELEASE.md` · AGENTS.md diperbarui.

**Status: DONE — READY review PO. BERHENTI, tidak membuka WO baru.**
