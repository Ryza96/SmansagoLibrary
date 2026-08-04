# BORROW CARD — BUGFIX REPORT

## 1. Status
**BORROW CARD FEATURE COMPLETED.**

UAT final (11 item) diselesaikan dalam mode **bug-fix only**. **TIDAK ditemukan bug pada source** — tidak ada perbaikan kode yang diperlukan.

## 2. Ringkasan UAT
- Smoke end-to-end baru: `borrow_card_uat_smoke/smoke.ts` — **29/29 PASS** (alur create → preview, 1 buku, 20 buku/pagination, badge AKTIF, QR payload `borrowing.id`, avatar placeholder, logo fallback, nama file PDF F5, 404 guard).
- Regression Borrow: **228/228 PASS** (WO-1 101, eligibility 7, IT-1 34, E-2 36, WO-2 21, UAT 29).
- `npm run lint` PASS · `npm run build` PASS · `prisma migrate diff` = no difference.

## 3. Temuan Awal & Koreksi Assertion (BUKAN bug source)
Dua FAIL pertama pada smoke baru dianalisis dan terbukti **kesalahan assertion fixture**, bukan cacat aplikasi:

| Temuan | Analisis | Keputusan |
|--------|----------|-----------|
| Assertion "QR payload = borrowing.id (uuid literal)" FAIL | Payload QR **di-encode ke path SVG** (`<path d="…"/>`), bukan dirender sebagai teks UUID — perilaku benar `generateQrCodeSvg(borrowing.id)` (WO-1 D7/D8). Dibuktikan `html.includes(generateQrCodeSvg(id))` = true | Koreksi assertion, source tidak diubah |
| Assertion "logo TIDAK berisi `logo-img`" FAIL | String `logo-img` yang muncul adalah **selector CSS** (`.logo-img { object-fit: contain; }`) di `<style>`, BUKAN `<img class="logo-img">` — logo fallback monogram bekerja benar (tanpa `data:image`) | Koreksi assertion (`!includes('<img class="logo-img"')`), source tidak diubah |

## 4. Perubahan pada UAT (test-only)
- `borrow_card_uat_smoke/smoke.ts` — file smoke baru (bukan perbaikan aplikasi).
- Assertion QR & logo dikoreksi agar menguji perilaku nyata.

## 5. Verifikasi Manual yang Direkomendasikan (Electron UI)
Empat item memerlukan runtime Electron + interaksi user (tidak headless): zoom/Fit Width/Ctrl+Wheel (2), dialog printer (3), dialog save PDF + file terbuat (4), navigasi kembali (5). Semua wiring diverifikasi di bundle dan kode; konfirmasi visual final oleh PO direkomendasikan.

## 6. Kesimpulan
**BORROW CARD FEATURE COMPLETED** — tidak ada bug, tidak ada perbaikan kode, tidak ada perubahan source aplikasi pada WO ini selain file smoke UAT.
