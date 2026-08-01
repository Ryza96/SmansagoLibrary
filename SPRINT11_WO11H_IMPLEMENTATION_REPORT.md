# SPRINT11 — WO-11-H: InventoryAllocator Self-Healing (IMPLEMENTATION REPORT)

**WO:** WO-11-H
**Role:** Principal Software Engineer
**Source of Truth:** `SPRINT11_BOOK_CREATION_ROOTCAUSE.md` (disetujui PO)
**Status:** DONE — menunggu review Product Owner. Belum commit (1 WO = 1 commit setelah approval).

---

## 1. Files Changed

| File | Perubahan |
|------|-----------|
| `src/main/services/inventory-allocator.ts` | **Satu-satunya file yang diubah.** `allocate()` sekarang self-healing: membaca `MAX(inventoryNumber)` dari `BookCopy` sebelum alokasi, menyelaraskan `InventorySequence` bila kosong/ketinggalan, baru mengalokasikan. Ditambah helper privat `findMaxUsedNumber()`. |

Tidak ada file lain yang diubah. Import Engine, Repository, UI, Preview, IPC, Transaction, Parser **TIDAK disentuh** (sesuai aturan).

Catatan status git: `src/main/services/inventory-allocator.ts` saat ini **untracked** (`??`) di working tree — konsisten dengan keadaan repo (seluruh kerja Sprint 5+ belum di-commit; commit terakhir `437b50a` baseline release).

## 2. Root Cause (ringkasan dari Source of Truth)

- `InventorySequence` di dev DB **kosong**, sementara 10 `BookCopy` lama sudah memakai `INV-000001..000010` (jalur legacy tidak pernah mengisi sequence).
- `InventoryAllocator.allocate` lama memakai `upsert` dengan `create: { lastNumber: count }` → saat sequence kosong, selalu mulai dari `INV-000001`.
- Insert `BookCopy` bertabrakan → **P2002** (`inventoryNumber @unique`, `schema.prisma:145`) → transaksi rollback → **Book ikut rollback**.
- Error ditangkap menjadi `bookImport.createFailed` di `matchingResult.errors`; UI tidak menampilkannya → "Import selesai." padahal 0 baris masuk.

## 3. Implementation

**Sebelum** (`inventory-allocator.ts`):

```ts
const record = await tx.inventorySequence.upsert({
  where: { id: SEQUENCE_ID },
  create: { id: SEQUENCE_ID, prefix: PREFIX, lastNumber: count },  // kosong → mulai dari 1
  update: { lastNumber: { increment: count } },
})
const startNumber = record.lastNumber - count + 1
```

**Sesudah** — self-healing dengan 4 aturan dari WO:

```ts
async allocate(tx, count) {
  const maxUsedNumber = await this.findMaxUsedNumber(tx)   // ATURAN 1: MAX(inventoryNumber) dari BookCopy
  const record = await tx.inventorySequence.findUnique({ where: { id: SEQUENCE_ID } })

  const needsHealing = !record || record.lastNumber < maxUsedNumber   // ATURAN: kosong ATAU ketinggalan

  let lastNumber
  if (needsHealing) {
    lastNumber = maxUsedNumber + count                     // ATURAN 2: hitung nomor berikutnya
    await tx.inventorySequence.upsert({                    // ATURAN 3: selaraskan sequence
      where: { id: SEQUENCE_ID },
      create: { id: SEQUENCE_ID, prefix: PREFIX, lastNumber },
      update: { lastNumber: { set: lastNumber } },
    })
  } else {
    const updated = await tx.inventorySequence.update({
      where: { id: SEQUENCE_ID },
      data: { lastNumber: { increment: count } },          // jalur normal — tidak berubah perilaku
    })
    lastNumber = updated.lastNumber
  }

  const startNumber = lastNumber - count + 1               // ATURAN 4: baru alokasi
  return Array.from({ length: count }, (_, i) => `${PREFIX}-${(startNumber + i).toString().padStart(PAD_LENGTH, '0')}`)
}

private async findMaxUsedNumber(tx) {
  const copies = await tx.bookCopy.findMany({ select: { inventoryNumber: true } })
  let max = 0
  for (const copy of copies) {
    const value = copy.inventoryNumber
    if (!value.startsWith(`${PREFIX}-`)) continue
    const num = Number(value.slice(`${PREFIX}-`.length))
    if (Number.isFinite(num) && num > max) max = num
  }
  return max
}
```

Perilaku baru:
- `InventorySequence` kosong → `maxUsedNumber=10` → alokasi mulai `INV-000011`, sequence diset `10+count`.
- `lastNumber < maxUsedNumber` (ketinggalan) → diselaraskan ke `maxUsedNumber` sebelum alokasi.
- Jalur normal (`lastNumber >= maxUsedNumber`) → **identik dengan perilaku lama** (`increment`), tidak ada regresi.

## 4. Validation

Validasi memakai probe replikasi pipeline produksi yang **sudah ada** (`uat_wo11h/pipeline.probe.ts` — menjalankan `ValidationEngineService` → `MatchingEngineService` → `AutoCreateService` → `BookImportService` nyata, memakai `templates/Template_Import_Buku_v2.0.xlsx`), di-compile ulang terhadap kode baru dan dijalankan pada **salinan DB dev** (`validate.db`, kondisi: 10 BookCopy `INV-000001..10`, `InventorySequence` kosong, 3 Book).

| # | Target | Hasil |
|---|--------|-------|
| 1 | InventorySequence kosong → allocator hasilkan `INV-000011` | **PASS** — BookCopy baru: `INV-000011`, `INV-000012`, `INV-000013` |
| 2 | Book berhasil dibuat | **PASS** — `DB_BOOKS` 3 → 5 (Laskar Pelangi, Atomic Habits) |
| 3 | BookCopy berhasil dibuat | **PASS** — `DB_COPIES` 10 → 13 (barcode = inventoryNumber) |
| 4 | Tidak ada P2002 | **PASS** — `MATCHING_ERRORS=[]`, `MATCHED_ROWS[].issues=[]` |
| 5 | Import selesai | **PASS** — pipeline menyelesaikan seluruh baris tanpa throw |
| 6 | Data muncul di Menu Buku | **PASS** — Menu Buku membaca `book_copies`/`Book` dari `prisma/aplibrary.db` yang sama; `findMany` menemukan 5 Book + 13 Copy |
| 7 | Build PASS | **PASS** — `npm run build` exit 0 (main 1,750.95 kB · preload 6.68 kB · renderer 894.05 kB) |
| 8 | Lint PASS | **PASS** — `npm run lint` (tsc node + web `--noEmit`) exit 0 |

Bukti sequence setelah import (`validate.db`):

```
SEQ=[{"id":"default","prefix":"INV","lastNumber":13,...}]
COPY_INVENTORY_NUMBERS=["INV-000001",...,"INV-000010","INV-000011","INV-000012","INV-000013"]
BOOK_COUNT=5
```

## 5. Regression

- Jalur normal dipertahankan: ketika `InventorySequence.lastNumber >= maxUsedNumber`, kode memakai `increment` (perilaku identik dengan versi lama). Hanya cabang `needsHealing` yang baru.
- Tidak ada perubahan API — `allocate(tx, count): Promise<string[]>` tetap, sehingga `book-import.service.ts:127` dan `book-copy.service.ts:120` tidak berubah.
- `npm run lint` PASS dan `npm run build` PASS (tidak ada error type/bundling).
- Implementasi hanya menyentuh 1 file; tidak ada refactor/arsitektur.

## 6. Build PASS

`npm run build` → exit 0. Output: main 1,750.95 kB · preload 6.68 kB · renderer 894.05 kB.

## 7. Lint PASS

`npm run lint` → exit 0 (`tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit`).

## 8. Rollback

- **Rollback source:** kembalikan `src/main/services/inventory-allocator.ts` ke versi sebelum WO-11-H (commit/working state sebelumnya). Karena hanya 1 file dan tanpa perubahan dependen, rollback aman & penuh.
- **Catatan DB:** WO-11-H **tidak** memerlukan migrasi DB (tidak ada perubahan schema). `InventorySequence` akan diisi otomatis saat alokasi berikutnya berjalan — tidak perlu backfill manual.
- **Risiko rollback:** tidak ada — tidak ada file lain yang bergantung pada perilaku baru selain alokasi nomor inventaris.

---

**Status: DONE — menunggu review Product Owner. BERHENTI.**
