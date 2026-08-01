# SPRINT8_EXECUTION_PROTOCOL

**Status:** DRAFT — menunggu persetujuan Product Owner. Dokumen aturan resmi implementasi Sprint 8.
**Baseline:** `SPRINT8_IMPLEMENTATION_PLAN.md` (DISETUJUI) → RFC Revision 2.
**Isi dokumen ini:** aturan. **Bukan** implementasi, bukan coding, bukan commit.

---

## 1. Architecture Gate

Setiap Work Order **WAJIB BERHENTI** setelah selesai. **TIDAK BOLEH otomatis lanjut** ke WO berikutnya.

Urutan wajib untuk setiap WO:

```
Implementasi
      ↓
Self Review
      ↓
Implementation Report
      ↓
Menunggu persetujuan Product Owner
      ↓
Baru boleh lanjut ke WO berikutnya
```

- Tidak ada pengecualian, termasuk WO yang "kecil" atau "pasti benar".
- WO berikutnya hanya boleh dimulai setelah PO memberikan persetujuan eksplisit atas Implementation Report WO berjalan.
- Jika PO menolak/meminta revisi: kerjakan perbaikan pada WO yang sama, perbarui report, ajukan lagi. Lanjut tetap menunggu.

---

## 2. Architecture Checklist

Setiap WO wajib menjawab **semua** pertanyaan berikut (jawaban "Ya" adalah syarat selesai, kecuali kolom yang memang N/A):

| # | Pertanyaan | Wajib |
|---|---|---|
| 1 | Repository tetap SSOT (single source of truth data)? | Ya |
| 2 | Provider bebas business logic (tidak ada keputusan pencarian/ranking di provider)? | Ya |
| 3 | Engine tetap tidak mengenal Repository maupun Prisma? | Ya |
| 4 | Tidak ada `mode`? | Ya |
| 5 | Tidak ada `searchMode`? | Ya |
| 6 | Tidak ada `switch(mode)` / enum mode? | Ya |
| 7 | Build PASS? | Ya |
| 8 | Lint PASS? | Ya |
| 9 | Rollback tervalidasi (metode revert per WO sudah ditentukan & diuji)? | Ya |
| 10 | Semua dependency (WO prasyarat) terpenuhi? | Ya |

Checklist ini dilampirkan di dalam setiap Implementation Report (bagian "Architecture Checklist").

---

## 3. Implementation Report

Setiap WO **wajib** menghasilkan report dengan format standar berikut (tidak boleh ada field yang dihilangkan; bila kosong tulis `-` / `N/A`):

| Field | Isi |
|---|---|
| **WO** | Nomor WO (contoh: WO-3) |
| **Status** | `DONE` / `REJECTED` / `NEEDS_REVISION` |
| **Files Changed** | Daftar file yang dimodifikasi |
| **New Files** | Daftar file baru |
| **Deleted Files** | Daftar file yang dihapus |
| **Public API Changed** | Perubahan kontrak publik (interface/SPI/output) yang berdampak konsumen lain |
| **Behavior Changed** | Perubahan perilaku yang disengaja, lengkap dengan alasan (rujuk plan/RFC) |
| **Lint** | `PASS` / `FAIL` (+ output ringkas bila FAIL) |
| **Build** | `PASS` / `FAIL` (+ output ringkas bila FAIL) |
| **Tests** | Test yang dijalankan + hasil (jumlah PASS/FAIL) |
| **Rollback** | Metode rollback yang dipakai + hasil validasi revert |
| **Technical Debt** | Utang teknis yang sengaja diterima (tidak diperbaiki di WO ini) |
| **Deviation** | Penyimpangan dari `SPRINT8_IMPLEMENTATION_PLAN.md` (jika ada, dengan alasan) |
| **Known Issues** | Masalah yang diketahui tapi di luar scope WO ini |

Lampiran wajib: **Architecture Checklist** (§2) dengan jawaban per item.

---

## 4. Minimal File Changes

- Gunakan **perubahan seminimal mungkin**.
- **Jangan mengubah file yang tidak diperlukan** untuk WO tersebut.
- Setiap file yang diubah harus tercantum di plan WO dan di report. File di luar daftar plan = deviation, wajib dijelaskan.
- Sebelum mulai & setelah selesai, jalankan `git status` untuk membuktikan tidak ada perubahan liar di luar scope.
- Selama Sprint 8, jangan menyentuh perubahan yang sudah ada di working tree (WO-BR-99 staged, WO13) kecuali diminta.

---

## 5. No Scope Creep

- Jika menemukan ide/perbaikan/refactor baru **di luar scope WO berjalan**: **JANGAN diimplementasikan**.
- Catat ke salah satu:
  - **Technical Debt** — bagian dalam Implementation Report WO berjalan; atau
  - **Future Work** — bagian dalam laporan sprint/plan; atau
  - **New Work Order** — diusulkan ke PO sebagai WO terpisah.
- Penemuan ide tidak pernah boleh menggagalkan Architecture Gate; report tetap dikirim apa adanya, ide dicantumkan sebagai usulan terpisah.

---

## 6. Compatibility Rule

- Jika interface (SPI/DTO/output) berubah:
  - **Gunakan compatibility layer** agar consumer lama tetap berjalan selama migrasi.
  - API lama **baru boleh dihapus setelah SEMUA consumer selesai dimigrasikan** ke API baru.
- Contoh berlaku di Sprint 8: method transisi `findMatches(value)` pada provider (WO-3) dipertahankan sampai Engine (satu-satunya consumer) dimigrasikan di WO-5.
- Pelanggaran aturan ini = WO belum selesai.

---

## 7. Build Rule

- **Setiap akhir WO**, dua perintah **WAJIB** dijalankan dan harus **PASS**:
  ```
  npm run lint
  npm run build
  ```
- Jika salah satu gagal → WO dinyatakan **BELUM selesai** (tidak boleh mengirim report dengan Status `DONE`).
- Hasil lint/build dicatat di report (§3).

---

## 8. Rollback Rule

- Setiap WO **harus dapat di-revert secara independen** dari WO lain.
- Karena aturan commit adalah 1 WO = 1 commit, rollback dilakukan dengan **revert commit WO tersebut** (bukan per file).
- Rollback harus **tidak memengaruhi** hasil WO lain (tidak ada coupling antar WO dalam satu commit).
- Metode rollback setiap WO dicantumkan di report dan **divalidasi** (dijalankan, bukan sekadar direncanakan).

---

## 9. Commit Rule

```
Satu Work Order = Satu Commit
```

- **TIDAK BOLEH** mencampur beberapa WO dalam satu commit.
- Commit dibuat **setelah** WO disetujui PO (bukan sebelum report diterima).
- Isi commit **hanya** file milik WO tersebut; file lain (termasuk WO-BR-99/WO13 yang sedang staged) tidak ikut.
- Pesan commit mengikuti gaya repo dan menyebutkan nomor WO.

---

## 10. Definition of Complete Sprint

Sprint 8 dinyatakan **SELESAI** hanya jika **SEMUA** kondisi berikut terpenuhi:

| # | Kondisi |
|---|---|
| 1 | Semua WO (WO-1 s.d. WO-8) selesai |
| 2 | Semua Build PASS (setiap akhir WO + build final) |
| 3 | Semua Lint PASS |
| 4 | Semua Smoke Test PASS (WO-7) |
| 5 | Semua Regression PASS (WO-8, termasuk suite Sprint 6/7/8) |
| 6 | Semua Review PASS (setiap WO melewati Architecture Gate & disetujui PO) |
| 7 | Tidak ada Critical Issue yang terbuka |

Jika satu saja kondisi tidak terpenuhi, sprint **belum selesai**.

---

*Setelah dokumen ini selesai: BERHENTI. Tidak ada kode, tidak ada commit, tidak ada prompt implementasi. Menunggu persetujuan Product Owner.*
