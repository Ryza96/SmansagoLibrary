# GIT_RECOVERY_PLAN.md — Recovery Plan Repository APLibrary

**Mode:** READ ONLY — laporan ini TIDAK menjalankan perintah apa pun. Semua langkah di bawah adalah rencana untuk dieksekusi setelah PO approve.
**Baseline commit:** `437b50a` "release: v1.0 release candidate" (= `origin/main`, ahead/behind 0/0).
**Riwayat:** hanya 3 commit — `fb8729b` (initial Sprint 0–4), `46ff9ba` (core + hardening), `437b50a` (release candidate).
**Kondisi working tree:** 196 file tracked; 33 file tracked ter-modifikasi; 142 entri untracked (kode produksi Sprint 5–11, docs, dan file temp bercampur). HEAD sama dengan origin — seluruh kerja Sprint 5–11 **belum pernah** masuk riwayat Git dan belum ada push.

---

## 1. Current Situation

### 1.1 Ringkasan
Seluruh pekerjaan sejak Sprint 5 berada di working tree tanpa commit. `437b50a` (release candidate) TIDAK memuat fitur Import Buku, WO13 Procurement, maupun WO-8 Barcode/Label.

### 1.2 Fakta Terverifikasi
| Fakta | Nilai |
|-------|-------|
| HEAD / origin/main | `437b50a`, sinkron (0/0) |
| Total commit | 3 |
| Total file tracked | 196 |
| File tracked ter-modifikasi | 33 (925 ins / 686 del) |
| Entri untracked | 142 (kode produksi + docs + temp) |
| Migration aktif tracked | `20260731_adr002_initial` + `migration_lock.toml` |
| Migration WO13 | **UNTracked** (`20260731_wo13_procurement_fields`, `20260731_wo13_revision1_source_detail`) |
| `prisma/migrations_archive/` | 11 folder tracked (dokumentasi) |
| DB SQLite | `prisma/aplibrary.db` (di-ignore oleh `prisma/*.db`) |

### 1.3 Kelas File Untracked
| Kelas | Contoh | Jumlah | Status |
|-------|--------|--------|--------|
| Kode produksi Sprint 11 (WO-11A–J) | `src/main/services/inventory-allocator.ts`, `database-reconciliation.service.ts`, `src/pages/BookImport*.tsx`, `electron/ipc/book-import.ipc.ts`, `templates/Template_Import_Buku_v2.0.xlsx` | ±25 | WAJIB commit |
| Kode produksi Sprint 9–10 | `src/services/strategies/*`, `src/main/providers/*`, `src/main/services/auto-create.service.ts`, `book-import.service.ts`, `src/contexts/*`, `src/hooks/*`, `src/config/*` | ±40 | WAJIB commit |
| Kode WO13 / WO-8 (modifikasi tracked) | `schema.prisma`, `book-copy.service.ts`, `print.service.ts`, `barcode.service.ts`, `label.service.ts`, `BookDetail.tsx`, `InventoryDetailPage.tsx` | 33 (tracked, diubah) | WAJIB commit |
| Dokumentasi | `SPRINT4–11*.md`, `WO13_*.md`, `SPRINT9/10_*.md`, `ENVIRONMENT_AUDIT.md` | ±50 | WAJIB commit |
| File temp / UAT | `uat_wo3/`, `uat_wo11h/i/j/`, `wo11a–g/`, `scripts/smoke-match-strategies.ts`, `templates/*_v1.0*` | ±25 | TIDAK commit → `.gitignore` |

### 1.4 Isu Kritis
1. **R1 — Migration WO13 untracked.** Baseline migration tracked, 2 migration WO13 tidak. Clone fresh + `migrate deploy` akan menghasilkan schema tanpa kolom procurement.
2. **R2 — `SPRINT1/2/3_REPORT.md` ditimpa.** File tracked ini di-REWRITE (558 baris dihapus) dari isi asli "Book Domain Foundation" menjadi konten import-themed. Perlu keputusan PO (restore asli vs pertahankan baru vs ganti nama).
3. **R3 — Temp bercampur produksi.** `uat_wo*/`, `wo11*/`, template v1 belum di-ignore → risiko ter-stage tidak sengaja.
4. **R4 — File shared multi-WO.** `labels.ts`, `env.d.ts`, `repositories/*`, `BookDetail.tsx` membawa perubahan beberapa fitur sekaligus → pemisahan per-WO murni tidak praktis tanpa `git add -p`.

---

## 2. Recovery Objectives

1. Seluruh kerja produksi (Sprint 5–11) masuk riwayat Git secara aman dan terurut.
2. Repo bersih: `git status` kosong setelah commit terakhir, file temp tidak ikut.
3. Clone fresh dapat `migrate deploy` sukses (migration WO13 ikut tercommit) + build + lint PASS.
4. Tidak ada data yang hilang — backup snapshot dibuat sebelum manipulasi apa pun.
5. Riwayat tetap dapat dipulihkan ke `437b50a` kapan pun (origin tidak tersentuh sampai akhir).

---

## 3. Recovery Steps

Urutan dirancang berdasarkan ketergantungan: schema → fitur → dokumentasi → housekeeping → verifikasi → push. **Semua langkah di bawah adalah rencana; tidak dijalankan saat ini.**

### STEP 0 — Backup Snapshot (JALANKAN PALING PERTAMA)
- **Tujuan:** Jaring pengaman jika langkah berikutnya salah; memastikan tidak ada data hilang (karena working tree adalah satu-satunya tempat kerja Sprint 5–11).
- **Risiko:** Hampir nihil. Hanya risiko penyimpanan; pastikan backup di luar repo (mis. `C:\Users\hp\AppData\Local\Temp\opencode\aplibrary_backup_20260801\`).
- **Output:** Salinan penuh working tree (kecuali `node_modules/`, `out/`, `dist/`, `release/`, `prisma/*.db*`).
- **Verifikasi:** file `.zip` terbuka dan berisi `src/main/services/inventory-allocator.ts`.

### STEP 1 — Perbaiki `.gitignore` Sebelum Menyentuh Apa pun
- **Tujuan:** Menghilangkan file temp dari pandangan `git status` agar tidak ter-stage tidak sengaja.
- **Risiko:** Pola terlalu luas bisa mengecualikan file produksi (verifikasi dengan `git status` setelahnya).
- **Output:** `.gitignore` ditambah:
  ```gitignore
  uat_wo*/
  wo11*/
  templates/Template_Import_Buku_v1.0.xlsx
  templates/Template_Import_Buku_v1.0_screenshot.png
  templates/Template_Import_Buku_v2.0_screenshot.png
  prisma/*.db-wal
  prisma/*.db-shm
  ```
- **Verifikasi:** `git status` — entri `uat_wo3/`, `wo11a/` dst. hilang; entri produksi tetap ada. **Belum commit** (ikut di Step 8).

### STEP 2 — Resolusi `SPRINT1/2/3_REPORT.md` (DECISION POINT D1)
- **Tujuan:** Memutuskan nasib 3 file tracked yang isinya ditimpa.
- **Risiko:** Salah memilih → isi asli hilang permanen atau konten baru tertimpa.
- **Opsi:**
  - **D1-A (Direkomendasikan):** `git restore SPRINT1_REPORT.md SPRINT2_REPORT.md SPRINT3_REPORT.md` untuk memulihkan isi asli, karena konten baru (import UI/reader/validation) sudah didokumentasikan terpisah di file untracked `SPRINT2_1_REPORT.md`, `SPRINT3_TEMPLATE_SPEC.md`, `SPRINT3_WO1_TEMPLATE_IMPLEMENTATION_REPORT.md`, `SPRINT1`-related.
  - **D1-B:** Pertahankan isi baru; commit sebagai dokumen baru (perlu rename agar tidak menimpa makna "Book Domain Foundation").
  - **D1-C:** Gabungkan — restore asli, salin konten baru ke file bernama jelas.
- **Output:** 3 file kembali ke status bersih (A) atau berubah sesuai keputusan (B/C).

### STEP 3 — Commit Schema + Migrations (Pertama Kali)
- **Tujuan:** Mengunci baseline + migration WO13 ke riwayat sehingga clone fresh berfungsi.
- **Risiko:** Jika lupa `20260731_wo13_revision1_source_detail` → fresh deploy schema mismatch (R1).
- **Output:** Commit `feat(db): procurement fields BookCopy (WO13)` berisi `prisma/schema.prisma` + 2 folder migration WO13. Verifikasi: fresh DB `prisma migrate deploy` PASS (urutan baseline→WO13→R1 benar).
- **Catatan:** JANGAN commit `migrations_archive/` (sudah tracked, tidak perlu disentuh).

### STEP 4 — Commit WO13 Procurement (fitur)
- **Tujuan:** Fitur procurement sebagai commit mandiri.
- **Risiko:** File shared (`book-copy.service.ts`, `BookDetail.tsx`, `labels.ts`, `env.d.ts`) juga membawa perubahan WO-8/barcode → lihat DECISION POINT D2 di Step 6.
- **Output:** Commit `feat: procurement fields UI + service (WO13)`.

### STEP 5 — Commit WO-8 Barcode/Label + dependency
- **Tujuan:** Fitur barcode/label + `bwip-js`/`read-excel-file` masuk riwayat.
- **Risiko:** `package.json`/`package-lock.json` bersama dependency import → jika dipisah, lock bisa tidak konsisten (lihat D2).
- **Output:** Commit `feat: barcode Code128 + label cetak (WO-8)`.

### STEP 6 — Commit Import Pipeline (Sprint 9–10 + Sprint 11 WO-11A–J)
- **Tujuan:** Seluruh fitur import buku (engine, matching, validation, provider, strategi, UI, IPC, preload, template v2, allocator, reconciliation, summary) masuk riwayat sebagai satu fitur besar.
- **Risiko:** Banyak file; 1 WO = 1 commit tidak realistis untuk file shared multi-WO (R4).
- **DECISION POINT D2 — Struktur commit fitur import:**
  - **D2-A (Direkomendasikan):** Satu commit agregat `feat: buku import pipeline + summary + reconciliation (Sprint 9–11)` untuk seluruh file import + shared. Realistis, aman, riwayat bersih; trade-off: granularitas per-WO hilang.
  - **D2-B:** Pemisahan per-WO dengan `git add -p` untuk memilah hunk shared — presisi tinggi, tapi rawan kesalahan (hunk salah kena) dan sangat lama.
- **Output:** Commit `feat: buku import (Sprint 9–11)` berisi ±65 file.

### STEP 7 — Commit Dokumentasi
- **Tujuan:** History kerja Sprint 4–11 (reports, RFC, audit, WO13) tersimpan di Git.
- **Risiko:** Banyak file; jika commit buta tanpa daftar, file temp bisa ikut (sudah dicegah Step 1).
- **Output:** Commit `docs: laporan Sprint 4–11, RFC, audit, WO13`.
- **Verifikasi:** `git status` — hanya menyisakan `AGENTS.md`, `.gitignore`, dan file housekeeping.

### STEP 8 — Commit Housekeeping (`AGENTS.md` + `.gitignore`)
- **Tujuan:** Menutup recovery — seluruh working tree bersih.
- **Risiko:** Kecil.
- **Output:** Commit `chore: AGENTS.md session context + .gitignore UAT/temp`.

### STEP 9 — Verifikasi Akhir (sebelum push)
- **Tujuan:** Buktikan repo bersih + fresh-clone work.
- **Risiko:** Jika verifikasi gagal, JANGAN push (lanjut ke Step 10).
- **Output:**
  1. `git status` → **nothing to commit, working tree clean**.
  2. Clone fresh ke folder temp → `npm ci` → `npx prisma migrate deploy` PASS → `npm run lint` PASS → `npm run build` PASS → smoke jalur import (template v2 tersedia) PASS.
  3. `git log --oneline` — commit baru berurutan rapi di atas `437b50a`.

### STEP 10 — Push ke `origin/main`
- **Tujuan:** Menyinkronkan riwayat ke remote (satu-satunya langkah yang menyentuh origin).
- **Risiko:** Push setelah verifikasi minim risiko; pastikan tidak ada orang lain yang push (repo single-dev).
- **Output:** `git push origin main` → origin/main = HEAD baru.

---

## 4. Decision Points

| ID | Pertanyaan | Opsi | Rekomendasi |
|----|-----------|------|-------------|
| **D1** | Nasib `SPRINT1/2/3_REPORT.md` yang ditimpa | A: restore asli; B: pertahankan baru; C: gabung | **A** — konten baru sudah ada di file untracked terpisah |
| **D2** | Struktur commit fitur import | A: 1 commit agregat; B: `git add -p` per-WO | **A** — file shared multi-WO membuat B tidak praktis |
| **D3** | `scripts/smoke-match-strategies.ts` | commit sebagai script dev; atau hapus | **Hapus / ignore** — smoke legacy yang tidak terpakai |
| **D4** | Screenshot template v2 | simpan di `docs/`; atau ignore | Simpan di `docs/` bila PO ingin artifact review dihistorykan |

---

## 5. Rollback Strategy

Karena belum ada satu pun commit baru, titik aman absolut adalah `437b50a` (origin).

| Situasi | Tindakan Rollback |
|---------|-------------------|
| Commit baru salah (belum push) | `git reset --soft HEAD~N` untuk membatalkan commit tanpa menyentuh working tree, lalu perbaiki staging. |
| Working tree rusak/terhapus | Pulihkan dari backup Step 0; alternatif `git checkout -- .` hanya memulihkan tracked (KURANGI — untracked hilang tanpa backup). |
| Push salah ke origin | `git reset --hard 437b50a` + `git push --force` HANYA jika diyakinkan tidak ada kolaborator lain (repo single-dev). |
| Recovery ingin diulang dari awal | `git reset --hard 437b50a` (working tree kembali baseline) — **harus** setelah backup, karena seluruh kerja Sprint 5–11 hanya ada di working tree. |

**Aturan emas:** Jangan pernah `git reset --hard` / `git clean` sebelum backup Step 0 selesai dan terverifikasi. Jangan push sebelum verifikasi Step 9.

---

## 6. Final Recommendation

**Urutan eksekusi paling aman:**

1. **Backup** working tree (Step 0) — non-negosiable.
2. **`.gitignore`** dulu (Step 1), lalu **resolusi SPRINT1/2/3** (D1-A, Step 2).
3. Commit berurutan: **Schema+migrations** → **WO13** → **WO-8+barcode/label** → **Import (squash, D2-A)** → **Docs** → **Housekeeping**.
4. **Verifikasi fresh-clone** (migrate deploy + lint + build + smoke) sebelum push.
5. **Push** terakhir.

Rasional: schema/migration paling pertama karena R1 (fresh-clone gagal tanpa migration WO13); temp di-ignore paling awal (R3) untuk mencegah polusi; verifikasi sebelum push (Step 9) memastikan release berikutnya benar-benar memuat fitur (menghindari insiden artifact basi seperti WO-2 Investigation sebelumnya).

**Hasil akhir yang diharapkan:** 6–8 commit baru di atas `437b50a`, `git status` bersih, fresh-clone buildable, dan seluruh kerja Sprint 5–11 akhirnya tersimpan permanen di riwayat Git.

---

## Lampiran — Inventori Kunci (untuk pengecekan silang saat eksekusi)

- **Sprint 11 baru:** `src/main/services/inventory-allocator.ts`, `database-reconciliation.service.ts`, `templates/Template_Import_Buku_v2.0.xlsx`.
- **Import engine (Sprint 9–11):** `src/services/{MatchingEngineService,ValidationEngineService,WorkbookReaderService,HeaderNormalizerService,MatchProviders,DummyMatchProviders,DummyMatchStrategies}.ts`, `src/services/strategies/*`, `src/main/providers/*`, `src/main/strategies/index.ts`, `src/config/*`, `src/contexts/*`, `src/hooks/*`, `src/shared/match-*.ts`, `src/types/import.ts`.
- **Import wiring:** `electron/ipc/book-import.ipc.ts`, `electron/preload/book-import.preload.ts`, `src/pages/BookImportPage.tsx`, `BookImportPreviewPage.tsx`, `src/components/books/FileUploadDropzone.tsx`, `src/utils/bookImport.ts`.
- **Shared (multi-WO, ikut commit import/WO13/WO-8):** `src/utils/labels.ts`, `src/renderer/env.d.ts`, `src/main/repositories/{book,book-copy,author,category,publisher}.repository.ts`, `src/components/books/BookDetail.tsx`.
- **Temp (jangan commit):** `uat_wo3/`, `uat_wo11h/`, `uat_wo11i/`, `uat_wo11j/`, `wo11a/`…`wo11g/`, `scripts/smoke-match-strategies.ts`, `templates/Template_Import_Buku_v1.0.xlsx` + screenshot.
- **Docs (±50):** `SPRINT4–11*.md`, `SPRINT9_*.md`, `SPRINT10_*.md`, `WO13_*.md`, `ENVIRONMENT_AUDIT.md`, `PRODUCTION_READINESS_AUDIT_SPRINT8.md`, `REACT_RENDER_TREE_AUDIT.md`, `RELEASE_ARTIFACT_AUDIT.md`.
