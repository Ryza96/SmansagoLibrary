# Sprint 1.1 — Laporan Architecture Refinement

**Project:** APLibrary (Aplikasi Perpustakaan Desktop)  
**Tanggal:** 29 Juli 2026  
**Status:** ✅ SELESAI

---

## 1. Ringkasan Perubahan

7 refinement changes telah diimplementasikan sesuai spesifikasi:

| # | Perubahan | Tipe |
|---|-----------|------|
| 1 | Category.code (String, Required, Unique) | Schema + Migration |
| 2 | Indexes pada Book, Author, Publisher, Category, BookCopy | Schema + Migration |
| 3 | Dokumentasi format nomor inventaris di schema | Schema comment |
| 4 | Status tetap String (konfirmasi tidak ada enum Prisma) | Verifikasi |
| 5 | findAll() → findMany() di 5 Repository + 5 Service | Method rename |
| 6 | Validasi status BookCopy di create/update | Service logic |
| 7 | Dependency architecture (Renderer → IPC → Service → Repository → Prisma) | Verifikasi |

**Tidak ada perubahan** pada: model Book, Author, BookAuthor, Publisher, BookCopy selain index.

---

## 2. File yang Berubah

| File | Perubahan |
|------|-----------|
| `prisma/schema.prisma` | +Category.code (unique), +7 @@index, +inventory number comment |
| `prisma/migrations/20260729040204_add_category_code_and_indexes/migration.sql` | Migration baru |
| `src/main/repositories/book.repository.ts` | findAll → findMany |
| `src/main/repositories/author.repository.ts` | findAll → findMany |
| `src/main/repositories/publisher.repository.ts` | findAll → findMany |
| `src/main/repositories/category.repository.ts` | findAll → findMany |
| `src/main/repositories/book-copy.repository.ts` | findAll → findMany |
| `src/main/services/book.service.ts` | this.repository.findAll() → this.repository.findMany() |
| `src/main/services/author.service.ts` | this.repository.findAll() → this.repository.findMany() |
| `src/main/services/publisher.service.ts` | this.repository.findAll() → this.repository.findMany() |
| `src/main/services/category.service.ts` | this.repository.findAll() → this.repository.findMany() |
| `src/main/services/book-copy.service.ts` | findAll → findMany + validasi status |
| `src/main/shared/book-copy-status.ts` | Tidak berubah (sudah sesuai) |

---

## 3. Migration

**Nama:** `20260729040204_add_category_code_and_indexes`

Perubahan:
- `Category.code` — kolom baru, NOT NULL, UNIQUE
- Indexes baru:
  - `Book_title_idx`, `Book_isbn_idx`, `Book_publicationYear_idx`
  - `Author_name_idx`
  - `Publisher_name_idx`
  - `Category_name_idx`
  - `BookCopy_status_idx`

---

## 4. Detail Perubahan

### 4.1. Category.code
```prisma
model Category {
  id          String   @id @default(uuid())
  code        String   @unique    // NEW: required, unique
  name        String
  description String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

### 4.2. Indexes
```prisma
model Book      { @@index([title])  @@index([isbn])  @@index([publicationYear]) }
model Author    { @@index([name]) }
model Publisher { @@index([name]) }
model Category  { @@index([name]) }
model BookCopy  { @@index([status]) }
```

### 4.3. Inventory Number Comment
```prisma
// Format nomor inventaris: BK-000001, BK-000002, BK-000003 (6 digit, prefix BK-)
// Nomor bersifat: permanent, unique, never reused
```

### 4.4. Repository Naming
Semua method `findAll()` diubah menjadi `findMany()` di seluruh repository dan service untuk konsistensi dengan Prisma API.

### 4.5. Status Validation (BookCopyService)
```typescript
create(data: Prisma.BookCopyCreateInput) {
  if (data.status && !validStatuses.includes(data.status as any)) {
    throw new Error(`Invalid status: ${data.status}. Must be one of: ${validStatuses.join(', ')}`)
  }
  return this.repository.create(data)
}
```
Validasi menggunakan `Object.values(BookCopyStatus)` dari shared enum — tidak ada hardcode string.

---

## 5. Hasil Validasi

| Langkah | Status | Keterangan |
|---------|--------|------------|
| `prisma format` | ✅ | Formatted |
| `prisma validate` | ✅ | Valid |
| `prisma migrate dev` | ✅ | Migration applied |
| `prisma generate` | ✅ | Client generated |
| `npm run build` | ✅ | main + preload + renderer |
| `npm run lint` (tsc) | ✅ | No errors |

---

## 6. Temuan

Tidak ada temuan signifikan. Semua perubahan bersifat refinement sesuai spesifikasi.

### Catatan
- **Tidak ada enum Prisma** — status tetap String, type safety via shared/book-copy-status.ts ✅
- **Dependency architecture** sudah benar: Repository tidak dipanggil langsung oleh Renderer ✅
- **Category.code** bersifat required — migration akan gagal jika tabel Category sudah berisi data. Saat ini tabel masih kosong, sehingga aman.

---

**Kesimpulan: Sprint 1.1 selesai. Seluruh refinement telah diterapkan. Project siap untuk Sprint berikutnya.**

*Laporan ini disusun oleh Project Engineer (OpenCode).*
