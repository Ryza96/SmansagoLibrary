# BORROW CARD LAYOUT v1.1 — FINAL REVIEW

## Mandat UAT (dari keputusan PO)
| # | Mandat | Bukti |
|---|--------|-------|
| 1 | Ukuran kartu tetap **110×60mm**; PDF tetap 110×60mm | `@page { size: 110mm 60mm }` + `.borrow-card { width:110mm; height:60mm }` TIDAK diubah; PDF smoke MediaBox 312.000×169.920pt = 110.067×59.944mm PASS |
| 2 | Preview / Print / PDF tidak berubah alur | `print.service.ts` tidak disentuh; bundle main hanya +0.44 kB (template), preload & renderer byte-identik |
| 3 | QR & tanda tangan tetap kanan-bawah footer | geometry: QR 34×34px kanan, terpisah dari tanda tangan, keduanya di footer |
| 4 | Identitas anggota & header/logo/border/style visual tidak berubah | Teks identitas (Nama/No. Anggota/Jenis/Kelas), font 6.5pt, gap, logo, border 1px, radius, warna badge — semua identik baseline |
| 5 | Jumlah + Status pindah ke pojok kanan atas | `header-info` dirender di header (kartu utama + lanjutan); `footer-left` = 0 match di `src/` |
| 6 | 5 buku nyaman di halaman 1 | Kapasitas halaman 1 = 5 baris (pagination 6 → 2 halaman); geometry: 5 baris tanpa overlap, footer clear |
| 7 | Judul buku diperkecil tapi tetap dominan | `.book-row` font-size 8pt vs teks identitas 6.5pt vs nomor/inv 6.5pt; judul flex:1 + ellipsis |
| 8 | Nomor urut kiri, judul rata kiri, inv rata kanan | `book-row` = `num` (flex 0 0 5mm) + `title` (flex:1) + `inv` (flex 0 0 auto), `justify-content: space-between` |
| 9 | Tidak ada teks terpotong / overlap | geometry nyata: baris berurutan tidak overlap, semua di dalam kartu, daftar berhenti di atas footer; judul & nama sekolah pakai ellipsis+nowrap |
| 10 | Layout seimbang (tidak ada celah besar kiri-bawah) | footer hanya QR+tanda tangan kanan; daftar buku mengisi zona yang dibebaskan |

## Keputusan teknis yang diambil
- **Body 20→18mm & footer 10→9mm** — satu-satunya pengorbanan agar 5 baris × 2.8mm muat di halaman 1 tanpa mengubah padding (border frame 3mm), warna, font identitas, atau QR 9mm. Avatar (dekoratif placeholder) mengikuti body (18×18mm). **Teks identitas & tata letak kolom identitas TIDAK berubah.**
- **Pagination deterministik** dari konstanta mm yang sama dengan CSS; kapasitas dihitung `floor(54 − fixed)/2.8`, sehingga tidak ada overflow/truncation.
- **Header-info di kartu lanjutan juga** — konsisten: tiap kartu adalah dokumen sah (R4), jadi Jumlah & Status tampil di semua kartu.
- **Badge base style dipertahankan**; hanya override `.header-info .badge { margin-top: 0 }` agar rapat di kolom header-info.

## Gate
| Gate | Hasil |
|------|-------|
| lint | PASS |
| build | PASS (main 1,883.01 · preload 9.95 identik · renderer 1,147.66 identik kB) |
| migrate diff | "This is an empty migration." |
| Smoke | wo1 104 · v11 58 · uat 31 · pdf 6 · geometry 10 — total **209 PASS, 0 FAIL** |

## Rekomendasi
- **LULUS jalur utama.** Konfirmasi visual manual oleh PO pada preview/print disarankan (toast-style layout, kelegaan baris 5 buku, proporsi judul 8pt) — konsisten pola WO-2/UAT Borrow Card.
- Tidak membuka WO baru; jika PO ingin kerapatan lebih (mis. 6 buku), itu WO terpisah (bukan bagian v1.1).
