# MEMBER_IMPORT_SERVICE_ARCHITECTURE_RFC — P4A (Orchestrator Design)

**Fitur:** Import Anggota (SISWA) — mass import dari Excel ke database
**Role:** Project Engineer
**Mode:** DESIGN ONLY — menyusun Architecture RFC untuk `MemberImportService` (fasa P4). Bukan implementasi, bukan Work Order berikutnya.
**Status:** Menunggu review Product Owner
**Tanggal:** 02-08-2026
**Source of Truth:**
1. `MEMBER_IMPORT_DATABASE_RFC.md` (RFC v2 APPROVED) — keputusan PO #1–#13
2. Hasil fasa selesai: **P1** `NumberGeneratorService` (DONE), **P1.1** repository optimasi (DONE), **P2** `MemberDuplicateChecker` (DONE), **P3** `MemberClassResolver` (DONE)

---

## Ringkasan Keputusan Desain (acuan seluruh dokumen)

| # | Keputusan | Nilai |
|---|-----------|-------|
| D1 | **Tahap 1 (duplikat dalam file) TETAP di renderer** | Scope P2 mengunci "Duplicate File tetap seperti sekarang" (`MemberPreviewService`, `src/services/MemberPreviewService.ts`). Orchestrator preflight = **Tahap 2 (DB)** + **Resolve Class** — sesuai lifecycle yang digambar PO (Klik Import → Preflight → Duplicate Database → Resolve Class). Renderer hanya mengirim baris yang lolos validasi + gate `canImport` (in-file NISN duplikat). Deviasi dari RFC §2/§3/§5 (yang menempatkan Tahap 1 di main) dicatat — lihat §1.4. |
| D2 | **`memberType` dikunci `'student'`** | Import adalah SISWA saja (RFC §15). `allocateMemberNumbers(tx, count, 'student')`. |
| D3 | **`status` baris import = `'INACTIVE'`** | Konsisten dengan jalur single-create (WO-004) dan default schema `@default("INACTIVE")`; diisi eksplisit di payload. |
| D4 | **Issue DTO "kaya" (bukan `MatchingIssue` polos)** | Error hasil import wajib memuat detail agar UI informatif (RFC §11 #3): field duplikat, nomor/anggota yang sudah ada, dan nama kelas yang gagal dicari. `MemberImportPreviewIssue` = `MatchingIssue` + field opsional. |
| D5 | **`MemberRepository.createManyWithTx` + `IMPORT_CONFIG.MEMBER_IMPORT_WRITE_CHUNK`** | Keduanya **belum ada** — akan ditambahkan di P4 (RFC §8.1/§8.2). `createMany` di-chunk DI DALAM satu transaksi. |
| D6 | **Orchestrator = SATU-SATUNYA penulis** | Seluruh service di bawahnya read-only atau tx-scoped. Tidak ada write di luar transaksi. |
| D7 | **Single-flight guard** | `import()` menolak bila sudah ada import berjalan (in-flight flag module-level; RFC §14). |

---

## 1. Architecture Overview

### 1.1 Posisi `MemberImportService` dalam arsitektur

```
┌────────────────────────────── RENDERER ──────────────────────────────┐
│  MemberImportDialog                                                   │
│   ├─ MemberExcelParserService (reuse)                                 │
│   ├─ MemberImportValidationService (reuse)                            │
│   ├─ MemberPreviewService (Tahap 1 in-file, gate canImport) [D1]      │
│   ├─ memberImport.previewCheck(rows)  → MemberImportPreviewDTO        │
│   ├─ memberImport.import(rows)        → MemberImportResultDTO         │
│   └─ memberImport.onProgress(cb)      → MemberImportProgressEvent     │
└──────────────┬───────────────────────────────────────────────────────┘
               │ preload (memberImport.*) + env.d.ts
               ▼
┌──────────── MAIN ────────────────────────────────────────────────────┐
│  electron/ipc/member.ipc.ts                                          │
│    members:previewCheck / members:import / members:importProgress    │
│        ▼                                                             │
│  ┌─ MemberImportService (ORCHESTRATOR — tipis, single-flight) ─────┐ │
│  │  previewCheck(rows)    → preflight (read-only)                   │ │
│  │  import(rows)          → preflight ulang + SATU $transaction     │ │
│  └────┬─────────┬─────────────┬──────────────────┬──────────────────┘ │
│       ▼         ▼             ▼                  ▼                    │
│  MemberDuplicate  MemberClass   NumberGenerator   MemberRepository    │
│  Checker (P2)     Resolver (P3)  Service (P1)      (+createManyWithTx)│
│       │              │            (tx-scoped)      (P4 tambahan)      │
│       ▼              ▼                                │               │
│  MemberRepository  AcademicYearRepository         runTransaction      │
│  (findManyByNISNs/ ClassRepository                (getPrisma())       │
│   findManyByEmails) (findByAcademicYear)                              │
└───────────────────────────────────────────────────────────────────────┘
```

### 1.2 Dependensi orchestrator (semua sudah ada kecuali yang bertanda ✚)

| Dependensi | Kelas/File | Status |
|-----------|-----------|--------|
| Duplicate DB | `MemberDuplicateChecker` (`src/main/services/member-duplicate-checker.service.ts`) | P2 DONE |
| Class resolver | `MemberClassResolver` (`src/main/services/member-class-resolver.service.ts`) | P3 DONE |
| Nomor anggota | `NumberGeneratorService` (`src/main/services/number-generator.service.ts`) | P1 DONE |
| Insert | `MemberRepository.createManyWithTx` (`src/main/repositories/member.repository.ts`) | ✚ P4 |
| Transaksi | `runTransaction(getPrisma(), fn)` (`src/main/repositories/base/transaction.ts` + `base/prisma.ts`) | ADA (reuse) |
| Chunk config | `IMPORT_CONFIG.MEMBER_IMPORT_WRITE_CHUNK` (`src/config/import.config.ts`) | ✚ P4 (LOOKUP_CHUNK sudah ada) |
| DTO | `src/shared/dto/member.ts` — `MemberImportRowInput` ada; sisanya ✚ P4 | |

### 1.3 Prinsip inti (dari RFC v2)

1. **All-or-Nothing** — seluruh baris dalam SATU `$transaction`; error apa pun → ROLLBACK → `success:false`, `created:0`.
2. **Preflight read-only** — deteksi duplikat DB + resolusi kelas SEBELUM transaksi; tidak ada tulis bila ada blocker.
3. **Semua pembacaan sebelum semua penulisan** — write ter-chunk dalam satu transaksi.
4. **Preflight diulang di `import()`** — hasil `previewCheck` hanya UX (TOCTOU, RFC §3/§14).
5. **Nomor permanen** — `max suffix + 1..+count` di dalam transaksi (PO #4/#12).

### 1.4 Catatan deviasi Tahap 1 (wajib diketahui PO)

RFC v2 §2/§3/§5 menempatkan **Tahap 1 (in-file)** di `MemberDuplicateChecker` di main, sehingga semua masalah (file+DB) tampil dalam SATU preview. P2 mengunci Tahap 1 tetap di renderer. Konsekuensi saat ini:

- Renderer `MemberPreviewService` hanya mendeteksi duplikat **NISN in-file** (→ status `DUPLICATE`, `canImport = valid === total`).
- **Email in-file** dan **Nama+Tanggal Lahir in-file (warning)** belum ada deteksinya (RFC §5.1).
- **DB warning Nama+Tanggal Lahir** (`findByNameAndBirthDate`, RFC §5.2) juga belum dibangun.

Dampak pada P4: preflight orchestrator = Tahap 2 (NISN/email DB, blocker) + class (blocker). `warningCount` saat ini selalu 0 sampai penyedia warning ditambahkan. **Kontrak DTO sudah menyiapkan slot `warnings`** sehingga penyedia warning baru (di mana pun) bisa di-plug tanpa mengubah kontrak. Jika PO ingin Tahap 1 pindah ke main, itu adalah Work Order terpisah di luar P4.

---

## 2. Import Lifecycle

```
Klik Import
    │
    ▼
┌─ [0] RENDERER (di luar MemberImportService) ─────────────────────────┐
│   parse → validate → MemberPreviewService (Tahap 1, gate canImport)  │
│   kirim MemberImportRowInput[] yang lolos                            │
└───────────────────────────────────────────────────────────────────────┘
    │  members:import(rows)
    ▼
┌─ [1] PREFLIGHT — READ ONLY (MemberImportService.import) ─────────────┐
│   MemberDuplicateChecker.checkDatabase(rows)   → { errors[] }        │
│   MemberClassResolver.resolve(rows)            → { items[], errors[] }│
│   gabung → preflight { errors, warnings, classIdByRow }              │
│   errors.length > 0 ?  →  return success:false, created:0, FAIL       │
└───────────────────────────────────────────────────────────────────────┘
    │ bersih
    ▼
┌─ [2] SATU TRANSACTION (runTransaction(getPrisma(), tx => ...)) ──────┐
│   NumberGeneratorService.allocateMemberNumbers(tx, N, 'student')     │
│       → string[]  (baca max suffix DI DALAM tx)                      │
│   build payload  MemberCreateManyInput[] (zip: row + classId + nomor)│
│   MemberRepository.createManyWithTx(tx, payload)  (chunked, di dalam │
│       tx yang sama; MEMBER_IMPORT_WRITE_CHUNK per statement)         │
└───────────────────────────────────────────────────────────────────────┘
    │  COMMIT otomatis oleh $transaction  (rollback otomatis bila throw)
    ▼
┌─ [3] RESULT ─────────────────────────────────────────────────────────┐
│   MemberImportResultDTO { success, totalRows, created, failed,       │
│                            warnings, durationMs, errors }            │
└───────────────────────────────────────────────────────────────────────┘
```

### 2.1 Urutan wajib (RFC §3)

| Step | Panggilan | Lapisan | Tulis? |
|------|-----------|---------|--------|
| 1 | Upload → guard file → parse → validate | renderer | ✗ |
| 2 | `memberImport.previewCheck(rows)` → preflight → preview + blocker | main (orchestrator) | ✗ |
| 3 | `memberImport.import(rows)` → **preflight ULANG** → bila bersih → SATU tx → commit | main (orchestrator) | ✓ |
| 4 | Result tampil → tutup dialog → refresh daftar | renderer | ✗ |

### 2.2 Progress (RFC §7/#11) — desain, diimplementasikan di P4/P5

`import()` mengirim `MemberImportProgressEvent { stage, current, total }` pada titik-titik stage (via callback yang di-inject IPC, bukan akses langsung ke Electron):

```
preparing 0/N → checking-duplicate (current nyata per batch) →
resolving-class (current nyata per batch baris) →
generating-number 0/N → saving (current kumulatif per chunk) →
completed N/N → result
```

`previewCheck` TIDAK mengirim progress (operasi read-only singkat).

---

## 3. Service Responsibility

### 3.1 Matriks tanggung jawab

| Service | Metode | Input | Output | Melempar exception? | Tulis DB? |
|---------|--------|-------|--------|---------------------|-----------|
| `MemberDuplicateChecker` (P2) | `checkDatabase(rows)` | `MemberImportRowInput[]` | `MemberDuplicateDatabaseResult { errors[] }` | **Tidak** untuk kasus bisnis; hanya error sistem DB (propagasi) | ✗ (read-only, chunked IN) |
| `MemberClassResolver` (P3) | `resolve(rows)` | `MemberImportRowInput[]` | `MemberClassResolutionResult { items[], errors[] }` | **Tidak** untuk kasus bisnis; hanya error sistem DB (propagasi) | ✗ (read-only, 2 query total) |
| `NumberGeneratorService` (P1) | `allocateMemberNumbers(tx, count, memberType)` | `tx`, `count`, `memberType` | `string[]` | **Ya** — error DB di dalam tx (propagasi ke orchestrator) | ✓ tx-scoped (read max suffix + alokasi in-memory) |
| `MemberRepository` | `createManyWithTx(tx, payload)` ✚ | `tx`, `MemberCreateManyInput[]` | `void` | **Ya** — P2002 / error DB di dalam tx (propagasi) | ✓ tx-scoped (chunked `createMany`) |
| **`MemberImportService`** (P4) | `previewCheck(rows)` / `import(rows, onProgress?)` | `MemberImportRowInput[]` | `MemberImportPreviewDTO` / `MemberImportResultDTO` | **Hanya** error sistem (DB down/timeout) → `AppError` → reject promise. **Semua kasus bisnis → result object.** | ✓ hanya lewat `$transaction` |

### 3.2 Aturan lempar-vs-return (RFC §11)

1. **Preflight** (duplicate DB + class) → **result object** (`MemberImportPreviewDTO` / errors+warnings di `MemberImportResultDTO`), **bukan throw**.
2. **Commit (P2002)** → Prisma ROLLBACK otomatis → orchestrator **menangkap** dan memetakan ke `MemberImportResultDTO { success:false, errors:[{rowNumber,messageKey:'memberImport.createFailed'}] }`. Tetap `created:0`.
3. **Error sistem** (DB unreachable, timeout, database locked) → **throw `AppError`** → ditangkap `ipcMain.handle` → reject → renderer menampilkan pesan (pola `electron/main/errorHandler.ts`).
4. **Tidak mengulang bug B1 buku (WO-3):** error baris import SELALU dikembalikan eksplisit di `errors`, tidak disembunyikan.
5. `success:false` dijamin **0 baris tersimpan**.

### 3.3 Message keys yang mengalir

| Sumber | messageKey | Efek |
|--------|-----------|------|
| P2 | `memberImport.duplicateNisnInDb` | BLOCKER |
| P2 | `memberImport.duplicateEmailInDb` (hanya bila email terisi) | BLOCKER |
| P3 | `memberImport.classNotFound` (+ `className`) | BLOCKER |
| P3 | `memberImport.classAmbiguous` (+ `className`) | BLOCKER |
| P4 (tx) | `memberImport.createFailed` (P2002 setelah mapping per baris) | BLOCKER → rollback |
| P4 (sistem) | reject → `memberImport.importFailed` | Error UI |

---

## 4. Transaction Boundary

```
                    ┌──────────────────────────────────────────────┐
                    │          DI LUAR $transaction                 │
                    │  [1] preflight (READ ONLY):                   │
                    │        dup DB (IN chunked) + class resolve    │
                    │  [2] single-flight guard check                │
                    │  [3] build payload (zip classId + nomor)      │
                    │  [4] mapping result / progress event send     │
                    └──────────────────────────────────────────────┘
                                      │  BEGIN
                                      ▼
                    ┌──────────────────────────────────────────────┐
                    │   DI DALAM $transaction (tx client)          │
                    │   NumberGenerator.allocateMemberNumbers(tx,  │
                    │     count, 'student')  → string[]            │
                    │   MemberRepository.createManyWithTx(tx,      │
                    │     payload)  → chunk createMany 1..n        │
                    └──────────────────────────────────────────────┘
                                      │  COMMIT / ROLLBACK
                                      ▼
```

- **Di dalam transaksi:** hanya (a) `allocateMemberNumbers(tx, ...)` dan (b) `createManyWithTx(tx, payload)` — semuanya memakai objek `tx: Prisma.TransactionClient` yang sama.
- **Di luar transaksi:** seluruh pembacaan preflight, guard single-flight, pembangunan payload, pengiriman progress event (non-DB), dan pemetaan hasil.
- **Satu commit di akhir** — dikelola `prisma.$transaction(fn)` interaktif (`runTransaction` reuse, `src/main/repositories/base/transaction.ts`).
- **Alasan:** transaksi sesingkat mungkin → semua read sudah selesai sebelum tx; di dalam tx hanya write (RFC §12.2 mitigasi database locked).
- Progress stage `saving` mengirim `event.sender.send(...)` (bukan akses DB) — aman dipanggil di dalam tx, tidak memengaruhi atomicity.

---

## 5. Rollback Strategy

| Aspek | Desain |
|-------|--------|
| **Rollback point** | Satu-satunya titik = batas `$transaction` (Prisma interactive). **Tidak ada savepoint, tidak ada commit per baris, tidak ada partial state.** |
| **Trigger rollback** | Setiap throw di dalam `fn(tx)` — P2002 (nisn/memberNumber unique), error DB, error sistem apa pun → Prisma otomatis ROLLBACK. |
| **Semantik nomor (PO #12)** | `allocateMemberNumbers` dijalankan DI DALAM tx. Rollback → nomor `max+1..+count` yang sempat dialokasikan **tidak dianggap terpakai** (`max suffix` DB tidak berubah, tidak ada baris tersimpan). Percobaan berikutnya mengalokasikan ulang dari `max+1` yang sama. Nomor resmi hanya setelah COMMIT. |
| **P2002 saat commit** | ROLLBACK penuh → orchestrator map ke `success:false` + error per baris (`createFailed`). `created:0` dijamin. |
| **Force close / listrik mati** | Semua tulis dalam satu tx (SQLite journal + Prisma) → pada buka berikutnya rollback journal SQLite membatalkan transaksi, 0 baris tersimpan. Recovery = upload ulang (resume out of scope, PO #10). |
| **Database timeout / locked** | `$transaction` throw → ROLLBACK → sistem error (reject). Single-writer desktop → tidak ada deadlock. |

---

## 6. DTO Flow

### 6.1 Kontrak (definisi baru ✚ di `src/shared/dto/member.ts`; reuse `MemberImportRowInput`)

```ts
// SUDAH ADA (P2) — input dari renderer ke main
export interface MemberImportRowInput {
  rowNumber: number
  fullName: string
  className: string          // "X MIPA 1"
  gender: 'male' | 'female'
  nisn: string
  birthPlace?: string
  birthDate?: string         // ISO YYYY-MM-DD
  address: string
  phone: string
  email?: string
}

// ✚ P4 — issue "kaya" (D4). Struktural kompatibel dengan MatchingIssue
//   ({ rowNumber, messageKey }), plus detail untuk pesan UI yang informatif.
export interface MemberImportPreviewIssue {
  rowNumber: number
  messageKey: string
  field?: 'nisn' | 'email'              // dari P2 (duplicate)
  existingMemberNumber?: string          // dari P2 (nomor yang sudah ada)
  existingMemberName?: string            // dari P2 (nama yang sudah ada)
  className?: string                     // dari P3 (nama kelas yang gagal dicari)
}

// ✚ P4 — hasil preview (RFC §10.2)
export interface MemberImportPreviewDTO {
  valid: boolean
  errorCount: number                     // blocker (NISN/email DB/kelas) — memblokir import
  warningCount: number                   // warning (hari ini 0 — lihat §1.4)
  errors: MemberImportPreviewIssue[]
  warnings: MemberImportPreviewIssue[]
}

// ✚ P4 — hasil import (RFC §10.3)
export interface MemberImportResultDTO {
  success: boolean
  totalRows: number
  created: number
  failed: number                         // == totalRows bila !success
  warnings: number
  durationMs: number
  errors: MemberImportPreviewIssue[]
}

// ✚ P4 — progress (RFC §9.2)
export type MemberImportStage =
  | 'preparing'
  | 'checking-duplicate'
  | 'resolving-class'
  | 'generating-number'
  | 'saving'
  | 'completed'

export interface MemberImportProgressEvent {
  stage: MemberImportStage
  current: number                        // baris nyata terproses pada stage berjalan
  total: number
}
```

### 6.2 Alur antar service

```
MemberImportRowInput[]
  │  previewCheck / import
  ▼
MemberImportService.preflight(rows)                       // internal, read-only
  ├─▶ MemberDuplicateChecker.checkDatabase(rows)
  │     └▶ MemberDuplicateDatabaseResult { errors: MemberDuplicateDatabaseIssue[] }
  └─▶ MemberClassResolver.resolve(rows)
        └▶ MemberClassResolutionResult { items[], errors[] }
  └─▶ gabung  →  MemberImportPreviewDTO   (untuk previewCheck)
       +     Map<rowNumber, classId>      (untuk import — build payload)
                                        │
  import(), bila bersih                  │
                                        ▼
  runTransaction(getPrisma(), tx => {
    numbers = NumberGeneratorService.allocateMemberNumbers(tx, N, 'student')  // string[]
    payload = zip(rows, classIdByRow, numbers)  →  MemberCreateManyInput[]
    MemberRepository.createManyWithTx(tx, payload)                            // void
  })
    │  →  MemberImportResultDTO
```

### 6.3 Pemetaan payload insert (invariant)

Payload dibangun **dengan urutan input baris** sehingga nomor berurutan `max+1..max+N` sejajar dengan baris. Field per baris:

| Field DTO input | Field `MemberCreateManyInput` |
|-----------------|-------------------------------|
| (alokasi) | `memberNumber` = nomor dari allocator |
| — | `memberType: 'student'` (D2) |
| `fullName` | `fullName` |
| `gender` | `gender` |
| `nisn` | `nisn` |
| `birthPlace?` | `birthPlace` |
| `birthDate?` (ISO) | `birthDate: new Date(...)` (hanya bila ter-parse) |
| `address` | `address` |
| `phone` | `phone` |
| `email?` | `email` |
| (resolusi kelas) | `classId` = dari `classIdByRow[rowNumber]` |
| — | `status: 'INACTIVE'` (D3) |

---

## 7. Dependency Diagram

```
                  ┌─────────────────────────────┐
                  │   MemberImportService       │
                  │   (orchestrator, P4)        │
                  └──────┬──────┬──────┬────────┘
                         │      │      │
              ┌──────────┘      │      └───────────┐
              ▼                 ▼                  ▼
   MemberDuplicateChecker  MemberClassResolver  NumberGeneratorService
   ┌─────────────┐          ┌──────────────┐    ┌───────────────┐
   │ MemberRepos │          │ AcademicYear │    │ MemberRepos   │
   │   (ro)      │          │ Repository   │    │   (tx)        │
   └─────────────┘          │ ClassRepo    │    └───────┬───────┘
                            └──────────────┘            │
                                                       ▼
   MemberRepository (createManyWithTx, tx) ── runTransaction(getPrisma(), fn)
```

### 7.1 Konstruksi DI (kontrak — wiring nyata di P5 bootstrap)

```ts
// bootstrap.ts (P5) — alur DI
const memberRepository = new NewMemberRepository()
const academicYearRepository = new AcademicYearRepository()
const classRepository = new ClassRepository()

const numberGeneratorService = new NumberGeneratorService(memberRepository)
const memberDuplicateChecker = new MemberDuplicateChecker(memberRepository)
const memberClassResolver = new MemberClassResolver(academicYearRepository, classRepository)

const memberImportService = new MemberImportService(
  memberDuplicateChecker,
  memberClassResolver,
  numberGeneratorService,
  memberRepository
)
```

---

## 8. Public API

```ts
export class MemberImportService {
  constructor(
    private readonly duplicateChecker: MemberDuplicateChecker,
    private readonly classResolver: MemberClassResolver,
    private readonly numberGenerator: NumberGeneratorService,
    private readonly memberRepository: MemberRepository
  ) {}

  // Preview: preflight read-only → blocker/warning untuk UI. Tanpa tulis, tanpa progress.
  async previewCheck(rows: MemberImportRowInput[]): Promise<MemberImportPreviewDTO>

  // Import: single-flight → preflight ULANG → SATU $transaction → result.
  // onProgress di-inject oleh IPC (P5) untuk mengirim members:importProgress.
  async import(
    rows: MemberImportRowInput[],
    options?: { onProgress?: (event: MemberImportProgressEvent) => void }
  ): Promise<MemberImportResultDTO>

  // Guard single-flight — query status berjalan (dipakai IPC/UI).
  isImportRunning(): boolean
}
```

Struktur internal (sketsa P4):

```
import(rows, { onProgress }) {
  if (this.isImportRunning()) return { success:false, ... errors:[importFailed] } // D7
  try {
    setRunning(true); emit('preparing', 0/N)
    const preflight = await this.preflight(rows)          // dup DB + class (+ progress checking-duplicate/resolving-class)
    if (preflight.errors.length > 0) return buildResult(false, preflight)
    emit('generating-number', 0/N)
    const created = await runTransaction(getPrisma(), async (tx) => {
      const numbers = await this.numberGenerator.allocateMemberNumbers(tx, rows.length, 'student')
      const payload = this.buildPayload(rows, preflight.classIdByRow, numbers)
      await this.memberRepository.createManyWithTx(tx, payload)   // progress 'saving' per chunk
      return payload.length
    })
    emit('completed', N/N)
    return buildResult(true, { created, ... })
  } catch (error) {
    return this.mapCommitError(error, rows)     // P2002 → result; sistem → throw AppError
  } finally { setRunning(false) }
}
```

---

## 9. Error Flow

| Kategori | Sumber | Cara disampaikan | messageKey | Efek |
|----------|--------|------------------|-----------|------|
| NISN duplikat di DB | P2 (preflight) | **result object** | `memberImport.duplicateNisnInDb` | BLOCKER → `success:false`, 0 write |
| Email duplikat di DB (bila terisi) | P2 (preflight) | **result object** | `memberImport.duplicateEmailInDb` | BLOCKER → `success:false`, 0 write |
| Kelas tidak ditemukan | P3 (preflight) | **result object** (+ `className`) | `memberImport.classNotFound` | BLOCKER → `success:false`, 0 write |
| Kelas ambigu | P3 (preflight) | **result object** (+ `className`) | `memberImport.classAmbiguous` | BLOCKER → `success:false`, 0 write |
| DB constraint saat commit (P2002) | P4 (tx) | **ditangkap → result object** (mapping per baris) | `memberImport.createFailed` | ROLLBACK → `success:false`, 0 write |
| Error sistem (DB down/timeout/locked) | P4 | **throw `AppError` → reject promise** | `memberImport.importFailed` | Error UI; 0 write |
| Import ganda (single-flight) | P4 | **result object** (tanpa tulis) | `memberImport.importFailed` | Error UI; 0 write |

Alur:
```
preflight issue  → return result (0 write)
commit P2002     → catch → map ke errors per baris → return result (0 write)
error lain       → catch → throw AppError → ipcMain.handle reject → renderer error UI
```

---

## 10. Sequence Diagram

### 10.1 `previewCheck(rows)`

```
Renderer              MemberImportService      MemberDuplicateChecker   MemberClassResolver    DB
   │  previewCheck(rows) │                          │                        │                  │
   │────────────────────▶│   preflight (read-only)  │                        │                  │
   │                     │───checkDatabase(rows)──▶│                        │                  │
   │                     │                          │──findManyByNISNs/Emails(chunked IN)──▶   │
   │                     │◀──{ errors }─────────────│                        │                  │
   │                     │───resolve(rows)─────────▶│                        │                  │
   │                     │                          │──findActive()────────▶│──▶ DB            │
   │                     │                          │──findByAcademicYear()─▶│──▶ DB            │
   │                     │◀──{ items, errors }──────│                        │                  │
   │◀─ MemberImportPreviewDTO ──│ (gabung + classIdByRow)                   │                  │
```

### 10.2 `import(rows, onProgress)`

```
Renderer       MemberImportService     NumberGenerator     MemberRepository   DB        IPC->Renderer
   │  import(rows) │                       │                    │              │              │
   │──────────────▶│  single-flight OK     │                    │              │              │
   │               │  preflight ULANG      │                    │              │              │
   │               │  (dup DB + class)     │                    │              │              │
   │               │  errors? → return fail│                    │              │              │
   │               │  emit('checking…')    │                    │              │              │──▶ progress
   │               │  emit('resolving…')   │                    │              │              │──▶ progress
   │               │  emit('generating…')  │                    │              │              │──▶ progress
   │               │  BEGIN $transaction   │                    │              │              │
   │               │──allocate(tx,N)──────▶│──findLastMemberNumberByPrefix(tx)──▶│              │
   │               │◀── string[N]──────────│                    │              │              │
   │               │  build payload        │                    │              │              │
   │               │──createManyWithTx────▶│                    │──createMany chunk 1..n(tx)──▶│
   │               │                       │                    │              │  (commit)      │
   │               │  emit('saving', n/N)  │                    │              │              │──▶ progress
   │               │  COMMIT otomatis      │                    │              │              │
   │◀─ MemberImportResultDTO ──│           │                    │              │              │
   │               │  emit('completed')    │                    │              │              │──▶ progress
```

---

## 11. Implementation Breakdown

### 11.1 P4 — Orchestrator + transaksi (fasa berikutnya, TUNGGU approval PO)

| File | Perubahan |
|------|-----------|
| `src/main/services/member-import.service.ts` | **BARU** — `MemberImportService` (public API §8), single-flight guard, `preflight()` (gabung P2+P3), `import()` (satu `$transaction`: allocate + createManyWithTx chunked), pemetaan P2002 → per baris, emit progress, throw hanya error sistem. |
| `src/shared/dto/member.ts` | Tambah `MemberImportPreviewDTO`, `MemberImportResultDTO`, `MemberImportPreviewIssue`, `MemberImportProgressEvent`, `MemberImportStage` (§6.1). |
| `src/main/repositories/member.repository.ts` | Tambah `createManyWithTx(tx, rows)` — chunk `createMany` per `IMPORT_CONFIG.MEMBER_IMPORT_WRITE_CHUNK` DI DALAM tx yang sama (§8.2 RFC). |
| `src/config/import.config.ts` | Tambah `MEMBER_IMPORT_WRITE_CHUNK: 500` (§8.1 RFC). |

**TIDAK diubah di P4:** schema/migrasi; service P1/P2/P3; renderer; IPC/preload/env/bootstrap (P5); UI (P6); progress ke renderer (P5).

**Validasi P4:** lint PASS → build PASS → smoke pada fresh DB (`migrate deploy` 3 migration): import bersih, 1 blocker → all-or-nothing, P2002 → rollback + nomor tidak terpakai, nomor berurutan & tidak reuse, classId benar.

### 11.2 P5 — Cara `MemberImportService` dipanggil (KONTRAK — belum diimplementasikan)

1. **`electron/ipc/member.ipc.ts`** — `registerMemberHandlers(memberService, memberImportService)`:
   - `ipcMain.handle('members:previewCheck', (_e, rows) => memberImportService.previewCheck(rows))`
   - `ipcMain.handle('members:import', (e, rows) => memberImportService.import(rows, { onProgress: (p) => e.sender.send('members:importProgress', p) }))`
   - Progress **main → renderer** satu arah di channel `members:importProgress`.
2. **`electron/preload/member.preload.ts`** — ekspos:
   - `memberImport.previewCheck: (rows) => ipcRenderer.invoke('members:previewCheck', rows)`
   - `memberImport.import: (rows) => ipcRenderer.invoke('members:import', rows)`
   - `memberImport.onProgress: (cb) => { const h = (_e, p) => cb(p); ipcRenderer.on('members:importProgress', h); return () => ipcRenderer.removeListener(...) }`
3. **`src/renderer/env.d.ts`** — tipe ketiganya (+ import DTO dari `src/shared/dto/member`).
4. **`electron/main/bootstrap.ts`** — instantiasi DI (§7.1), tambah ke `Container`, teruskan ke `registerMemberHandlers`.

### 11.3 P6 + P7 (ringkasan, referensi RFC §16)

P6 UI: dialog panggil `previewCheck` → tampil blocker/warning per baris → `import` dengan progress `current / total` → tampil `MemberImportResultDTO` → refresh daftar. P7: validasi & regression menyeluruh (100/500/1000/5000, chunk boundary, rollback, nomor, kelas).

---

## Status

**P4A selesai — DESIGN ONLY.** Tidak ada perubahan kode, tidak ada commit. `MemberImportService` masih belum ada di source; kontrak di atas menunggu review Product Owner. Setelah approval, lanjut ke P4 (implementasi orchestrator sesuai §11.1), lalu P5–P7 mengikuti gate RFC §16.1 (lint PASS → build PASS → review PO → approval per fasa).
