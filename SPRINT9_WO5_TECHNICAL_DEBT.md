# SPRINT9 — WO-5 Technical Debt Register
**Auto Create**

| ID | Item | Dampak | Rencana | Prioritas |
|----|------|--------|---------|-----------|
| TD-1 | `matchingResult.valid` masih hardcoded `true` di `MatchingEngineService` (F-3 audit) | Konsumen yang memercayai `valid` akan mengira seluruh workbook "siap impor" padahal ada baris AMBIGUOUS / create-failed. WO-5 mencatatnya di `warnings`, bukan `valid`. | WO lanjutan: hitung `valid`/`errors` dari status nyata (`NOT_FOUND` isbn diizinkan, `AMBIGUOUS` = warning/block sesuai keputusan PO) | Tinggi |
| TD-2 | Tidak ada kebijakan AMBIGUOUS yang final (skip/blokir/pilih + scoring) — F-8/R4 | WO-5 mencatat issue tapi tidak menentukan nasib baris (boleh di-import dengan field null atau diblokir). | RFC/keputusan PO; opsi scoring ditunda | Tinggi |
| TD-3 | `Category.code` di-generate dari nama (`toCategoryCode`) | Kode hasil generate bisa ambigu/berubah bila nama mirip; dua nama beda dengan slug sama → P2002 → create-failed (entity tidak dibuat, issue dicatat). | Evaluasi pola kode kategori; kemungkinan transaksi + retry unik di WO-6 | Sedang |
| TD-4 | Auto Create berjalan non-transaksional (per entity) | Kegagalan di tengah run menyisakan sebagian entity ter-create (parsial). Tidak ada batch commit/rollback seluruh run. | WO-6 (Book Import + commit transaksional) bisa membungkus; atau Auto Create versi tx | Sedang |
| TD-5 | `resolvedEntity` tidak di-set oleh engine (hanya Auto Create) | Kontrak FieldMatch dua fase: tanpa Auto Create, `resolvedEntity` undefined. Konsumen wajib melewati Auto Create. | Pertahankan opsional; dokumentasikan bahwa `imports:match` selalu mengembalikan hasil pasca Auto Create | Rendah |
| TD-6 | Multi-author satu string `"A; B"` di-create sebagai satu entity author | False-positive entity gabungan bila `contains` cocok; entity author baru berisi nama gabungan bila NOT_FOUND. Schema `Book.authorId` tunggal membatasi representasi. | Keputusan PO: pemisah `;` → multi-author perlu relasi (schema change) atau blokir multi-author di validasi | Sedang |
| TD-7 | `createFailed` hanya terpicu pada P2002 tanpa recovery | Kasus selain unique-conflict (mis. constraint lain) akan melempar keluar handler → renderer mendapat error IPC, bukan workbook dengan issue | Perluas penanganan bila kasus muncul di WO-6 | Rendah |
| TD-8 | Publisher strategy tetap "mati" di pipeline riil (F-5) — template tidak punya kolom publisher | Auto Create publisher tidak pernah aktif di template nyata; semua buku impor tanpa publisher | Keputusan PO: tambah kolom publisher ke template ATAU keluarkan strategy publisher | Sedang |

## Catatan
- Semua debt bersifat **additif/tidak merusak path produksi aktif**: output `imports:match` sekarang selalu
  pasca Auto Create (`resolvedEntity` terisi); tanpa Auto Create (tidak ada konsumen lain) perilaku lama tetap sama.
- Tidak ada file di luar scope yang diubah; verifikasi `git status` menunjukkan hanya file WO-5 + laporan.
