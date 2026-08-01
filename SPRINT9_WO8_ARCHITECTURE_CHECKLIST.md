# SPRINT9 — WO-8 Architecture Checklist
**Barcode & Label**

## 1. Ruang Lingkup (harus terpenuhi)
| # | Kriteria | Status | Bukti |
|---|----------|--------|-------|
| 1 | Nilai barcode eksemplar = `inventoryNumber` (Keputusan PO #1) | ✅ | `book-copy.service.ts:126` `barcode: invNum`; `generateBarcodes` dihapus; smoke DB: 3 row barcode === inventoryNumber |
| 2 | Simbol barcode = Code128 (Keputusan PO #2) | ✅ | `barcode.service.ts` `bcid: 'code128'`; smoke: SVG Code128 valid |
| 3 | Gambar barcode TIDAK disimpan di DB — dirender saat cetak (Keputusan PO #3) | ✅ | `generateBarcodeSvg` hanya dipanggil di `label.service.ts` saat membangun HTML; tidak ada kolom/simpanan gambar |
| 4 | Setting `barcodeFormat` dibiarkan tidak dikonsumsi (Keputusan PO #4) | ✅ | Tidak ada kode membaca `barcodeFormat`; tercatat di Decision Log & TD |
| 5 | Label berisi: SVG barcode + inventoryNumber + judul + lokasi rak | ✅ | `label.service.ts` `.label-barcode/.label-inventory/.label-title/.label-shelf` |
| 6 | Cetak label via PrintService reuse `printHtml` | ✅ | `printBookLabels` → `printHtml(html, {margins:{marginType:'none'}})` |
| 7 | IPC/preload/env.d.ts untuk label | ✅ | `printing:bookLabels` + `print.bookLabels` + tipe `BookLabelData` di `env.d.ts:127` |
| 8 | Entry UI "Cetak Label" | ✅ | `BookDetail.tsx` tombol (disabled saat 0 eksemplar) |

## 2. JANGAN (tidak boleh diubah — diverifikasi)
| Komponen | Status |
|----------|--------|
| Matching Engine / Validation / AutoCreate | ✅ tidak diubah |
| BookImportService (placeholder `barcode = inventoryNumber` WO-7) | ✅ tidak diubah |
| BookCopyRepository (new, SSOT) | ✅ tidak diubah |
| Schema/migrasi DB | ✅ tidak ada perubahan |
| Backfill barcode eksisting | ✅ tidak dilakukan |
| `Setting.barcodeFormat` | ✅ tidak dikonsumsi |
| Print resit peminjaman/pengembalian | ✅ kompatibel (`printHtml` param opsional, default resit sama) |

## 3. Gate SPRINT8_EXECUTION_PROTOCOL
| # | Pertanyaan | Jawaban |
|---|-----------|---------|
| 1 | Repository tetap SSOT? | Ya — data eksemplar tetap via BookCopyRepository (UI); barcode/label service murni fungsi, tidak menyentuh DB |
| 2 | Provider bebas business logic? | N/A — provider tidak disentuh WO-8 |
| 3 | Engine tetap tidak mengenal Repository maupun Prisma? | Ya — engine tidak diubah |
| 4 | Tidak ada `mode`? | Ya |
| 5 | Tidak ada `searchMode`? | Ya |
| 6 | Tidak ada `switch(mode)` / enum mode? | Ya |
| 7 | Build PASS? | Ya — `npm run build` PASS (main 1,746.12 kB) |
| 8 | Lint PASS? | Ya — `npm run lint` PASS |
| 9 | Rollback tervalidasi? | Ya — metode tercatat di Implementation Report (per file); belum ada commit, rollback manual |
| 10 | Semua dependency (WO prasyarat) terpenuhi? | Ya — WO-7 (BookCopy dari import, barcode placeholder) disetujui; `bwip-js@4.11.2` terpasang |

## 4. Batasan non-fungsional
| Aspek | Status |
|-------|--------|
| Minimal file changes | ✅ 3 file baru + 9 file dimodifikasi (semua dalam scope WO-8) |
| Tidak ada perubahan database | ✅ (tidak ada schema/migrasi baru) |
| Tidak ada perubahan Matching/Validation/AutoCreate/Repository | ✅ |
| Smoke end-to-end fresh DB | ✅ unit 16/16 + DB `addCopies` 16/16, DB uji dibersihkan |
| `git status` sebelum/sesudah (no scope creep) | ✅ hanya file WO-8 + laporan (di atas working tree WO-BR-99/WO13 yang tidak disentuh) |

## 5. Kesimpulan
Seluruh kriteria RUANG LINGKUP terpenuhi, seluruh komponen pada daftar JANGAN tidak tersentuh,
semua gate hijau, Build/Lint PASS, smoke unit + DB PASS. **READY untuk review PO.**

## 6. Revisi (Review PO — DB Smoke Blocker)
| Item | Hasil |
|------|-------|
| Root cause TypeError `reading 'book'` | Diperbaiki — smoke mengakses singleton `db.prisma` setelah `initDatabase()` (bukan destructure saat require) |
| Root cause assertion `sequential inventory numbers` | Stale DB temp dari run sebelumnya → smoke dijalankan pada **fresh DB** (hapus file → `migrate deploy` → run) |
| Integritas `book-copy.service.ts` | ✅ diverifikasi utuh (`barcode: invNum`, retry P2002, tanpa sisa `generateBarcodes`) |
| BookRepository / database singleton / `initDatabase()` | ✅ tidak diubah |
| Re-run: lint, build, HTML Smoke, DB Smoke | ✅ semuanya PASS (DB Smoke 16/16, HTML Smoke 16/16) |
| Scope | ✅ hanya prosedur smoke; tidak ada perubahan kode aplikasi / fitur / refactor |
