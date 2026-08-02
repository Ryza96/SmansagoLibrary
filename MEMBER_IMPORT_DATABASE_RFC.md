# MEMBER_IMPORT_DATABASE_RFC — RFC FINAL

**Fitur:** Import Anggota (SISWA) — mass import dari Excel ke database
**Role:** Project Engineer
**Mode:** DESIGN ONLY — dokumen desain arsitektur final, BUKAN prompt implementasi, BUKAN audit
**Status:** RFC v2 (revisi WO-5) — menunggu approval Product Owner untuk dikunci
**Tanggal:** 02-08-2026
**Source of Truth:**
1. `IMPORT_MEMBER_ARCHITECTURE_SPEC.md` (v3.0 FINAL) — keputusan arsitektur yang sudah disetujui
2. `PRODUCTION_READINESS_AUDIT_MEMBER_IMPORT_DATABASE.md` — temuan audit yang harus dibereskan

---

## 0. Ringkasan Keputusan PO (acuan wajib RFC ini)

| # | Keputusan | Nilai |
|---|-----------|-------|
| 1 | **Atomic Import** | **ALL OR NOTHING** — satu `BEGIN…COMMIT` untuk seluruh baris, atau `BEGIN…ROLLBACK` bila ada error. **Tidak boleh commit per baris.** |
| 2 | **Duplicate Detection** | Dua tahap wajib: **Tahap 1 = dalam file**, **Tahap 2 = terhadap database**. **Keduanya SELALU dijalankan** (Tahap 2 tidak pernah dilewati meskipun Tahap 1 punya blocker) dan dijalankan SEBELUM ada satu pun tulis — agar operator melihat **seluruh** masalah dalam satu preview. |
| 3 | **Duplicate Rule** | **NISN → BLOCKER.** **Email → BLOCKER** (hanya jika Email terisi). **Nama + Tanggal Lahir → WARNING** (bukan blocker). |
| 4 | **Nomor Anggota** | Identifier **permanen, tidak boleh digunakan kembali**. **JANGAN pakai `count()+1`**. Gunakan **max suffix + allocation batch** di dalam transaction. |
| 5 | **Class Resolver** | **TIDAK boleh membuat kelas otomatis.** Kelas tidak ditemukan → **import gagal**. |
| 6 | **Chunk** | Database **write HARUS chunked**; database **lookup HARUS chunked**; namun **seluruh write tetap dalam SATU TRANSACTION**. |
| 7 | **Progress** | RFC mendesain alur progress: **Preparing → Checking Duplicate → Resolving Class → Generating Member Number → Saving Database → Completed**. (Belum perlu implementasi.) |
| 8 | **Error Result** | RFC mendesain hasil import ke UI: **totalRows, created, failed, warnings, durationMs, errors**. |
| 9 | **Recovery** | Dokumentasikan perilaku: force close, listrik mati, database timeout. |
| 10 | **Out of Scope** | **JANGAN** buat: Auto Create Class, Auto Fix Data, Partial Import, Resume Import. |
| 11 | **Progress** | Progress **harus menampilkan jumlah data yang telah diproses** pada stage berjalan (contoh: `Checking Duplicate 347 / 5000`, `Saving Database 2500 / 5000`), bukan hanya perpindahan stage. |
| 12 | **Nomor Setelah Rollback** | Nomor anggota yang dialokasikan di dalam transaksi yang **ROLLBACK TIDAK dianggap terpakai**. Nomor baru baru resmi/terpakai setelah **COMMIT berhasil**. |
| 13 | **Implementasi Bertahap** | Setiap fasa P1–P7 wajib: **selesai → lint PASS → build PASS → review Product Owner → approval**, baru boleh lanjut ke fasa berikutnya. **TIDAK boleh** mengerjakan beberapa fasa sekaligus. |

> **Revisi terhadap SPEC yang disetujui (wajib dicatat):**
> - SPEC §7 menyatakan "Nama + Tanggal Lahir di DB → tetap **memblokir**". **Keputusan PO #3 di RFC ini MENGUBAHNYA menjadi WARNING (bukan blocker).** Implementasi harus mengikuti RFC ini (yang lebih baru).
> - Keputusan PO #4 mengunci strategi nomor anggota = max suffix + allocation batch, sekaligus memperbaiki dua bug jalur single-create yang ditemukan audit (prefix `GURU/UMUM` salah dan `count()+1` reuse setelah delete). Ini **prasyarat** sebelum batch import.
> - Keputusan PO #12 memperjelas semantik alokasi nomor: alokasi hidup dan mati bersama transaksi. Rollback membatalkan nomor yang sudah dialokasikan (belum pernah terpakai); hanya COMMIT yang menjadikan nomor resmi terpakai.

---

## 1. Executive Summary

Fitur Import Anggota saat ini berhenti di Preview — tombol Import hanya placeholder, **0 baris tertulis ke database**. RFC ini mendesain lapisan database yang hilang secara lengkap, mengikuti keputusan PO #1–#10.

Prinsip desain:
1. **All-or-Nothing.** Seluruh baris tersimpan dalam SATU transaksi Prisma (`$transaction`); error apa pun → ROLLBACK, 0 baris tersimpan, hasil `success:false`.
2. **Preflight read-only.** Semua deteksi duplikat (file + DB) dan resolusi kelas dijalankan SEBELUM transaksi — tidak ada tulis bila ada blocker.
3. **Pembacaan sebelum penulisan; penulisan ter-chunk dalam satu transaksi.** Guard batas variabel SQLite (~32.766): `createMany` di-chunk per `IMPORT_CONFIG.MEMBER_IMPORT_WRITE_CHUNK`, lookup `IN` di-chunk per `IMPORT_CONFIG.MEMBER_IMPORT_LOOKUP_CHUNK`. Nilai chunk **hanya di `IMPORT_CONFIG`** — service/repository membaca, tidak menulis hardcode.
4. **Nomor anggota permanen.** `max suffix + 1..+count` di dalam transaksi (O(1) query), tidak pernah digunakan kembali.
5. **Progress & hasil terstruktur.** Main mengirim event progress ke renderer; progress **menampilkan jumlah data terproses** (`current / total`) per stage, bukan hanya label stage. Hasil akhir berisi `totalRows / created / failed / warnings / durationMs / errors`.

**Skala target:** 5.000 siswa tanpa crash (guard chunk, tanpa benchmark/optimasi).
**Schema:** TIDAK ada perubahan schema, TIDAK ada migration baru.

---

## 2. Architecture Overview

```
┌────────────────────────────── RENDERER ──────────────────────────────┐
│  MemberListPage (student)                                            │
│   └─ MemberImportDialog (fullscreen, state lokal)                    │
│        ├─ FileUploadDropzone → validateImportFile (ekstensi/ukuran)  │
│        ├─ MemberExcelParserService (reuse)                           │
│        ├─ MemberImportValidationService (reuse)                      │
│        ├─ memberImport.previewCheck(rows)  → preview + blockers      │
│        ├─ memberImport.import(rows)        → result (progress events)│
│        └─ memberImport.onProgress(cb)      → stage/current/total     │
└──────────────┬───────────────────────────────────────────────────────┘
               │ preload (extend member.preload.ts) + env.d.ts
               ▼
┌──────────── MAIN ────────────────────────────────────────────────────┐
│  electron/ipc/member.ipc.ts  (+members:previewCheck, members:import, │
│                                main→renderer members:importProgress) │
│        ▼                                                             │
│  MemberImportService (ORCHESTRATOR — tipis, single-flight)           │
│   ├─ MemberDuplicateChecker   (Tahap 1 in-file → Tahap 2 DB, chunked)│
│   ├─ MemberClassResolver      (parse kelas → classId, scope AY aktif)│
│   └─ NumberGeneratorService   (allocateMemberNumbers(tx, count))     │
│        └─ runTransaction(getPrisma(), tx → allocate + createMany*)    │
│                                                                      │
│  MemberRepository (extended: createManyWithTx, findManyByNISNs/      │
│    findManyByEmails/findByNameAndBirthDate)                          │
│  AcademicYearRepository (extended: findActive)                       │
│  ClassRepository (existing: findByAcademicYear)                      │
└───────────────────────────────────────────────────────────────────────┘
```

Lapisan:
- **Renderer:** dialog (existing) + panggilan IPC baru + progress listener.
- **Shared:** `MemberImportRowInput`, `MemberImportPreviewDTO`, `MemberImportResultDTO`, `MemberImportProgressEvent` (di `src/shared/dto/member.ts`), reuse `MatchingIssue`.
- **Main:** `MemberImportService` (orchestrator), `MemberDuplicateChecker`, `MemberClassResolver`, `NumberGeneratorService` (allocator), repository extensions.
- **Config:** `IMPORT_CONFIG` (+2 key chunk).

TIDAK ada: route baru, menu baru, context, hook, page baru, provider matching, dependency baru, migration.

---

## 3. Import Lifecycle

```
Operator        Renderer (Dialog)           Main                        DB
   │                 │                        │                          │
   │ Pilih file      │ validateImportFile     │                          │
   │────────────────▶│ (ekstensi .xlsx, ≤5MB) │                          │
   │                 │ parse → validate       │                          │
   │                 │ (Parser + Validation)  │                          │
   │                 │ step='preview'         │                          │
   │                 │                        │                          │
   │                 │─members:previewCheck(rows)──▶│  preflight READ ONLY│
    │                 │                        │  [1] Dup in-file          │
    │                 │                        │  [2] Dup DB (chunked IN)  │
    │                 │                        │      (SELALU dijalankan,  │
    │                 │                        │       lihat §5.3)         │
   │                 │                        │  [3] Class resolve        │
   │                 │◀── MemberImportPreviewDTO ──│                     │
   │                 │ (Import aktif bila errorCount=0; warnings ditampilkan)│
   │                 │                        │                          │
   │  Klik Import    │─members:import(rows)──▶│  single-flight guard     │
   │                 │                        │  preflight ULANG (server)│
   │                 │                        │  ada blocker? → success:false, 0 write│
   │                 │                        │  BEGIN $transaction      │
   │                 │                        │    allocateMemberNumbers(tx, count)│
   │                 │                        │    createMany chunk 1..n  │
   │                 │                        │  COMMIT                  │
    │                 │◀── MemberImportResultDTO ──│  (success, totalRows,  │
    │                 │                        │   created, failed,        │
    │                 │                        │   warnings, durationMs,    │
    │                 │                        │   errors)                  │
   │                 │ show result + Selesai  │                          │
   │                 │─▶ tutup dialog → fetchMembers() refresh daftar    │
```

Urutan wajib:
1. **Upload** → guard file → parse → validate (renderer, reuse).
2. **Preview** → `previewCheck` (preflight read-only) → tampilkan blocker & warning.
3. **Import** → `import` → **preflight diulang di main** (defense-in-depth) → bila bersih → SATU transaksi → commit.
4. **Selesai** → hasil tampil → tutup dialog → daftar di-refresh.

> Alasan preflight diulang di main: data bisa berubah antara preview dan import (TOCTOU). Preflight di `import()` adalah kebenaran final; hasil `previewCheck` hanya UX.

---

## 4. Transaction Design

```ts
// MemberImportService.import — SATU-SATUNYA titik tulis
async import(rows: MemberImportRowInput[]): Promise<MemberImportResultDTO> {
  const startedAt = Date.now()

  // [A] preflight (read-only) — diulang dari previewCheck
  const preflight = await this.preflight(rows)          // dup file + dup DB + class
  if (preflight.errors.length > 0) {
    return { success: false, totalRows: rows.length, created: 0, failed: rows.length,
             warnings: preflight.warnings.length, durationMs: ..., errors: preflight.errors }
  }

  // [B] SATU transaksi — semua write di dalam sini
  try {
    const created = await runTransaction(getPrisma(), async (tx) => {
      const numbers = await this.numberGenerator.allocateMemberNumbers(tx, rows.length, 'student')
      const payload = this.buildCreateManyRows(rows, numbers)
      await this.memberRepository.createManyWithTx(tx, payload)  // chunked INSIDE tx
      return payload.length
    })
    return { success: true, totalRows: rows.length, created, failed: 0,
             warnings: preflight.warnings.length,
             durationMs: Date.now() - startedAt, errors: [] }
  } catch (error) {
    // Prisma otomatis ROLLBACK. Map P2002 → error per-baris.
    return { success: false, totalRows: rows.length, created: 0, failed: rows.length,
             warnings: preflight.warnings.length,
             durationMs: Date.now() - startedAt,
             errors: this.mapCommitErrors(error, rows) }
  }
}
```

- **BEGIN/COMMIT/ROLLBACK** dikelola `prisma.$transaction(fn)` (interactive) — `runTransaction` reuse (`src/main/repositories/base/transaction.ts`).
- **SEMUA statement tulis** (`allocate` + semua `createMany` chunk) **berada di dalam satu transaksi**. Commit hanya di akhir.
- **Error apa pun** → ROLLBACK otomatis → `success:false`, `created:0`. **Tidak ada partial commit, tidak ada orphan.**
- `P2002` (unique constraint: `nisn`/`memberNumber`) saat commit → ROLLBACK penuh, lalu di-map ke error per-baris untuk laporan (tetap `created:0`).
- **Semantik nomor anggota (keputusan PO #12):** alokasi nomor terjadi DI DALAM transaksi yang sama dengan write. Bila transaksi ROLLBACK, alokasi nomor ikut batal — nomor `max+1..+count` yang sempat dialokasikan **tidak dianggap terpakai** (tidak ada baris tersimpan, `max suffix` DB tidak berubah). Nomor baru baru resmi setelah COMMIT berhasil. Rincian di §7.2.

> **Peringatan desain:** `BookImportService.importBooks` (pola buku) memakai transaksi **per-baris**. **JANGAN meniru pola itu untuk anggota.** Keputusan PO #1: all-or-nothing, satu transaksi untuk seluruh batch.

---

## 5. Duplicate Detection Design

### 5.1 Tahap 1 — Dalam File (in-memory, read-only)
Iterasi `rows` sekali, bangun 3 map:

| Key | Normalisasi | Aturan | Hasil |
|-----|-------------|--------|-------|
| NISN | `trim()` | kemunculan > 1 | **BLOCKER** → `memberImport.duplicateNisnInFile` |
| Email | `trim().toLowerCase()` | hanya bila Email **terisi**; kemunculan > 1 | **BLOCKER** → `memberImport.duplicateEmailInFile` |
| Nama + Tanggal Lahir | Nama `trim()`; tanggal `YYYY-MM-DD` | hanya bila **keduanya** terisi; kemunculan > 1 | **WARNING** → `memberImport.duplicateNameBirthInFile` |

- Setiap baris yang terlibat dalam duplikat menerima issue (tidak berhenti di yang pertama).
- NISN adalah hard key (wajib & unik di schema). Email kolom opsional → hanya dicek bila terisi. Nama+Tanggal Lahir → warning, tidak memblokir.

### 5.2 Tahap 2 — Terhadap Database (read-only, chunked)
Kumpulkan **nilai unik** dari file, lalu query batch:

| Query | Chunk | Aturan | Hasil |
|-------|-------|--------|-------|
| `findManyByNISNs(nisns)` | `IN` per `MEMBER_IMPORT_LOOKUP_CHUNK` | NISN sudah ada di DB | **BLOCKER** → `memberImport.duplicateNisnInDb` |
| `findManyByEmails(emails)` | `IN` per `MEMBER_IMPORT_LOOKUP_CHUNK` | Email (lowercase) sudah ada di DB, hanya bila terisi | **BLOCKER** → `memberImport.duplicateEmailInDb` |
| `findByNameAndBirthDate(name, bday)` | per kombinasi unik, batch | Nama+Tanggal Lahir sudah ada di DB | **WARNING** → `memberImport.duplicateNameBirthInDb` |

### 5.3 Bagaimana keduanya bekerja bersama
1. Tahap 1 (in-file) dijalankan **selalu**, sebagai langkah pertama → issue in-file.
2. Tahap 2 (DB) **SELALU dijalankan juga**, terlepas dari ada/tidaknya blocker pada Tahap 1. **Tidak pernah dilewati.** Keputusan PO #2: operator harus melihat **seluruh** masalah (in-file + DB) dalam SATU preview, bukan memperbaiki satu masalah lalu menemukan masalah berikutnya pada percobaan berikutnya.
3. Semua issue dikumpulkan per baris ke `errors` (blocker) dan `warnings`.
4. `previewCheck` mengembalikan keduanya (hasil gabungan Tahap 1 + Tahap 2); `import` hanya menolak bila `errors.length > 0` (warnings tidak memblokir).
5. **Belum ada tulis database saat Tahap 1 & 2.**
6. **Efek pada jumlah query (tetap aman):** Tahap 2 tetap ter-chunk (`MEMBER_IMPORT_LOOKUP_CHUNK`); dijalankan lebih awal hanya menambah pembacaan, tidak pernah menambah tulis. Trade-off desain = kecepatan preview sedikit lebih mahal demi kualitas hasil (semua masalah tampil sekaligus).

> Catatan schema: `nisn` = `@unique` (DB ikut mencegah duplikat NISN saat commit). `email` TIDAK unique → hanya preflight yang mencegah duplikat email. Nama+Tanggal Lahir bukan constraint → murni warning.

---

## 6. Class Resolution

### 6.1 Aturan (Keputusan PO #5)
- **TIDAK ada auto-create kelas.** Data master (AcademicYear, Curriculum, Class) wajib sudah ada.
- Kelas tidak ditemukan / ambigu → **BLOCKER → import gagal** (all-or-nothing).
- **Error Wajib memuat nama kelas yang gagal dicari** (keputusan PO, Revisi 3), bukan hanya messageKey `classNotFound`/`classAmbiguous`. Contoh pesan per baris:
  ```
  Baris 18: Kelas "XI Merdeka 1" tidak ditemukan.
  Baris 22: Kelas "XII IPA 2" ambigu (lebih dari satu kelas cocok).
  ```
  Implementasi menaruh `className` asli (normalized) sebagai bagian dari detail issue (lihat §11).

### 6.2 Parser `className`
Input contoh: `X MIPA 1`, `XI IPA 2`, `XII TKJ 1`, `XI AKL 2`, `XI DKV`.

```
token pertama = educationLevel   (hanya X | XI | XII)
sisa string   = parallel         (contoh: "MIPA 1")
tidak diawali X/XI/XII → classNotFound (blocker; error memuat className input)
```

### 6.3 Resolusi (batch, O(1) query — JANGAN per-baris)
```
[1] academicYearRepository.findActive()          → activeYear | null
       null → semua baris classNotFound (blocker)
[2] classRepository.findByAcademicYear(activeYear.id)   → kelas tahun ajaran aktif (1 query)
[3] bangun Map<String, Class[]>: key = `${educationLevel} ${parallel}` (normalized)
[4] per baris:
       key tidak ada        → classNotFound    (blocker; error memuat nama kelas)
       key punya 1 kelas    → classId
       key punya >1 kelas   → classAmbiguous   (blocker; error memuat nama kelas)
```

> `@@unique([academicYearId, curriculumId, educationLevel, parallel])` memungkinkan dua kelas dengan `educationLevel+parallel` sama dalam satu tahun ajaran bila kurikulumnya berbeda → kasus ambigu harus ditangani (blocker, sesuai keputusan PO #16 SPEC).

---

## 7. Member Number Allocation

### 7.1 Prinsip (Keputusan PO #4)
- Nomor anggota = **identifier permanen**, **tidak pernah digunakan kembali**.
- **DILARANG `count()+1`** (audit: reuse nomor setelah delete; tidak aman concurrency).
- Strategi: **max suffix + allocation batch di dalam transaction**.
- **Semantik rollback (keputusan PO #12):** nomor yang dialokasikan di dalam transaksi yang **ROLLBACK TIDAK dianggap terpakai**. Alokasi hidup dan mati bersama transaksi: karena seluruh write (termasuk alokasi) berada di SATU `$transaction`, kegagalan apa pun membatalkan baris DAN alokasi sekaligus. `max suffix` DB tidak berubah setelah rollback → percobaan berikutnya mengalokasikan ulang nomor yang sama. Nomor baru baru resmi terpakai setelah **COMMIT berhasil**.

### 7.2 Batch allocation (untuk import)

```ts
// NumberGeneratorService — metode baru (additive)
async allocateMemberNumbers(tx: Prisma.TransactionClient, count: number, memberType?: string): Promise<string[]> {
  const prefix = memberType === 'teacher' ? 'G' : memberType === 'general' ? 'U' : 'S'
  // 1) query max suffix numerik existing dengan prefix, di dalam tx
  const existing = await tx.member.findMany({ select: { memberNumber: true } })
  const maxSuffix = existing.reduce((max, m) => {
    if (!m.memberNumber?.startsWith(`${prefix}-`)) return max
    const n = Number(m.memberNumber.slice(prefix.length + 1))
    return Number.isFinite(n) ? Math.max(max, n) : max
  }, 0)
  // 2) alokasi max+1 .. max+count di memori
  return Array.from({ length: count }, (_, i) =>
    `${prefix}-${String(maxSuffix + i + 1).padStart(6, '0')}`
  )
}
```

- O(1) query untuk berapapun jumlah baris.
- Di dalam `$transaction` bersama `createMany` → nomor aman dari race & dari partial state.
- `memberNumber` `@unique` di schema → nomor ganda (seandainya ada) ditolak DB (P2002 → rollback).
- **Rollback → alokasi batal (keputusan PO #12).** Contoh: transaksi mengalokasikan `S-000001..S-000100`, lalu gagal pada `createMany` chunk ke-2 → Prisma ROLLBACK → **tidak ada satupun dari 100 nomor itu terpakai**; DB tidak berisi baris apa pun; percobaan berikutnya mengalokasikan ulang dari `S-000001`. Nomor dianggap resmi hanya setelah COMMIT berhasil. Ini konsisten dengan "permanen & tidak reuse": nomor yang terlanjur masuk DB (COMMIT) tidak pernah dipakai ulang; nomor yang batal (ROLLBACK) memang belum pernah terpakai.

### 7.3 Perbaikan jalur single-create (PRASYARAT, dari audit)
`generateMemberNumber` (jalur create manual) saat ini bermasalah:
1. **Prefix bug:** membandingkan `'GURU'/'UMUM'` padahal nilai runtime `teacher/general` → semua anggota dapat `S-`.
2. **Reuse bug:** `count()+1` → nomor dipakai ulang setelah delete.

Keduanya **wajib diperbaiki** di WO yang sama sebelum batch (gunakan `max suffix + 1` dan prefix `student/teacher/general`). Ini selaras keputusan PO #4 (permanen, tidak reuse).

---

## 8. Chunk Strategy

### 8.1 Konfigurasi (satu-satunya sumber — PO SPEC #23)

```ts
// src/config/import.config.ts — additive, Import Buku tidak terpengaruh
export const IMPORT_CONFIG = {
  allowedExtensions: ['.xlsx'] as const,
  maxFileSize: 5 * 1024 * 1024,
  minColumns: 1,
  MEMBER_IMPORT_WRITE_CHUNK: 500,   // baris per statement createMany
  MEMBER_IMPORT_LOOKUP_CHUNK: 900,  // id per query IN
} as const
```

- **TIDAK ada angka chunk di service/repository** — hanya membaca dari `IMPORT_CONFIG`.
- Nilai default mengacu guard batas variabel SQLite (~32.766 parameter).

### 8.2 Write chunking (di dalam SATU transaksi)
- 5.000 baris × 9 kolom ≈ 45.000 parameter > batas → `createMany` tunggal gagal.
- `MemberRepository.createManyWithTx(tx, rows)` memecah menjadi beberapa statement `createMany`, masing-masing `MEMBER_IMPORT_WRITE_CHUNK` baris.
- **Semua statement dalam transaksi yang sama** → all-or-nothing tetap berlaku.

```ts
async createManyWithTx(tx: Prisma.TransactionClient, rows: Prisma.MemberCreateManyInput[]) {
  const chunk = IMPORT_CONFIG.MEMBER_IMPORT_WRITE_CHUNK
  for (let i = 0; i < rows.length; i += chunk) {
    await tx.member.createMany({ data: rows.slice(i, i + chunk) })  // satu statement per chunk
  }
}
```

### 8.3 Lookup chunking (read-only, sebelum write)
- `findManyByNISNs` / `findManyByEmails` memecah array menjadi beberapa query `where { field: { in: chunk } }`, masing-masing `MEMBER_IMPORT_LOOKUP_CHUNK` id.
- `findByNameAndBirthDate` per kombinasi unik (batch).

---

## 9. Progress Flow

### 9.1 Channel & mekanisme
- **Main → Renderer** via `event.sender.send('members:importProgress', payload)` pada channel `members:importProgress`.
- Preload mengekspos `memberImport.onProgress(cb): () => void` (return unsubscribe).
- Event dikirim DARI DALAM `MemberImportService.import` pada titik-titik stage.

### 9.2 Stage (Keputusan PO #7)
**Progress WAJIB menampilkan jumlah data yang telah diproses** pada stage berjalan (`current / total`), bukan sekadar perpindahan stage (keputusan PO, Revisi 2). UI menampilkan label stage + angka terproses:

```
Checking Duplicate    347 / 5000
Resolving Class       912 / 5000
Saving Database      2500 / 5000
```

```ts
export type MemberImportStage =
  | 'preparing'            // normalisasi + build payload
  | 'checking-duplicate'   // Tahap 1 in-file → Tahap 2 DB (keduanya selalu dijalankan)
  | 'resolving-class'      // findActive + findByAcademicYear + map
  | 'generating-number'    // allocateMemberNumbers (di dalam tx, O(1))
  | 'saving'               // createMany chunk 1..n (di dalam tx)
  | 'completed'            // hasil dikirim

export interface MemberImportProgressEvent {
  stage: MemberImportStage
  current: number   // jumlah BARIS yang sudah diproses pada stage berjalan (bukan sekadar 0/N)
  total: number
}
```

- `current` diisi dengan **jumlah data (baris) nyata yang sudah terproses** pada stage tersebut — diperbarui berkala, bukan hanya dikirim satu kali per stage.
- `total` = jumlah baris input (N) untuk semua stage kecuali yang definisinya berbeda (lihat §9.3).

### 9.3 Alur pengiriman

| Stage | current/total (jumlah baris terproses) | Keterangan |
|-------|---------------|------------|
| `preparing` | 0 / N | mulai; normalisasi |
| `checking-duplicate` | progress nyata pada Tahap 1 & Tahap 2 (keduanya selalu dijalankan) | in-file selesai dulu, lalu DB; `current` bertambah per batch yang diperiksa |
| `resolving-class` | per baris resolusi | loop in-memory, `current` di-update berkala (mis. tiap 100 baris) |
| `generating-number` | 0 / N | alokasi O(1) dalam tx |
| `saving` | kumulatif baris per chunk commit | `current` = jumlah baris tersimpan hingga chunk terakhir (mis. 500, 1000, …, 5000) |
| `completed` | N / N | sebelum result dikirim |

- **UI WAJIB menampilkan angka `current / total` bersama label stage** — mis. `Checking Duplicate 347 / 5000`, `Resolving Class 912 / 5000`, `Saving Database 2500 / 5000` — bukan hanya "Checking…" / "Saving…".
- `previewCheck` TIDAK mengirim progress (bukan operasi panjang wajib).

---

## 10. DTO Design

### 10.1 Input dari renderer ke main (disimpan di `src/shared/dto/member.ts`)

```ts
// Dibangun renderer dari ParsedMemberRow (sudah tervalidasi)
export interface MemberImportRowInput {
  rowNumber: number
  fullName: string
  className: string          // teks "X MIPA 1"
  gender: 'male' | 'female'
  nisn: string
  birthPlace?: string
  birthDate?: string         // ISO YYYY-MM-DD
  address: string
  phone: string
  email?: string
}
```

### 10.2 Preview result

```ts
export interface MemberImportPreviewDTO {
  valid: boolean
  errorCount: number        // blocker (NISN/email/kelas) — memblokir import
  warningCount: number      // Nama+Tanggal Lahir — tidak memblokir
  errors: MatchingIssue[]
  warnings: MatchingIssue[]
}
```

### 10.3 Import result (Keputusan PO #8)

```ts
export interface MemberImportResultDTO {
  success: boolean
  totalRows: number        // total baris input (keputusan PO, Revisi 4)
  created: number          // baris tersimpan (hanya >0 bila success)
  failed: number           // baris gagal (== total bila !success)
  warnings: number         // jumlah warning Nama+Tanggal Lahir
  durationMs: number
  errors: MatchingIssue[]  // detail per baris (rowNumber + messageKey)
}
```

> `totalRows` selalu berisi jumlah baris yang dikirim renderer ke `import()`, terlepas dari `success`. Utilitas UI dapat menyimpulkan `failed = totalRows - created` bila `success=true`, namun DTO tetap memuat keduanya secara eksplisit untuk konsistensi laporan.

> `MatchingIssue` reuse dari `src/types/import.ts` (`{ rowNumber, messageKey }`). Renderer memetakan `messageKey` → label via `LABELS.MEMBER_IMPORT.MESSAGES` / map baru.

---

## 11. Error Design

| Kategori | Kode/MessageKey | Sumber | Efek |
|----------|-----------------|--------|------|
| File invalid (ekstensi/ukuran) | `IMP-002` / `IMP-003` | renderer (validateImportFile) | Blok di upload |
| Read/parse gagal | `IMP-004` / "File gagal dibaca." | renderer (parser) | Blok |
| Wajib kosong / tipe salah / enum invalid | `IMP-013..015` / `memberImport.*` | renderer (validation) | Baris invalid → import nonaktif |
| NISN duplikat (file/DB) | `memberImport.duplicateNisnInFile/InDb` | main (preflight) | **BLOCKER** |
| Email duplikat (file/DB), bila terisi | `memberImport.duplicateEmailInFile/InDb` | main (preflight) | **BLOCKER** |
| Nama+Tanggal Lahir duplikat (file/DB) | `memberImport.duplicateNameBirthInFile/InDb` | main (preflight) | **WARNING** |
| Kelas tidak ditemukan | `memberImport.classNotFound` + **nama kelas** (contoh: `Baris 18: Kelas "XI Merdeka 1" tidak ditemukan.`) | main (preflight) | **BLOCKER** |
| Kelas ambigu | `memberImport.classAmbiguous` + **nama kelas** | main (preflight) | **BLOCKER** |
| DB constraint saat commit (P2002) | `memberImport.createFailed` | main (tx) | ROLLBACK; `success:false` |
| System error (DB down/timeout) | reject promise → `memberImport.importFailed` | main | Error UI |

Prinsip:
1. **Preflight** → hasil terstruktur (`MemberImportPreviewDTO` / errors+warnings di `MemberImportResultDTO`), **bukan throw**.
2. **Throw hanya untuk kegagalan sistem** (DB unreachable, timeout) → ditangkap `ipcMain.handle` → reject → renderer tampilkan pesan. Pola `AppError` reuse (`electron/main/errorHandler.ts`).
3. **JANGAN ulangi bug B1 buku (WO-3):** error import harus **dikembalikan ke UI secara eksplisit** (`MemberImportResultDTO.errors` per baris), bukan disembunyikan.
4. `success:false` dijamin **0 baris tersimpan** (rollback penuh).
5. **Error kelas wajib memuat nama kelas** (keputusan PO Revisi 3): detail per baris menaruh `className` yang gagal dicari, sehingga pesan yang tampil di UI informatif (`Baris 18: Kelas "XI Merdeka 1" tidak ditemukan.`), bukan sekadar `classNotFound`.

---

## 12. Recovery Strategy

### 12.1 Force close / listrik mati (keputusan #9)
- Semua tulis dalam SATU `$transaction` (SQLite journal + Prisma).
- Aplikasi mati / listrik mati **di tengah transaksi** → pada buka berikutnya SQLite menjalankan rollback journal → **transaksi dibatalkan otomatis, 0 baris tersimpan**.
- UI: hasil tidak pernah dikirim → dialog tampil di state error (atau pengguna membuka ulang aplikasi dan mengulang upload). **Tidak ada partial import.**
- Efek samping positif all-or-nothing: recovery = "gagal total, upload ulang". Tidak perlu resume (dan resume memang out of scope).

### 12.2 Database timeout ("database is locked")
- SQLite desktop single-user, satu proses → risiko rendah. Prisma menetapkan busy timeout bawaan.
- Bila terjadi: `$transaction` melempar error → ROLLBACK otomatis → `success:false` + pesan `memberImport.importFailed` (atau `createFailed`).
- **Tidak ada deadlock** (single-writer, satu transaksi aktif).
- Mitigasi desain: transaksi sesingkat mungkin (all reads sudah selesai sebelum tx; di dalam tx hanya `allocate` + `createMany` chunk).

### 12.3 Import terpotong sebelum commit
- Seluruh batch batal (all-or-nothing) → tidak ada baris valid yang tersisa di DB → operator memperbaiki file & mengulang.
- Tidak ada staging table, tidak ada log resume (out of scope PO #10).

---

## 13. Performance Strategy

| Tahap | Pendekatan | Skala 100/500/1.000/5.000 |
|-------|------------|---------------------------|
| Parse + validasi (renderer) | in-memory linear, tanpa loop DB | aman semua skala |
| Preview (renderer) | render ≤ 50 baris (`PREVIEW_MAX_ROWS`) | aman |
| Tahap 1 duplicate (file) | map in-memory sekali iterasi | O(n), aman |
| Tahap 2 duplicate (DB) | 3 jenis query `IN` ter-chunk; **selalu dijalankan** (keputusan PO #2) | O(#chunk), ≤ 6 query @5.000 |
| Class resolve | `findActive` + `findByAcademicYear` = 2 query total, map in-memory | konstan, bukan per-baris |
| Alokasi nomor | `max suffix` 1 query di dalam tx | konstan |
| Write | `createMany` chunk (`WRITE_CHUNK`) dalam SATU tx | ≤ 10 statement @5.000, 1 commit |
| Commit | satu commit di akhir | — |

- **Aturan:** semua pembacaan sebelum semua penulisan; semua penulisan dalam satu transaksi; chunk config dari `IMPORT_CONFIG`.
- **Guard batas SQLite (~32.766 variabel):** `WRITE_CHUNK=500` × 9 kolom ≈ 4.500 param « batas; `LOOKUP_CHUNK=900` « batas.
- 5.000 baris preview tabel: hanya 50 baris dirender; validasi in-memory linear.
- **Tanpa benchmark/optimasi** (keputusan PO #9 SPEC) — target "tidak crash", bukan kecepatan.

---

## 14. Security

| Aspek | Desain |
|-------|--------|
| SQL Injection | AMAN — Prisma query parameterized; semua input sebagai nilai. |
| Malformed Excel | Parser menolak file rusak ("File gagal dibaca"); hanya `sheet[0]` dipakai; file ≤ 5MB via `validateImportFile` di dialog (guard ukuran/ekstensi sebelum parse — memperbaiki temuan audit E2). |
| Duplicated request | **Single-flight guard** di `MemberImportService`: tolak bila sudah ada import berjalan (module-level in-flight flag); UI `disabled` tombol saat `importing`. |
| Race condition | Desktop single-process, IPC serial di main → risiko rendah. `allocateMemberNumbers` di dalam tx menghilangkan race nomor (`max+1`, bukan `count()+1`). `memberNumber` `@unique` + `nisn` `@unique` sebagai backstop (P2002 → rollback). |
| TOCTOU preview→import | Preflight **diulang di main** pada `import()`; hasil preview hanya untuk UX. |

---

## 15. Out of Scope (Keputusan PO #10 + SPEC)

- **Auto Create Class** — kelas wajib sudah ada di master; tidak ditemukan → import gagal.
- **Auto Fix Data** — tidak ada koreksi/transformasi otomatis data bermasalah.
- **Partial Import** — valid-rows-only TIDAK didukung; selalu all-or-nothing.
- **Resume Import** — import yang gagal/terpotong diulang dari awal.
- Import Guru & Umum (hanya SISWA).
- Update massal / merge data existing (import hanya create).
- Benchmark & optimasi skala (target desain, bukan pengerjaan).
- Route/menu/context/hook baru; perubahan schema & migration; dependency baru.
- Barcode / ID card anggota hasil import.

---

## 16. Implementation Work Breakdown

> Breakdown fasa implementasi (bukan Work Order formal — menunggu arahan PO).

### 16.1 ATURAN IMPLEMENTASI (keputusan PO #13, Revisi 6)

**Setiap fasa dikerjakan SATU PER SATU dan tidak boleh melompati gate.** Urutan wajib per fasa P1–P7:

1. Kode fasa **selesai**.
2. `npm run lint` → **PASS**.
3. `npm run build` → **PASS**.
4. **Review Product Owner** terhadap hasil fasa.
5. **Approval Product Owner**.
6. Hanya setelah approval, fasa berikutnya boleh dimulai.

**TIDAK ada implementasi beberapa fasa sekaligus.** Satu fasa berjalan; fasa lain menunggu. Tanpa approval PO, fasa berikutnya TIDAK dimulai. Tiap fasa menghasilkan laporan/lampiran untuk review PO (pola sesuai prosedur `AGENTS.md`).

| Fasa | Cakupan | File utama | Dependensi |
|------|---------|------------|------------|
| **P1 — Nomor anggota (prasyarat)** | Perbaiki prefix bug (`student/teacher/general`); ganti `count()+1` → `max suffix + 1`; tambah `allocateMemberNumbers(tx, count, memberType)` | `src/main/services/number-generator.service.ts` | — |
| **P2 — Repository & config** | `MemberRepository`: `createManyWithTx`, `findManyByNISNs`, `findManyByEmails`, `findByNameAndBirthDate` (chunked); `AcademicYearRepository.findActive()`; `IMPORT_CONFIG` +2 key chunk | `member.repository.ts`, `academic-year.repository.ts`, `import.config.ts` | P1 |
| **P3 — Service (duplicate + class)** | `MemberDuplicateChecker` (Tahap 1+2, chunked, blocker/warning); `MemberClassResolver` (parse X/XI/XII, scope AY aktif, not-found/ambiguous → blocker) | `src/main/services/member-duplicate-checker.service.ts`, `member-class-resolver.service.ts` | P2 |
| **P4 — Orchestrator + transaksi** | `MemberImportService`: preflight (`previewCheck`) + `import` (single-flight, satu `$transaction`, progress event, map P2002); DTO baru di `dto/member.ts` | `src/main/services/member-import.service.ts`, `src/shared/dto/member.ts` | P1–P3 |
| **P5 — IPC/preload/env/bootstrap** | `members:previewCheck`, `members:import`, main→renderer `members:importProgress`; preload `memberImport.{previewCheck,import,onProgress}`; env.d.ts; wiring bootstrap | `electron/ipc/member.ipc.ts`, `electron/preload/member.preload.ts`, `src/renderer/env.d.ts`, `electron/main/bootstrap.ts` | P4 |
| **P6 — UI + hasil** | Dialog: guard file (`validateImportFile`), panggil `previewCheck`, progress listener + stage labels **dengan angka terproses `current / total`** (mis. `Checking Duplicate 347 / 5000`), tampil `MemberImportResultDTO` (totalRows/created/failed/warnings/duration/errors per baris), disabled saat `importing`, refresh daftar; label baru `LABELS.MEMBER_IMPORT` | `src/components/members/MemberImportDialog.tsx`, `src/utils/labels.ts`, `src/pages/MemberListPage.tsx` | P5 |
| **P7 — Validation & regression** | lint, build, fresh DB `migrate deploy` (tanpa migration baru), `migrate diff` = no difference; smoke 100/500/1.000/5.000 (chunk boundary), duplicate file+DB (blocker & warning, **Tahap 1+2 selalu dijalankan**), class not-found/ambiguous (**error memuat nama kelas**), nomor berurutan & tidak reuse setelah delete, **rollback saat P2002 → nomor yang batal tidak terpakai**, **result memuat totalRows** | — | P1–P6 |

**Kriteria penerimaan kunci:**
- Import 5.000 siswa sukses: `success:true`, `created=5000`, 1 transaksi, chunked write/lookup.
- 1 baris blocker → `success:false`, `created=0` (all-or-nothing).
- NISN/email duplikat → blocker; Nama+Tanggal Lahir → warning (tidak memblokir).
- Nomor anggota `S-` berurutan dari `max+1`, tidak pernah reuse setelah delete.
- Kelas tidak ditemukan/ambigu → import gagal; tidak ada auto-create.
- Progress: 6 stage dikirim ke renderer; setiap stage menampilkan **jumlah data terproses** (`current / total`), mis. `Checking Duplicate 347 / 5000`.
- Error result: `totalRows / created / failed / warnings / durationMs / errors` lengkap ke UI.

---

## 17. Status

**RFC v2 — Revisi WO-5 (6 revisi) telah diintegrasikan.** Revisi yang masuk:
1. Tahap 1 **dan** Tahap 2 duplicate detection **selalu** dijalankan (§0 #2, §5.3).
2. Progress menampilkan jumlah data terproses `current / total` (§9.2, §9.3).
3. Error kelas memuat nama kelas yang gagal dicari (§6, §11).
4. `MemberImportResultDTO` memuat `totalRows` (§10.3).
5. Semantik rollback nomor anggota: alokasi batal saat ROLLBACK, resmi hanya setelah COMMIT (§4, §7).
6. Aturan implementasi bertahap per fasa P1–P7 dengan gate lint+build+review PO+approval (§16.1).

**RFC v2 siap dikunci setelah approval Product Owner.** Setelah approval: RFC ditutup menjadi Work Order implementasi (mengikuti urutan P1–P7 DAN gate §16.1 — satu fasa per kali, tiap fasa lint PASS → build PASS → review PO → approval) + UAT, fresh-DB migrate deploy, packaging verification sesuai prosedur `AGENTS.md`. Sampai ada approval, **tidak ada implementasi, tidak ada Work Order, tidak ada commit.**

**Mode READ ONLY — tidak ada perubahan kode. RFC v2 selesai. Berhenti — menunggu approval Product Owner.**
