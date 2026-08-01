# SPRINT 11 — WO-11-E: Design Review Multi BookCopy (READ ONLY — BELUM IMPLEMENTASI)

## Status
Design review arsitektur untuk fitur **Multi BookCopy** (Template v2 `copyCount` → N BookCopy per Book).
**READ ONLY.** Tidak ada kode/migration/schema yang diubah.

---

## 1. Rekomendasi Arsitektur

### Pertanyaan 1: for loop vs bulk create vs transaction vs kombinasi?

**Rekomendasi: KOMBINASI — satu transaction per Book + `createMany` + alokator atomik di awal.**

| Opsi | Kelebihan | Kekurangan |
|------|-----------|------------|
| **For loop biasa** | Sederhana; mudah debug | N query serial; tidak atomik; tanpa reservasi nomor → rawan duplicate di concurrent write; lambat (N roundtrip) |
| **Bulk create (`createMany`)** | 1 query untuk N row; cepat | Tidak atomik sendiri; tetap butuh nomor unik di-generate dulu; gagal di tengah → partial insert |
| **Transaction saja** | Atomik (all-or-nothing) | Tidak menyelesaikan masalah nomor unik; overhead per transaction jika per-copy |
| **Kombinasi (direkomendasikan)** | Atomik + 1 query bulk + nomor direservasi aman | Sedikit lebih kompleks |

**Desain final:**
```
$transaction(tx):
  1. allocator.allocate(tx, copyCount)   → reservasi N inventoryNumber kontigu
  2. bookCopy.createMany(data)           → insert N BookCopy sekaligus (barcode = inventoryNumber)
commit/rollback atomik
```

Pola ini **sudah terbukti** di codebase: `electron/main/services/book-copy.service.ts:executeAddCopiesTransaction` (transaction + `InventoryAllocator.allocate(tx, quantity)` + `createManyWithTx`) dan `src/main/repositories/borrow.repository.ts:createWithItems` (transaction multi-write). WO-11-E tinggal mengadopsi pola yang sama ke jalur import (`book-import.service.ts`).

### Pertanyaan 2: ATOMIC atau tidak?

**Rekomendasi: B — semua rollback (atomic per Book).**

- Alasan utama: **integritas data**. Jika Copy ke-7 dari 10 gagal, menyimpan 6 copy adalah state korup — user tidak pernah diberitahu "7 dari 10 berhasil", dan 6 copy itu tetap tersimpan selamanya tanpa penanda sebagian-gagal.
- **Semantik impor baris = 1 buku + N copy adalah SATU unit.** Baris valid → semua copy masuk; baris gagal → tidak ada yang masuk, error dilaporkan, baris ditandai invalid di `matchingResult.errors` (perilaku sudah ada di `BookImportService.importBooks`).
- Konsisten dengan pola `createWithItems` (borrow): detail borrow dibuat atomik bersama header.
- **Catatan:** atomik per **Book**, bukan per seluruh workbook. Satu baris gagal tidak boleh menggagalkan 500 baris lain — error dikumpulkan per baris (perilaku existing `importBooks`).
- **Bonus:** karena rollback, retry otomatis aman. Gagal karena P2002 (duplicate) → retry seluruh batch tanpa risiko double-insert.

### Pertanyaan 3: Inventory Number dibuat bagaimana?

**Rekomendasi: RESERVASI DI AWAL via `InventoryAllocator` (pola existing), BUKAN per-loop, BUKAN count()+1.**

Pola yang benar (sudah ada di `electron/main/services/inventory-allocator.ts`):
```
tx.inventorySequence.upsert({
  where: { id: 'default' },
  update: { lastNumber: { increment: count } }   // ATOMIK
})
startNumber = record.lastNumber - count + 1
→ generate [startNumber .. startNumber+count-1]
```

- **Risiko race `count()+1` (implementasi `book-import.service.ts` saat ini):** DUA proses/migration membaca `count()` yang sama → keduanya generate `INV-000001` → P2002. Implementasi saat ini memakai `count()+attempt+1` + retry yang **tidak aman** untuk concurrent write dan **menghasilkan nomor lompat/duplicate** bila ada copy lain dibuat di antara read & insert.
- `inventorySequence.upsert ... increment` adalah **operasi atomik** — dua pemanggil konkuren mendapatkan range yang berbeda (serialization di SQLite write lock).
- Tidak perlu memakai UUID untuk inventoryNumber: nilai yang terbaca manusia (`INV-000001`) adalah identitas operasional BookCopy (barcode, label, borrowing).

### Pertanyaan 4: Barcode

**Rekomendasi: TETAP MENGIKUTI INVENTORY NUMBER (`barcode = inventoryNumber`).**

- Keputusan WO-8 (#1): nilai barcode di DB = `inventoryNumber`; gambar barcode dirender saat cetak (Code128). Barcode terpisah menambah kompleksitas (generator unik kedua, label tak konsisten) tanpa nilai tambah.
- `BookCopy.barcode` adalah `@unique` — jika di-generate terpisah, perlu generator unik tambahan dan potensi collision baru.
- WO-11-E tidak mengubah keputusan ini.

### Pertanyaan 5: Limit `copyCount`?

**Rekomendasi: PERLUKAN LIMIT. Validasi: `1 ≤ copyCount ≤ 100`.**

- `0` / `-1` / `999999` tidak masuk akal operasional dan berbahaya (berpotensi mengalokasikan rentang nomor raksasa).
- Batas eksisting sudah ada: `book-copy.service.ts:64` → `1..100`. WO-11-E mengadopsi batas yang sama di jalur import.
- **Dua lapis:**
  1. **Validation Engine** (renderer/main): baris dengan `copyCount` di luar range → invalid row (IMP-013 style), dicegah sebelum pipeline.
  2. **Guard di pipeline** (`book-import.service.ts`): defense-in-depth — canonical row yang datang langsung via IPC (tanpa melewati validation, seperti smoke test) tetap di-clamp/reject.
- 10000 copy dalam satu baris → ditolak. User memecah menjadi beberapa baris/batch.

### Pertanyaan 6: Performance 500 buku × 20 copy = 10.000 BookCopy

**Rekomendasi: desain kombinasi (transaction + createMany) MASIH LAYAK.**

- Per Book: 1 transaction = 1 `upsert` alokator + 1 `createMany` (20 row). Total 500 transaction, bukan 10.000 insert terpisah.
- SQLite + Prisma `$transaction` (default interactive, serialized) menangani ini dengan nyaman; 10.000 row `createMany` terdistribusi per-Book (20/transaksi) = ringan.
- **Jika** semua 10.000 dibuat dalam SATU transaction: tetap OK di SQLite, tapi berisiko lock lebih lama; desain per-Book (500×20) lebih baik — **error isolation** + memory footprint kecil.
- Estimasi: << 10 detik di desktop single-user.

### Pertanyaan 7: Deadlock / duplicate / transaction issue?

- **Deadlock:** SQLite memakai write lock serial. `$transaction` interactive + `createMany` di dalamnya berpotensi deadlock **jika kita memakai `createMany` hasil `create()` per-row di loop dalam transaction yang sama** (nested write-lock). Karena kita pakai **1 `createMany`**, tidak ada nested — aman. Hindari memanggil `create` per-copy di dalam transaction yang sudah memegang lock (pola `book-copy.service.ts` legacy sudah benar).
- **Duplicate inventory:** dieliminasi oleh `inventorySequence.upsert increment` (atomik).
- **Duplicate barcode:** `barcode = inventoryNumber` → otomatis unik; `@unique` di DB sebagai pengaman terakhir.
- **Retry P2002:** karena atomic, retry di-level transaction aman (pola `executeAddCopiesTransaction` MAX_RETRIES=3).
- **Nested transaction:** `$transaction` tidak bisa di-nested. WO-11-E harus memakai `$transaction` TUNGGAL di `book-import.service.ts` — jangan panggil `createWithItems`/repo method ber-transaction lain dari dalamnya.

### Pertanyaan 8: Perubahan schema WAJIB sebelum Multi Copy?

**TIDAK ADA.**

- `BookCopy` sudah punya seluruh field operasional yang dipersist WO-11-D.
- `InventorySequence` sudah ada di schema (`prisma/schema.prisma:223`) — alokator sudah tersedia.
- Multi Copy murni perubahan logika `book-import.service.ts` + repository method, tanpa migration.

---

## 2. Risiko

| Risiko | Tingkat | Mitigasi |
|--------|---------|----------|
| Duplicate inventory (concurrent write) | Medium | `InventoryAllocator` atomik; retry P2002 |
| Partial insert (copy gagal di tengah) | Medium | Atomic per-Book transaction |
| Deadlock (nested write lock) | Rendah | Satu `$transaction` + `createMany` (bukan create per-row) |
| `copyCount` tidak masuk akal (0/-1/raksasa) | Tinggi | Validasi `1..100` dua lapis |
| Retry double-insert | Rendah | Rollback penuh → retry bersih |
| Perubahan perilaku `importBooks` | Rendah | Error per-baris tetap; hanya jumlah copy yang berubah |

---

## 3. Keputusan (Decision Log)

| # | Keputusan | Alasan |
|---|-----------|--------|
| D1 | **Kombinasi**: transaction + createMany + allocator | Atomik + cepat + nomor unik |
| D2 | **Atomic per Book** (semua rollback) | Integritas data; baris = 1 unit |
| D3 | **Reservasi di awal** via `inventorySequence.upsert increment` | Anti race; kontigu; pola existing |
| D4 | **Barcode = inventoryNumber** | Keputusan WO-8 dipertahankan |
| D5 | **Limit 1..100** | Konsisten dengan `book-copy.service.ts` |
| D6 | **Per-Book transaction** (bukan per-workbook) | Error isolation; performance |
| D7 | **TIDAK ADA perubahan schema** | Field + sequence sudah tersedia |
| D8 | Default `copyCount=1` untuk v1 (tanpa kolom) | Backward compat WO-11-C |

---

## 4. Diagram Alur

```
Template v2 (copyCount = 10)
         │
         ▼
ValidationEngine ──► copyCount valid? (1..100) ──NO──► row invalid (error per baris)
         │ YES
         ▼
MatchingEngine ──► entities (author/publisher/category) resolve
         │
         ▼
AutoCreate ──► buat entity yang belum ada
         │
         ▼
BookImportService.importBooks ──► per baris:
         │
         └── $transaction(tx):                      ◄── ATOMIK per Book
                ├─ bookRepository.create(tx, book)     1 Book
                ├─ allocator.allocate(tx, 10)          → INV-000xxx..INV-000yyy (kontigu, atomik)
                └─ bookCopyRepository.createMany(tx)   10 BookCopy (barcode = INV-000xxx)
         │
         ├─ sukses  ──► row valid, lanjut baris berikutnya
         └─ gagal   ──► rollback semua, row.error, lanjut baris berikutnya
```

---

## 5. Rencana Implementasi (WO-11-E — belum dieksekusi)

### File yang akan diubah
| File | Perubahan |
|------|-----------|
| `src/main/services/book-import.service.ts` | Ganti `createBookCopy()` per-copy loop → 1 `$transaction` + allocator + `createMany`; baca `copyCount` dari canonical (default 1); guard `1..100` |
| `src/main/services/inventory-allocator.ts` | **BARU** — port `electron/main/services/inventory-allocator.ts` ke stack baru (pakai `Prisma.TransactionClient`) |
| `src/main/repositories/book-copy.repository.ts` | Tambah `createManyWithTx(tx, data)` (pola legacy) |
| `src/main/repositories/base/transaction.ts` | `runTransaction` sudah ada — reuse |
| `src/services/ValidationEngineService.ts` | *(opsional, bila dalam scope)* tambah validasi range `copyCount 1..100` → row invalid |
| `wo11e/smoke.ts` | **BARU** — smoke: 10 copy → 10 BookCopy; barcode unik; rollback bila copy gagal; limit |

### Langkah
1. Buat `InventoryAllocator` baru di `src/main/services/`.
2. Tambah `createManyWithTx` di `BookCopyRepository`.
3. Refactor `importRow` → baca `copyCount` (default 1), buat Book + N copy dalam satu `$transaction` dengan `createMany`, retry P2002 (3x).
4. Guard `copyCount 1..100` di pipeline + (opsional) di validation engine.
5. Smoke: validasi multi-copy, rollback, barcode, limit, backward v1 (copyCount default 1).
6. Lint + Build PASS; report `SPRINT11_WO11E_IMPLEMENTATION_REPORT.md`.

### Di luar scope
- Perubahan schema/migration (TIDAK ADA yang dibutuhkan).
- Barcode terpisah, UUID inventoryNumber, perubahan template/validation preview.

---

**Status: DESIGN REVIEW SELESAI — READ ONLY. Menunggu persetujuan PO untuk implementasi.**
