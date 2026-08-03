# WORK_ORDER_4_AY1A_IMPLEMENTATION_REPORT

**WO-4 — AY-1a: AcademicYear exclusive-active guard**
**Status: DONE — READY review PO**
**Tanggal: 2026-08-03**

---

## 1. Ringkasan

Implementasi WO-4 AY-1a sesuai `WO4_DISCOVERY_REPORT.md` (READY FOR IMPLEMENTATION) dan RFC §2.4/§17: **guard exclusive-active** pada `AcademicYear` — setiap create/update/aktivasi yang menetapkan `isActive=true` **menonaktifkan tahun ajaran lain dalam SATU transaksi**, sehingga tepat satu `isActive=true` selalu dan `findActive()` ≤ 1 record.

**Tidak ada** perubahan schema, migration, IPC, Preload, UI, atau DTO (WBS WO-4: Repo/UI = N/A, repo sudah ada).

## 2. Deliverable

| File | Keterangan |
|------|-----------|
| `src/main/repositories/academic-year.repository.ts` | +2 metode transaksional: `createExclusiveActive` dan `updateExclusiveActive` (pola `borrow.repository`). |
| `src/main/services/academic-year.service.ts` | Guard decision: `isActive===true` → metode exclusive-active; selainnya path biasa. |
| `wo4_ay1a_smoke/smoke.ts` | Smoke DB pada fresh DB. **21/21 PASS** |

## 3. Logika Guard

### 3.1 Repository (`createExclusiveActive` / `updateExclusiveActive`)
```
$this.prisma.$transaction(async (tx) => {
  await tx.academicYear.updateMany({ where: { isActive: true }, data: { isActive: false } })
  return tx.academicYear.create / update({ ...data, isActive: true })
})
```
- Deaktivasi **semua** tahun aktif (termasuk target) lalu target di-set `isActive=true` → net: hanya target yang aktif. Query tanpa exclude target = lebih sederhana.
- `$transaction` = all-or-nothing: bila create/update target gagal, deaktivasi ikut rollback (tahun lama tetap aktif).

### 3.2 Service (decision point)
- `create`: bila `input.isActive === true` → `createExclusiveActive`; selainnya → `create` biasa (perilaku lama).
- `update`: bila `input.isActive === true` → `updateExclusiveActive`; selainnya → `update` biasa (perilaku lama).
- Tidak ada perubahan pada `findMany/findById/delete/toDTO`.

## 4. Hasil Smoke (fresh DB)

Seed via service: A aktif → B aktif → C nonaktif → update A aktif → update B nonaktif → regresi.

| Langkah | Aksi | Assert | Hasil |
|---------|------|--------|-------|
| 1 | create A `{isActive:true}` | A aktif; count aktif=1; `findActive()`=A | PASS |
| 2 | create B `{isActive:true}` | B aktif; **A nonaktif**; count=1; `findActive()`=B | PASS |
| 3 | create C `{isActive:false}` | C nonaktif; B tetap aktif; count=1 | PASS |
| 4 | update A `{isActive:true}` | A aktif; **B & C nonaktif**; count=1; `findActive()`=A | PASS |
| 5 | update B `{isActive:false}` | B nonaktif; A tetap aktif; count=1 | PASS |
| 6 | create nama duplikat | ditolak (AppError) — regresi | PASS |
| 7 | update id tidak ada | ditolak (AppError) — regresi | PASS |
| 8 | assert akhir | count aktif == 1 (dua aktif mustahil) | PASS |

**Total: 21 passed, 0 failed.**

## 5. Validation (semua PASS)

| # | Check | Hasil |
|---|-------|-------|
| 1 | Fresh DB PASS | `prisma migrate deploy` (4 migrations) + smoke 21/21 |
| 2 | Dua aktif mustahil PASS | count `isActive=true` === 1 di tiap langkah |
| 3 | Aktivasi B menonaktifkan A PASS | create & update path |
| 4 | Path non-aktif tidak berubah PASS | create/update tanpa aktivasi tidak menyentuh tahun aktif lain |
| 5 | Regresi create/update PASS | nama duplikat & id tidak ada tetap ditolak |
| 6 | lint PASS | `npm run lint` (tsc node+web) |
| 7 | build PASS | `npm run build` (main 1,776.61 kB · preload 7.68 kB · renderer 940.40 kB) |

## 6. Yang TIDAK dikerjakan (eksplisit)

- Schema `prisma/schema.prisma` + migration — tidak disentuh.
- IPC / Preload / `env.d.ts` / DTO — N/A (channel `academic-years:*` sudah ada).
- UI (AY-2) — tidak disentuh.
- Operasi Buka/Tutup Tahun (AY-1b) — tidak disentuh.
- WO sebelumnya (F1/F2a/F2b) — tidak disentuh.

## 7. Catatan Teknis

- **Guard di service, eksekusi atomik di repo** — konsisten pola `borrow.repository.createWithItems`/`processReturn` (`$transaction` di repo; keputusan bisnis di service).
- **Deaktivasi menyeluruh tanpa exclude target** — query lebih sederhana; net result tetap "hanya target aktif" karena target langsung di-set aktif di operasi berikutnya dalam transaksi yang sama.
- **Rollback aman** — kegagalan create/update target membatalkan deaktivasi (semua-or-tidak-sama-sekali).
- **DB live dev** tidak disentuh; smoke memakai fresh DB temp (`file:C:/.../wo4.db`) dan dibersihkan setelah run.
