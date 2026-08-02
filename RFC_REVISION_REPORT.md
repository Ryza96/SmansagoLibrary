# RFC_REVISION_REPORT — WORK ORDER 5

**Fitur:** Member Import Database — RFC Revision
**Role:** Project Engineer
**Mode:** READ ONLY — tidak ada perubahan kode
**Status:** RFC v2 selesai direvisi — menunggu approval Product Owner
**Tanggal:** 02-08-2026
**Artefak direvisi:** `MEMBER_IMPORT_DATABASE_RFC.md`

---

## 1. Daftar Perubahan

| # | Revisi PO | Perubahan di RFC |
|---|-----------|------------------|
| R1 | Duplicate Detection — Tahap 1 **dan** Tahap 2 wajib selalu dijalankan | §0 #2 dipertegas (Tahap 2 tidak pernah dilewati); §5.3 langkah 2 diubah dari "hanya bila Tahap 1 tidak punya blocker" menjadi "SELALU dijalankan"; ditambahkan langkah 6 (trade-off jumlah query tetap aman & ter-chunk); diagram lifecycle §3 diberi catatan "(SELALU dijalankan, lihat §5.3)"; tabel performa §13 diberi keterangan "selalu dijalankan (keputusan PO #2)". |
| R2 | Progress menampilkan jumlah data yang telah diproses | §9.2 diberi pernyataan wajib + contoh UI (`Checking Duplicate 347 / 5000`, `Resolving Class 912 / 5000`, `Saving Database 2500 / 5000`); komentar `current` pada `MemberImportProgressEvent` diperjelas = jumlah BARIS terproses nyata (bukan sekadar 0/N); §9.3 tabel diperbarui dengan definisi `current` per stage (`saving` = kumulatif per chunk; `checking-duplicate` = bertambah per batch) + catatan "UI WAJIB menampilkan angka current/total". |
| R3 | Class Resolver — error memuat nama kelas yang gagal dicari | §6.1 ditambah aturan + contoh pesan (`Baris 18: Kelas "XI Merdeka 1" tidak ditemukan.`); §6.2 & §6.3 keterangan `classNotFound`/`classAmbiguous` ditambah "(error memuat nama kelas / className input)"; §11 tabel & prinsip #5 diperbarui. |
| R4 | Import Result DTO — tambah field `totalRows` | §10.3 `MemberImportResultDTO` ditambah `totalRows` + catatan semantik; §0 #8 diperbarui; kode `import()` §4 ditambah `totalRows` di ketiga titik return; diagram lifecycle §3 hasil DTO ditambah `totalRows`; kriteria penerimaan §16 diperbarui. |
| R5 | Number Generator — keputusan eksplisit: alokasi yang ROLLBACK tidak dianggap terpakai | §0 #12 baru; catatan §0 (baris baru); §4 ditambah bullet semantik nomor + rollback; §7.1 ditambah bullet "Semantik rollback"; §7.2 ditambah contoh numerik (alokasi `S-000001..S-000100` batal saat chunk ke-2 gagal → tidak ada yang terpakai, percobaan berikutnya mengulang dari `S-000001`). |
| R6 | Implementation Rule — setiap fasa P1–P7 harus selesai → lint PASS → build PASS → review PO → approval sebelum lanjut | §0 #13 baru; §16.1 baru berisi aturan gate 6 langkah + larangan mengerjakan beberapa fasa sekaligus; P6/P7 di tabel §16 diperbarui menyesuaikan R2–R4; §17 Status ditulis ulang menjadi RFC v2. |

## 2. Section yang Diperbarui

| Section | Ringkasan perubahan |
|---------|---------------------|
| Header (baris status) | Status → **RFC v2 (revisi WO-5) — menunggu approval Product Owner**. |
| §0 Ringkasan Keputusan PO | Row #2 dipertegas; row #8 ditambah `totalRows`; **row baru #11 (progress count), #12 (nomor setelah rollback), #13 (implementasi bertahap)**; catatan revisi terhadap SPEC ditambah keputusan #12. |
| §1 Executive Summary | Prinsip #5: progress menampilkan `current / total` + hasil berisi `totalRows/...`. |
| §3 Import Lifecycle | Diagram: catatan "[2] Dup DB (SELALU dijalankan)"; hasil DTO + `totalRows`. |
| §4 Transaction Design | `import()` ditambah `totalRows` (3 return); bullet semantik nomor anggota + rollback (PO #12). |
| §5 Duplicate Detection | §5.3 langkah 2 diubah → Tahap 2 selalu dijalankan; tambah langkah 6 (dampak query). |
| §6 Class Resolution | §6.1 aturan error memuat nama kelas + contoh; §6.2/§6.3 keterangan `className`. |
| §7 Member Number Allocation | §7.1 + §7.2 semantik rollback & contoh numerik (PO #12). |
| §9 Progress Flow | §9.2 pernyataan wajib + contoh `347/5000`; §9.3 definisi `current` per stage + catatan UI. |
| §10 DTO Design | §10.3 `MemberImportResultDTO` + `totalRows` + catatan semantik. |
| §11 Error Design | Tabel `classNotFound`/`classAmbiguous` + nama kelas; prinsip #5 baru. |
| §13 Performance Strategy | Baris Tahap 2 duplicate diberi keterangan "selalu dijalankan". |
| §16 Implementation WBS | **§16.1 baru** (aturan gate P1–P7); tabel P6/P7 diperbarui; kriteria penerimaan diperbarui (progress count + totalRows). |
| §17 Status | Ditulis ulang: daftar 6 revisi terintegrasi; RFC v2 menunggu approval; tanpa approval tidak ada implementasi/WO/commit. |

## 3. Dampak terhadap Implementasi

| Aspek | Dampak |
|-------|--------|
| **MemberDuplicateChecker (P3)** | Tidak ada branch "skip Tahap 2 bila Tahap 1 punya blocker". Tahap 1 + Tahap 2 selalu dieksekusi; hasil digabung. Query DB pada preview bertambah (tetap ter-chunk, aman untuk 5.000 baris). |
| **MemberClassResolver (P3)** | Error `classNotFound`/`classAmbiguous` harus membawa **`className` asli** (normalized) sebagai bagian detail issue — struktur `MatchingIssue` perlu menampung konteks pesan (bukan hanya `{ rowNumber, messageKey }`), atau label UI memformat dari data ekstra. |
| **MemberImportService (P4)** | DTO `MemberImportResultDTO` wajib memuat `totalRows` (selalu = jumlah input, terlepas `success`). Alokasi nomor ada di dalam SATU transaksi; tidak ada pemisahan "alokasi terlanjur" yang bertahan setelah rollback — logika `max suffix` sudah konsisten dengan semantik COMMIT-only. |
| **Progress event (P4)** | `current` bukan lagi 0/N statis per stage: `checking-duplicate` menaikkan `current` per batch yang diperiksa; `resolving-class` per baris (update berkala); `saving` per chunk kumulatif. Service perlu mengirim beberapa event per stage. |
| **UI (P6)** | Harus menampilkan label stage + angka `current / total` (contoh `Checking Duplicate 347 / 5000`), bukan hanya spinner + label. Hasil menampilkan `totalRows` di samping `created/failed`. |
| **Alur kerja implementasi** | **Gate per fasa** (§16.1): P1 selesai → lint → build → review PO → approval → baru P2. **TIDAK boleh** implementasi beberapa fasa sekaligus. Tiap fasa menghasilkan laporan untuk review PO. |
| **Smoke test (P7)** | Tambahan skenario: (a) Tahap 2 tetap jalan walau Tahap 1 punya blocker — hasil preview memuat issue gabungan; (b) rollback P2002 → nomor yang batal tidak terpakai (percobaan berikutnya mengulang dari `max+1` yang sama); (c) error kelas memuat nama kelas; (d) `totalRows` benar pada sukses & gagal. |

## 4. Ketidakberubahan (tetap)

- **Keputusan desain yang TIDAK berubah:** all-or-nothing (§0 #1), aturan duplikat NISN/Email/Nama+TL (§0 #3), max suffix + allocation batch (§0 #4), no auto-create class (§0 #5), chunk write/lookup dalam satu transaksi (§0 #6), 6 stage progress (§0 #7), recovery (§0 #9), out of scope (§0 #10).
- **Tidak ada perubahan schema, migration, dependency, route, menu, atau halaman baru.**
- **Tidak ada kode yang diubah** — hanya dokumen RFC.

## 5. Status

**RFC v2 selesai direvisi sesuai 6 instruksi WO-5.** Mode READ ONLY dipertahankan.

**Berhenti — tidak membuat Work Order, tidak implementasi, tidak commit. Menunggu approval Product Owner.**
