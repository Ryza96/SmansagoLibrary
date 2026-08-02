# WORK ORDER 7 — P7A: Fix F-1 Transaction Timeout (COMPLETE)

- **Status:** DONE — menunggu review Product Owner (STOP, tidak lanjut WO berikutnya)
- **Scope:** HANYA F-1 (`runTransaction` tanpa `{ timeout }`). F-2/F-3/TD **tidak** disentuh, sesuai P7 fix plan.
- **Referensi:** `PRODUCTION_READINESS_FIX_PLAN.md` (F-1), `PRODUCTION_READINESS_AUDIT_MEMBER_IMPORT.md` (TD-2 / B-3), `MEMBER_IMPORT_SERVICE_ARCHITECTURE_RFC.md` (kontrak throw/rollback).
- **No commit.**

---

## 1. Perubahan Kode

**File:** `src/main/repositories/base/transaction.ts` (satu-satunya file kode yang berubah)

| Sebelum | Sesudah |
|---------|---------|
| `prisma.$transaction(fn)` — memakai default Prisma **5 detik** (P2028) | `prisma.$transaction(fn, options ?? DEFAULT_TRANSACTION_OPTIONS)` dengan default `{ maxWait: 5_000, timeout: 60_000 }` |

- Ditambahkan interface `TransactionOptions { maxWait?; timeout? }` + konstanta `DEFAULT_TRANSACTION_OPTIONS` = `{ maxWait: 5_000, timeout: 60_000 }` (nilai dari rekomendasi fix plan §F-1).
- Parameter `options?` opsional → **backward-compatible**: semua pemanggil lama (`member-import.service.ts:197`, `book-import.service.ts:125`, smoke P4C/P5/… yang memanggil tanpa argumen) otomatis memakai default 60 detik.
- Nilai timeout jauh di atas beban terukur (lihat §3: 1.000 baris ≈ 0.1 s) sehingga tidak mempengaruhi perilaku normal; hanya mencegah P2028 pada import besar/disk lambat.

## 2. Mengapa Ini Menutup F-1

- Sebelum: write phase import besar (≥ beberapa ribu baris, createMany chunked + allocation reads dalam satu `$transaction`) dapat melampaui batas 5 detik Prisma → `P2028` → bukan `P2002` → di-`throw` sebagai system error → user harus mengulang seluruh file (`PRODUCTION_READINESS_AUDIT_MEMBER_IMPORT.md` B-3).
- Sesudah: timeout eksplisit 60 s; bila benar-benar terlampaui, Prisma tetap ROLLBACK dan error menjadi pesan system error yang jelas (kontrak RFC §3.2 dipertahankan: **rollback, 0 write, reject promise**).

## 3. Smoke Test — `uat_wo7_p7a/transaction-timeout.smoke.ts` (READ-ONLY file, dihapus setelah run)

Fresh temp SQLite DB (`prisma migrate deploy`, 3 migration: baseline → WO13 → R1) — prosedur wajib fresh DB per run.

| # | Kasus | Hasil |
|---|-------|-------|
| S1 | Opsi timeout diteruskan ke `$transaction` (tx dengan sleep 500 ms + `{ timeout: 100 }`) → reject | PASS (`timedOut=true`) |
| S1 | Tx yang timeout tidak menulis apa pun (rollback, count tetap 0) | PASS |
| S2 | Import 100 baris via service (jalur default, tanpa argumen opsi) — sukses, created 100, nomor berurutan S-000100 | PASS (38 ms) |
| S3 | Import 500 baris (1 chunk createMany) — count 600, nomor S-000600 | PASS (63 ms) |
| S4 | Import 1.000 baris (2 chunk createMany, lintas batas 500) — count 1600, nomor S-000601…S-001600, baris pertama & terakhir benar | PASS (102 ms) |

**Hasil: 18/18 PASS.** Durasi jauh di bawah 60 s → default baru tidak mengubah perilaku normal, hanya menaikkan batas atas.

**Catatan:** 1 asersi awal sempat FAIL pada run pertama — bug pada *smoke* (query `findUnique` memakai nisn yang salah: `300001000` vs `3000001000`), bukan bug aplikasi; diperbaiki dan re-run 18/18 PASS.

## 4. Regression

- `npm run lint` PASS (tsconfig.node + tsconfig.web).
- `npm run build` PASS (out/main/index.js 1,774.11 kB; renderer index-1u9sUwM6.js 938.79 kB — tidak berubah dari P5C).
- Fresh DB `prisma migrate deploy` PASS (urutan baseline → WO13 → R1 benar).

## 5. Sisa Gap (di luar scope P7A — untuk review PO)

- **F-2** (HIGH) cap ukuran file member path (`IMPORT_CONFIG.maxFileSize` belum dipakai) — belum dikerjakan.
- **F-3** (MEDIUM) trim NISN/email sebelum simpan — belum dikerjakan.
- **F-4** (MEDIUM UX) progress non-monotonic — direkomendasikan sebagai Technical Debt.
- B-1/B-6/B-7/B-8/B-9/B-10, TD-6/TD-7 — non-blocker (detail di fix plan).

## 6. Status

**P7A DONE.** Satu dari tiga release blocker (F-1) ditutup. Produk tetap **NOT READY** sampai F-2 dan F-3 selesai (P7B/P7C berikutnya, menunggu persetujuan PO). Tidak ada commit.
