# IMPORT_MEMBER_ARCHITECTURE_SPEC (RFC) — REVISION FINAL

**Fitur:** Import Anggota (SISWA only) — mass import dari file Excel (.xlsx)
**Role:** Principal Software Architect
**Mode:** DESIGN ONLY — dokumen spesifikasi arsitektur, bukan implementasi
**Status:** DRAFT (REVISION FINAL) — menunggu approval Product Owner untuk dikunci
**Tanggal:** 02-08-2026
**Dasar:** `IMPORT_MEMBER_ARCHITECTURE_AUDIT.md` + RFC v0 + Revisi 1 PO + Revisi 2 PO + **Keputusan REVISION FINAL PO**
**Versi dokumen:** v3.0

---

## REVISION FINAL — Ringkasan Perubahan dari RFC v2

| # | Aspek | RFC v2 | RFC v3 / FINAL (ini) | Alasan |
|---|-------|--------|--------------|--------|
| RF-1 | Ukuran chunk write (`createMany`) | Hardcode `≤500 baris/statement` di service/repository | **TIDAK di-hardcode** — dipindah ke `IMPORT_CONFIG.MEMBER_IMPORT_WRITE_CHUNK`; service/repository hanya **membaca** konfigurasi | PO #1 |
| RF-2 | Ukuran chunk lookup (`IN`) | Hardcode `≤900 id/query` di repository | **TIDAK di-hardcode** — dipindah ke `IMPORT_CONFIG.MEMBER_IMPORT_LOOKUP_CHUNK`; repository hanya **membaca** konfigurasi | PO #1 |
| RF-3 | File terdampak | `src/config/import.config.ts` TIDAK diubah | **DITAMBAHKAN** ke daftar modifikasi — 2 key baru (additive; Import Buku tidak terpengaruh) | PO #1 |
| RF-4 | State dialog saat ditutup | Tidak diatur eksplisit | **AC baru**: dialog ditutup sebelum Import dijalankan → seluruh state di-reset penuh (file / preview / hasil validasi / duplicate result / class resolver result / progress / error); upload berikutnya benar-benar mulai dari awal | PO #2 |

> Semua nilai chunk kini adalah **satu-satunya sumber** di `IMPORT_CONFIG`:
> - `IMPORT_CONFIG.MEMBER_IMPORT_WRITE_CHUNK` — jumlah baris per statement `createMany`.
> - `IMPORT_CONFIG.MEMBER_IMPORT_LOOKUP_CHUNK` — jumlah id per query `IN`.
>
> Service, repository, dan dokumentasi teknis **tidak menulis angka chunk**; hanya
> merujuk nama key konfigurasi. Nilai default tetap mengacu pada guard batas variabel
> SQLite (~32.766 parameter).

---

## REVISION 2 — Ringkasan Perubahan dari RFC v1 (riwayat)

| # | Aspek | RFC v1 | RFC v2 (ini) | Alasan |
|---|-------|--------|--------------|--------|
| R2-1 | Route import | `members/students/import` (route baru) | **DIHAPUS** — tidak ada route; import bukan halaman permanen | PO #1 |
| R2-2 | Halaman import | `MemberImportPage.tsx` (page) | **DIHAPUS** — UI di **fullscreen dialog** di dalam `MemberListPage` | PO #2 |
| R2-3 | Entry & navigasi | Navigasi halaman ke route | **Tanpa navigasi** — klik "Import Siswa" membuka dialog; selesai menutup dialog; daftar di-refresh | PO #2 |
| R2-4 | Preview | View internal di halaman (statistik + preflight + tabel data 50 baris) | **Di dalam dialog** (state `step`); isi minimal: **Total/Valid/Error + tabel Nama/Kelas/Status + tombol Import** | PO #3, #7 |
| R2-5 | Duplicate Checker | `member-duplicate-checker.service.ts` | **Tetap** — service tunggal; tanpa provider/strategy/abstraction tambahan | PO #4 |
| R2-6 | Class Resolver | `member-class-resolver.service.ts` | **Tetap** — khusus Import Anggota; TIDAK digeneralisasi | PO #5 |
| R2-7 | NumberGeneratorService | `allocateMemberNumbers` (additive) | **Tetap additive** — `generateMemberNumber` (single-create) TIDAK berubah | PO #6 |
| R2-8 | Template Excel | 9 kolom (+ styling/opsional) | **Sesederhana mungkin**: 1 sheet, header saja, tanpa sheet bantuan / warna / contoh / dokumentasi | PO #8 |
| R2-9 | Skala | tidak dibahas | **AC baru: impor 5.000 siswa tanpa crash**; design guard (chunked read + chunked createMany) tanpa benchmark/optimasi | PO #9 |
| R2-10 | File baru | 6 (termasuk `MemberImportPage.tsx`) | **6** — `MemberImportPage` diganti `src/components/members/MemberImportDialog.tsx` | PO #2 |
| R2-11 | File modifikasi | 15 (termasuk `src/routes/index.tsx`) | **14** — `src/routes/index.tsx` dihapus dari rencana | PO #1 |

> Catatan arsitektur (R2-9): `createMany` Prisma mengirim **satu statement SQL** untuk
> seluruh baris. Untuk 5.000 baris × 9 kolom ≈ 45.000 parameter, melampaui batas
> variabel SQLite (~32.766). Karena itu desain memakai **chunked writes**
> (≤ 500 baris per `createMany`) di dalam **SATU `$transaction`** dan **chunked
> reads** (`IN` ≤ 900 id per query). Semantik all-or-nothing tetap terjaga karena
> seluruh statement berada dalam satu transaksi. Ini **guard kebenaran skala**,
> bukan optimasi.

---

## REVISION 1 — Ringkasan Perubahan dari RFC v0 (riwayat)

| # | Aspek | RFC v0 | RFC v1 | Alasan |
|---|-------|--------|--------------|--------|
| R1 | Menu sidebar | Ada sub-item "Import Siswa" | **DIHAPUS** — tidak ada menu sidebar baru | PO #1 |
| R2 | Flow | Daftar → Import → Preview (route terpisah) → Import → Selesai | Daftar → Import Siswa → **Preview (internal)** → Import → Selesai | PO #1 |
| R3 | Preview | Halaman route `member-import/preview` | **View internal** (state `step`) | PO #1 |
| R4 | Context | `MemberImportContext` (Provider) | **DIHAPUS** — state lokal halaman | PO #2 |
| R5 | Hook | `useMemberImportWorkflow` | **DIHAPUS** — pakai service existing langsung | PO #3 |
| R6 | `MemberImportService` | Orkestrator + semua logika | **Orkestrator murni** (DuplicateChecker / ClassResolver / NumberAllocator) | PO #4 |
| R7 | Class matching | `MatchingEngineService` + `PrismaClassMatchProvider` + `ClassMatchStrategy` | **DIHAPUS** — resolusi langsung di `MemberClassResolver` | PO #6 |
| R8 | DTO baru | `member-import.ts` (file baru) | **DIHAPUS** — reuse `MatchingResult`/`MatchingIssue`; hanya `MemberImportResultDTO` di `dto/member.ts` | PO #5 |
| R9 | File IPC/preload baru | `member-import.ipc.ts` + `member-import.preload.ts` | **DIHAPUS** — handler di `member.ipc.ts`/`member.preload.ts` | PO #6 |
| R10 | `memberType` | `'student'` (rekomendasi) | **KEPUTUSAN FINAL: `'student'`** | PO final |
| R11 | Jenis Kelamin template | `Laki-laki/Perempuan` → `male/female` | **KEPUTUSAN FINAL: nilai sel `Laki-laki`/`Perempuan`**, disimpan `male`/`female` | PO final |
| R12 | Kelas ambigu | ERROR (rekomendasi) | **KEPUTUSAN FINAL: ERROR, import dibatalkan, tanpa dialog** | PO final |
| R13 | Jumlah file baru | 23 artefak | 6 file baru + 15 modifikasi | PO #6 |

---

## 0. Keputusan PO yang Menjadi Batas (Final, termasuk Revisi 1, 2, & FINAL)

| # | Keputusan | Nilai |
|---|-----------|-------|
| 1 | Cakupan | Hanya **SISWA**. Guru & Umum modul terpisah (di luar scope) |
| 2 | Workflow | Daftar Anggota → **Import Siswa** → Download Template → Upload → Validation → **Preview** → Import → Selesai |
| 3 | Halaman | **TIDAK ada halaman import baru** — UI di **fullscreen dialog** pada `MemberListPage`. Preview di dalam dialog, bukan menu, bukan route |
| 4 | Template kolom | Nama (wajib), Kelas (wajib), Jenis Kelamin (wajib), NISN (wajib), Tempat Lahir (ops), Tanggal Lahir (ops), Alamat (wajib), No. WhatsApp (wajib), Email (ops) |
| 5 | Jenis anggota | Seluruh hasil import otomatis `memberType = 'student'` (nilai runtime aplikasi) |
| 6 | Nomor anggota | Dibuat otomatis sistem; operator tidak mengisi |
| 7 | Duplicate detection | NISN dalam file, NISN di DB, Nama + Tanggal Lahir (jika tersedia), Email (jika tersedia) |
| 8 | Mode import | **All-or-Nothing** — jika masih ada ERROR, import TIDAK dijalankan |
| 9 | Schema DB | TIDAK ada perubahan schema; TIDAK ada migration baru |
| 10 | Sidebar | **TIDAK ada menu import** — entry via tombol "Import Siswa" di Daftar Siswa |
| 11 | Preview | **Internal**, di dalam dialog; tidak ada item navigation baru |
| 12 | Context | **TIDAK ada** `MemberImportContext` — state lokal |
| 13 | Hook | **TIDAK ada** `useMemberImportWorkflow` — gunakan service existing langsung |
| 14 | Service | `MemberImportService` **orkestrator murni**; logika dipecah (DuplicateChecker / ClassResolver / NumberAllocator) |
| 15 | Template Jenis Kelamin | Nilai sel: `Laki-laki` / `Perempuan`; disimpan `male` / `female` |
| 16 | Kelas ambigu | **ERROR → import dibatalkan**; tidak ada dialog tambahan |
| 17 | Jumlah file | Minimum — **6 file baru, 15 modifikasi existing** |
| 18 | **Route** (R2) | **TIDAK ada route** `/members/students/import` — import bukan halaman permanen |
| 19 | **UI Import** (R2) | **Fullscreen dialog** di dalam `MemberListPage`; tanpa perpindahan halaman |
| 20 | **Preview** (R2) | Di dalam dialog; minimal: **Total/Valid/Error + tabel Nama/Kelas/Status + tombol Import** |
| 21 | **Template** (R2) | Sesederhana mungkin: 1 sheet header-only, 9 kolom; tanpa sheet bantuan / warna / contoh / dokumentasi |
| 22 | **Skala** (R2) | Mampu impor **5.000 siswa tanpa crash**; tanpa benchmark/optimasi |
| 23 | **Chunk config** (FINAL) | Ukuran chunk **TIDAK di-hardcode** di service — di `IMPORT_CONFIG` (`MEMBER_IMPORT_WRITE_CHUNK`, `MEMBER_IMPORT_LOOKUP_CHUNK`); service hanya membaca |
| 24 | **State cleanup** (FINAL) | Dialog ditutup sebelum Import → seluruh state dibersihkan (file/preview/validasi/duplikat/kelas/progress/error); upload berikutnya mulai dari awal |

---

## 1. Executive Summary

Fitur Import Anggota (Siswa) adalah fitur **baru end-to-end** dengan permukaan
implementasi **minimal**: 1 komponen dialog, 3 service baru + 1 config, 1 file
template Excel. **Tidak ada halaman baru, tidak ada route baru, tidak ada menu,
tidak ada context, tidak ada hook, tidak ada provider matching, tidak ada file
IPC/preload baru.**

Arsitektur mengikuti prinsip:
1. **Orkestrator tipis.** `MemberImportService` hanya mengatur alur (preflight →
   transaksi), logika didelegasikan ke `MemberDuplicateChecker`, `MemberClassResolver`,
   dan `NumberGeneratorService` (allocator).
2. **Semantik All-or-Nothing.** Seluruh baris tersimpan dalam SATU `$transaction`
   ATAU tidak ada yang tersimpan (bila perlu melalui beberapa statement `createMany`
   ter-chunk demi batas parameter SQLite — tetap satu transaksi).
3. **Reuse maksimal.** Parser, validation engine, dropzone, types, dan pola
   download template dipakai ulang dari Import Buku tanpa menyalin file.
4. **Skala 5.000.** Desain tidak membatasi skala 5.000 siswa: pembacaan & penulisan
   bulk di-chunk dalam satu transaksi; preview hanya me-render ≤ 50 baris.
5. **Konfigurasi, bukan hardcode.** Ukuran chunk (`write`/`lookup`) tidak ditulis
   di service — dibaca dari `IMPORT_CONFIG` (`MEMBER_IMPORT_WRITE_CHUNK`,
   `MEMBER_IMPORT_LOOKUP_CHUNK`).
6. **Dialog bersih.** Tutup dialog sebelum Import → seluruh state di-reset ke
   kondisi awal; upload berikutnya benar-benar dimulai dari awal.

Fitur **TIDAK memerlukan perubahan schema maupun migration** (keputusan #9),
**TIDAK menambah dependency** (`read-excel-file@^9.3.5` sudah ada).

---

## 2. Business Flow

```
Daftar Siswa (MemberListPage, memberType=student)
      │  [tombol "Import Siswa" — button, bukan menu]
      ▼
Fullscreen Dialog (MemberImportDialog) — TANPA perpindahan halaman
   ├─ Upload (Download Template + pilih file .xlsx)
   ├─ Preview (ringkasan Total / Valid / Error + tabel Nama·Kelas·Status)
   ├─ Import (all-or-nothing)
   └─ Selesai → Tutup dialog → daftar siswa di-refresh
```

Aturan bisnis:
- Seluruh hasil import: `memberType='student'`, `status='INACTIVE'`,
  `gender` dari template (`Laki-laki`→`male`, `Perempuan`→`female`).
- Nomor anggota dibuat sistem, prefix `S-`, urut dari **max existing + 1**.
- Import hanya berjalan jika **NOL error** (struktur, kelas, maupun duplikat).
- Kelas ambigu → ERROR → import dibatalkan tanpa dialog.
- Data duplikat → ERROR → membatalkan seluruh import (all-or-nothing).
- Target skala: **5.000 siswa tanpa crash** (tanpa benchmark/optimasi).
- Dialog ditutup sebelum Import dijalankan → **seluruh state dibersihkan**
  (file, preview, hasil validasi, duplicate result, class resolver result,
  progress, error) dan upload berikutnya dimulai dari awal (keputusan #24).

---

## 3. UI Flow

### 3.1 Entry point
`MemberListPage` (Daftar Siswa, `memberType="student"`) mendapat tombol
**"Import Siswa"** (di samping "+ Tambah Siswa") yang men-set `importOpen=true`
dan me-render `MemberImportDialog` (fullscreen overlay). **TIDAK ada perubahan**
`routes/index.tsx`, `Sidebar.tsx`, dan `navigation.ts` (tombol memakai handler
lokal, sama seperti tombol "+ Tambah" memakai `navigate`).

### 3.2 Satu dialog: `MemberImportDialog` (3 step internal)
State lokal di dalam dialog (bukan context): `step`, `file`, `errorCode`,
`validatedWorkbook`, `previewResult`, `importing`, `importResult`.

| step | Konten | Aksi |
|------|--------|------|
| `upload` | Subtitle, tombol **Download Template**, `FileUploadDropzone`, tombol **Lanjut** | Download → `memberImport.downloadTemplate`; Lanjut → parse+validate |
| `preview` | Ringkasan **Total/Valid/Error**, tabel **Nama · Kelas · Status** (≤50 baris), tombol **Import Anggota** (disabled bila ada error) + **Kembali** | `memberImport.previewCheck` saat masuk; Import → `memberImport.import` |
| `done` | Status sukses + `createdCount`, tombol **Selesai** | Tutup dialog → `fetchMembers()` pada `MemberListPage` |

Parse+validate dijalankan **langsung** memakai service existing:
`workbookReaderService.readWorkbook(file)` → `validationEngineService.validate(raw, detectMemberImportTemplate)`.
Tidak ada hook/context baru.

### 3.3 Lifecycle dialog
- Dibuka → state di-reset (fresh setiap kali).
- Import sukses → `step='done'` → tombol "Selesai" menutup dialog.
- `MemberListPage` menerima callback `onImported` → `fetchMembers()` (daftar
  ter-refresh tanpa perpindahan halaman).
- **Ditutup sebelum proses Import dijalankan** (tombol `X`, klik luar, `Batal`,
  atau `Kembali`) → **seluruh state di-reset penuh ke kondisi awal**: `file`,
  `validatedWorkbook`, `previewResult` (termasuk hasil duplicate checker &
  class resolver di dalamnya), `importing`, `importResult`, `errorCode`, dan
  `step` kembali ke `'upload'`. Upload berikutnya benar-benar dimulai dari awal —
  **tidak membawa state lama** (keputusan #24, AC-16).

---

## 4. Import Workflow (main process — channel `members:import`)

```
canonicalRows (dari renderer, sudah tervalidasi struktur)
      │
      ▼
MemberImportService.import()
  [1] buildRows(): normalize + map gender (Laki-laki→male, Perempuan→female)
  [2] preflight (read-only, TANPA tulis):
      ├─ MemberDuplicateChecker.check(rows)     → isu duplikat (file+DB)
      └─ MemberClassResolver.resolveAll(rows)   → classId per baris | isu kelas
  [3] Jika ADA ERROR (≥1) → return { success:false, createdCount:0, errors }
      │                    (TANPA tulis database)
      ▼
  [4] Jika NOL error → SATU transaksi:
      ├─ NumberGeneratorService.allocateMemberNumbers(tx, count, 'student')
      │     → max existing S-xxx + 1 .. +count (di dalam tx)
      ├─ MemberRepository.createManyWithTx(tx, rows)
      │     → statement createMany ter-chunk sebesar
      │       IMPORT_CONFIG.MEMBER_IMPORT_WRITE_CHUNK baris/statement,
      │       SEMUA dalam SATU $transaction
      │       [guard batas parameter SQLite (~32.766): 5000×9 ≈ 45.000 param
      │        bila satu statement penuh. Ukuran chunk dibaca dari IMPORT_CONFIG,
      │        TIDAK di-hardcode di service.]
      └─ commit
      │
      ▼
  [5] return { success:true, createdCount:N, errors:[] }
```

Prinsip: **semua pembacaan sebelum semua penulisan**; penulisan hanya pada satu
`$transaction`; error apa pun di tahap [3] tidak menyentuh database.

---

## 5. Validation Workflow (Struktur)

Dijalankan di **renderer** dengan memanggil `validationEngineService.validate(raw, detectMemberImportTemplate)`.

1. **File-level**: ekstensi `.xlsx`, ukuran ≤ `IMPORT_CONFIG.maxFileSize` (5 MB) —
   reuse `validateImportFile` (`src/utils/bookImport.ts`).
2. **Workbook-level**: ada sheet, tidak kosong, ≥1 kolom, ada baris data.
3. **Header-level**: `detectMemberImportTemplate` mencocokkan header ternormalisasi
   terhadap template anggota; error `IMP-010/011/012`.
4. **Row-level**:
   - Kolom wajib (`requiredValue:true`): Nama, Kelas, Jenis Kelamin, NISN,
     Alamat, No. WhatsApp → `IMP-013`.
   - Tipe data string/date → `IMP-014`.
   - **Enum Jenis Kelamin** (`allowedValues:['Laki-laki','Perempuan']`) → `IMP-015`
     (reuse code range; label "Nilai berada di luar rentang yang diizinkan").

> Skala 5.000: validasi berjalan di renderer sebagai iterasi in-memory linear
> (tanpa DOM). 5.000 baris × operasi ringan adalah aman; tidak ada loop per baris
> yang menyentuh DB.

### 5.1 Perubahan minimal & backward-compatible
- `TemplateColumn` ditambah field opsional `allowedValues?: string[]`
  (`src/types/import.ts`). Template Buku tidak memakainya → perilaku Buku tidak berubah.
- `ValidationEngineService.validate(raw, detectTemplate = detectBookImportTemplate)`
  — argumen opsional, default Buku → tidak mengubah pemanggil Buku.
- `HeaderNormalizerService` ditambah synonyms anggota (additive, disjoint dari istilah
  Buku): `gender→jenis kelamin`, `no hp→no. whatsapp`, `whatsapp→no. whatsapp`,
  `wa→no. whatsapp`, `ttl→tanggal lahir`.

---

## 6. Preview Workflow (di dalam dialog)

`step='preview'` di dalam `MemberImportDialog`, **sesederhana mungkin** (PO #7):

| Elemen | Isi |
|--------|-----|
| Ringkasan | Tiga angka: **Total Data** · **Valid** · **Error** |
| Tabel | Kolom **Nama** · **Kelas** · **Status**; render maksimum **50 baris pertama** (guard DOM saat 5.000 baris) |
| Status per baris | `Valid` atau `Error: <message>` (messageKey via `LABELS.MEMBER_IMPORT.MESSAGES`) |
| Tombol | **Import** (disabled bila `Error > 0`) + **Kembali** |

- Data preflight (kelas/duplikat) ditambahkan ke status per baris saat masuk
  preview: `memberImport.previewCheck(canonicalRows)` → `MatchingResult` (reuse).
- TIDAK ada panel tambahan, TIDAK ada data-grid, TIDAK ada pagination UI, TIDAK
  ada layout kompleks.

---

## 7. Duplicate Detection Workflow

Dijalankan di main (read-only) oleh `MemberDuplicateChecker`. Normalisasi sebelum
banding: `trim()`, lowercase untuk email, tanggal `YYYY-MM-DD`.

| Aturan | Check | Metode repo | MessageKey |
|--------|-------|-------------|------------|
| NISN duplikat dalam file | nilai NISN muncul >1x di file | in-memory | `memberImport.duplicateNisnInFile` |
| NISN sudah di DB | `findManyByNISNs(nisns)` | query batch ter-chunk (`MEMBER_IMPORT_LOOKUP_CHUNK` id/query) | `memberImport.duplicateNisnInDb` |
| Email duplikat dalam file | email (lowercase) >1x | in-memory | `memberImport.duplicateEmailInFile` |
| Email sudah di DB | `findManyByEmails(emails)` | query batch ter-chunk (`MEMBER_IMPORT_LOOKUP_CHUNK` id/query) | `memberImport.duplicateEmailInDb` |
| Nama+Tanggal Lahir di DB | `findByNameAndBirthDate(name, bday)` per kombinasi unik | query batch ter-chunk (`MEMBER_IMPORT_LOOKUP_CHUNK`) | `memberImport.duplicateNameBirthInDb` |

- NISN = **hard key** (wajib & unik). Email serta Nama+Tanggal Lahir = deteksi
  sekunder (hanya bila nilai tersedia) dan tetap **memblokir** (keputusan #7).
- Semua error dikumpulkan per baris (tidak berhenti di error pertama).
- `MemberDuplicateChecker.check(rows)` → `MatchingIssue[]`.
- Skala 5.000: seluruh lookup DB memakai `IN` ter-chunk sesuai
  `IMPORT_CONFIG.MEMBER_IMPORT_LOOKUP_CHUNK` agar di bawah batas variabel SQLite;
  tidak ada query per-baris. **Angka chunk hanya ada di `IMPORT_CONFIG`.**
  `MemberDuplicateChecker` membaca nilai tersebut — tidak menulis hardcode.

---

## 8. Transaction Workflow

- Satu-satunya titik tulis: `MemberImportService.import` tahap [4],
  `runTransaction(getPrisma(), async (tx) => {...})` (reuse
  `src/main/repositories/base/transaction.ts`).
- Di dalam tx:
  1. `numberGeneratorService.allocateMemberNumbers(tx, count, 'student')` —
     query `tx.member` untuk max suffix numerik `S-`, alokasi `max+1..max+count`
     di memori (O(1) query, berapapun jumlah baris).
  2. `memberRepository.createManyWithTx(tx, rows)` — seluruh baris dalam **beberapa
     statement `createMany` ter-chunk sebesar `IMPORT_CONFIG.MEMBER_IMPORT_WRITE_CHUNK`
     baris/statement**, semua dalam transaksi yang sama. Commit di akhir.
- Gagal di `createMany` (mis. P2002 field unik) → rollback → return error.
- **Tidak ada partial commit, tidak ada orphan.** All-or-Nothing tetap berlaku
  meskipun tulisannya ter-chunk.

---

## 9. Error Handling

| Kategori | Kode/MessageKey | Sumber | Efek |
|----------|-----------------|--------|------|
| File tidak valid | `IMP-001..004` | renderer | Lanjut diblok |
| Workbook/sheet kosong | `IMP-005..009` | renderer | Lanjut diblok |
| Header tidak sesuai | `IMP-010..012` | renderer | Lanjut diblok |
| Wajib kosong / tipe salah / enum invalid | `IMP-013..015` | renderer | Baris invalid → import diblok |
| Kelas tidak ditemukan | `memberImport.classNotFound` | main (preflight) | Import diblok |
| Kelas ambigu | `memberImport.classAmbiguous` | main (preflight) | Import diblok, tanpa dialog |
| NISN duplikat (file/DB) | `memberImport.duplicateNisnInFile/InDb` | main (preflight) | Import diblok |
| Email duplikat (file/DB) | `memberImport.duplicateEmailInFile/InDb` | main (preflight) | Import diblok |
| Nama+Tanggal Lahir duplikat | `memberImport.duplicateNameBirthInDb` | main (preflight) | Import diblok |
| DB constraint saat commit | `memberImport.createFailed` | main (tx) | Rollback, error |
| IPC exception | reject → `memberImport.importFailed` | renderer | Pesan error |

Kontrak hasil:
- `members:previewCheck` → `MatchingResult { valid, errors, warnings }` (reuse).
- `members:import` → `MemberImportResultDTO { success, createdCount, errors }`;
  `success:false` dijamin tanpa perubahan DB.

---

## 10. Architecture Diagram

```
┌────────────────────────────── RENDERER ──────────────────────────────┐
│  MemberListPage (student)                                            │
│   ├─ [Import Siswa] ── open ▶ MemberImportDialog (fullscreen)        │
│   └─ state lokal; TIDAK ada route / page / context / hook           │
│        │  upload ▶ preview ▶ done  (step state)                     │
│        ├─ WorkbookReaderService (reuse)                              │
│        ├─ ValidationEngineService.validate(raw, detectMemberImportTemplate)│
│        │     └─ HeaderNormalizerService (synonyms anggota)          │
│        └─ window.electronAPI.memberImport.{previewCheck, import,     │
│                                              downloadTemplate}       │
│   └─ sukses → tutup dialog → fetchMembers() (daftar refresh)        │
└──────────────┬───────────────────────────────────────────────────────┘
               │ preload (extend member.preload.ts)
               ▼
┌──────────── MAIN ────────────────────────────────────────────────────┐
│  electron/ipc/member.ipc.ts  (+3 handler: previewCheck/import/       │
│                                downloadTemplate — pola book IPC)     │
│        ▼                                                             │
│  MemberImportService (ORCHESTRATOR — tipis)                          │
│   ├─ MemberDuplicateChecker   (duplikat file+DB, chunked IN per config)│
│   ├─ MemberClassResolver      (parse "X MIPA 1" → classId,           │
│   │                             scope tahun ajaran aktif)            │
│   └─ NumberGeneratorService   (allocateMemberNumbers(tx), additive)  │
│        └─ runTransaction + MemberRepository.createManyWithTx          │
│             (chunk per IMPORT_CONFIG)                                │
│                                                                      │
│  MemberRepository (extended)  ·  AcademicYearRepository (+findActive)│
│  ClassRepository (existing)                                          │
└───────────────────────────────────────────────────────────────────────┘
```

Lapisan:
- **Renderer/UI:** `MemberListPage` + `MemberImportDialog` (fullscreen), state lokal.
- **Shared:** `src/types/import.ts` (+`allowedValues`), `src/shared/dto/member.ts` (+`MemberImportResultDTO`).
- **Main:** IPC (extend existing), `MemberImportService` (orkestrator),
  `MemberDuplicateChecker`, `MemberClassResolver`, `NumberGeneratorService` (allocator),
  repository extensions.
- **Assets:** `templates/Template_Import_Anggota_v1.0.xlsx` (ditambahkan ke
  `electron-builder.yml` `extraResources`).

---

## 11. Sequence Diagram

```
Operator   MemberListPage   MemberImportDialog  Main IPC      MemberImportService   DupChecker   ClassResolver  NumberGen  DB
   │             │                 │                │                │                  │            │             │      │
   │  Click "Import Siswa"         │                │                │                  │            │             │      │
   │────────────▶│ open dialog (fresh state)       │                │                  │            │             │      │
   │             │                 │                │                │                  │            │             │      │
   │ Download Template             │                │                │                  │            │             │      │
   │───────────────────────────────▶│─memberImport.downloadTemplate─▶│  copy file       │            │             │      │
   │             │                 │◀────────────status────────────│                  │            │             │      │
   │ Upload + Lanjut               │                │                │                  │            │             │      │
   │───────────────────────────────▶│ parse & validate (renderer)   │                  │            │             │      │
   │             │                 │ step='preview' │                │                  │            │             │      │
   │             │                 │─memberImport.previewCheck(canonical)─▶│           │            │             │      │
   │             │                 │                │  check():      │                  │            │             │      │
   │             │                 │                │──check(rows)───────────────────▶│            │             │      │
   │             │                 │                │                │──findManyByNISNs/Emails/NameBirth (chunked)──▶│
   │             │                 │                │──resolveAll(rows)──────────────────────────────▶│             │      │
   │             │                 │                │                │                  │  findActive + findByAcademicYear──▶│
   │             │                 │◀──── MatchingResult (valid, errors) ───────────────│            │             │      │
   │             │                 │ (Import enabled if Error = 0)    │                  │            │             │      │
   │  Click Import                 │                │                │                  │            │             │      │
   │             │                 │─memberImport.import(canonical)──▶│                  │            │             │      │
   │             │                 │                │  preflight (ulang)│                 │            │             │      │
   │             │                 │                │  [ERROR? return false, no write]   │            │             │      │
   │             │                 │                │  runTransaction(...)│               │            │             │      │
   │             │                 │                │──allocateMemberNumbers(tx,count)───────────────▶│             │      │
   │             │                 │                │──createManyWithTx(tx, rows) [chunk]──────────────────────────▶│      │
   │             │                 │◀──── MemberImportResultDTO ──────│               │            │             │      │
   │             │                 │ step='done' + createdCount       │               │            │             │      │
   │             │  [Selesai]──────▶│ close dialog → fetchMembers()   │               │            │             │      │
```

---

## 12. DTO yang Dibutuhkan

### 12.1 Reuse (tanpa perubahan)
- `CanonicalRow`, `ValidatedWorkbook`, `RawWorkbook`, `RowResult`,
  `ValidationIssue`, `ValidationResult`, `ImportCellValue`, `ImportErrorCode`,
  `DownloadTemplateResult`, **`MatchingResult`**, **`MatchingIssue`**
  (`src/types/import.ts`).
- `CreateMemberDTO` (`src/shared/dto/member.ts`) — dipakai sebagai dasar build
  payload anggota (reuse, bukan DTO baru).

### 12.2 Perubahan backward-compatible pada type shared
- `TemplateColumn.allowedValues?: string[]` (untuk enum Jenis Kelamin).

### 12.3 Satu tipe baru — `src/shared/dto/member.ts`
```ts
import type { MatchingIssue } from '../../types/import'

export interface MemberImportResultDTO {
  success: boolean
  createdCount: number
  errors: MatchingIssue[]
}
```
> TIDAK ada file DTO baru (`member-import.ts` dihapus dari rencana). Preview
> memakai `MatchingResult` yang sudah ada.

### 12.4 Tipe internal main (non-IPC, di dalam service)
```ts
interface MemberImportRow {
  rowNumber: number
  fullName: string
  className: string        // teks "X MIPA 1"
  gender: 'male' | 'female'
  nisn: string
  birthPlace?: string
  birthDate?: string        // ISO date
  address: string
  phone: string
  email?: string
}
```

---

## 13. Service yang Dibutuhkan

### 13.1 Baru — `src/main/services/member-import.service.ts` (ORCHESTRATOR, tipis)
Dependencies di-inject via constructor (bootstrap):
- `MemberDuplicateChecker`
- `MemberClassResolver`
- `NumberGeneratorService`
- `MemberRepository`
- `getPrisma` + `runTransaction`

Methods:
- `check(canonicalRows): Promise<MatchingResult>` — preflight read-only:
  `duplicateChecker.check(rows)` + `classResolver.resolveAll(rows)` →
  `{ valid, errors, warnings }`.
- `import(canonicalRows): Promise<MemberImportResultDTO>` — `check()` lalu, bila
  bersih, SATU `runTransaction` (allocate numbers + `createManyWithTx` ter-chunk).

**Bukan God Service** — `MemberImportService` tidak berisi logika dedup,
resolusi kelas, maupun alokasi nomor; hanya mengatur urutan.

### 13.2 Baru — `src/main/services/member-duplicate-checker.service.ts`
`MemberDuplicateChecker` (dep: `MemberRepository`).
- `check(rows): MatchingIssue[]` — aturan §7 (file + DB), normalisasi nilai,
  lookup DB ter-chunk.
- `checkInFile(rows)` / `checkInDb(rows)` internal.

### 13.3 Baru — `src/main/services/member-class-resolver.service.ts`
`MemberClassResolver` (dep: `ClassRepository`, `AcademicYearRepository`).
- `resolveAll(rows): { classIds: Map<number,string>; issues: MatchingIssue[] }`
- Parse `className` → token `educationLevel` (`X`/`XI`/`XII`) + `parallel`;
  query dalam **tahun ajaran aktif** (`findActive`); 0 → `classNotFound`,
  >1 → `classAmbiguous` (ERROR, tanpa dialog).
- **Khusus Import Anggota** — tidak digeneralisasi (PO #5).

### 13.4 Diperkuat (existing, additive) — `src/main/services/number-generator.service.ts`
(MemberNumber Allocator — reuse, bukan file baru)
- Tambah `allocateMemberNumbers(tx: Prisma.TransactionClient, count: number, memberType?: string): Promise<string[]>` —
  query `tx.member` untuk **max suffix numerik** existing dengan prefix, alokasi
  `max+1 .. max+count` di dalam transaksi (O(1) query).
- **Additive (PO #6):** `generateMemberNumber` (jalur single-create) **TIDAK
  berubah**; alur create anggota sekarang tetap seperti sekarang.

### 13.5 Tidak dibuat
- `useMemberImportWorkflow` (PO #3) — renderer memanggil service existing langsung.
- `PrismaClassMatchProvider` / `ClassMatchStrategy` / `MatchingEngineService` untuk
  kelas (PO #4/#5) — resolusi langsung di `MemberClassResolver`; tidak ada framework.
- `AutoCreateService` varian — Kelas adalah data master, tidak di-auto-create.

---

## 14. Repository yang Akan Digunakan

### 14.1 `MemberRepository` (extended — `src/main/repositories/member.repository.ts`)
Metode baru:
```ts
createManyWithTx(tx: Prisma.TransactionClient, rows: Prisma.MemberCreateManyInput[]): Promise<number>
  // menulis dalam chunk sebesar IMPORT_CONFIG.MEMBER_IMPORT_WRITE_CHUNK baris/statement
  // di dalam tx (guard batas parameter SQLite); mengembalikan total row ter-tulis.
  // Ukuran chunk dibaca dari konfigurasi — TIDAK di-hardcode di repo.
findManyByNISNs(nisns: string[]): Promise<Member[]>
  // query IN ter-chunk sesuai IMPORT_CONFIG.MEMBER_IMPORT_LOOKUP_CHUNK id/query.
findManyByEmails(emails: string[]): Promise<Member[]>
  // query IN ter-chunk sesuai IMPORT_CONFIG.MEMBER_IMPORT_LOOKUP_CHUNK id/query.
findByNameAndBirthDate(fullName: string, birthDate: Date): Promise<Member[]>
  // per kombinasi unik, batch (chunk sesuai MEMBER_IMPORT_LOOKUP_CHUNK).
```
Existing yang dipakai: `existsByMemberNumber`, `findByNISN`, `count`.

### 14.2 `AcademicYearRepository` (extended — `src/main/repositories/academic-year.repository.ts`)
```ts
findActive(): Promise<AcademicYear | null>
```

### 14.3 `ClassRepository` (existing — tanpa perubahan)
Dipakai: `findByAcademicYear(academicYearId)`, `findById`, `findDuplicate`.

---

## 15. Reuse Component (dari Import Buku & existing UI)

| Komponen | File | Cara pakai |
|----------|------|------------|
| `runTransaction` | `src/main/repositories/base/transaction.ts` | Langsung |
| `getPrisma` / `BaseRepository` | `repositories/base/prisma.ts`, `base.repository.ts` | Langsung |
| `WorkbookReaderService` | `src/services/WorkbookReaderService.ts` | Langsung, tanpa perubahan |
| `ValidationEngineService` | `src/services/ValidationEngineService.ts` | Param `detectTemplate` opsional (default Buku); `allowedValues` untuk enum |
| `HeaderNormalizerService` | `src/services/HeaderNormalizerService.ts` | Ditambah synonyms anggota (additive) |
| Types `CanonicalRow`/`ValidatedWorkbook`/`RowResult`/`ValidationIssue`/`MatchingResult`/`MatchingIssue` | `src/types/import.ts` | Langsung |
| `FileUploadDropzone` | `src/components/books/FileUploadDropzone.tsx` | Langsung (generik) |
| `IMPORT_CONFIG` | `src/config/import.config.ts` | Langsung (5MB, `.xlsx`); + 2 key additive `MEMBER_IMPORT_WRITE_CHUNK` / `MEMBER_IMPORT_LOOKUP_CHUNK` (Buku tidak terpengaruh) |
| `validateImportFile` | `src/utils/bookImport.ts` | Langsung |
| Pola overlay modal (`fixed inset-0 z-50`, tombol `X`) | `src/components/ui/InlineAddModal.tsx` | Pola gaya untuk `MemberImportDialog` (fullscreen, bukan framework) |
| Pattern download template (save dialog + `templates/`) | `electron/ipc/book-import.ipc.ts` | Pola ditiru di `member.ipc.ts` (handler kecil) |
| Context/hook workflow pattern | `src/contexts/BookImportContext.tsx`, `hooks/useBookImportWorkflow.ts` | **TIDAK dipakai** — state lokal + service langsung (PO #2/#3) |
| Dependency `read-excel-file` | `package.json` | Langsung |

---

## 16. Komponen Baru yang Harus Dibuat

**6 file baru (5 source + 1 template):**

| # | Komponen | Path |
|---|----------|------|
| 1 | Fullscreen dialog import (upload + preview + done) | `src/components/members/MemberImportDialog.tsx` |
| 2 | Orkestrator | `src/main/services/member-import.service.ts` |
| 3 | Duplicate checker | `src/main/services/member-duplicate-checker.service.ts` |
| 4 | Class resolver | `src/main/services/member-class-resolver.service.ts` |
| 5 | Template config | `src/config/memberImport.template.ts` (`MEMBER_IMPORT_TEMPLATE`, `detectMemberImportTemplate`) |
| 6 | File template Excel | `templates/Template_Import_Anggota_v1.0.xlsx` (1 sheet, header-only, 9 kolom) |

**15 file existing yang dimodifikasi (perubahan minimal):**

| # | File | Perubahan |
|---|------|-----------|
| 1 | `src/types/import.ts` | `TemplateColumn.allowedValues?` |
| 2 | `src/services/ValidationEngineService.ts` | Param `detectTemplate` opsional + cek `allowedValues` → `IMP-015` |
| 3 | `src/services/HeaderNormalizerService.ts` | Synonyms anggota (additive) |
| 4 | `src/utils/labels.ts` | Blok `MEMBER_IMPORT` (label + `MESSAGES` map) |
| 5 | `src/shared/dto/member.ts` | `MemberImportResultDTO` |
| 6 | `src/pages/MemberListPage.tsx` | Tombol "Import Siswa" (conditional `memberType=student`) + host `MemberImportDialog` + refetch setelah sukses |
| 7 | `src/config/import.config.ts` | +2 key additive: `MEMBER_IMPORT_WRITE_CHUNK`, `MEMBER_IMPORT_LOOKUP_CHUNK` (REVISION FINAL) |
| 8 | `src/main/repositories/member.repository.ts` | +4 method (§14.1, chunk per config) |
| 9 | `src/main/repositories/academic-year.repository.ts` | +`findActive()` |
| 10 | `src/main/services/number-generator.service.ts` | +`allocateMemberNumbers(tx,…)` (additive) |
| 11 | `electron/ipc/member.ipc.ts` | +3 handler (previewCheck/import/downloadTemplate) |
| 12 | `electron/preload/member.preload.ts` | +`memberImport` API |
| 13 | `src/renderer/env.d.ts` | +`memberImport` block |
| 14 | `electron/main/bootstrap.ts` | Wiring orchestrator + collaborators |
| 15 | `electron-builder.yml` | `extraResources` + template anggota |

> `src/routes/index.tsx` **TIDAK diubah** (tidak ada route baru) — dihapus dari
> daftar modifikasi vs RFC v1.

---

## 17. Risk Assessment

| # | Risiko | Tingkat | Mitigasi |
|---|--------|---------|----------|
| 1 | Alokasi `memberNumber` (race/collision) | SEDANG | `allocateMemberNumbers` di dalam tx berbasis max existing; all-or-nothing; P2002 → rollback |
| 2 | Resolusi kelas komposit dari teks "X MIPA 1" | TINGGI | Scope tahun ajaran aktif; parse token X/XI/XII; AMBIGUOUS → ERROR (keputusan PO) |
| 3 | False positive Nama+Tanggal Lahir (nama kembar) | SEDANG | NISN = hard key; deteksi sekunder; pesan per baris jelas |
| 4 | Parsing tanggal lahir / format cell | SEDANG | `WorkbookReaderService` → `Date`; normalisasi ISO `YYYY-MM-DD` |
| 5 | Header tidak sesuai / kolom bergeser | SEDANG | `detectMemberImportTemplate` (urutan+nomor) + IMP-011/012 |
| 6 | Regresi Buku saat `ValidationEngineService`/`HeaderNormalizerService` diparameterisasi/ditambah | SEDANG | Default Buku; synonyms additive & disjoint; lint+build+smoke Buku sebagai regression |
| 7 | Template tidak terkemas di `app.asar` | SEDANG | Update `electron-builder.yml` `extraResources` |
| 8 | **Skala 5.000: batas parameter SQLite** (createMany/IN tunggal terlalu besar) | SEDANG | **Chunked writes** (`MEMBER_IMPORT_WRITE_CHUNK` baris/statement) & **chunked reads** (`MEMBER_IMPORT_LOOKUP_CHUNK` id/query) dalam SATU transaksi — all-or-nothing tetap; ukuran dibaca dari `IMPORT_CONFIG`, mudah disesuaikan tanpa perubahan kode |
| 9 | Volume besar membebani render (tabel preview) | RENDAH | Preview hanya render ≤50 baris; validasi in-memory linear |
| 10 | Regresi UI Buku bila `FileUploadDropzone`/`IMPORT_CONFIG` diubah | RENDAH | Komponen dipakai apa adanya (reuse); key chunk **additive** di `IMPORT_CONFIG` — nilai Buku tidak tersentuh |

---

## 18. Acceptance Criteria

1. **Entry point**: dari Daftar Siswa, tombol "Import Siswa" → membuka **fullscreen
   dialog**. **TIDAK ada** route baru, **TIDAK ada** menu sidebar, **TIDAK ada**
   perubahan `routes/index.tsx`/`navigation.ts`.
2. **Dialog**: 3 step internal (`upload`/`preview`/`done`); import selesai menutup
   dialog dan daftar ter-refresh; **tanpa perpindahan halaman**.
3. **Download template**: `.xlsx` **1 sheet, header-only**, 9 kolom sesuai urutan &
   nama keputusan #4; kolom "Jenis Kelamin" berisi `Laki-laki`/`Perempuan`; **tanpa**
   sheet bantuan/warna/contoh/dokumentasi.
4. **Upload**: hanya `.xlsx` ≤ 5 MB; selain itu ditolak dengan pesan.
5. **Validasi struktur**: header salah/urutan salah/wajib kosong/tipe salah/enum
   invalid → error per baris; tombol Import nonaktif.
6. **Preview**: ringkasan **Total/Valid/Error** + tabel **Nama/Kelas/Status**
   (≤50 baris) + tombol Import; sederhana, tanpa layout kompleks.
7. **Preflight read-only**: kelas tidak ada/ambigu, NISN duplikat (file & DB),
   email duplikat (bila ada), Nama+Tanggal Lahir duplikat (bila ada) terdeteksi;
   **tidak ada perubahan DB**.
8. **All-or-Nothing**: ada ≥1 error → `success:false`, **0 baris tersimpan**.
9. **Kelas ambigu**: `memberImport.classAmbiguous` → import dibatalkan, tanpa dialog.
10. **Sukses**: seluruh baris dalam SATU transaksi; `createdCount` sesuai;
    `memberType='student'`, `gender` ter-map (`male`/`female`), `status='INACTIVE'`,
    `memberNumber='S-xxxxxx'` unik berurutan dari max existing + 1.
11. **Daftar Siswa**: anggota hasil import muncul di `/members/students` setelah
    dialog ditutup; detail benar (kelas dari tahun ajaran aktif).
12. **Skala 5.000**: desain mampu impor **5.000 siswa tanpa crash** (chunked
    reads/writes **per `IMPORT_CONFIG`** dalam satu transaksi, preview ≤50 baris).
    **Tanpa benchmark/optimasi** (keputusan PO #9).
13. **Chunk via config**: tidak ada angka chunk (`500`/`900`) di-hardcode di
    service/repository — ukuran chunk hanya ada di `IMPORT_CONFIG.MEMBER_IMPORT_WRITE_CHUNK`
    & `MEMBER_IMPORT_LOOKUP_CHUNK`; service/repository hanya membaca (keputusan #23).
14. **Packaging**: build + electron-builder; grep `Template_Import_Anggota` di
    `app.asar` ditemukan.
15. **Regression**: `npm run lint` PASS, `npm run build` PASS, fresh DB
    `migrate deploy` PASS (3 migration, tidak ada migration baru), `migrate diff`
    = "No difference detected", smoke Buku tetap hijau.
16. **State cleanup saat dialog ditutup**: dialog ditutup (tombol `X`, klik luar,
    `Batal`, atau `Kembali`) **sebelum** proses Import dijalankan → seluruh state
    di-reset ke kondisi awal: file upload, preview, hasil validasi, duplicate
    result, class resolver result, progress, dan error. Upload berikutnya benar-benar
    dimulai dari awal — **tidak membawa state lama** (keputusan #24).
17. **DB**: tidak ada model/kolom baru; tidak ada migration baru.

---

## 19. Out of Scope

- Import Guru & Umum (modul terpisah, keputusan #1).
- Auto-create Kelas / Tahun Ajaran / Kurikulum (wajib sudah ada di master data).
- Update massal / merge untuk data yang sudah ada (import hanya create).
- Pembersihan `@map` bridge (`number`/`birthplace`) — WO terpisah (M7/M8).
- Perbaikan `NumberGeneratorService.generateMemberNumber` (single-create path)
  — hanya penambahan method batch yang additive.
- Import tanpa template / pemetaan kolom manual di UI.
- Barcode / ID card untuk anggota baru hasil import.
- Dialog konfirmasi untuk kelas ambigu (keputusan PO: ERROR langsung).
- File CSV / non-Excel.
- **Benchmark & optimasi skala 5.000** (keputusan PO #9 — target desain, bukan
  pengerjaan sekarang).
- **Virtualisasi/pagination penuh pada tabel preview** (cukup render ≤50 baris).
- Import dari halaman selain Daftar Siswa.

---

## 20. Keputusan Teknis (Sudah Terkunci)

| # | Aspek | Keputusan |
|---|-------|-----------|
| A | Nilai `memberType` tersimpan | **`'student'`** (konsisten runtime aplikasi) |
| B | Nilai sel "Jenis Kelamin" | `Laki-laki` / `Perempuan` → disimpan `male` / `female` |
| C | Kelas ambigu | **ERROR** (`memberImport.classAmbiguous`), import dibatalkan, tanpa dialog |
| D | Generalisasi validation | Parameterize `ValidationEngineService` (`detectTemplate` opsional, default Buku) + `allowedValues` |
| E | Preview | View internal pada dialog (step state), bukan route/menu |
| F | Orchestration | `MemberImportService` tipis; logika di `MemberDuplicateChecker`, `MemberClassResolver`, `NumberGeneratorService` |
| G | **Route** (R2) | **TIDAK ada route** `members/students/import` — import via fullscreen dialog |
| H | **UI Import** (R2) | **`MemberImportDialog`** fullscreen di `MemberListPage`; state `step` lokal; tanpa perpindahan halaman |
| I | **Preview** (R2) | Ringkasan Total/Valid/Error + tabel Nama/Kelas/Status (≤50) + tombol Import |
| J | **Template** (R2) | 1 sheet header-only, 9 kolom; tanpa sheet bantuan / warna / contoh / dokumentasi |
| K | **Skala 5.000** (R2) | `createMany` & `IN`-lookup di-chunk dalam SATU transaksi (guard batas variabel SQLite ~32.766) |
| L | **Chunk config** (FINAL) | Ukuran chunk **di `IMPORT_CONFIG`** (`MEMBER_IMPORT_WRITE_CHUNK`, `MEMBER_IMPORT_LOOKUP_CHUNK`); service/repository **hanya membaca** — tidak ada hardcode angka chunk di kode |
| M | **State cleanup** (FINAL) | Tutup dialog sebelum Import → seluruh state (file/preview/validasi/duplikat/kelas/progress/error) di-reset; upload berikutnya mulai dari awal |

---

## 21. Daftar File Final yang Diperlukan

### 21.1 File baru (6)
1. `src/components/members/MemberImportDialog.tsx`
2. `src/main/services/member-import.service.ts`
3. `src/main/services/member-duplicate-checker.service.ts`
4. `src/main/services/member-class-resolver.service.ts`
5. `src/config/memberImport.template.ts`
6. `templates/Template_Import_Anggota_v1.0.xlsx`

### 21.2 File existing yang dimodifikasi (15)
1. `src/types/import.ts`
2. `src/services/ValidationEngineService.ts`
3. `src/services/HeaderNormalizerService.ts`
4. `src/utils/labels.ts`
5. `src/shared/dto/member.ts`
6. `src/pages/MemberListPage.tsx`
7. `src/config/import.config.ts`
8. `src/main/repositories/member.repository.ts`
9. `src/main/repositories/academic-year.repository.ts`
10. `src/main/services/number-generator.service.ts`
11. `electron/ipc/member.ipc.ts`
12. `electron/preload/member.preload.ts`
13. `src/renderer/env.d.ts`
14. `electron/main/bootstrap.ts`
15. `electron-builder.yml`

### 21.3 Dihapus dari rencana pada REVISION FINAL (vs RFC v2)
**Tidak ada file yang dihapus.** Perubahan FINAL hanya **menambah** 2 key ke file
existing `src/config/import.config.ts` (masuk ke §21.2 nomor 7) — bukan file baru.

### 21.4 Dihapus dari rencana pada REVISION 2 (vs RFC v1)
1. `src/pages/MemberImportPage.tsx` — diganti `src/components/members/MemberImportDialog.tsx` (fullscreen dialog di dalam `MemberListPage`, bukan page/route)
2. Perubahan `src/routes/index.tsx` (route `members/students/import` + import) — import bukan halaman permanen, tanpa route baru

### 21.5 Dihapus dari rencana sejak RFC v0 (kumulatif)
1. `src/pages/MemberImportPage.tsx` — (Revisi 2) diganti dialog
2. Perubahan `src/routes/index.tsx` — (Revisi 2) tanpa route
3. `src/pages/MemberImportPreviewPage.tsx` — diganti view internal di dialog
4. `src/contexts/MemberImportContext.tsx` — diganti state lokal
5. `src/hooks/useMemberImportWorkflow.ts` — pakai service existing
6. `src/main/providers/prisma-class-match.provider.ts` — resolusi langsung di ClassResolver
7. `src/services/strategies/ClassMatchStrategy.ts` — dihapus
8. `src/main/strategies/member.ts` — dihapus
9. `src/shared/dto/member-import.ts` — tipe ditambahkan ke `dto/member.ts` existing
10. `src/utils/memberImport.ts` — labels via `labels.ts`, mapping via `MESSAGES`
11. `electron/ipc/member-import.ipc.ts` — handler ditambahkan ke `member.ipc.ts`
12. `electron/preload/member-import.preload.ts` — API ditambahkan ke `member.preload.ts`
13. Perubahan `src/utils/navigation.ts` — tidak ada item navigation baru
14. Perubahan `src/components/layout/Sidebar.tsx` — tidak ada menu import

---

## 22. Status & Approval

**Status: DRAFT (REVISION FINAL) — DESIGN ONLY.** REVISION FINAL telah menerapkan
dua revisi terakhir PO tanpa mengubah keputusan lain, tanpa fitur baru, tanpa
perluasan scope:
1. Ukuran chunk (`createMany` write & `IN` lookup) **tidak di-hardcode** — dipindah
   ke `IMPORT_CONFIG` (`MEMBER_IMPORT_WRITE_CHUNK`, `MEMBER_IMPORT_LOOKUP_CHUNK`);
   service/repository hanya membaca konfigurasi (keputusan #23).
2. Acceptance Criteria baru: dialog ditutup sebelum Import → **seluruh state
   dibersihkan** (file/preview/validasi/duplicate/class/progress/error) dan upload
   berikutnya dimulai dari awal (keputusan #24, AC-16).

Seluruh riwayat revisi terdokumentasi (REVISION FINAL / REVISION 2 / REVISION 1).
**Tidak ada blocking decision tersisa** — seluruh keputusan teknis §20 (A–M)
telah terkunci sesuai keputusan final PO.

**RFC FINAL siap dikunci setelah approval Product Owner.** Setelah approval:
RFC ini ditutup menjadi 1 Work Order implementasi (+ UAT, lint, build, fresh-DB
migrate deploy, packaging verification) sesuai prosedur AGENTS.md. Sampai ada
approval, tidak ada implementasi, tidak ada Work Order, tidak ada commit.
