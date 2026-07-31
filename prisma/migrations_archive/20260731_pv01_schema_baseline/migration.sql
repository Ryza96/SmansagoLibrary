-- REPAIR WO-PV-01 (BLOCKER-01)
-- Baseline reconciliation migration.
--
-- History migration lama TIDAK pernah menangkap perubahan skema berikut
-- (perubahan dilakukan via `prisma db push` di masa pengembangan):
--   - Model akademik baru      : AcademicYear, Curriculum, Class
--   - Model peminjaman baru    : Borrow, BorrowDetail
--   - Restrukturisasi Book     : BookAuthor dibuang, kolom authorId ditambahkan,
--                                kolom edition/language/pageCount/coverImage dihapus
--   - Restrukturisasi BookCopy : barcode & shelfLocation jadi NOT NULL,
--                                condition default 'GOOD', acquisitionPrice dihapus
--   - Restrukturisasi Member   : kolom nisn/nip/nuptk/nik/classId ditambahkan,
--                                kolom joinDate/validUntil/district/village/city/
--                                postalCode/notes dihapus, status default 'INACTIVE'
--   - Tabel legacy dibuang     : Borrowing, BorrowingItem, Return
--   - Berbagai index/unique index disesuaikan dengan schema.prisma.
--
-- Migration ini menyamakan skema hasil replay history lama (yang kosong/tidak
-- lengkap) menjadi skema final sesuai prisma/schema.prisma. Dengan demikian
-- `prisma migrate deploy` pada database kosong menghasilkan skema yang identik
-- dengan datamodel dan aplikasi berjalan normal di instalasi fresh.
--
-- Catatan pada database yang SUDAH berisi skema final (hasil db push):
-- migration ini direkam sebagai applied via `prisma migrate resolve --applied`
-- tanpa dieksekusi, karena skemanya sudah sesuai.
--
-- (dibuat otomatis dari `prisma migrate diff --from-migrations --to-schema-datamodel`)

-- DropIndex
DROP INDEX "Borrowing_borrowingNumber_idx";

-- DropIndex
DROP INDEX "Borrowing_status_idx";

-- DropIndex
DROP INDEX "Borrowing_memberId_idx";

-- DropIndex
DROP INDEX "Borrowing_borrowingNumber_key";

-- DropIndex
DROP INDEX "BorrowingItem_status_idx";

-- DropIndex
DROP INDEX "BorrowingItem_bookCopyId_idx";

-- DropIndex
DROP INDEX "BorrowingItem_borrowingId_idx";

-- DropIndex
DROP INDEX "Return_borrowingId_idx";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "BookAuthor";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Borrowing";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "BorrowingItem";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Return";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "AcademicYear" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Curriculum" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Class" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "academicYearId" TEXT NOT NULL,
    "curriculumId" TEXT NOT NULL,
    "educationLevel" TEXT NOT NULL,
    "parallel" TEXT NOT NULL,
    "homeroomTeacher" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Class_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Class_curriculumId_fkey" FOREIGN KEY ("curriculumId") REFERENCES "Curriculum" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Borrow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "borrowNumber" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "borrowDate" DATETIME NOT NULL,
    "dueDate" DATETIME NOT NULL,
    "returnDate" DATETIME,
    "notes" TEXT,
    "memberName" TEXT NOT NULL,
    "memberNumber" TEXT NOT NULL,
    "className" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Borrow_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BorrowDetail" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "borrowId" TEXT NOT NULL,
    "bookCopyId" TEXT NOT NULL,
    "returnedAt" DATETIME,
    "conditionBack" TEXT,
    "note" TEXT,
    "bookTitle" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BorrowDetail_borrowId_fkey" FOREIGN KEY ("borrowId") REFERENCES "Borrow" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BorrowDetail_bookCopyId_fkey" FOREIGN KEY ("bookCopyId") REFERENCES "BookCopy" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Book" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "isbn" TEXT,
    "title" TEXT NOT NULL,
    "authorId" TEXT,
    "publisherId" TEXT,
    "categoryId" TEXT,
    "publicationYear" INTEGER,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Book_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Author" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Book_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "Publisher" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Book_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Book" ("categoryId", "createdAt", "description", "id", "isbn", "publicationYear", "publisherId", "title", "updatedAt") SELECT "categoryId", "createdAt", "description", "id", "isbn", "publicationYear", "publisherId", "title", "updatedAt" FROM "Book";
DROP TABLE "Book";
ALTER TABLE "new_Book" RENAME TO "Book";
CREATE UNIQUE INDEX "Book_isbn_key" ON "Book"("isbn");
CREATE INDEX "Book_title_idx" ON "Book"("title");
CREATE INDEX "Book_isbn_idx" ON "Book"("isbn");
CREATE TABLE "new_BookCopy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bookId" TEXT NOT NULL,
    "inventoryNumber" TEXT NOT NULL,
    "barcode" TEXT NOT NULL,
    "condition" TEXT NOT NULL DEFAULT 'GOOD',
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "shelfLocation" TEXT NOT NULL,
    "acquisitionDate" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BookCopy_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_BookCopy" ("acquisitionDate", "barcode", "bookId", "condition", "createdAt", "id", "inventoryNumber", "notes", "shelfLocation", "status", "updatedAt") SELECT "acquisitionDate", "barcode", "bookId", "condition", "createdAt", "id", "inventoryNumber", "notes", "shelfLocation", "status", "updatedAt" FROM "BookCopy";
DROP TABLE "BookCopy";
ALTER TABLE "new_BookCopy" RENAME TO "BookCopy";
CREATE UNIQUE INDEX "BookCopy_inventoryNumber_key" ON "BookCopy"("inventoryNumber");
CREATE UNIQUE INDEX "BookCopy_barcode_key" ON "BookCopy"("barcode");
CREATE INDEX "BookCopy_status_idx" ON "BookCopy"("status");
CREATE INDEX "BookCopy_shelfLocation_idx" ON "BookCopy"("shelfLocation");
CREATE TABLE "new_Member" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" TEXT NOT NULL,
    "memberType" TEXT,
    "fullName" TEXT NOT NULL,
    "gender" TEXT,
    "nisn" TEXT,
    "nip" TEXT,
    "nuptk" TEXT,
    "nik" TEXT,
    "birthplace" TEXT,
    "birthDate" DATETIME,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "classId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'INACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Member_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Member" ("address", "birthDate", "birthplace", "createdAt", "email", "fullName", "gender", "id", "memberType", "number", "phone", "status", "updatedAt") SELECT "address", "birthDate", "birthplace", "createdAt", "email", "fullName", "gender", "id", "memberType", "number", "phone", "status", "updatedAt" FROM "Member";
DROP TABLE "Member";
ALTER TABLE "new_Member" RENAME TO "Member";
CREATE UNIQUE INDEX "Member_number_key" ON "Member"("number");
CREATE UNIQUE INDEX "Member_nisn_key" ON "Member"("nisn");
CREATE UNIQUE INDEX "Member_nip_key" ON "Member"("nip");
CREATE UNIQUE INDEX "Member_nuptk_key" ON "Member"("nuptk");
CREATE UNIQUE INDEX "Member_nik_key" ON "Member"("nik");
CREATE INDEX "Member_fullName_idx" ON "Member"("fullName");
CREATE INDEX "Member_status_idx" ON "Member"("status");
CREATE INDEX "Member_classId_idx" ON "Member"("classId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "AcademicYear_name_key" ON "AcademicYear"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Curriculum_name_key" ON "Curriculum"("name");

-- CreateIndex
CREATE INDEX "Class_academicYearId_idx" ON "Class"("academicYearId");

-- CreateIndex
CREATE INDEX "Class_curriculumId_idx" ON "Class"("curriculumId");

-- CreateIndex
CREATE UNIQUE INDEX "Class_academicYearId_curriculumId_educationLevel_parallel_key" ON "Class"("academicYearId", "curriculumId", "educationLevel", "parallel");

-- CreateIndex
CREATE UNIQUE INDEX "Borrow_borrowNumber_key" ON "Borrow"("borrowNumber");

-- CreateIndex
CREATE INDEX "Borrow_memberId_idx" ON "Borrow"("memberId");

-- CreateIndex
CREATE INDEX "Borrow_borrowNumber_idx" ON "Borrow"("borrowNumber");

-- CreateIndex
CREATE INDEX "BorrowDetail_borrowId_idx" ON "BorrowDetail"("borrowId");

-- CreateIndex
CREATE INDEX "BorrowDetail_bookCopyId_idx" ON "BorrowDetail"("bookCopyId");

-- CreateIndex
CREATE UNIQUE INDEX "Author_name_key" ON "Author"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Publisher_name_key" ON "Publisher"("name");
