# WO-1 BORROW CARD — IMPLEMENTATION REPORT

## 1. Ringkasan
Implementasi **Borrow Card Engine** (Template & Data Contract) sebagai **single source of truth** untuk Preview / Cetak / PDF (D2). WO berdiri sendiri **tanpa wiring**: tidak ada perubahan IPC/preload/bootstrap/env.d.ts/UI/repository/schema.

Source of truth: `BORROW_RECEIPT_DESIGN_AMENDMENT.md` (FINAL DESIGN DECISION) + `BORROW_RECEIPT_DISCOVERY_REPORT.md` + `BORROW_RECEIPT_ARCHITECTURE.md` + `BORROW_RECEIPT_WIREFRAME.md`.

## 2. File Baru / Diubah
| File | Jenis | Isi |
|------|-------|-----|
| `src/shared/config/borrow-status.ts` | **baru** | Config leaf node `BORROW_STATUS` (code/label/className): ACTIVE→AKTIF/badge-active, RETURNED→DIKEMBALIKAN/badge-returned, OVERDUE→TERLAMBAT/badge-overdue; `isBorrowStatusCode`; `borrowStatusConfig(code)` fallback label-raw + badge-neutral; `deriveBorrowStatus(returnDate, dueDate, now)` pure (D9) |
| `src/shared/dto/borrow-card.ts` | **baru** | Kontrak data `BorrowCardData` = header/member/borrow/books[]/footer; seluruh string sudah diformat di assembler, template hanya merender (D5) |
| `src/main/services/borrow-card.service.ts` | **baru** | **Engine**: layout 110×60mm, `escapeHtml`, `initialsOf`, `generateAvatarPlaceholderSvg` (D6), `generateLogoMonogramSvg` + `generateBookIconSvg` (D13), `paginateBorrowCard`/`generateBorrowCardPages` (D10/R4), template tunggal `generateBorrowCardHtml` (D2/D4), assembler `buildBorrowCardData` (D5) |
| `src/main/services/barcode.service.ts` | **modifikasi** | `+generateQrCodeSvg(value)` bcid `qrcode` via `bwip-js` (D8) |
| `borrow_card_wo1_smoke/smoke.ts` | **baru** | Smoke murni 101 kasus (tanpa DB/Electron) |

## 3. Keputusan Desain yang Diimplementasikan
| ID | Implementasi |
|----|--------------|
| D2 | Satu template `generateBorrowCardHtml(data)`; Preview/Print/PDF (WO-2..4) akan memanggil fungsi yang sama |
| D3 | Template pure `data→HTML`, tanpa Electron API/DB; `escapeHtml` utk semua nilai user-visible |
| D4 | `@page { size: 110mm 60mm; margin: 0 }`; `.borrow-card` 110mm × 60mm fixed |
| D5 | `buildBorrowCardData(borrowing, settings, deps)` menyiapkan logo data URI, QR svg, status, tanggal DD-MM-YYYY — template tidak membaca DB |
| D6 | Foto anggota **tidak ada di DB** (diverifikasi schema) → avatar placeholder **inisial inline SVG** |
| D7 | QR payload = **`borrowing.id`** (UUID) |
| D8 | `generateQrCodeSvg(value)` = `bwip-js` bcid `qrcode`, scale 4, tanpa text, padding 4 (viewBox 264×264) |
| D9 | Badge via config `BORROW_STATUS`; derivasi pure `deriveBorrowStatus()` (returnDate set → RETURNED; dueDate lewat → OVERDUE; else ACTIVE) |
| D10 | **Auto pagination multi-page**: halaman 1 = kartu utama, halaman 2+ = kartu lanjutan header ringkas + footer diulang; seluruh buku tampil, **tanpa "+N lainnya"** |
| D13 | Logo `logoPath` data URI → jika kosong/gagal baca: **monogram SVG** (inisial schoolName/libraryName) → jika keduanya kosong: **ikon buku SVG** bawaan |
| R4 | Halaman lanjutan diberi label **"LANJUTAN"** + no. pinjam pada header ringkas |

### Kapasitas baris buku (deterministik, tanpa overflow)
`booksZoneCapacity`: halaman 1 = `floor((60−6−42)/3.4)` = **3 baris**; halaman lanjutan = `floor((60−6−18)/3.4)` = **10 baris**. Distribusi: 1–3 buku → 1 kartu; 4–13 → 2 kartu; 14+ → 3+ kartu (14 = 3+10+1, 20 = 3+10+7). Kapasitas melebihi `MAX_BOOKS=20`.

## 4. Arsitektur — Separasi DATA vs TEMPLATE
```
BorrowCardSourceBorrowing (hasil repo read-only)
        │  buildBorrowCardData(borrowing, settings, deps)   ← assembler murni
        ▼
   BorrowCardData (dto/borrow-card.ts)                       ← kontrak antar-lapisan
        │  generateBorrowCardHtml(data) / Pages(data)        ← template TUNGGAL pure
        ▼
   HTML 110×60mm (siap dipakai Preview / print / printToPDF)
```
- **Assembler** menangani: lookup `memberTypeLabel` (Siswa/Guru/Umum), fallback snapshot `memberName`/`memberNumber`/`bookTitle` bila relasi kosong, format tanggal, derivasi status, QR svg, logo data URI (dependency-injected `readFileAsDataUri` → testable).
- **Template** hanya merender `BorrowCardData`; tidak memanggil service/repo/DB apa pun.

## 5. Scope Discipline (TIDAK Diubah)
`BorrowService.create`/Repository borrow, schema/migration (`prisma migrate diff` = empty), return flow, channel print legacy, IPC/preload/bootstrap/env.d.ts, dependency baru, UI. Grep: `generateBorrowCardHtml`/`buildBorrowCardData` tidak di-import di `electron/` maupun `src/pages/` (bukti WO berdiri sendiri).

## 6. Validation
| Gate | Hasil |
|------|-------|
| Smoke `borrow_card_wo1_smoke` | **101/101 PASS** (config, inisial, SVG helper, pagination 0/1/3/4/13/14/20, HTML 1-buku, HTML 20-buku 3 kartu tanpa "+N lainnya", avatar/logo fallback, QR, 4 status badge, escape HTML, assembler 24 kasus) |
| Regression borrow (fresh DB) | `it1_borrow_return` 34/34 · `it_borrow_eligibility` 7/7 · `wo14_e2` 36/36 = **77 PASS** |
| `npm run lint` | **PASS** (tsc node + web) |
| `npm run build` | **PASS** — main 1,819.55 kB · preload 9.02 kB · renderer 1,044.75 kB (**identik baseline IT-1** → bukti tanpa wiring) |
| `prisma migrate diff` | **No difference detected** (schema tidak disentuh) |

## 7. Catatan Teknis
- Smoke di-compile dengan `--module node16 --moduleResolution node16` (bukan `node`) karena `bwip-js` memakai conditional exports; dijalankan dengan `NODE_PATH=<repo>\node_modules` karena output di temp di luar repo.
- Compile smoke: `npx tsc --module node16 --target es2022 --moduleResolution node16 --esModuleInterop --skipLibCheck --rootDir . --outDir <tmp>\out borrow_card_wo1_smoke/smoke.ts`.
- Bug smoke yang diperbaiki saat run pertama: (1) objek `member` pada fixture assembler kurang `memberNumber` (TS2339 saat compile); (2) STEP 5 mengecek `'Laskar Pelangi'` padahal `books(1)` menghasilkan `'Buku Ke-1'`. Keduanya murni kesalahan fixture smoke, bukan source.
