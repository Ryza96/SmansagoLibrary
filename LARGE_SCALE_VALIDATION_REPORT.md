# LARGE SCALE VALIDATION — Member Import Pipeline (WO-8, COMPLETE)

- **Status:** DONE — menunggu review Product Owner (STOP, tidak lanjut WO berikutnya)
- **Mode:** VALIDATION ONLY — **tanpa perubahan kode produksi, tanpa commit.** Satu-satunya file yang ditulis adalah smoke `uat_wo8/large-scale.smoke.ts` (tooling validasi, bukan kode aplikasi).
- **Referensi:** `PRODUCTION_READINESS_FIX_PLAN.md` (F-1..F-3 fix + item P7-scope "smoke skala besar"), `MEMBER_IMPORT_SERVICE_ARCHITECTURE_RFC.md` (kontrak progress/rollback), laporan P7A/P7B/P7C (ketiga release blocker sudah ditutup).
- **Lingkungan:** fresh temp SQLite (3 migration: baseline → WO13 → R1), `$env:DATABASE_URL` override, smoke di-compile `tsc --lib "es2022,dom"` lalu dijalankan node. DB temp + `.build` dihapus setelah run.

---

## 1. Test Matrix

**115/115 PASS.** Alur valid per skala = Preview backend (`previewCheck`: valid/errorCount/warningCount) → Preview renderer (`buildPreview`: canImport + summary) → `import` → ResultDTO → DB count → Number Generator → Progress → Performance.

| Skenario | Baris | Yang diverifikasi | Hasil |
|----------|------:|-------------------|-------|
| A10 | 10 | valid, canImport, created 10, S-000010, progress lengkap | 15/15 PASS |
| B100 | 100 | valid, created 100, S-000110, progress lengkap | 15/15 PASS |
| C500 | 500 | valid, created 500, S-000610, progress lengkap (batas 1 chunk write 500) | 15/15 PASS |
| D1000 | 1000 | valid, created 1000, S-001610, progress lengkap (lintas 2 chunk write) | 15/15 PASS |
| E5000 | 5000 | valid, created 5000, S-006610, progress lengkap, import < 60 s (headroom F-1) | 15/15 PASS |
| Stress A — Duplicate acak | 500 (50 duplikat tersebar vs DB 5000001..5005000) | preview invalid, errorCount 50 `duplicateNisnInDb`, created 0, count tetap, progress berhenti di stage terakhir | 10/10 PASS |
| Stress B — Kelas tidak ditemukan | 1000 (100 × `XI Tidak Ada`) | errorCount 100 `classNotFound` + `className` terisi, created 0, count tetap | 8/8 PASS |
| Stress C — File maksimum | 0 | `File` tepat `maxFileSize` lolos; `+1` byte → `IMP-003` | 3/3 PASS |
| Stress D — Rollback | 1000 (duplikat NISN hanya dalam file) | preview lolos (valid), import `createFailed`, created 0, failed 1000, count tetap 6610, tanpa baris partial, nomor tidak terpakai | 8/8 PASS |
| Stress E — Import ulang | 5000 (NISN+email duplikat) + 100 (fresh) | 5000 `duplicateNisnInDb` + 5000 `duplicateEmailInDb`, created 0, lalu batch baru 100 sukses → S-006710, count 6710 | 10/10 PASS |
| Stabilitas akhir | — | total member == total import valid (6710 == 6710), nomor terakhir S-006710, Class Resolver utuh (classId `XI IPA 2`) | 5/5 PASS |

## 2. Performance

| Skenario | Baris | Preview | Import | Rows/detik (import) | Count setelah |
|----------|------:|--------:|-------:|--------------------:|--------------:|
| A10 | 10 | 9 ms | 27 ms | 370 | 10 |
| B100 | 100 | 5 ms | 22 ms | 4.545 | 110 |
| C500 | 500 | 10 ms | 59 ms | 8.475 | 610 |
| D1000 | 1000 | 21 ms | 120 ms | 8.333 | 1.610 |
| E5000 | 5000 | 46 ms | 486 ms | 10.288 | 6.610 |
| A-dup-acak | 500 | 25 ms | 9 ms | 55.556 | 6.610 |
| B-kelas-tdk-ada | 1000 | 16 ms | 17 ms | 58.824 | 6.610 |
| D-rollback | 1000 | 19 ms | 118 ms | 8.475 | 6.610 |
| E-reimport | 5100 | — | 230 ms | 22.174 | 6.710 |

- Skala produksi realistis (ratusan–ribuan siswa): import **1000 baris ≈ 120 ms**, **5000 baris ≈ 486 ms** → throughput meningkat hingga ±10.000 rows/detik.
- Semua jauh di bawah timeout transaksi 60 s (F-1) → **headroom ≥ 120×** bahkan pada beban terbesar yang diuji.

## 3. Stability

- Proses beruntun 5 skala valid + 5 stress tanpa reset → status DB selalu konsisten: count akhir **6710 == jumlah seluruh baris valid yang diimpor** (10+100+500+1000+5000+100).
- Nomor anggota berurutan sempurna tanpa celah pada jalur valid (S-000010 → S-006710); nomor yang dialokasikan transaksi gagal **tidak terpakai** (rollback).
- Class Resolver berfungsi pada semua skala; `classId` benar terpasang (verifikasi `XI IPA 2`).
- Import ulang seluruh dataset (5000 NISN+email sama) terdeteksi penuh dan tidak menulis apa pun; batch fresh berikutnya tetap sukses.

## 4. Memory

| Metrik | Start | End | Delta |
|--------|------:|----:|------:|
| heapUsed | 6.3 MiB | 26.2 MiB | +19.9 MiB |
| rss | 39.9 MiB | 112.8 MiB | +72.9 MiB |
| external | 1.8 MiB | 1.8 MiB | +0.0 MiB |

- Batas guard: rss end < 1 GB (terukur 112.8 MiB), heapUsed end < 800 MB (terukur 26.2 MiB). **PASS.** Tidak ada indikasi kebocoran pada proses terpanjang (5000 baris + stress).

## 5. Transaction

- **F-1 terverifikasi:** transaksi import 5000 baris (10 chunk `createMany`) selesai 486 ms tanpa P2028; timeout 60 s tidak mengubah perilaku normal, hanya menaikkan batas atas.
- **Rollback all-or-nothing (Stress D):** duplikat NISN dalam file pada baris lintas-chunk → `P2002` → seluruh transaksi ROLLBACK → `createFailed`, `failed=1000`, `created=0`, **0 baris partial** (tidak ada NISN `9000…` tersisa), dan nomor yang sudah dialokasikan **tidak dipersistenkan** (latest tetap S-006610). Sesuai kontrak RFC §3.2 (rollback, 0 write, reject promise).

## 6. Result

- **115/115 PASS** pada fresh DB. Lint + build PASS (tidak ada kode produksi berubah — bundle identik dengan P7C: out/main/index.js 1,774.56 kB; renderer index-ClA9YfRJ.js 939.58 kB).
- Dua koreksi selama validasi adalah **bug smoke, bukan bug aplikasi** (transparansi, pola sama seperti P7A):
  1. Asersi progress Stress A awalnya menuntut `completed` pada import gagal — perilaku desain P5C adalah progress **berhenti di stage terakhir** (`resolving-class`) saat preflight gagal; asersi disesuaikan dan didokumentasikan sebagai F-4.
  2. Asersi Stress E awalnya menuntut 5000 error — kenyataannya **10000 error** (5000 `duplicateNisnInDb` + 5000 `duplicateEmailInDb`) karena setiap baris menduplikasi NISN **dan** email; asersi disesuaikan (5000+5000).

## 7. Final Recommendation

### **READY WITH TECHNICAL DEBT**

**Alasan:**

1. **Ketiga release blocker P7 sudah ditutup dan terverifikasi pada skala produksi** — F-1 (timeout 60 s: 5000 baris = 486 ms, headroom ≥120×), F-2 (cap file: Stress C lolos tepat batas, ditolak di atas), F-3 (trim/lowercase: re-import 5000 NISN+email terdeteksi penuh). Sesuai jalur keputusan `PRODUCTION_READINESS_FIX_PLAN.md:108` — setelah tiga fix + smoke skala besar PASS → status naik ke **READY WITH TECHNICAL DEBT**.
2. **Stabilitas, transaksi, dan memori terbukti** di seluruh rentang 10–5000 baris + lima skenario stress: tidak ada korupsi data, tidak ada partial write, tidak ada kebocoran memori, nomor anggota konsisten, rollback all-or-nothing.
3. **Technical Debt tercatat (bukan blocker, tidak menghalangi rilis):**
   - F-4 — progress non-monoton / terpaku saat tulis & tidak emit `completed` pada kegagalan preflight (terverifikasi: progress berhenti di stage terakhir). Murni persepsi UX; data aman.
   - B-1 — email tidak `@unique` + lookup case-sensitive (duplikat email terdeteksi di jalur import, tetapi lintas jalur manual masih bisa lolos).
   - B-6/B-7/B-8/B-9/B-10, TD-6/TD-7 — severity Low, detail di fix plan.
4. **Batas yang didokumentasikan:** number generator 6-digit/prefix (≈999.999 anggota) — di luar realistis untuk sekolah; nomor gagal tidak terpakai karena rollback.

**Keputusan menunggu Product Owner.** Tidak ada perubahan kode produksi dan tidak ada commit pada WO ini.
