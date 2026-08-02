# Production Fix Plan — Member Import

**Work Order:** 7 (P7)
**Source of Truth:** `PRODUCTION_READINESS_AUDIT_MEMBER_IMPORT.md` (status: NOT READY)
**Mode:** READ ONLY — tidak ada perubahan kode, tidak ada implementasi, tidak ada commit.
**Tujuan:** Untuk setiap temuan yang menyebabkan status NOT READY → Severity, Root Cause, Impact, Risk, Recommended Fix, dan keputusan wajib-atau-tech-debt. Diakhiri tabel ringkasan + Final Recommendation.

---

## Findings yang menyebabkan NOT READY

### F-1: Transaction timeout default Prisma 5 detik (audit TD-2 / B-3)

1. **Severity:** HIGH
2. **Root Cause:** `src/main/repositories/base/transaction.ts:7` memanggil `prisma.$transaction(fn)` tanpa opsi `{ timeout }`. Prisma interactive transaction memakai default **5 detik**; impor besar (createMany chunked + allocation reads di dalam satu tx) dapat melampauinya.
3. **Impact:** `P2028 (Transaction already closed / timed out)` → bukan P2002 → di-throw sebagai system error → seluruh file import gagal, user harus mengulang dari awal. Non-deterministik: bekerja di dataset kecil, gagal di dataset besar/disk lambat.
4. **Risk:** Muncul hanya di produksi dengan data real (bukan di smoke kecil) → paling berbahaya karena sulit direproduksi di pengembangan. Pada skala khas sekolah (ratusan–ribuan siswa) probabilitas rendah, tetapi tidak ada ruang aman (headroom).
5. **Recommended Fix:** Konfigurasi eksplisit di `runTransaction`: `prisma.$transaction(fn, { maxWait: 5_000, timeout: 60_000 })` (nilai disesuaikan dataset). Verifikasi dengan smoke skala 1.000/5.000 baris + timing. Beri fallback pesan system error yang jelas bila tetap timeout.
6. **Wajib sebelum release:** **YA — Release Blocker.** Satu baris konfigurasi, low-risk, menghilangkan mode kegagalan non-deterministik.

---

### F-2: Tanpa cap ukuran file pada jalur import anggota (audit TD-5 / B-5)

1. **Severity:** MEDIUM
2. **Root Cause:** `MemberImportDialog.handleFileChange` memanggil `memberExcelParserService.parse(file)` langsung; `IMPORT_CONFIG.maxFileSize` (5 MB) dan validasi extension hanya dipakai jalur import buku, tidak di jalur anggota.
3. **Impact:** File xlsx raksasa (mis. 50–100 MB) atau korup yang di-drop → `read-excel-file` memuat seluruh isi ke memori renderer → freeze/hang; potensi crash renderer.
4. **Risk:** DoS berbasis file lokal (membekukan UI), UX buruk. Bukan risiko data tetapi risiko ketersediaan aplikasi.
5. **Recommended Fix:** Reuse pola jalur buku (`validateImportFile`): cek extension + ukuran sebelum parse di `handleFileChange`, tampilkan pesan error jelas (`IMP-003`/`IMP-004`), jangan pernah lolos ke parser. Tambahkan smoke unit untuk ukuran melebihi batas.
6. **Wajib sebelum release:** **YA — Release Blocker.** Fix kecil dan murah; menutup satu-satunya celah praktis audit security.

---

### F-3: Nilai NISN/email tidak di-trim sebelum disimpan (audit TD-4 / B-2)

1. **Severity:** MEDIUM
2. **Root Cause:** `toMemberImportRows` di `MemberImportDialog.tsx` memetakan sel dengan `String()` polos (tanpa trim); backend `buildPayload` menyimpan `row.nisn`/`row.email` mentah. Normalisasi (`normalizeNisn`/`normalizeEmail`) hanya dipakai untuk lookup, bukan untuk nilai yang dipersistenkan.
3. **Impact:** NISN `"12345 "` (trailing space) tersimpan apa adanya. Import berikutnya dengan NISN `"12345"` tidak terdeteksi duplicate (lookup `nisn IN ('12345')` case/char-exact, tidak cocok) dan tidak memicu `@unique` (string berbeda) → NISN kembar lintas file lolos. Inti jaminan "NISN unik" jebol.
4. **Risk:** Data-quality drift yang sulit dibersihkan setelah tersimpan (perlu backfill). Terjadi realistis lewat copy-paste dari spreadsheet.
5. **Recommended Fix:** Trim semua field teks di satu titik kebenaran (paling aman: backend `buildPayload` — trim `fullName/className/nisn/email`); seragamkan normalisasi email (lowercase+trim) antara renderer dan backend. Tambahkan smoke: NISN/email dengan spasi harus terdeteksi duplicate.
6. **Wajib sebelum release:** **YA — Release Blocker.** Perbaikan murah (trim boundary), melindungi integritas data inti.

---

### F-4: Progress bar non-monoton & terpaku 0% selama fase tulis (audit TD-1 / B-4)

1. **Severity:** MEDIUM (UX)
2. **Root Cause:** DTO memancarkan persentase **per-fase** (0 lalu N di tiap fase), `writePhase` memiliki parameter `_onProgress` yang TIDAK dipakai, dan stage `saving` di DTO tidak pernah dipancarkan backend. Renderer setia menggambar persen DTO (sesuai aturan "tidak menghitung ulang").
3. **Impact:** Bar naik-turun (`checking-duplicate` → 0/100%, `resolving-class` → 0/100%, `generating-number` → 0%, tulis tanpa emisi → 100% di `completed`). Selama fase tulis (terpanjang) bar terpaku "Generating Member Number · 0/N"; pada gagal preflight, bar menampilkan 100% lalu status gagal.
4. **Risk:** Persepsi aplikasi hang → user membatalkan/keluar di tengah tulis. Tidak ada risiko data (transaksi tetap benar).
5. **Recommended Fix:** (a) Emisikan stage `saving` dari `writePhase` dengan `current`/`total` (per chunk tulis); (b) gunakan persentase kumulatif berbasis stage atau render bar stage-driven agar monoton naik. Backend mengirim persen final; renderer tetap tidak menghitung ulang.
6. **Wajib sebelum release:** **TIDAK wajib — boleh Technical Debt** (fungsi tetap benar, murni persepsi). Direkomendasikan segera karena murah dan menyentuh UX inti; jika dijadikan debt, dokumentasikan di backlog dan tandai di rilis.

---

## Temuan lain (bukan penyebab NOT READY — bisa Technical Debt)

| ID | Temuan | Severity | Rekomendasi |
|----|--------|----------|-------------|
| B-1 | Email tidak `@unique` + lookup case-sensitive → duplikat email bisa lolos | MEDIUM | Kebijakan: putuskan email sebagai kunci atau bukan. Jika ya → `@unique` (hati-hati migrasi data eksisting) + normalisasi lowercase tersimpan. Boleh Tech Debt — tidak diblokir |
| B-6 | Nomor anggota rusak > 999.999/prefix (urutan lexicographic) | LOW | Tidak realistis untuk sekolah. Tech Debt; dokumentasikan batas |
| B-7 | Pesan system error ber-prefiks `Error invoking remote method...` | LOW | Renderer strip prefiks / tampilkan pesan bersih. Tech Debt |
| B-8 | Parsing tanggal teks ambigu (DD/MM vs MM/DD) | LOW | Tentukan format template eksplisit + validasi ketat. Tech Debt |
| B-9 | NISN numerik kehilangan leading zero (Excel) | LOW | Edukasi template (format teks). Tech Debt |
| B-10 | Status baris DUPLICATE menang atas error kelas (keterangan tetap lengkap) | LOW | Tech Debt |
| TD-6 | Preflight dijalankan 2× (preview + import) | LOW | Optimasi opsional. Tech Debt |
| TD-7 | Konsep `warnings` vestigial (selalu 0) | LOW | Tech Debt |
| P7-scope | Smoke skala besar (100/500/1.000/5.000, boundary chunk, timing) belum dieksekusi | — | **Validasi, bukan code fix** — jalankan sebelum rilis untuk memverifikasi F-1 |

---

## Tabel Ringkasan

| No | Issue | Severity | Release Blocker | Technical Debt |
|----|-------|----------|-----------------|----------------|
| 1 | F-1 Transaction timeout default 5 s (`base/transaction.ts`) | High | **YA** | Tidak — wajib fix |
| 2 | F-2 Tanpa cap ukuran file jalur anggota | Medium | **YA** | Tidak — wajib fix |
| 3 | F-3 NISN/email tidak di-trim → duplikat lolos | Medium | **YA** | Tidak — wajib fix |
| 4 | F-4 Progress non-monoton / terpaku saat tulis | Medium | Tidak | **Boleh** (rekomendasi: fix segera) |
| 5 | B-1 Kebijakan email uniqueness + case | Medium | Tidak | **Ya** |
| 6 | B-6 Batas numbering 999.999/prefix | Low | Tidak | **Ya** |
| 7 | B-7 Pesan system error ber-prefiks | Low | Tidak | **Ya** |
| 8 | B-8 Ambigu format tanggal | Low | Tidak | **Ya** |
| 9 | B-9 Leading zero NISN (Excel) | Low | Tidak | **Ya** |
| 10 | B-10 Prioritas status baris | Low | Tidak | **Ya** |
| 11 | TD-6 Preflight ganda | Low | Tidak | **Ya** |
| 12 | TD-7 `warnings` vestigial | Low | Tidak | **Ya** |
| 13 | Smoke skala besar (P7 validasi) | — | **YA (validasi)** | Tidak — jalankan sebelum rilis |

---

## Final Recommendation

### Pilihan: NOT READY

**Alasan rinci:**

1. **Tiga release blocker nyata belum diimplementasikan** — F-1 (transaction timeout), F-2 (cap ukuran file), F-3 (trim NISN/email). Ketiganya ber-*severity* High/Medium, mempengaruhi **keandalan** (kegagalan non-deterministik), **ketersediaan** (freeze renderer), dan **integritas data** (duplikat NISN lolos) — tiga dari empat pilar produksi. Status saat ini tidak dapat disebut READY selama tiga gap ini terbuka.

2. **Percabangan keputusan (menjawab pilihan lain):**
   - **READY** → tidak tepat: tiga blocker masih ada di kode.
   - **READY WITH TECHNICAL DEBT** → tidak tepat untuk F-1/F-2/F-3: F-1 menghapus headroom kegagalan, F-2 menutup celah ketersediaan, F-3 menjaga jaminan unik NISN yang menjadi fitur inti. Ketiganya terlalu murah (masing-masing low-risk, perbaikan kecil) untuk dibawa sebagai debt.

3. **Jalan menuju READY itu murah dan jelas** — semua fix bersifat lokal dan non-arsitektural:
   - F-1: satu opsi konfigurasi di `runTransaction` + smoke skala.
   - F-2: reuse `validateImportFile` (pola jalur buku) sebelum parse.
   - F-3: trim di boundary backend + normalisasi email seragam + smoke.
   - Setelah tiga fix + smoke skala (P7 validasi) PASS → status naik ke **READY WITH TECHNICAL DEBT** (sisa: F-4 progress boleh debt, B-1..TD-7 sebagai debt tercatat).

4. **Tanpa risiko lebih lanjut:** audit tidak menemukan korupsi data, race berbahaya, atau kebocoran resource pada alur inti; seluruh temuan lain ber-*severity* Low dan aman dijadikan Technical Debt tercatat di backlog.

**Keputusan menunggu Product Owner.** Tidak ada perubahan kode, tidak ada Work Order implementasi yang dibuat.
