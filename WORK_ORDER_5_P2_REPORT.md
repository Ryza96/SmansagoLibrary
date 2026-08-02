# WORK ORDER 5 — P2: Database Duplicate Detection

## 1. Objective
Membangun **Duplicate Detection terhadap database** (Tahap 2, RFC v2 §5.2) sebagai API yang akan dipakai P4. Scope **hanya** deteksi duplikat DB:

- **NISN** → sudah ada di DB → **BLOCKER**.
- **Email** → bila terisi dan sudah ada di DB → **BLOCKER**; bila kosong/tidak terisi → **dilewati**.
- **Duplicate File (Tahap 1)** tetap seperti sekarang — **tidak diubah** (ditangani `MemberPreviewService` di renderer).
- **Tidak** membuat import, transaction, insert, IPC baru, UI, atau P3.

## 2. Files Modified
| File | Perubahan |
|------|-----------|
| `src/config/import.config.ts` | Tambah `MEMBER_IMPORT_LOOKUP_CHUNK: 900` (additive; import buku tidak terpengaruh). |
| `src/main/repositories/member.repository.ts` | Tambah `findManyByNISNs(nisns)`, `findManyByEmails(emails)` — batch `IN` ter-chunk. |
| `src/shared/dto/member.ts` | Tambah `MemberImportRowInput` (DTO input baris import, kontrak P4 — RFC §10.1). |
| `src/main/services/member-duplicate-checker.service.ts` | **Baru** — `MemberDuplicateChecker` (DB duplicate detection). |
| `tsconfig.node.json` | Tambah `src/config/**/*` ke include (config kini dibaca oleh main). |
| `uat_wo5_p2/database-duplicate.smoke.ts` | Baru — validasi P2 (26 checks). |

## 3. Architecture
```
renderer (MemberPreviewService — Tahap 1, TIDAK diubah)
main:
  MemberDuplicateChecker.checkDatabase(rows: MemberImportRowInput[])
    ├─ kumpulkan nilai unik NISN (trim) + Email (trim + lowercase, hanya terisi)
    ├─ MemberRepository.findManyByNISNs([...])   → WHERE nisn IN (chunk 900)
    ├─ MemberRepository.findManyByEmails([...])  → WHERE email IN (chunk 900)
    ├─ Map lookup di memori (nisn→member, email→member)
    └─ per baris → isu BLOCKER bila match
```
- `MemberImportRowInput` didefinisikan di `src/shared/dto/member.ts` (RFC §10.1) — inilah API yang P4 pakai untuk memanggil `checkDatabase`.
- `MemberDuplicateChecker` dikonstruksi dengan `MemberRepository` (pola sama dengan `NumberGeneratorService`); instantiasi/wiring dilakukan P5 di `bootstrap.ts`.
- Hasil: `MemberDuplicateDatabaseResult { errors: MemberDuplicateDatabaseIssue[] }`; **tidak ada tulis, tidak ada transaksi** — seluruhnya read-only.

## 4. Duplicate Strategy
| Aturan | Implementasi | Message Key | Efek |
|--------|--------------|-------------|------|
| NISN sudah ada di DB | `findManyByNISNs` → lookup map → per baris | `memberImport.duplicateNisnInDb` | **BLOCKER** |
| Email terisi & sudah ada di DB | `findManyByEmails` (lowercase) → lookup map → per baris | `memberImport.duplicateEmailInDb` | **BLOCKER** |
| Email kosong / tidak terisi | normalisasi mengembalikan string kosong → dilewati | — | Tidak ada isu |

Setiap duplicate membawa **5 informasi** (aturan #5 WO) di `MemberDuplicateDatabaseIssue`:

```ts
export interface MemberDuplicateDatabaseIssue {
  rowNumber: number              // nomor baris di file (Row Number)
  field: 'nisn' | 'email'        // Field
  existingMemberNumber: string   // Existing Member Number
  existingMemberName: string     // Existing Member Name
  messageKey: string             // Message Key
}
```

- Setiap **baris yang terlibat** mendapat isu sendiri (tidak berhenti di baris pertama).
- Satu baris bisa memuat 2 isu bila NISN **dan** Email keduanya duplikat (field berbeda).
- NISN dinormalisasi `trim()`; Email dinormalisasi `trim().toLowerCase()` (RFC §5.2).

## 5. Performance Strategy
- **DILARANG query per baris.** Alur: nilai unik dikumpulkan (`Set`), lalu batch lookup `WHERE nisn IN (...)` dan `WHERE email IN (...)`, kemudian pencocokan **di memori** (`Map`).
- **Chunked `IN`:** repository memecah array menjadi potongan `MEMBER_IMPORT_LOOKUP_CHUNK` (900) — membaca `IMPORT_CONFIG`, bukan hardcode (RFC §8).
- Jumlah query konstan terhadap jumlah baris duplikat: 2 × ⌈uniques/900⌉.
- Skala target 1.000 baris → NISN 2 chunk, Email 2 chunk (diverifikasi di smoke S6 lintas boundary).

## 6. Validation

### Lint & Build
- `npm run lint` — **PASS** (tsconfig.node + tsconfig.web).
- `npm run build` — **PASS** (out/main 1,762.40 kB; out/preload 7.26 kB; out/renderer 925.16 kB js).

### Smoke Test — `uat_wo5_p2/database-duplicate.smoke.ts` (fresh temp DB, 3 migration deploy)
**Hasil: 26/26 PASS.**

| Skenario | Hasil |
|----------|-------|
| S1 tidak ada duplicate → `errors` kosong | PASS |
| S2 duplicate NISN → 1 error, field `nisn`, rowNumber, existing `S-000001`/`Ayu Lestari`, key `memberImport.duplicateNisnInDb` | PASS |
| S3 duplicate Email → 1 error, field `email`, existing `S-000001`/`Ayu Lestari`, key `memberImport.duplicateEmailInDb` | PASS |
| S4a email kosong `""` → tidak ada error | PASS |
| S4b email `undefined` → tidak ada error | PASS |
| S5 NISN+Email di baris sama → 2 error (field `nisn,email`) | PASS |
| S5b email sama di 2 baris → tiap baris dapat issue (row 16,17) | PASS |
| S6 1000 rows → total 104 error (53 nisn + 51 email) | PASS |
| S6 chunk boundary: duplikat di chunk1 (row 501) & chunk2 (row 999 nisn, row 1000 email) terdeteksi dengan info existing benar | PASS |
| S6 semua baris duplikat NISN mendapat issue (53 baris) | PASS |

> Catatan: ekspektasi awal smoke 51/102 ternyata **salah hitung** (seed `S-000001` nisn 1001 dan `S-000002` nisn 1002 berada di rentang input 1001..2000 → duplikat tambahan 2). Kode aplikasi benar; asersi smoke dikoreksi menjadi 53/104.

### Defect ditemukan & diperbaiki
- `tsconfig.node.json` tidak menyertakan `src/config/**/*` → TS6307 saat main mengimpor `IMPORT_CONFIG`. Ditambahkan ke include (file ini dipakai bersama renderer dan main).

## 7. Compatibility
- **Pemanggil lama tidak berubah:** `MemberRepository.findByNISN`/`findByNIP`/`findByNIK`/`findByNUPTK`, `findMany`, `create`, dst. tetap ada; hanya menambah 2 method batch.
- **`MemberImportRowInput`** adalah tipe baru (additive) di shared DTO — tidak mengubah `MemberDTO`/`CreateMemberDTO`/`UpdateMemberDTO`.
- **Tidak ada perubahan schema, migrasi, IPC, preload, bootstrap, UI.**
- **Ruang perbaikan (dokumentasi):** `email` di DB tidak distandarkan lowercase saat create → pencocokan email case-sensitive (`IN` SQLite). Sesuai RFC (bandingkan lowercase); untuk data email lama ber-case campur perlu normalisasi data (di luar scope).
- **Nama+Tanggal Lahir (warning DB) belum termasuk** — scope WO P2 hanya NISN + Email; `findByNameAndBirthDate` didefer ke fase yang menangani class resolver / warning.

## 8. Status
- **DONE** — lint PASS, build PASS, smoke 26/26 PASS.
- Menunggu review Product Owner. Belum commit. P3 tidak dikerjakan (di luar scope WO).
