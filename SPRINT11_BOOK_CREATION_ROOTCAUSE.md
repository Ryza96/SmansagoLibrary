# SPRINT11 — Book Creation Root Cause (CODE PATH ANALYSIS)

**Mode:** READ ONLY — tanpa perubahan kode, tanpa implementasi.
**Tanggal:** 01/08/2026
**Metode:** Code-path trace dari `electron/ipc/book-import.ipc.ts` → `BookImportService` → repository & transaction. Cross-check dengan bukti runtime headless (probe replikasi pipeline produksi, `SPRINT11_DATABASE_VERIFICATION.md`).

---

## 1. Execution Flow

### 1.1 Entry point import

**`electron/ipc/book-import.ipc.ts:64`** — `ipcMain.handle('imports:match', ...)`

```
ipcMain.handle('imports:match', async (_event, canonicalRows) => {
  const matchedWorkbook = await matchingEngine.match(toValidatedWorkbook(canonicalRows))   // :65  Matching
  await autoCreateService.apply(matchedWorkbook)                                            // :66  AutoCreate
  return bookImportService.importBooks(matchedWorkbook)                                     // :67  Book+BookCopy creation
})
```

| Langkah | Dipanggil? | Return | Throw | Early return |
|---------|-----------|--------|-------|--------------|
| `matchingEngine.match` | ✓ | ✓ `MatchedWorkbook` | ✗ | ✗ |
| `autoCreateService.apply` | ✓ | ✓ `MatchedWorkbook` | ✗ (P2002 internal di-recover) | ✗ |
| `bookImportService.importBooks` | ✓ | ✓ `MatchedWorkbook` (**selalu return, tidak pernah throw per-baris**) | ✗ | ✗ |

### 1.2 `BookImportService.importBooks` — `src/main/services/book-import.service.ts:24`

```
for (const row of workbook.matchedRows) {          // :27
  const rowErrors = await this.importRow(row)      // :28  → setiap baris diproses
  row.issues.push(...rowErrors)                    // :29
  errors.push(...rowErrors)                        // :30
}
workbook.matchingResult.errors.push(...errors)     // :33  → error DIKUMPULKAN, bukan throw
return workbook                                    // :34
```

**Loop selalu menyelesaikan semua baris.** Kegagalan per-baris disimpan ke `matchingResult.errors`, tidak pernah dilempar. Inilah mengapa UI selalu melihat "Import selesai."

### 1.3 `importRow` — `src/main/services/book-import.service.ts:37`

| Guard / langkah | Baris | Return? | Apa yang terjadi |
|-----------------|-------|---------|------------------|
| `match.status === 'AMBIGUOUS'` | :43–46 | ✓ early return | issue `bookImport.ambiguous` |
| title kosong | :48–51 | ✓ early return | issue `bookImport.titleMissing` |
| authorId/publisherId/categoryId missing | :54–60 | ✓ early return | issue `bookImport.entityMissing` |
| ISBN duplikat (`existsByISBN`) | :65–68 | ✓ early return | issue `bookImport.isbnDuplicate` |
| copyCount invalid | :70–77 | ✓ early return | issue `bookImport.copyCreateFailed` |
| **`createBookWithCopies(...)`** | :79–80 | → masuk 1.4 | try/catch |
| catch: P2002 + ISBN dup | :94–96 | — | issue `isbnDuplicate` |
| catch: lainnya | :97–99 | — | **issue `bookImport.createFailed`** |

Untuk template produksi (Laskar Pelangi, Atomic Habits): **tidak ada guard yang return**. Alur **MASUK** ke `createBookWithCopies` baris :80.

### 1.4 `createBookWithCopies` — `src/main/services/book-import.service.ts:105`

```
for (let attempt = 0; attempt < INVENTORY_CREATE_RETRIES; attempt++) {   // :123  INVENTORY_CREATE_RETRIES=3
  try {
    await runTransaction(getPrisma(), async (tx) => {                    // :125  TRANSACTION mulai
      const book = await bookRepository.createWithTx(tx, bookData)       // :126  ★ Book DIBUAT (di dalam tx)
      const inventoryNumbers = await inventoryAllocator.allocate(tx, copyCount)  // :127  ★ INV-000001 (kolisi!)
      await bookCopyRepository.createManyWithTx(tx, ...)                 // :128  ★ BookCopy INSERT → P2002 THROW
    })                                                                   // :140  TRANSACTION ROLLBACK
    return                                                               // :141
  } catch (error) {
    if (code === 'P2002' && attempt < RETRIES-1) continue                // :144  retry ulang (INV-000001 lagi)
    throw error                                                          // :147  setelah 3x gagal → THROW P2002
  }
}
```

**Detail penentuan langkah:**

| Baris | Dipanggil? | Return | Throw | Keterangan |
|-------|-----------|--------|-------|------------|
| :123 loop attempt=0..2 | ✓ | — | — | 3 percobaan |
| :125 `runTransaction` | ✓ | — | — | transaksi interaktif |
| :126 `bookRepository.createWithTx` | ✓ | ✓ `Book` | ✗ | **Book memang TERBUAT di dalam tx** |
| :127 `inventoryAllocator.allocate` | ✓ | ✓ `["INV-000001"]` | ✗ | sequence kosong → mulai dari 1 |
| :128 `bookCopyRepository.createManyWithTx` | ✓ | ✗ | **✓ P2002** | `Unique constraint failed on (inventoryNumber)` |
| :140 transaksi | — | — | — | **ROLLBACK** → Book dari :126 ikut dibatalkan |
| :144 catch P2002 | ✓ | continue | ✗ | retry, tapi allocator tetap INV-000001 |
| :147 throw | — | — | ✓ setelah attempt ke-2 | P2002 diteruskan ke `importRow` :93 |

---

## 2. Lokasi berhentinya alur

**Alur berhenti di `src/main/services/book-import.service.ts:128`:**

```ts
await this.bookCopyRepository.createManyWithTx(
  tx,
  inventoryNumbers.map((inventoryNumber) => ({          // inventoryNumbers = ["INV-000001"]
    bookId: book.id,
    inventoryNumber,                                    // ← INV-000001 SUDAH ADA di DB → P2002
    barcode: inventoryNumber,
    ...
  }))
)
```

Throw `P2002 Unique constraint failed on the fields: (inventoryNumber)` → transaksi `runTransaction` (:125–:140) **rollback** → Book yang dibuat di :126 ikut dibatalkan → catch :142 → retry 2× lagi dengan hasil sama → :147 throw → `importRow` :93 menangkap → :97 issue `bookImport.createFailed` → `matchingResult.errors` → UI "Import selesai."

**Satu arah tambahan yang mencegah perbaikan:** `InventoryAllocator.allocate` (`src/main/services/inventory-allocator.ts:8-27`) mengembalikan `INV-000001` karena `InventorySequence` kosong (`upsert` `create` `lastNumber=count`), sementara 10 `BookCopy` lama (`INV-000001..000010`) dibuat oleh jalur legacy yang **tidak pernah mengisi `InventorySequence`**. Rollback transaksi juga mem-rollback upsert sequence, jadi setiap retry tetap mengembalikan `INV-000001`.

---

## 3. Root Cause

### SATU BARIS KODE penyebab Book tidak pernah dibuat

**`src/main/services/book-import.service.ts:128`**

```ts
await this.bookCopyRepository.createManyWithTx(tx, /* inventoryNumber: INV-000001 */)
```

Book SEBENARNYA dibuat (baris :126), tetapi **dibatalkan oleh rollback** karena `createManyWithTx` di :128 **throw P2002** — `inventoryNumber` unik `INV-000001` sudah dipakai oleh 10 `BookCopy` yang ada di DB dev, dan `InventoryAllocator` mengalokasikan dari 1 lagi karena `InventorySequence` kosong.

**Rantai sebab-akibat:**
```
BookCopy lama: INV-000001..000010 ada di DB, InventorySequence KOSONG (legacy tidak update sequence)
        ↓
InventoryAllocator.upsert create lastNumber=count  (inventory-allocator.ts:9-19)
        ↓
allocate → INV-000001  (inventory-allocator.ts:21-25)
        ↓
bookCopy.createManyWithTx → P2002 (inventoryNumber @unique, schema.prisma:145)   ← book-import.service.ts:128
        ↓
runTransaction ROLLBACK → Book (:126) ikut hilang  (book-import.service.ts:125-140)
        ↓
catch → retry 2× (tetap INV-000001) → throw → issue createFailed (:97-99)
        ↓
UI "Import selesai." tanpa menampilkan matchingResult.errors
```

---

## 4. Mengapa Author berhasil tetapi Book gagal

Perbedaan **struktur transaksi** antara dua service:

| Aspek | AutoCreate (Author/Publisher/Category) | BookImport (Book + BookCopy) |
|-------|----------------------------------------|------------------------------|
| File | `src/main/services/auto-create.service.ts` | `src/main/services/book-import.service.ts` |
| Entry | `apply()` :29 → `applyRow()` :42 → `createEntity()` :87 | `importBooks()` :24 → `importRow()` :37 → `createBookWithCopies()` :105 |
| Insert | `authorRepository.create({name})` — **standalone, TANPA transaksi** (:111) | `book.createWithTx` + `bookCopy.createManyWithTx` — **dalam SATU transaksi** (:125-140) |
| Alokasi nomor | Tidak ada | Bergantung `InventoryAllocator` → kolisi `INV-000001` |
| Konstrain unik | `Author.name @unique` (:60), `Publisher.name @unique` (:71), `Category.code @unique` (:82) | `Book.isbn @unique` (:123), `BookCopy.inventoryNumber @unique` (:145), `barcode @unique` (:146) |
| Nama baru template | Andrea Hirata / James Clear / Bentang Pustaka / Pengembangan Diri — **belum ada** → `create` sukses & langsung commit | Laskar Pelangi / Atomic Habits — ISBN belum ada, **tapi transaksi gagal di langkah BookCopy** |
| P2002 | Di-recover: `recoverExisting()` (:100, :127-136) → lalu FOUND | Tidak dapat di-recover: retry selalu kolisi → throw → `createFailed` |
| Efek kegagalan | Standalone insert: berhasil / gagal terisolasi | **Kegagalan BookCopy menyeret Book (1 transaksi)** |

**Kesimpulan:** Author sukses karena insertnya **mandiri tanpa transaksi bersama BookCopy dan tanpa alokasi nomor inventaris**. Book gagal karena `book.create` dan `bookCopy.createMany` berada **di dalam `runTransaction` yang sama**; begitu `createMany` kena P2002, **seluruh transaksi rollback termasuk Book**.

---

## 5. Rencana perbaikan

(READ ONLY — tidak dieksekusi)

### Prioritas 1 — Data (fix segera, tanpa kode)
1. **Isi `InventorySequence`** di DB dev agar sejajar dengan `BookCopy` yang ada:
   `INSERT INTO InventorySequence (id, prefix, lastNumber, updatedAt) VALUES ('default','INV',10, now())`
   → allocator berlanjut dari `INV-000011`, tidak lagi kolisi.

### Prioritas 2 — Kode (ketahanan allocator)
2. **`InventoryAllocator.allocate`** (`src/main/services/inventory-allocator.ts`) sebaiknya menghitung angka awal dari **maksimum nomor inventaris yang terpakai** (fallback query `BookCopy`) bila `InventorySequence` kosong / out-of-sync, bukan `create lastNumber=count`. Ini mencegah regresi bila sequence hilang/di-reset.

### Prioritas 3 — UX / kontrak (blocker kepercayaan PO)
3. **`imports:match`** harus mengembalikan info jumlah sukses/gagal yang nyata, dan **`BookImportPreviewPage`** wajib menampilkan `matchingResult.errors`/`warnings` per-baris (jumlah dibuat vs gagal) alih-alih unconditional "Import selesai." (melanjutkan B1/B2 `SPRINT10_WO3_UAT_REPORT.md`).
4. **Unifikasi PrismaClient** (`electron/main/database.ts` vs `src/main/repositories/base/prisma.ts`) agar seluruh alur memakai satu instance (mitigasi drift).

---

## Lampiran — Bukti pendukung (READ ONLY)

- Replikasi headless pipeline produksi: `uat_wo11h/pipeline.probe.ts` → `MATCHING_ERRORS=[bookImport.createFailed, bookImport.createFailed]`; DB: books=3 (tetap), copies=10 (tetap), authors/publishers/categories bertambah.
- Instrumentasi transaksi: `uat_wo11h/instr.probe.ts` → `ATTEMPT 0 FAILED code=P2002 … Unique constraint failed on the fields: (inventoryNumber)`; `[tx] inv allocated=["INV-000001"]`.
- Isolasi langkah: `uat_wo11h/step.probe.ts` → `book.create` sukses, `bookCopy.createMany` P2002.
- Snapshot dev DB (`prisma/aplibrary.db`): `InventorySequence` kosong; 10 `BookCopy` `INV-000001..000010` (barcode `BC-…`).
- Laporan terkait: `SPRINT11_DATABASE_VERIFICATION.md` (verifikasi DB, §4.3 sama dengan temuan ini).

**Status: DONE — READ ONLY. BERHENTI.**
