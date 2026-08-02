# PRODUCTION READINESS AUDIT — MEMBER IMPORT DATABASE (WO-5)

**Fitur:** Import Anggota (SISWA) — mass import dari file Excel (.xlsx) ke database
**Role:** Project Engineer
**Mode:** READ ONLY — audit terhadap implementasi yang sudah ada; TIDAK ada perubahan kode
**Tanggal:** 02-08-2026
**Acuan:** `IMPORT_MEMBER_ARCHITECTURE_SPEC.md` (v3.0 FINAL, sudah disetujui PO) + kode implementasi saat ini

---

## 1. Executive Summary

Alur Import Anggota saat ini **berhenti di Preview** — tombol **Import** hanya menampilkan
teks placeholder *"Fitur import database akan diimplementasikan pada Work Order berikutnya"*
(`MemberImportDialog.tsx:124-126`). **Tidak ada satu baris pun yang ditulis ke database.**

Yang SUDAH ada (solid, reusable):
- Parse Excel (renderer, `MemberExcelParserService`) ✅
- Validasi baris (renderer, `MemberImportValidationService`) ✅
- Preview + duplicate-in-file NISN (renderer, `MemberPreviewService`) ✅
- Download template (`members:downloadTemplate`) ✅

Yang BELUM ada (gap utama menuju production-ready):
- IPC `members:import` + `members:previewCheck` ❌
- `MemberImportService` (orchestrator), `MemberDuplicateChecker` (DB), `MemberClassResolver` ❌
- `MemberRepository.createManyWithTx` + `findManyByNISNs` / `findManyByEmails` / `findByNameAndBirthDate` ❌
- `AcademicYearRepository.findActive()` ❌
- `NumberGeneratorService.allocateMemberNumbers(tx, …)` batch (single-create `count()+1` pun bermasalah) ❌
- Konfigurasi chunk di `IMPORT_CONFIG` (`MEMBER_IMPORT_WRITE_CHUNK`, `MEMBER_IMPORT_LOOKUP_CHUNK`) ❌

**Kesimpulan: Fitur TIDAK production-ready.** Desain lengkap sudah disetujui di
`IMPORT_MEMBER_ARCHITECTURE_SPEC.md`, tetapi **0% dari sisi database yang diimplementasikan**.
Seluruh pengerjaan database ada di depan. Audit ini memetakan risiko yang harus diselesaikan
**selama** implementasi (bukan hanya mengulang spec).

---

## 2. Current State

### 2.1 Alur end-to-end saat ini (yang BENAR-BENAR terjadi)

```
Klik "Import Siswa" (MemberListPage, memberType='student')
        ▼
MemberImportDialog (fullscreen)
  1. Upload: Download Template + pilih file .xlsx
        ▼
  2. parse (RENDERER)        → MemberExcelParserService.parse(file)
        ▼
  3. validate (RENDERER)     → MemberImportValidationService.validate(rows)
        ▼
  4. preview (RENDERER)      → MemberPreviewService.buildPreview(rows)
       · duplicate-in-file hanya NISN (bukan email / nama+tgl-lahir)
       · canImport = total>0 && valid===total && duplicate===0
        ▼
  5. Klik "Import"           → handleImport() → setImportNotice(PLACEHOLDER)
        ▼
  ★ STOP — tidak ada panggilan IPC, tidak ada tulis DB
```

**Fakta kunci (dari kode):**
| Aspek | Implementasi | File:baris |
|---|---|---|
| IPC member | Hanya `findMany/findById/create/update/delete/downloadTemplate` | `electron/ipc/member.ipc.ts` |
| Preload member | Hanya `members.*` + `memberImport.downloadTemplate` | `electron/preload/member.preload.ts` |
| Tombol Import | `handleImport` = placeholder, `disabled={!canImport}` | `MemberImportDialog.tsx:124-126, 249-260` |
| env.d.ts | Hanya `memberImport.downloadTemplate` | `src/renderer/env.d.ts:99-101` |

### 2.2 Yang sudah dibangun dengan benar (jangan diubah)

- Parser membaca **sheet[0] saja** → sheet `PETUNJUK` tidak pernah di-parse.
- Normalisasi header via `HeaderNormalizerService` (identity untuk header anggota).
- Normalisasi tanggal Excel (serial number → `Date`) dengan guard rentang.
- Validasi: kolom wajib, enum gender (L/Laki-laki/P/Perempuan), tanggal.
- Preview render ≤ 50 baris (`PREVIEW_MAX_ROWS = 50`) — guard DOM untuk 5.000 baris.
- Dialog fullscreen tanpa route baru, tanpa context/hook (sesuai keputusan PO R2).

### 2.3 Gap vs SPEC yang disetujui (IMPORT_MEMBER_ARCHITECTURE_SPEC.md)

| SPEC | Implementasi | Status |
|---|---|---|
| §13.1 `MemberImportService` (orchestrator) | tidak ada | ❌ BELUM |
| §13.2 `MemberDuplicateChecker` | tidak ada | ❌ BELUM |
| §13.3 `MemberClassResolver` | tidak ada | ❌ BELUM |
| §13.4 `allocateMemberNumbers(tx)` | tidak ada | ❌ BELUM |
| §14.1 repo `createManyWithTx` / `findManyByNISNs` / `findManyByEmails` / `findByNameAndBirthDate` | tidak ada | ❌ BELUM |
| §14.2 `AcademicYearRepository.findActive()` | tidak ada | ❌ BELUM |
| §8 transaksi `runTransaction` | ada (reuse) | ✅ reuse |
| §12.3 `MemberImportResultDTO` | tidak ada | ❌ BELUM |
| AC-13 chunk via `IMPORT_CONFIG` | `IMPORT_CONFIG` belum punya 2 key | ❌ BELUM |

---

## 3. Risk Analysis

### 3.1 Alur import end-to-end — risiko
| # | Risiko | Severity | Detail |
|---|--------|----------|--------|
| E1 | Tombol Import tampak "aktif" tapi tidak melakukan apa pun | TINGGI | `handleImport` hanya placeholder. Operator menekan Import, tidak ada feedback proses maupun hasil. Persepsi bug di production. |
| E2 | Tidak ada guard file (ukuran/ekstensi) di jalur anggota | SEDANG | `FileUploadDropzone` hanya menampilkan info; `validateImportFile()` (bookImport.ts) TIDAK dipanggil oleh dialog anggota. Drag-drop bisa membawa file non-xlsx / >5MB; parser akan gagal di `read-excel-file` → error generik "File gagal dibaca". |
| E3 | Tidak ada state `importing` / progres | SEDANG | Import 5.000 baris tanpa indikator proses → user menutup dialog / menekan ulang (duplicated request, lihat §3.9). |
| E4 | Hasil import tidak dikembalikan ke UI | TINGGI | Belum ada kontrak hasil (sukses/gagal + createdCount + error per baris). Spec §9 & §12.3 belum ada. |

### 3.2 Duplicate detection — in-file vs database
**Saat ini:**
- **In-file:** HANYA NISN (`MemberPreviewService.ts:44-55` menghitung kemunculan NISN, `>1` → `DUPLICATE`). Email dan Nama+Tanggal Lahir tidak dicek.
- **Database:** TIDAK ADA sama sekali.

**Cara keduanya harus bekerja bersama (per spec §7):**
1. **Preflight read-only di main** — dijalankan SEBELUM ada satu pun tulis.
2. **In-file:** NISN (hard key), Email (lowercase, bila tersedia), Nama+Tanggal Lahir.
3. **DB:** `findManyByNISNs` + `findManyByEmails` + `findByNameAndBirthDate` — query batch `IN` ter-chunk.
4. Semua error dikumpulkan per baris (tidak berhenti di error pertama) → `MatchingIssue[]`.
5. Ada ≥1 error → import tidak dijalankan (all-or-nothing, keputusan PO #8).

**Catatan penting:**
- `nisn` di schema `@unique` → NISN duplikat pasti diblok DB (P2002) saat commit. Tapi preflight tetap diperlukan agar error muncul **sebelum** commit (UX + tidak buang transaksi).
- `email` TIDAK `@unique` di schema → duplikat email hanya bisa dicegah via preflight query, bukan constraint DB.
- **TOCTOU:** preflight lalu commit adalah dua langkah terpisah. Antara keduanya, data bisa berubah (mis. anggota baru dibuat user lain / jendela kedua). Mitigasi: tangkap `P2002` saat commit → map ulang ke error per-baris, bukan rollback brutal tanpa pesan.

### 3.3 Transaction — BEGIN / COMMIT / ROLLBACK
`runTransaction(prisma, fn)` sudah ada (`base/transaction.ts`) = `prisma.$transaction(fn)` (interactive, otomatis BEGIN…COMMIT/ROLLBACK). Sudah dipakai di `BorrowRepository.createWithItems` dan `book-copy` (legacy).

**Kapan dipakai untuk member import (per spec §8):**
- SATU transaksi membungkus: (1) alokasi nomor anggota, (2) seluruh `createMany` ter-chunk.
- Commit hanya di akhir → semua baris atau tidak sama sekali.
- ROLLBACK otomatis jika ada statement gagal (Prisma).
- **Catatan:** `BookImportService.importBooks` (referensi buku) justru memakai transaksi **per-baris** (`createBookWithCopies`), bukan satu transaksi besar — keputusan buku adalah per-row atomic. **Ini berbeda dengan keputusan PO untuk anggota (all-or-nothing). Jangan meniru pola buku untuk anggota.**

### 3.4 Atomic import — all-or-nothing vs valid-rows-only (TRADEOFF — tanpa keputusan)
PO sudah memutuskan **All-or-Nothing** (SPEC #8, #18, AC-8). Tradeoff yang perlu dipahami agar keputusan di-review ulang bila perlu:

| | All-or-Nothing (keputusan PO) | Valid-rows-only (pola buku) |
|---|---|---|
| Konsistensi | DB bersih, tanpa partial | Mungkin ada row valid tersimpan saat baris lain gagal |
| UX | 1 error = seluruh file ditolak; operator harus perbaiki & ulang semua | Baris valid tetap masuk; hanya error yang dilaporkan |
| Risiko | File 5.000 baris dengan 1 NISN typo = semua gagal (frustasi) | Orphan/partial data; butuh mekanisme laporan per-baris yang jelas |
| Kompleksitas | Lebih sederhana (satu tx) | Perlu merancang kontrak hasil per-baris |
| Keselarasan DB | Tidak pernah ada state antara | Konsisten dengan "import buku" yang sudah rilis |

**TIDAK ADA keputusan yang diambil di sini** — keputusan final tetap di tangan PO.

### 3.5 Member Number — audit pembuatan nomor anggota
Implementasi sekarang (single-create path):

```ts
// number-generator.service.ts:23-28
const prefix = memberType === 'GURU' ? 'G' : memberType === 'UMUM' ? 'U' : 'S'
const count = await this.memberRepository.count()
const seq = String(count + 1).padStart(6, '0')
return `${prefix}-${seq}`
```

**Dua bug nyata yang harus dibereskan SEBELUM batch import:**

1. **Bug prefix `memberType`:** Nilai `memberType` runtime adalah **`student` / `teacher` / `general`** (lihat `MemberForm.tsx:21` `MEMBER_TYPES`, `MemberListPage.tsx` `MEMBER_TYPE_LABEL`). Kode membandingkan dengan `'GURU'` / `'UMUM'` (huruf besar) → **tidak pernah cocok** → SEMUA anggota (termasuk guru & umum) dapat prefix `S-`. Ini bug yang ada sekarang, bukan hanya untuk import.
2. **Bug collision setelah delete:** `count()+1` **menggunakan kembali** nomor setelah penghapusan. Contoh: ada S-000001…S-000010 (count=10). Hapus anggota S-000010 → count=9 → anggota baru dapat `S-000010` lagi. Nomor anggota bisa **berulang** — tidak pernah unik dalam riwayat.

**Yang benar untuk batch (per spec §13.4):** `allocateMemberNumbers(tx, count, memberType)` → query max suffix numerik existing dengan prefix di dalam transaksi, alokasi `max+1..max+count` di memori (O(1) query). Untuk jalur single-create: ganti `count()+1` dengan pola `max+1` yang sama (perbaiki 2 bug di atas). **Pembersihan ini PRASYARAT agar nomor batch tidak bentrok dengan jalur create manual.**

### 3.6 Performance — 100 / 500 / 1.000 / 5.000
**Risiko implementasi SEKARANG (tanpa DB import):**

| Tahap | Risiko | Keterangan |
|---|---|---|
| Parse + validasi (renderer) | RENDAH | Iterasi in-memory linear; 5.000 baris aman; tanpa loop per-baris ke DB |
| Preview (renderer) | RENDAH | Hanya render ≤50 baris (`PREVIEW_MAX_ROWS`) |
| **Tulis DB (createMany)** | **TINGGI** | SQLite batas ~32.766 variabel per statement. 5.000 baris × 9 kolom ≈ **45.000 parameter > batas** → P2028/error bila satu `createMany`. WAJIB chunk (`MEMBER_IMPORT_WRITE_CHUNK`) dalam satu transaksi. |
| **Baca DB (duplicate check)** | **TINGGI** | `IN` dengan 5.000 NISN dalam satu query = 5.000+ variabel → WAJIB chunk (`MEMBER_IMPORT_LOOKUP_CHUNK`). Tanpa chunk → error atau query raksasa. |
| Resolusi kelas (per-baris) | SEDANG–TINGGI | `MemberClassResolver` (spec §13.3) harus batch: query kelas tahun ajaran aktif SEKALI, lalu lookup in-memory. JANGAN 1 query per baris (5.000 query). |
| Alokasi nomor | RENDAH | `max+1..+count` O(1) query di dalam tx. |

**Aturan:** semua pembacaan sebelum semua penulisan; semua penulisan dalam satu transaksi; chunk config di `IMPORT_CONFIG` (bukan hardcode) — sesuai keputusan PO #23.

### 3.7 Error handling — bagaimana error dikembalikan ke UI
Saat ini: error parse (renderer) langsung ditangkap di dialog (`setParseError`); error IPC belum ada karena belum ada handler.

**Pola yang benar (per spec §9 + pelajaran WO-3 buku):**
1. **Preflight** → `MatchingResult { valid, errors: MatchingIssue[] }` via `members:previewCheck` — dikembalikan **terstruktur**, bukan throw.
2. **Import** → `MemberImportResultDTO { success, createdCount, errors: MatchingIssue[] }` via `members:import`. `success:false` dijamin **0 baris tersimpan**.
3. **Throw hanya untuk kegagalan sistem** (DB down, dsb) → ditangkap `ipcMain.handle` → reject → renderer menampilkan pesan. Pola `AppError` sudah ada (`electron/main/errorHandler.ts`).
4. **JANGAN ulangi bug B1 buku** (WO-3): `imports:match` resolve tanpa throw dan error tersembunyi di `matchingResult.errors` → renderer hanya tahu "sukses" padahal baris gagal. Kontrak anggota harus **mengembalikan error per-baris ke renderer secara eksplisit**.

### 3.8 Recovery — listrik mati / force close / DB timeout
| Skenario | Kondisi sekarang | Yang terjadi setelah DB import |
|---|---|---|
| Listrik mati / force close saat transaksi | — | SQLite journal + Prisma `$transaction` → **ROLLBACK otomatis** saat DB dibuka ulang. Tidak ada partial write. Aman. |
| Aplikasi ditutup paksa | — | Sama dengan di atas; karena semua tulis dalam 1 transaksi, state konsisten. |
| DB timeout / "database is locked" | — | Risiko rendah (desktop single-user, satu proses). Bila terjadi: `$transaction` melempar → rollback → error ke UI. Tidak ada deadlock. |
| **Import terpotong di tengah (crash sebelum commit)** | — | Seluruh batch batal (all-or-nothing) → operator upload ulang. **Tidak ada partial import.** Ini efek samping positif dari keputusan all-or-nothing. |
| **Import terpotong TETAPI per-row commit (bila PO memilih valid-rows-only)** | — | Sebagian baris tersimpan, sisanya hilang tanpa jejak → butuh staging/log untuk recovery. |

**Kesimpulan:** Dengan all-or-nothing + satu transaksi, recovery = "gagal total, ulangi upload". Tidak perlu mekanisme resume. Ini salah satu argumen kuat untuk all-or-nothing.

### 3.9 Security
| Aspek | Status | Analisis |
|---|---|---|
| SQL Injection | ✅ AMAN | Prisma = query parameterized. Semua input via nilai, bukan string SQL. |
| Malformed Excel | ⚠️ SEDANG | `read-excel-file` menolak file rusak → error "File gagal dibaca" (tertangkap). Tetapi: (a) file di-parse penuh di memori renderer — file 5MB maksimal, OK; (b) sheet >1 diabaikan (sheet[0] saja), OK; (c) TIDAK ada guard ukuran/ekstensi sebelum parse di jalur anggota (lihat E2). |
| Duplicated request | ⚠️ SEDANG–TINGGI | Tombol Import tanpa state `importing` → double-click = 2 IPC `members:import`. Preflight di main ulang → yang kedua terdeteksi NISN duplikat dan ditolak (jika yang pertama commit). TAPI antara dua preflight ada window TOCTOU; dan double-write mubazir. Mitigasi: disable tombol saat `importing` + single-flight di service (tolak bila sudah ada import berjalan). |
| Race condition | ⚠️ SEDANG | Desktop single-process, IPC serial di main → race antar-IPC rendah. Risiko utama: `count()+1` pada nomor anggota (lihat §3.5) — tidak aman untuk concurrency (dokumentasi `number-generator.service.ts:3-18` mengakuinya). Fix `max+1` di dalam transaksi menghilangkan ini. |

### 3.10 Technical Debt yang harus dibereskan SEBELUM/SAAT implementasi
| # | Debt | File | Prioritas |
|---|---|---|---|
| T1 | `count()+1` → collision setelah delete + `max+1` | `number-generator.service.ts` | TINGGI (prasyarat import) |
| T2 | Prefix bug `'GURU'/'UMUM'` vs nilai runtime `student/teacher/general` | `number-generator.service.ts` | TINGGI (prasyarat import) |
| T3 | Belum ada guard file (ukuran/ekstensi) di dialog anggota | `MemberImportDialog.tsx` + `validateImportFile` | SEDANG |
| T4 | `IMPORT_CONFIG` belum punya `MEMBER_IMPORT_WRITE_CHUNK` / `MEMBER_IMPORT_LOOKUP_CHUNK` | `src/config/import.config.ts` | TINGGI (spec AC-13) |
| T5 | `AcademicYearRepository.findActive()` belum ada | `academic-year.repository.ts` | TINGGI (spec §14.2) |
| T6 | Repo member belum punya method batch (`createManyWithTx`, `findManyByNISNs`, `findManyByEmails`, `findByNameAndBirthDate`) | `member.repository.ts` | TINGGI (spec §14.1) |
| T7 | Legacy member stack mati (`electron/main/services/member.service.ts`, `electron/main/repositories/member.repository.ts`) | — | RENDAH (housekeeping, jangan sampai dipakai import baru) |
| T8 | Komentar schema gender (`LAKI_LAKI/PEREMPUAN`) vs nilai runtime (`male/female`) — dokumentasi menyesatkan | `schema.prisma:12-13` | RENDAH |
| T9 | Schema `memberType` String tanpa enum — tidak mencegah nilai salah | `schema.prisma:95` | RENDAH (di luar scope; jangan tambah migration) |
| T10 | Duplicate-in-file hanya NISN (spec: + email + nama+tgl-lahir) | `MemberPreviewService.ts` | SEDANG (spec §7) |

---

## 4. Production Readiness Checklist

**Saat ini (PRE-DB):**

| # | Item | Status |
|---|------|--------|
| 1 | Parse file Excel → baris terstruktur | ✅ |
| 2 | Validasi per-baris (wajib/tipe/enum/date) | ✅ |
| 3 | Preview dengan status per-baris | ✅ |
| 4 | Duplicate detection dalam file | ⚠️ Hanya NISN (email/name+birthDate belum) |
| 5 | Download template | ✅ |
| 6 | Tombol Import benar-benar menulis ke DB | ❌ |
| 7 | Duplicate detection terhadap database | ❌ |
| 8 | Resolusi kelas (string → classId, scope tahun ajaran aktif) | ❌ |
| 9 | Alokasi nomor anggota batch (unik, berurutan) | ❌ |
| 10 | Transaksi all-or-nothing | ❌ |
| 11 | Kontrak hasil ke UI (createdCount + errors per baris) | ❌ |
| 12 | Skala 5.000 (chunked createMany + chunked IN) | ❌ |
| 13 | Chunk config di `IMPORT_CONFIG` | ❌ |
| 14 | Guard file (ekstensi/ukuran) di jalur anggota | ❌ |
| 15 | Guard duplicated request (disable tombol + single-flight) | ❌ |
| 16 | Error handling terstruktur (MatchingResult / MemberImportResultDTO) | ❌ |
| 17 | Fresh DB `migrate deploy` PASS (tanpa migration baru) | ✅ (belum ada perubahan schema) |
| 18 | Lint + build PASS | ✅ (kondisi sekarang) |

**Verdict: 5/18 = ~28% production-ready.** Seluruh 13 item yang ❌ adalah database layer.

---

## 5. Open Questions (untuk PO)

1. **Jenis Kelamin tersimpan** — spec §R11 & §20.B menyatakan sel `Laki-laki`/`Perempuan` disimpan `male`/`female`. Parser validasi sekarang menerima juga `L`/`P`/`laki-laki`/`perempuan` (variasi). Apakah variasi ini boleh dipertahankan sebagai masukan yang diterima?
2. **Email duplikat sebagai blocker** — spec §7 menyatakan email duplikat (file/DB) **memblokir** import. Konfirmasi: email yang tersedia di file (kolom opsional) memang harus memblokir seluruh import, atau cukup warning?
3. **`memberNumber` fix pada jalur single-create** — bug prefix (`S-` untuk semua) dan collision-after-delete akan diperbaiki sebagai prasyarat batch. Konfirmasi perbaikan ini masuk scope WO (tanpa tambahan migration).
4. **Kelas di luar tahun ajaran aktif** — jika `findActive()` mengembalikan null (tidak ada tahun ajaran aktif), apakah import harus gagal total (classNotFound untuk semua baris) atau memilih tahun ajaran lain?
5. **Format kelas** — spec contoh `X MIPA 1`. Konfirmasi parsing token hanya `X/XI/XII` + sisanya = parallel (mis. `XI IPA 2` → level `XI`, parallel `IPA 2`), dan kombinasi yang tidak dimulai X/XI/XII → `classNotFound`.

---

## 6. Recommended Work Orders

> Urutan prioritas. Semua mengikuti SPEC yang SUDAH disetujui (tidak ada desain ulang).

| WO | Deskripsi | Prioritas |
|----|-----------|-----------|
| **WO-5A** | **Fix `NumberGeneratorService`** (prasyarat): ganti `count()+1` → `max+1` berbasis suffix; perbaiki prefix bug (student/teacher/general); tambah `allocateMemberNumbers(tx, count, memberType)` additive. | BLOCKER |
| **WO-5B** | **Perluas repository**: `MemberRepository` + `createManyWithTx` (chunk), `findManyByNISNs`, `findManyByEmails`, `findByNameAndBirthDate` (chunk `IN`); `AcademicYearRepository.findActive()`; tambah 2 key chunk ke `IMPORT_CONFIG`. | BLOCKER |
| **WO-5C** | **Service baru** (per spec): `MemberDuplicateChecker`, `MemberClassResolver`, `MemberImportService` (orchestrator: preflight → satu `$transaction` → hasil). | BLOCKER |
| **WO-5D** | **IPC + preload + env.d.ts**: `members:previewCheck`, `members:import`; kontrak `MemberImportResultDTO`; wiring `bootstrap.ts`. | BLOCKER |
| **WO-5E** | **UI**: ganti placeholder → flow Import nyata (state `importing`, disable tombol, tampilkan `createdCount` + error per baris); guard file (ekstensi/ukuran) via `validateImportFile`; refresh daftar setelah sukses. | BLOCKER |
| **WO-5F** | **Regression & validation**: lint, build, fresh DB `migrate deploy` (tanpa migration baru), `migrate diff` = no difference, smoke 100/500/1.000/5.000 baris (chunk boundary), smoke duplicate (file+DB), smoke kelas, smoke nomor berurutan setelah delete. | WAJIB (bagian dari tiap WO) |
| **WO-5G** (opsional) | Housekeeping: hapus legacy member stack; perbaiki komentar schema gender. | RENDAH |

---

## 7. Lampiran — file kunci yang diaudit

| File | Peran |
|------|-------|
| `src/components/members/MemberImportDialog.tsx` | Dialog (placeholder Import) |
| `src/pages/MemberListPage.tsx` | Entry "Import Siswa" |
| `src/services/MemberExcelParserService.ts` | Parse Excel |
| `src/services/MemberImportValidationService.ts` | Validasi baris |
| `src/services/MemberPreviewService.ts` | Preview + duplicate-in-file (NISN) |
| `src/config/memberImport.template.ts` | Definisi kolom template |
| `src/config/import.config.ts` | Config (belum ada chunk key) |
| `src/main/repositories/member.repository.ts` | Repo member (belum ada method batch) |
| `src/main/repositories/base/transaction.ts` | `runTransaction` (reuse) |
| `src/main/services/number-generator.service.ts` | Nomor anggota (count+1, bug) |
| `src/main/repositories/academic-year.repository.ts` | Belum ada `findActive()` |
| `src/main/repositories/class.repository.ts` | `findByAcademicYear` (reuse untuk resolver) |
| `electron/ipc/member.ipc.ts` | Handler (belum ada import) |
| `electron/preload/member.preload.ts` | API (belum ada import) |
| `src/renderer/env.d.ts` | Tipe (belum ada import) |
| `electron/main/bootstrap.ts` | Wiring (belum ada import service) |
| `IMPORT_MEMBER_ARCHITECTURE_SPEC.md` | Desain disetujui (dasar seluruh WO) |

**Mode READ ONLY — tidak ada perubahan kode, tidak ada commit. Audit selesai.**
