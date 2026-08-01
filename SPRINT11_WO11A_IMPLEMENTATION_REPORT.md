# SPRINT 11 — WO-11-A: Persist Existing Fields — Implementation Report

> Status: **DONE — menunggu review Product Owner**
> Tanggal: 2026-08-01
> Scope: Hilangkan data loss pada proses Import Buku. HANYA field yang sudah ada di schema + sudah didukung repository, tapi dibuang oleh `BookImportService`.

---

## 1. Files Changed

| File | Perubahan |
|------|-----------|
| `src/main/services/book-import.service.ts` | **Satu-satunya file kode aplikasi yang diubah.** `importRow` kini membaca `values['year']` → `publicationYear` dan `values['description']` → `description` dari canonical row, lalu meneruskannya ke `bookRepository.create(...)`. Helper baru `valueToNumber()` untuk konversi nilai tahun yang aman. |
| `wo11a/smoke.ts` | Baru — validation script (bukan kode aplikasi, tidak di-build ke bundle). |
| `SPRINT11_WO11A_IMPLEMENTATION_REPORT.md` | Baru — dokumen ini. |

**Tidak ada file lain yang berubah.** Tidak ada migration, DTO, IPC, preload, template, validation engine, header normalizer, repository, atau UI.

---

## 2. Behavior Changed

Sebelum:
```
bookRepository.create({ title, isbn: isbn ?? undefined, authorId, publisherId, categoryId })
```
→ `publicationYear` dan `description` (jika ada di pipeline) **dibuang tanpa alasan**.

Sesudah:
```
bookRepository.create({
  title,
  isbn: isbn ?? undefined,
  authorId,
  publisherId,
  categoryId,
  publicationYear,   // dari canonicalRow.values['year']
  description,       // dari canonicalRow.values['description']
})
```

Detail:
- `publicationYear`: diambil dari canonical key `year` (key yang memang dipakai template saat ini). Dikonversi via `valueToNumber()`: menerima `number` atau string numerik; nilai tidak-finite / kosong → `undefined` (tidak disimpan, tetap `NULL` di DB).
- `description`: diambil dari canonical key `description`. Nilai kosong → `undefined` (bukan string kosong), sehingga DB menyimpan `NULL` — konsisten dengan perilaku create buku manual.
- **Tidak ada guard/validasi baru, tidak ada kolom template baru, tidak ada perubahan skema.** Guard pipeline (title/entity/ISBN-dup/AMBIGUOUS) tidak tersentuh.
- `BookCopy` **tidak berubah**: pipeline import saat ini memang belum mengalirkan `shelfLocation/condition/acquisition*` ke `createBookCopy` (masih hardcode `shelfLocation: ''`), sehingga per WO scope, field tersebut **belum dipaksakan di WO ini**.

---

## 3. Build PASS

```
npm run build
✓ out/main/index.js   1,746.61 kB
✓ out/preload/index.js  6.59 kB
✓ out/renderer/assets/index-DiqpmWbM.js  887.52 kB
BUILD_EXIT=0
```

## 4. Lint PASS

```
npm run lint  (tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit)
LINT_EXIT=0
```

## 5. Validation

Smoke `wo11a/smoke.ts` — rantai produksi penuh (`createProductionStrategies` → `MatchingEngineService` → `AutoCreateService` → `BookImportService`) pada **fresh DB** (`prisma migrate deploy`, 3 migration), dijalankan dengan `DATABASE_URL` absolute temp DB, lalu DB uji dibersihkan.

| # | Assertion | Hasil |
|---|-----------|-------|
| P1 | Import baris dengan `year: 2021` + `description` → tidak ada error | PASS |
| P1 | Book dibuat | PASS |
| P1 | **`publicationYear` tersimpan = 2021** | PASS |
| P1 | **`description` tersimpan = "Deskripsi resmi buku uji WO-11-A."** | PASS |
| P1 | BookCopy tetap dibuat (1) | PASS |
| P1 | barcode === inventoryNumber (regresi WO-8) | PASS |
| P2 | `year` string `"1999"` → dikonversi number 1999 | PASS |
| P2 | `description: ''` → tersimpan `NULL` (bukan string kosong) | PASS |
| P3 | Tanpa `year`/`description` → tetap `NULL` (regresi: perilaku default tidak berubah) | PASS |

**Hasil: 12/12 PASS.**

## 6. Rollback

- **Revert 1 file:** `git checkout -- src/main/services/book-import.service.ts` (atau revert commit bila sudah di-commit) mengembalikan perilaku lama (field dibuang).
- Tidak ada migration yang perlu di-rollback; tidak ada perubahan data irreversible.
- `wo11a/smoke.ts` dan report dapat dihapus tanpa efek.

## 7. Architecture Checklist

| # | Item | Status |
|---|------|--------|
| 1 | Perubahan terbatas pada 1 file layanan (minimal file changes) | ✅ |
| 2 | Tidak menambah kolom template | ✅ |
| 3 | Tidak ada migration database | ✅ |
| 4 | Tidak menyentuh edition / language / pageCount / jumlah copy / kode buku / barcode / inventory sequence | ✅ |
| 5 | Tidak ada validation baru / header normalizer / preview UI | ✅ |
| 6 | Data persist hanya ke field yang sudah ada di schema & repository (`publicationYear`, `description`) | ✅ |
| 7 | BookCopy field yang belum mengalir di pipeline TIDAK dipaksakan (sesuai scope) | ✅ |
| 8 | Tidak ada `any` baru, kode mengikuti gaya helper `valueToString` yang sudah ada | ✅ |
| 9 | Lint PASS + Build PASS + Smoke DB fresh 12/12 | ✅ |
| 10 | Siap 1 commit setelah approval PO | ✅ |

---

**Status: DONE — Architecture Gate BERHENTI**, menunggu review Product Owner.
