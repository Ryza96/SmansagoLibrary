# WORK ORDER 5 — P1.1: Repository Optimization

## 1. Objective
Optimasi akses database pada `NumberGeneratorService` (hasil review PO pada P1 yang telah APPROVED).

Masalah: `NumberGeneratorService` membaca **SELURUH** `memberNumber` ber-prefix tertentu ke Node.js (`findMany`), lalu mencari max suffix di sisi client (`maxSuffixFrom`). Untuk dataset besar cara ini tidak efisien — memuat ratusan ribu baris hanya untuk satu angka.

Target: Repository cukup mengembalikan **SATU nilai** — `memberNumber` TERBESAR dengan prefix tertentu, dihitung langsung di database. Public API `NumberGeneratorService` **tidak boleh berubah**; hanya implementasi internal yang dioptimasi.

## 2. Root Cause
`MemberRepository.findMemberNumbersByPrefix(prefix)` menjalankan:

```ts
this.prisma.member.findMany({
  where: { memberNumber: { startsWith: `${prefix}-` } },
  select: { memberNumber: true },
  orderBy: { memberNumber: 'asc' }
})
```

Mengembalikan array **seluruh** nomor ber-prefix, kemudian `maxSuffixFrom()` (fungsi `reduce` di Node.js) menghitung max. Biaya transfer/CPU `O(N)` pada dataset besar; yang sebenarnya dibutuhkan hanya `max(memberNumber)` — satu nilai.

## 3. Repository Optimization

### `src/main/repositories/member.repository.ts`
`findMemberNumbersByPrefix(prefix)` (**dihapus**) diganti:

```ts
async findLastMemberNumberByPrefix(prefix: string, tx?: Prisma.TransactionClient): Promise<string | null> {
  const client = tx ?? this.prisma
  const row = await client.member.findFirst({
    where: { memberNumber: { startsWith: `${prefix}-` } },
    select: { memberNumber: true },
    orderBy: { memberNumber: 'desc' }
  })
  return row?.memberNumber ?? null
}
```

- `findFirst` + `orderBy: { memberNumber: 'desc' }` → SQL `ORDER BY number DESC LIMIT 1`, memanfaatkan index unik pada kolom `number` (`memberNumber @unique`). Kembalian maksimal 1 baris (single scalar).
- Param `tx?: Prisma.TransactionClient` opsional: saat dipakai di dalam transaksi (`allocateMemberNumbers`), query dijalankan pada transaksi yang sama — semantik rollback PO #12 tetap terjaga (nomor hanya dikonsumsi saat COMMIT).
- Return `string | null` (`null` bila prefix belum pernah dipakai → max suffix = 0).

### `src/main/services/number-generator.service.ts`
- `generateMemberNumber(memberType?)`: `maxSuffixForPrefix(prefix)` → `formatMemberNumber(prefix, maxSuffix + 1)`.
- `allocateMemberNumbers(tx, count, memberType)`: `maxSuffixForPrefix(prefix, tx)` → array berurutan `max+1 .. max+count`.
- Helper privat baru `maxSuffixForPrefix(prefix, tx?)` mendeduplikasi kedua jalur:
  ```ts
  private async maxSuffixForPrefix(prefix: string, tx?: Prisma.TransactionClient): Promise<number> {
    const last = await this.memberRepository.findLastMemberNumberByPrefix(prefix, tx)
    return last === null ? 0 : Math.max(parseMemberNumberSuffix(last, prefix), 0)
  }
  ```
- Semua helper publik (`resolveMemberNumberPrefix`, `parseMemberNumberSuffix`, `formatMemberNumber`, `maxSuffixFrom`) **tetap diekspor** — `maxSuffixFrom` tidak lagi dipakai internal namun dipertahankan agar unit-check smoke (2 check) tetap valid.

## 4. Files Modified
| File | Perubahan |
|------|-----------|
| `src/main/repositories/member.repository.ts` | `findMemberNumbersByPrefix` → `findLastMemberNumberByPrefix(prefix, tx?)` (return `string \| null`, `findFirst orderBy desc`, mendukung transaksi). |
| `src/main/services/number-generator.service.ts` | Implementasi internal `generateMemberNumber`/`allocateMemberNumbers` memakai repo baru; helper privat `maxSuffixForPrefix`; public API tidak berubah. |
| `uat_wo5_p1/number-generator.smoke.ts` | **Tidak diubah** — seluruh 34 check tetap berlaku. |

## 5. Validation

### Lint & Build
- `npm run lint` — **PASS**.
- `npm run build` — **PASS** (out/main 1,761.56 kB; out/preload 7.26 kB; out/renderer 925.16 kB js + 35.64 kB css).

### Smoke Test — `uat_wo5_p1/number-generator.smoke.ts`
Fresh temp DB (`file:C:/Users/hp/AppData/Local/Temp/opencode/wo5p1-smoke/aplibrary-smoke.db`, `prisma migrate deploy` 3 migrations).

**Hasil: 34/34 PASS.** Seluruh skenario kunci tetap hijau dengan implementasi baru:

| Skenario | Hasil |
|----------|-------|
| Unit prefix/padding/suffix/maxSuffix (helper publik) | PASS |
| Create student/teacher/general → `S-000001`,`S-000002`,`G-000001`,`U-000001` | PASS |
| Allocate 1/10/100 → `S-000003`, `S-000004..13`, `S-000014..113` | PASS |
| Rollback 100 nomor (`S-000114..213`) → 0 tersimpan (PO #12) | PASS |
| Alokasi ulang mulai lagi `S-000114` (nomor batal tidak terpakai) | PASS |
| Delete `S-000013` → berikutnya `S-000114` (max suffix, bukan `count()+1`) | PASS |
| Independensi prefix `G-000002` / `U-000002` | PASS |

`FINAL_DB` mengonfirmasi: `S-000001..S-000113` + `S-000114` (After Delete), `G-000001`, `U-000001`; tanpa baris dari transaksi rollback.

## 6. Compatibility
- **Public API `NumberGeneratorService` tidak berubah:** konstruktor `(MemberRepository)`, `generateMemberNumber(memberType?)`, `allocateMemberNumbers(tx, count, memberType?)` — signature identik. Pemanggil (`member.service.ts`, `bootstrap.ts`) tanpa perubahan.
- **Helper publik tetap diekspor** — unit-check smoke (2 check `maxSuffixFrom`) tetap lulus.
- **Semantik bisnis terjaga:** nomor tidak pernah dipakai ulang, rollback tidak mengonsumsi nomor, independensi prefix, gap tidak memicu tabrakan.
- **DB:** tanpa migrasi; hanya perubahan kode TS.

## 7. Catatan
- `memberNumber` bersifat `@unique` di schema → `findFirst orderBy desc` memakai index kolom `number` secara efisien.
- Seluruh nomor yang di-generate sistem berformat fixed-width 6 digit (`S-000001`), sehingga urutan `desc` string ≡ urutan numerik. Batas praktis 999.999 nomor per prefix; di luar itu tetap valid (formatter tanpa truncate), namun `orderBy desc` string mengikuti leksikografis.
- `maxSuffixFrom` dipertahankan sebagai helper publik (bukan lagi dipakai internal) — keputusan kompatibilitas, bukan dead code dihapus.

## 8. Status
- **DONE** — lint PASS, build PASS, smoke 34/34 PASS.
- Menunggu review Product Owner. Belum commit. P2 tidak dikerjakan (di luar scope WO).
