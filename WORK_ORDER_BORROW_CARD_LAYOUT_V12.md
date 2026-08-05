# WORK ORDER — BORROW CARD LAYOUT REFINEMENT v1.2

## Ringkasan
- Penyempurnaan visual kartu peminjaman 110×60mm di atas engine v1.1 (sudah release).
- **Tanpa** mengubah ukuran kartu, ukuran PDF, print pipeline, Preview, QR Code, header, logo, identitas anggota, business logic, DTO, Repository, Service.
- 3 perubahan visual kecil (keputusan PO) di `src/main/services/borrow-card.service.ts` (SATU file source).

## Perubahan v1.2
| # | Perubahan | Sebelum | Sesudah |
|---|-----------|---------|---------|
| 1 | Ukuran judul buku | 8pt | **7.5pt** (tetap > identitas 6.5pt → judul tetap dominan) |
| 2 | Posisi inventory number | rata tepi kanan (`justify-content: space-between`) | **mengikuti judul, jarak proporsional ~8mm** (flex `gap: 3mm` + inv `margin-left: 5mm`, baris tanpa space-between) — revisi PO: gap keras 13mm hanya ilustrasi, yang dinilai adalah hasil visual (inv satu grup dgn judul) |
| 3 | Pemisah data anggota ↔ daftar buku | tidak ada | **garis tipis abu terang** `border-bottom: 1px solid #e2e8f0` + `margin-bottom: 1mm` |

### Detail implementasi (CSS)
- `.book-row` → `font-size: 7.5pt; line-height: 2.7mm;` + `gap: 3mm` (hapus `justify-content: space-between`)
- `.book-row .num` → `flex: 0 0 5mm` (margin-right 3mm DIHAPUS — gap flex yang memisahkan)
- `.book-row .title` → `flex: 1` → **`flex: 0 1 auto`** (tidak memenuhi sisa baris; ellipsis tetap)
- `.book-row .inv` → `margin-left: 5mm` (gap flex 3mm + margin 5mm = **~8mm total** inv mengikuti judul; bukan margin keras 13mm)
- `.body` → `height: 18mm` → **`17mm`**, tambah `margin-bottom: 1mm; border-bottom: 1px solid #e2e8f0`
- `.avatar` → `18mm` → **`17mm`** (menyesuaikan body)

### Detail implementasi (konstanta)
- `BORROW_CARD_LAYOUT.bookRowHeightMm` → `2.8` → `2.7`
- `BORROW_CARD_LAYOUT.pageOne.bodyMm` → `18` → `17`
- Header (12mm), footer (9mm), continuation (header 8 / footer 9), ukuran kartu 110×60, padding 3 TIDAK berubah.

### Kapasitas dipertahankan 5+13
- Halaman 1: `floor((54 − (12 + 17 + 9 + 0.5)) / 2.7)` = `floor(15.5 / 2.7)` = **5**
- Lanjutan: `floor((54 − (8 + 9)) / 2.7)` = `floor(37 / 2.7)` = **13**
- 20 buku → 3 kartu (5+13+2), pagination deterministik (D10) tanpa perubahan kode pagination.

## File
- **Dimodifikasi (1 source):** `src/main/services/borrow-card.service.ts`
- **Dimodifikasi (1 smoke):** `borrow_card_layout_v11_smoke/smoke.ts` (dijadikan regression suite hidup — STEP 5 CSS marker disesuaikan ke nilai v1.2)
- **Baru (2 smoke):** `borrow_card_layout_v12_smoke/smoke.ts` (structural, tanpa DB/Electron) + `borrow_card_layout_v12_smoke/geometry.cjs` (geometry bounding-box di render Electron nyata)
- **TIDAK diubah:** `src/shared/dto/borrow-card.ts`, `BorrowService`/`ReturnService`, Repository, IPC, preload, env.d.ts, schema, migration, `print.service.ts` (PDF fix), Preview/Print pipeline, renderer.

## Validation
- `npm run lint` PASS
- `npm run build` PASS (main **1,883.05 kB** ±0.01 · preload **9.95 kB identik** · renderer **1,147.66 kB identik**)
- `prisma migrate diff --from-migrations --to-schema-datamodel --script` = "This is an empty migration."
- Smoke MURNI (fresh): wo1 **104** · v11 layout **60** · v12 layout **38** = 202 PASS 0 FAIL
- Smoke DB (fresh temp DB `file:C:/.../uat/smoke.db` + `prisma migrate deploy`): uat **31** = 31 PASS 0 FAIL
- Smoke Electron (render nyata): v11 geometry **10** · v12 geometry **18** · PDF **6** = 34 PASS 0 FAIL
- **TOTAL: 267 PASS, 0 FAIL**

### Bukti geometry nyata (v12 geometry, render Electron)
- Gap `inventory → judul` = **tepat 8mm** di semua baris (`[8,8,8,8,8]`) — flex gap 3mm + margin-left 5mm
- Gap `nomor → judul` = **tepat 3mm** (flex gap)
- Judul pendek ("Buku Ke-1") → legroom kanan **65.79mm** (inv TIDAK rata tepi kartu; area sign lebih lega)
- Judul panjang → ter-ellipsis, inv tetap **8mm** setelah judul
- Pemisah border-bottom abu terang + jarak ke list **1mm**
- Kapasitas dipertahankan: 20 buku → distribusi **[5,13,2]**, tiap sheet tanpa overlap, di dalam kartu, footer clear
- QR & tanda tangan terpisah (tidak overlap); header-info di kanan atas; tanpa footer-left
- PDF: ukuran tetap **312.000×169.920pt = 110.067×59.944mm** (kontrol tanpa flag = Letter 792×612)

## Catatan Teknis (prosedur smoke)
- Compile smoke dengan `bwip-js` transitif: `npx tsc --module node16 --moduleResolution node16 --target es2022 --esModuleInterop --skipLibCheck --rootDir . --outDir <out>` + `NODE_PATH=<repo>\node_modules`
- Geometry dijalankan `electron geometry.cjs <outDir>` — outDir hasil compile DI DALAM repo (Electron abaikan NODE_PATH); `out/` di-gitignore.
- Smoke uat butuh fresh DB temp: `Remove-Item *.db*` → `prisma migrate deploy` (workdir `prisma/`) → run dengan `DATABASE_URL` absolute.

## Revisi Review PO (teknik posisi inventory number)
- Rilis awal v1.2 memakai `margin-left: 13mm` (gap keras) — **DITOLAK PO**: nilai 13mm hanyalah ilustrasi visual di keputusan, BUKAN requirement.
- Korolari PO: yang dinilai adalah **hasil visual**, bukan teknik CSS: (1) judul pendek → judul + inv tampak **satu grup informasi** (`Belajar Prisma    INV-000008`), (2) judul panjang → ellipsis bekerja, inv tetap dekat judul, (3) area kanan kartu lebih lega untuk QR + tanda tangan. Teknik apa pun boleh (flex/gap/inline-flex/margin/grid).
- **Revisi diterapkan:** `gap: 3mm` pada `.book-row` (menggantikan `margin-right` pada `.num`) + inv `margin-left: 5mm` → total **~8mm** (proporsional, bukan keras). Geometry nyata membuktikan gap inv→judul tepat 8mm, legroom 65.79mm, judul panjang tetap 8mm.

## Status
**DONE - menunggu review PO** (tidak membuka WO baru).
