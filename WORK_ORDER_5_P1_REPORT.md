# WORK ORDER 5 — P1: NumberGeneratorService Fix

## 1. Objective
Memperbaiki `NumberGeneratorService` sebagai fondasi fitur **Member Import Database** (RFC v2 — APPROVED). Dua bug yang ditemukan pada PRODUCTION_READINESS_AUDIT_MEMBER_IMPORT_DATABASE:

1. **Prefix mapping salah** — semua anggota mendapat `S-` meskipun tipe `teacher`/`general`.
2. **Algoritma next-number salah** — `count()+1` menghasilkan duplikat nomor saat ada nomor yang dihapus (gap).

Ruang lingkup P1 **hanya** service ini — tanpa IPC, tanpa UI, tanpa P2. Output wajib: laporan ini. STOP setelah laporan; tidak commit, menunggu review PO.

## 2. Files Modified
| File | Perubahan |
|------|-----------|
| `src/main/services/number-generator.service.ts` | Ditulis ulang (lihat §4). |
| `src/main/repositories/member.repository.ts` | Tambah helper read-only `findMemberNumbersByPrefix(prefix)` — ordered ascending, return `memberNumber[]`. `count()` dipertahankan namun tidak lagi dipakai service. |
| `uat_wo5_p1/number-generator.smoke.ts` | Baru — validasi P1 (34 checks). |

## 3. Root Cause

### Bug 1 — Prefix mapping
Kode lama membandingkan `memberType` terhadap literal `'GURU'` / `'UMUM'`:

```ts
if (memberType === 'GURU') prefix = 'G-';   // tidak pernah match
else if (memberType === 'UMUM') prefix = 'U-'; // tidak pernah match
else prefix = 'S-';
```

Padahal nilai runtime `memberType` adalah `'student' | 'teacher' | 'general'` (konstanta di `src/utils/labels.ts:219-221`, `MEMBER_TYPE_STUDENT='student'` dst). Akibatnya **semua** anggota — termasuk Guru dan Umum — di-generate sebagai `S-XXXXXX`.

### Bug 2 — Algoritma next-number
Kode lama:

```ts
const count = await this.memberRepository.count();
return formatMemberNumber(prefix, count + 1);
```

`count()` menghitung **jumlah baris**, bukan nomor terbesar. Saat `S-000003` dihapus sementara `S-000004` ada, `count()+1` bisa menabrak nomor yang masih terpakai → duplikat nomor anggota (kolom `memberNumber` seharusnya unik per anggota).

## 4. Implementation

`src/main/services/number-generator.service.ts` (ditulis ulang):

- **Prefix map:** `MEMBER_TYPE_PREFIX = { student: 'S', teacher: 'G', general: 'U' }`; `resolveMemberNumberPrefix(memberType)` mengembalikan `'S'` untuk `student`, `'G'` untuk `teacher`, `'U'` untuk `general`, dan **default `'S'`** untuk nilai tidak dikenal / undefined. Format nomor memakai `S-` / `G-` / `U-` (RFC §7.2).
- **Parser:** `parseMemberNumberSuffix(number, prefix)` mengekstrak bagian numerik. Guard `startsWith(`${prefix}-`)` memastikan nomor dari tipe lain (mis. `G-000002` saat mencari prefix `S`) **tidak** ikut dihitung sebagai kandidat suffix.
- **Formatter:** `formatMemberNumber(prefix, n)` meng-pad ke 6 digit (`S-000001`). Tidak terpengaruh nomor > 999999 (tanpa truncate).
- **Max suffix:** `maxSuffixFrom(numbers, prefix)` → `max(suffix)` atau `0` bila kosong.
- **`generateMemberNumber(memberType?)`:** membaca seluruh nomor ber-prefix via `findMemberNumbersByPrefix`, ambil `maxSuffix`, hasil = `formatMemberNumber(prefix, max + 1)`. **API publik tidak berubah** — pemanggil lama (`member.service.ts` create-member, `bootstrap.ts`) tetap kompatibel.
- **`allocateMemberNumbers(tx, count, memberType)`:** menerima `Prisma.TransactionClient` (dipakai via `tx.member.findMany`), **tidak** membuka transaksi sendiri (RFC §7.2 — alokasi hanya dikonsumsi saat COMMIT). Mengembalikan array nomor berurutan mulai `max+1`, panjang = `count` (`S-000101..S-000105` untuk count 5). `count <= 0` → `[]`.

## 5. Validation

### Lint & Build
- `npm run lint` — **PASS** (tsconfig.node.json + tsconfig.web.json).
- `npm run build` — **PASS** (out/main 1,761.78 kB; out/preload 7.26 kB; out/renderer 925.16 kB js + 35.64 kB css).

### Smoke Test — `uat_wo5_p1/number-generator.smoke.ts`
Dijalankan terhadap **fresh temp DB** (`DATABASE_URL="file:C:/Users/hp/AppData/Local/Temp/opencode/wo5p1-smoke/aplibrary-smoke.db"`, `prisma migrate deploy` 3 migrations: `20260731_adr002_initial` → `20260731_wo13_procurement_fields` → `20260731_wo13_revision1_source_detail`).

**Hasil: 34/34 PASS.**

| Grup | Check | Hasil |
|------|-------|-------|
| Unit prefix | student→S, teacher→G, general→U, unknown→S, undefined→S | PASS |
| Unit padding | 1→`S-000001`, 42→`S-000042`, 1000000→`S-1000000` | PASS |
| Unit suffix | parse valid, parse nomor tipe lain tidak ikut (guard prefix), dsb. | PASS |
| Unit maxSuffix | kosong→0, campuran→max | PASS |
| DB create | student `S-000001`,`S-000002`; teacher `G-000001`; general `U-000001` | PASS |
| DB allocate | 1→`S-000003`; 10→`S-000004..S-000013`; 100→`S-000014..S-000113` | PASS |
| DB rollback | forced-fail tx alokasi `S-000114..S-000213` → **0 persisten**; reallocate mulai lagi `S-000114` (PO #12) | PASS |
| DB gap | hapus `S-000013` → berikutnya `S-000114` (max suffix, bukan `count()+1` collision) | PASS |
| DB independensi prefix | teacher lanjut `G-000002`, general `U-000002`, tidak tercampur | PASS |

### Defect ditemukan & diperbaiki selama pengujian
1. `parseMemberNumberSuffix` tidak memverifikasi prefix sebelum slicing → ditambah guard `startsWith(`${prefix}-`)`.
2. Assertion smoke rollback menghitung `memberType:'student'` padahal baris alokasi memakai `memberType:null` → ganti kriteria ke `memberNumber: { startsWith: 'S-' }`.

## 6. Risk Analysis
| Risiko | Level | Mitigasi |
|--------|-------|----------|
| Nomor yang dihapus (gap) akan ter-reuse | LOW — diputuskan PO | RFC §0 #4; `memberNumber` tidak dijadikan FK relasi apapun. |
| Nomor > 999999 | LOW | `formatMemberNumber` tidak truncate. |
| Nomor terbesar datang dari prefix lain | NONE | Guard `startsWith` di parser. |
| Alokasi bocor saat import dibatalkan | NONE | Alokasi hanya dikonsumsi saat COMMIT (RFC §7.2); rollback terbukti 0 persisten di smoke. |
| Regresi create-member | NONE | API `generateMemberNumber` tidak berubah; lint+build+lint ulang PASS. |

## 7. Compatibility
- **Pemanggil:** `src/main/services/member.service.ts` (create-member) dan `electron/main/bootstrap.ts` — API `generateMemberNumber(memberType?)` identik, **tidak ada perubahan** di kedua file.
- **Repository:** `MemberRepository.count()` masih ada (dipakai tempat lain), service kini hanya memakai `findMemberNumbersByPrefix`.
- **DB:** tanpa migrasi — hanya perubahan kode TS.
- **UI/IPC:** tanpa perubahan.

## 8. Status
- **DONE** — lint PASS, build PASS, smoke 34/34 PASS.
- Menunggu review Product Owner (gate RFC §16.1). Belum commit. P2 tidak dikerjakan (di luar scope WO).
