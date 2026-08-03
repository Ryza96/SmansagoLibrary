# WO12 — UAT REPORT (T-A User Acceptance Test Milestone A)

- **Mode:** READ ONLY / AUDIT ONLY
- **Date:** 2026-08-03
- **Environment:** commit `ac3ba89`, fresh DB (4 migrations), build `out/`

## 1. Test Matrix per Fitur

### 1.1 Academic Year
| Skenario | Metode | Hasil |
|---|---|---|
| CRUD create | smoke wo4/wo5/wo11 | **PASS** |
| CRUD update (nama/tanggal) | wo11 STEP 10 | **PASS** |
| CRUD delete (tanpa kelas) | wo11 (guard) + wo5 | **PASS** |
| Activate (Buka Tahun → tahun lama nonaktif) | wo11 STEP 3/5/14 (via `activate`) | **PASS** |
| Deactivate (Tutup) | wo11 STEP 15 (multi-aktif defensif) | **PASS** |
| Exclusive Active (≤1 aktif) | wo4 STEP 1-3, wo11 STEP 1-17 | **PASS** |
| Exactly-One Active (tidak pernah 0/>1) | wo11 STEP 4/7 (tolak sole-active), count==1 tiap langkah | **PASS** |
| Duplicate name | wo11 STEP 11/16 | **PASS** |
| Delete Guard (dipakai kelas) | service `countByAcademicYear` | **PASS** (400) |
| **Edit toggle aktif (UI lama)** | wo5 UAT 3 | **REGRESI** — kini ditolak (K3); tidak ada jalur UI baru → **gap T1** |

### 1.2 Curriculum
| Skenario | Metode | Hasil |
|---|---|---|
| CRUD create/update/delete | wo6 UAT 1/3/5 | **PASS** |
| Duplicate name guard | wo6 UAT 2 | **PASS** |
| Delete Guard (dipakai kelas) | wo6 UAT 4 | **PASS** (400) |

### 1.3 Class
| Skenario | Metode | Hasil |
|---|---|---|
| CRUD create/update/delete | wo7/wo8 | **PASS** |
| Duplicate komposit guard | wo7 UAT 4, wo8 UAT 6 | **PASS** |
| Immutable educationLevel/parallel | wo7 UAT 5/6, wo8 UAT 5 | **PASS** |
| Normalisasi level (" xi "→XI, IX ditolak) | wo7 UAT 2/3 | **PASS** |
| Delete Guard (beranggota) | wo7/wo8 UAT 7 | **PASS** (400) |

### 1.4 Class Clone
| Skenario | Metode | Hasil |
|---|---|---|
| Clone (copy curriculum/level/parallel) | wo9 UAT 1 | **PASS** (3 dibuat) |
| homeroomTeacher null, isActive true | wo9 UAT 2 | **PASS** |
| Duplicate Skip | wo9 UAT 4 | **PASS** |
| Idempotent (run ulang created=0) | wo9 UAT 3 | **PASS** |
| Source ≠ Target | wo9 UAT 5 | **PASS** (400) |
| Tahun tidak ditemukan | wo9 UAT 6 | **PASS** (400) |

## 2. E2E Flow (alur produksi Milestone A)
**Buat Tahun → Buat Kurikulum → Buat Kelas → Clone ke Tahun Baru → Guard transisi**

1. `academicYears.create` tahun 2024/2025 nonaktif → OK.
2. `academicYears.create` 2025/2026 + aktif → **2024/2025 otomatis nonaktif** (exclusive guard) → count aktif = 1. **PASS**
3. `curricula.create` ×1-2 → OK; duplikat ditolak. **PASS**
4. `classes.create` (level X/XI/XII, paralel) → duplikat komposit ditolak; edit level/paralel ditolak. **PASS**
5. `classes.cloneToYear(2024/2025 → 2025/2026)` → created N, run ulang created=0, skipped=N; source=target ditolak. **PASS**
6. `academicYears.activate(2025/2026)` → 2024/2025 nonaktif, count = 1; `deactivate` sole-active ditolak; `update(isActive)` ditolak (K3). **PASS (backend)**
7. **UI**: langkah 1-5 reachable via form Master Data. **Langkah 6 "activate" TIDAK reachable dari UI** (T1) → satu-satunya cara aktif via UI = centang "Aktif" saat **create**.

## 3. Regression
| Item | Hasil |
|---|---|
| Menu lama (Buku, Anggota, Peminjaman, dll.) ter-render & ter-wire | **PASS** (bundle, wiring) |
| `npm run lint` | **PASS** |
| `npm run build` | **PASS** |
| Smoke wo1/2/3 (foundation) | **PASS** (46/35/28) |
| Smoke wo6/7/8/9/11 (features) | **PASS** (10/16/16/26/40) |
| Smoke wo4/5 | **STALE** (lihat Temuan) |

## 4. Temuan & Severity
| ID | Severity | Deskripsi |
|---|---|---|
| T1 | **HIGH** | **"Buka Tahun" tidak dapat dilakukan dari UI.** `activate`/`deactivate` tidak ada di preload/env.d.ts/UI (K4 menunda), sementara jalur lama (toggle saat edit) ditolak service (K3). Konsekuensi: (a) alur RFC §7 "buat tahun nonaktif → clone → buka" terputus di langkah "buka"; (b) bila operator membuat semua tahun nonaktif (default form), `findActive()` = null → member import memetakan seluruh baris ke `classNotFound` dan tidak ada cara membuka tahun via UI. |
| T2 | LOW–MEDIUM | Smoke wo4 & wo5 stale (menguji kontrak pre-K3 `update(isActive)`). Perlu diupdate ke `activate`/`deactivate` atau diarsipkan. |
| T3 | INFO | Delete-guard Class masih `Member.classId` (cutover ke enrollment = WO E-2). |

## 5. Rekomendasi
1. **WO perbaikan kecil (T-A follow-up):** expose `academicYears.activate`/`.deactivate` di preload + env.d.ts, dan tambah affordance UI (tombol "Buka Tahun" di list AY, atau ganti checkbox edit dengan aksi eksplisit). Skope kecil — hanya wiring, tanpa ubah service/repo/schema.
2. **Update/arsip** wo4 & wo5 smoke ke kontrak K3.
3. Setelah itu, Milestone A siap PO Review.

## 6. Kesimpulan
- **8/10 suite smoke hijau (217 PASS); 2 stale.**
- Backend AY-1b (activate/deactivate/exactly-one/update-reject) **terbukti benar**.
- Satu gap user-facing (T1) menghalangi fitur "Buka/Tutup Tahun" reachable end-to-end dari aplikasi.
