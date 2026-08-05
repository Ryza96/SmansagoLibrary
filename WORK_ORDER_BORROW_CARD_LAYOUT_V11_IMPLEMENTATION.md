# WORK ORDER — BORROW CARD LAYOUT v1.1 (IMPLEMENTATION)

## Ringkasan
- **WO:** Optimasi layout Kartu Peminjaman (110×60mm) agar memuat lebih banyak buku **tanpa mengubah ukuran kartu** (110×60mm), ukuran PDF, Preview, Print, QR, tanda tangan, identitas anggota, header/logo/border/style visual.
- **Source of Truth:** desain WO-1/WO-2 Borrow Card (`BORROW_RECEIPT_DESIGN_AMENDMENT.md`, `BORROW_PREVIEW_DESIGN_AMENDMENT.md`) + keputusan Product Owner untuk v1.1.
- **TIDAK diubah:** DTO (`src/shared/dto/borrow-card.ts`), Repository, Service bisnis (Borrow/Return), IPC, preload, env.d.ts, schema, migration, Preview/Print/PDF pipeline (`print.service.ts`), renderer UI.
- **Status:** DONE — READY review PO.

## Keputusan PO (v1.1)
1. **Jumlah + Status (AKTIF)** pindah ke **pojok kanan ATAS** (header-info) pada kartu utama DAN kartu lanjutan; dihapus dari footer kiri-bawah.
2. Area **footer kiri-bawah dikosongkan** → zona daftar buku bertambah (tanpa redesign global).
3. **Judul buku diperkecil** (8pt) — tetap lebih besar dari teks identitas (6.5pt) dan tetap elemen paling dominan di daftar.
4. **Spasi antar baris dikurangi** → target **5 buku nyaman di halaman 1** (sebelumnya 3) dan 13 buku di halaman lanjutan (sebelumnya 10).
5. Nomor urut di kiri, **judul rata kiri, inventory number rata kanan**.
6. QR & tanda tangan **tetap di kanan-bawah footer**, tidak berubah posisi.

## Perubahan Implementasi

### `src/main/services/borrow-card.service.ts` (SATU-SATUNYA file source)
| Elemen | Sebelum (WO-1) | Sesudah (v1.1) |
|--------|----------------|----------------|
| `BORROW_CARD_LAYOUT.bookRowHeightMm` | 3.4 | **2.8** |
| `BORROW_CARD_LAYOUT.pageOne` | header 12, body 20, footer 10 | header 12, **body 18**, **footer 9** |
| `BORROW_CARD_LAYOUT.continuation` | header 8, footer 10 | header 8, **footer 9** |
| Kapasitas halaman 1 | 3 baris | **5 baris** |
| Kapasitas lanjutan | 10 baris | **13 baris** |
| Lokasi "Jumlah: N" + badge status | footer kiri-bawah (`footer-left`) | **header-info kanan-atas** (kartu utama & lanjutan) |
| CSS `.book-row` | line-height 2.5mm + margin-bottom 0.9mm | **line-height 2.8mm, margin 0, font-size 8pt** |
| CSS `.book-row .num` / `.inv` | tanpa font-size (default 16px) | **6.5pt** (subordinat, tidak menyaingi judul) |
| CSS `.body` | height 20mm, margin-top 1mm | **height 18mm, margin-top 0** |
| CSS `.avatar` | 18×20mm | **18×18mm** (menyesuaikan body) |
| CSS `.books` / `.footer` | margin-top 1mm / height 10mm | **margin-top 0 / height 9mm, margin-top 0.5mm** |
| CSS `.qr` | tanpa margin | **margin-left: auto** (rata kanan eksplisit) |
| CSS `.header-text` | tanpa flex | **flex: 1 + overflow hidden** (header-info mendapat ruang kanan) |
| CSS `.school-name` | tanpa ellipsis | **ellipsis + nowrap** (nama sekolah panjang tak meluber) |

**Helper baru:** `headerInfoHtml(data)` — merender `<div class="header-info"><span class="qty">Jumlah: N</span><span class="badge {class}">label</span></div>`; dipanggil dari `headerHtml` untuk varian pertama maupun lanjutan. `footerHtml` menjadi QR + tanda tangan saja (elemen `footer-left` dihapus total).

### Geometri pagination (deterministik, sama antara konstanta & CSS)
- Konten kartu = 60 − 2×3 padding = 54mm.
- Halaman 1: 54 − (12 + 18 + 9 + 0.5 footer-margin) = 14.5mm → `floor(14.5/2.8)` = **5 baris**.
- Lanjutan: 54 − (8 + 9 + 0.5) = 36.5mm → `floor(36.5/2.8)` = **13 baris**.
- Maks 20 buku (MAX_BOOKS) → 5 + 13 + 2 = **3 kartu** (sebelumnya 3+10+7 juga 3, tapi kini halaman 1 & lanjutan jauh lebih isi).

## Smoke & Regression

### Smoke diperbarui
| Suite | Perubahan | Hasil |
|-------|-----------|-------|
| `borrow_card_wo1_smoke/smoke.ts` | STEP 4 pagination 5+13+2 (p4→p6, p14→p18/p19); STEP 6 label header-info + `class="badge badge-active"` ×3 + negasi `footer-left` | **104/104 PASS** |
| `borrow_card_uat_smoke/smoke.ts` | UAT #7: "Jumlah: 20 di header-info" ×3, badge ×3, `!footer-left`, distribusi 5+13+2 | **31/31 PASS** (fresh DB) |

### Smoke baru `borrow_card_layout_v11_smoke/`
- **`smoke.ts` (58/58 PASS, murni):** pagination 5+13 (5→1 kartu, 6→2, 13→2, 18→2, 19→3, 20→3 [5+13+2]); preview 1/3/5 buku → 1 kartu; struktur baris nomor→judul→inv; CSS marker 8pt/2.8mm/6.5pt/18mm/9mm/`margin-left auto`; distribusi per halaman 5+13+2; header-info/QR/tanda tangan ×3 pada 20 buku.
- **`geometry.cjs` (10/10 PASS, render nyata di Electron):** ukur bounding box aktual —
  - 5 buku di 1 kartu, **tidak overlap vertikal**, semua baris di dalam kartu, baris terakhir bottom 186.6px < footer top 188.4px (footer clear);
  - QR (34×34px) dan tanda tangan terpisah (tidak tumpang tindih), QR kanan;
  - header-info di kanan-atas (right edge 403px ≈ tepi kartu);
  - tidak ada `footer-left`;
  - 20 buku → 3 sheet, distribusi [5,13,2], tiap sheet tanpa overlap + di dalam kartu + footer clear.

### Regression PDF (ukuran kartu TIDAK berubah)
- `borrow_card_pdf_fix_smoke/main.cjs` re-run: **SMOKE_RESULT=PASS** — `renderPdf` asli → MediaBox `[0 0 312.000 169.920]` pt = **110.067 × 59.944 mm**; kontrol tanpa flag = Letter 792×612pt. Bukti perubahan layout TIDAK mengubah ukuran halaman PDF (SSOT `@page` + `.borrow-card` 110×60mm tidak disentuh).

## Validation
| Gate | Hasil |
|------|-------|
| `npm run lint` (tsc node+web) | **PASS** |
| `npm run build` | **PASS** — main **1,883.01 kB** (+0.44 dari baseline PDF-fix 1,882.57) · preload **9.95 kB identik** · renderer **1,147.66 kB identik** |
| `prisma migrate diff --from-migrations --to-schema-datamodel --script` | **"This is an empty migration."** (schema tidak disentuh) |
| Smoke wo1 104/104 · v11 58/58 · uat 31/31 · pdf 6/6 · geometry 10/10 | **PASS** |
| Grep `footer-left` di `src/` | 0 (tidak ada sisa elemen legacy) |

## Scope yang DIPERTAHANKAN (bukti non-perubahan)
- `electron/main/services/print.service.ts` **tidak disentuh** di WO ini (perbaikan `preferCSSPageSize` = WO PDF FIX sebelumnya; `buildBorrowCardHtml` memanggil `generateBorrowCardHtml` tanpa modifikasi).
- Bundle preload & renderer **byte-identik** baseline = tidak ada wiring/UI lain berubah.
- DTO `BorrowCardData` tidak berubah → kontrak IPC/Preview/Print/PDF tetap.
