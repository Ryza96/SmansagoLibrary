# Sprint 1 — Laporan Implementasi Book Domain Foundation

**Project:** APLibrary (Aplikasi Perpustakaan Desktop)  
**Tanggal:** 29 Juli 2026  
**Status:** ✅ SELESAI

---

## 1. Ringkasan Implementasi

Sprint 1 berhasil mengimplementasikan domain model Book beserta seluruh entitas pendukung sesuai spesifikasi arsitektur v1.0 dari Principal Software Architect.

### Yang Diimplementasikan
- 6 Prisma models (Book, Author, BookAuthor, Publisher, Category, BookCopy)
- 1 TypeScript enum (BookCopyStatus)
- 5 Repository classes
- 5 Service classes
- 1 Prisma migration (book_domain)

### Yang Tidak Diimplementasikan (sesuai scope)
- UI — tidak disentuh
- CRUD endpoints — repository/service sudah siap, belum di-expose ke IPC
- Barcode, Scanner, Peminjaman, Pengembalian, Anggota, Dashboard — belum

---

## 2. Prisma Schema

```prisma
model Book {
  id              String     @id @default(uuid())
  title           String
  isbn            String?
  publisherId     String?
  categoryId      String?
  publicationYear Int?
  edition         String?
  language        String?
  pageCount       Int?
  description     String?
  coverImage      String?
  createdAt       DateTime   @default(now())
  updatedAt       DateTime   @updatedAt

  publisher  Publisher?  @relation(fields: [publisherId], references: [id])
  category   Category?   @relation(fields: [categoryId], references: [id])
  authors    BookAuthor[]
  bookCopies BookCopy[]
}

model Author {
  id        String      @id @default(uuid())
  name      String
  createdAt DateTime    @default(now())
  updatedAt DateTime    @updatedAt

  books BookAuthor[]
}

model BookAuthor {
  bookId   String
  authorId String

  book   Book   @relation(fields: [bookId], references: [id])
  author Author @relation(fields: [authorId], references: [id])

  @@id([bookId, authorId])
}

model Publisher {
  id        String   @id @default(uuid())
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  books Book[]
}

model Category {
  id          String   @id @default(uuid())
  name        String
  description String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  books Book[]
}

model BookCopy {
  id               String   @id @default(uuid())
  bookId           String
  inventoryNumber  String   @unique
  barcode          String?  @unique
  status           String   @default("AVAILABLE")
  acquisitionDate  DateTime?
  acquisitionPrice Float?
  notes            String?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  book Book @relation(fields: [bookId], references: [id])
}
```

### Catatan: Status sebagai String

Berdasarkan keputusan Product Owner dan Principal Software Architect, `status` menggunakan `String` (bukan Prisma enum) karena SQLite tidak mendukung enum di Prisma 5.22. TypeScript enum `BookCopyStatus` disediakan di `src/main/shared/book-copy-status.ts` untuk type safety:

```typescript
export const BookCopyStatus = {
  AVAILABLE: 'AVAILABLE',
  BORROWED: 'BORROWED',
  RESERVED: 'RESERVED',
  LOST: 'LOST',
  DAMAGED: 'DAMAGED',
  REPAIR: 'REPAIR',
  WITHDRAWN: 'WITHDRAWN',
} as const
```

---

## 3. Migration

Migration `20260729035613_book_domain` telah dibuat dan diaplikasikan.

Perubahan dari Sprint 0:
- `DROP TABLE Placeholder` — (model sementara dari Sprint 0)
- `CREATE TABLE Book` — 11 fields + FK ke Publisher dan Category
- `CREATE TABLE Author` — 2 fields
- `CREATE TABLE BookAuthor` — composite PK (bookId, authorId)
- `CREATE TABLE Publisher` — 2 fields
- `CREATE TABLE Category` — 3 fields
- `CREATE TABLE BookCopy` — 8 fields + FK ke Book + unique index (inventoryNumber, barcode)

---

## 4. Repository

Lokasi: `src/main/repositories/`

| Repository | Methods | Catatan |
|-----------|---------|---------|
| `BookRepository` | findAll, findById, create, update, delete | CRUD dasar |
| `AuthorRepository` | findAll, findById, create, update, delete | CRUD dasar |
| `PublisherRepository` | findAll, findById, create, update, delete | CRUD dasar |
| `CategoryRepository` | findAll, findById, create, update, delete | CRUD dasar |
| `BookCopyRepository` | findAll, findById, findByInventoryNumber, findByBarcode, create, update, delete | + lookup by inventory number & barcode |

Semua repository menggunakan Prisma generated types (`Prisma.BookCreateInput`, dll) — tidak ada type custom.

---

## 5. Service

Lokasi: `src/main/services/`

| Service | Methods | Catatan |
|---------|---------|---------|
| `BookService` | getAll, getById, create, update, delete | Delegasi ke repository |
| `AuthorService` | getAll, getById, create, update, delete | Delegasi ke repository |
| `PublisherService` | getAll, getById, create, update, delete | Delegasi ke repository |
| `CategoryService` | getAll, getById, create, update, delete | Delegasi ke repository |
| `BookCopyService` | getAll, getById, getByInventoryNumber, getByBarcode, create, update, delete | + lookup methods |

Belum ada business process logic — service hanya wrapper tipis sesuai spesifikasi.

---

## 6. Struktur Domain

```
┌──────────────┐     ┌───────────────────┐
│   Publisher   │     │     Category      │
│  (id, name)   │     │  (id, name, desc) │
└──────┬───────┘     └────────┬──────────┘
       │                      │
       └──────────┬───────────┘
                  │
         ┌───────▼────────┐
         │      Book       │──────────┐
         │  (bibliografi)  │          │
         └───────┬────────┘          │
                  │                   │
         ┌───────▼────────┐    ┌─────▼──────────┐
         │   BookAuthor    │    │   BookCopy      │
         │  (penghubung)   │    │  (eksemplar)    │
         └───────┬────────┘    └─────────────────┘
                  │
         ┌───────▼────────┐
         │     Author     │
         │  (id, name)    │
         └────────────────┘
```

### Relasi:
- **Book → Publisher**: Many-to-One (nullable)
- **Book → Category**: Many-to-One (nullable)
- **Book → BookAuthor**: One-to-Many
- **Author → BookAuthor**: One-to-Many
- **Book → BookCopy**: One-to-Many
- **BookAuthor**: Composite PK (bookId, authorId) — Many-to-Many

---

## 7. Hasil Validasi

| Langkah | Status | Keterangan |
|---------|--------|------------|
| `prisma format` | ✅ | Formatted |
| `prisma validate` | ✅ | Valid |
| `prisma migrate dev` | ✅ | Migration `20260729035613_book_domain` created & applied |
| `prisma generate` | ✅ | Prisma Client generated |
| `npm run build` | ✅ | main, preload, renderer built |
| `npm run lint` (tsc) | ✅ | No type errors |

---

## 8. Temuan

### Temuan 1: SQLite tidak mendukung Prisma enum
- **Deskripsi**: Spesifikasi meminta `enum BookCopyStatus` di Prisma schema, tetapi SQLite connector tidak mendukung enum di Prisma 5.22.0.
- **Resolusi**: Diputuskan oleh Product Owner (dengan persetujuan Principal Software Architect) untuk menggunakan `String` di Prisma schema + TypeScript enum `BookCopyStatus` di kode aplikasi.
- **Dampak**: Status tetap type-safe di kode TypeScript, namun disimpan sebagai string biasa di SQLite.

### Temuan 2: Repository & Service belum diintegrasikan ke IPC
- **Catatan**: Repository dan Service sudah siap, tetapi belum di-expose ke IPC handlers di `src/main/index.ts`. Ini sengaja ditunda — integrasi IPC dilakukan ketika fitur bisnis membutuhkannya di sprint berikutnya.

---

## 9. Catatan untuk Sprint Berikutnya

- **IPC Integration**: Service perlu di-register di IPC handlers agar bisa diakses dari renderer.
- **ISBN Validation**: Sprint 1 belum menerapkan validasi checksum ISBN — opsional di sprint mendatang.
- **Barcode Generation**: Masih `null` — akan diimplementasikan di sprint terpisah.
- **Inventory Number Generation**: Format `BK-000001` — generator nomor inventaris belum diimplementasikan.
- **Business Logic**: Service masih kosong — logic seperti validasi status, aturan peminjaman, dll akan diisi di sprint mendatang.

---

**Kesimpulan: Sprint 1 selesai. Domain Book siap dikembangkan di sprint berikutnya.**

*Laporan ini disusun oleh Project Engineer (OpenCode).*
