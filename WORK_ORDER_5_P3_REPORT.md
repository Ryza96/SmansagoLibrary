# WORK ORDER 5 — P3: Class Resolver

## 1. Objective
Membangun **Class Resolver** (RFC v2 §6) sebagai API yang akan dipakai P4. Scope **hanya** class resolver:

- Input `className` → cari `Class` di database (tahun ajaran aktif).
- Ditemukan → kembalikan `classId`.
- Tidak ditemukan → **ERROR** wajib membawa `rowNumber`, `className`, `messageKey`.
- Lebih dari satu hasil → **ERROR `classAmbiguous`** wajib membawa nama kelas penyebab konflik.
- **DILARANG Auto Create Class.**
- Batch lookup — **tidak ada query per baris**.
- **Tidak** membuat import, transaction, insert, IPC, UI, atau P4.

## 2. Files Modified
| File | Perubahan |
|------|-----------|
| `src/main/repositories/academic-year.repository.ts` | Tambah `findActive()` (tahun ajaran `isActive: true`, terbaru via `startDate desc`). |
| `src/main/services/member-class-resolver.service.ts` | **Baru** — `MemberClassResolver`. |
| `uat_wo5_p3/class-resolver.smoke.ts` | Baru — validasi P3 (24 checks). |

> `ClassRepository.findByAcademicYear(academicYearId)` sudah ada (tidak diubah). `MemberImportRowInput` (P2) dipakai sebagai input resolver.

## 3. Architecture
```
MemberClassResolver.resolve(rows: MemberImportRowInput[])
  ├─ AcademicYearRepository.findActive()      → activeYear | null (1 query)
  ├─ ClassRepository.findByAcademicYear(activeYear.id) → semua kelas tahun aktif (1 query)
  ├─ Map<key, Class[]>  key = `${educationLevel} ${parallel}` (normalized)
  └─ per baris:
        format tidak valid (bukan X/XI/XII) atau !activeYear → classNotFound
        key tidak ada                        → classNotFound
        key punya 1 kelas                    → classId
        key punya >1 kelas                   → classAmbiguous
```
- `MemberClassResolver` dikonstruksi dengan `(AcademicYearRepository, ClassRepository)` — wiring dilakukan P5 di `bootstrap.ts`.
- Hasil: `MemberClassResolutionResult { items, errors }`; **tidak ada tulis**.

```ts
export interface MemberClassResolutionItem {
  rowNumber: number
  className: string
  classId: string | null
}
export interface MemberClassResolutionIssue {
  rowNumber: number
  className: string
  messageKey: string
}
export interface MemberClassResolutionResult {
  items: MemberClassResolutionItem[]
  errors: MemberClassResolutionIssue[]
}
```

## 4. Resolver Strategy
- **Parser `className`** (`parseClassName`): token pertama dipisah spasi pertama → `educationLevel` (di-uppercase, wajib `X | XI | XII`); sisa string → `parallel` (trim + collapse spasi berlebih). Format selain itu (tanpa spasi, level tidak valid) → `classNotFound`.
- **Key mapping** (`classKey`): `${educationLevel.toUpperCase()} ${parallel.toUpperCase()}` — diterapkan seragam pada sisi file dan sisi DB, sehingga input `x mipa 1` cocok dengan kelas ber-`parallel "MIPA 1"`.
- **Ambigu**: `@@unique([academicYearId, curriculumId, educationLevel, parallel])` memungkinkan dua kelas dengan `educationLevel + parallel` sama dalam satu tahun bila kurikulum berbeda → `classMap.get(key).length > 1` → `classAmbiguous` (blocker, RFC §6.3).
- **Tidak ada tahun ajaran aktif** (`findActive()` → null): **semua baris** → `classNotFound`.
- **Error wajib memuat nama kelas** (keputusan PO Revisi 3): `errors[]` berisi `{ rowNumber, className, messageKey }` — contoh UI: `Baris 18: Kelas "XI Merdeka 1" tidak ditemukan.`
- Message key: `memberImport.classNotFound`, `memberImport.classAmbiguous`.

## 5. Performance Strategy
- **DILARANG query per baris.** Seluruh kelas tahun ajaran aktif diambil dalam **1 query** (`findByAcademicYear`), dibangun `Map<key, Class[]>` di memori, lalu setiap baris cukup lookup map — konstan.
- Total query: **2** (`findActive` + `findByAcademicYear`) untuk berapa pun jumlah baris (termasuk 1.000 / 5.000).
- Tidak ada chunking lookup yang diperlukan (satu tahun ajaran = himpunan kelas terbatas).
- Tidak ada tulis; resolver read-only.

## 6. Validation

### Lint & Build
- `npm run lint` — **PASS**.
- `npm run build` — **PASS** (out/main 1,762.56 kB; out/preload 7.26 kB; out/renderer 925.16 kB js).

### Smoke Test — `uat_wo5_p3/class-resolver.smoke.ts` (fresh temp DB, 3 migration deploy)
Seed: 1 AY aktif (2025/2026), 2 kurikulum, 4 kelas (`X MIPA 1`×2 kurikulum → ambigu, `XI IPA 2`, `XII TKJ 1`).

**Hasil: 24/24 PASS.**

| Skenario | Hasil |
|----------|-------|
| S1 class ditemukan (`XI IPA 2`) → `classId`, 0 error | PASS |
| S2 tidak ditemukan (`XI Merdeka 1`, baris 18) → error `rowNumber=18`, `className="XI Merdeka 1"`, key `classNotFound`, `classId=null` | PASS |
| S3 ambigu (`X MIPA 1`, baris 5) → error `classAmbiguous`, membawa nama kelas `X MIPA 1` | PASS |
| S4 campuran (found/ambigu/notFound) → 1 resolved + 2 gagal, 2 error | PASS |
| S5 format invalid (`MIPA 1`, `XIIIPA 1`) → `classNotFound` | PASS |
| S6 tanpa tahun ajaran aktif → semua baris `classNotFound` | PASS |
| S7 1000 rows → resolved 334, gagal 666 (ambigu 333 + notFound 333); spot baris 1000 resolved, baris 2 ambigu | PASS |

## 7. Compatibility
- **Pemanggil lama tidak berubah:** `AcademicYearRepository` & `ClassRepository` hanya bertambah method; method existing tetap.
- **`MemberClassResolver`** adalah layanan baru (class) — instantiasi/wiring di `bootstrap.ts` pada P5.
- **DTO shared** `MemberImportRowInput` (dari P2) di-reuse; tidak ada DTO baru yang mengubah kontrak lama.
- **Tidak ada** perubahan schema, migrasi, IPC, preload, UI, dependency.
- **Tidak ada auto-create kelas** — kelas wajib sudah ada di master (keputusan PO #5).

## 8. Status
- **DONE** — lint PASS, build PASS, smoke 24/24 PASS.
- Menunggu review Product Owner. Belum commit. P4 tidak dikerjakan (di luar scope WO).
