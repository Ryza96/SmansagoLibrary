-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "gender" TEXT,
    "birthplace" TEXT,
    "birthDate" DATETIME,
    "phone" TEXT,
    "email" TEXT,
    "memberType" TEXT,
    "joinDate" DATETIME,
    "validUntil" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'inactive',
    "address" TEXT,
    "district" TEXT,
    "village" TEXT,
    "city" TEXT,
    "postalCode" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Borrowing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "borrowingNumber" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "borrowDate" DATETIME NOT NULL,
    "dueDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "totalItems" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Borrowing_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BorrowingItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "borrowingId" TEXT NOT NULL,
    "bookCopyId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'BORROWED',
    "returnedAt" DATETIME,
    "condition" TEXT,
    "fine" REAL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BorrowingItem_borrowingId_fkey" FOREIGN KEY ("borrowingId") REFERENCES "Borrowing" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BorrowingItem_bookCopyId_fkey" FOREIGN KEY ("bookCopyId") REFERENCES "BookCopy" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Return" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "borrowingId" TEXT NOT NULL,
    "returnDate" DATETIME NOT NULL,
    "processedBy" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Return_borrowingId_fkey" FOREIGN KEY ("borrowingId") REFERENCES "Borrowing" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Member_number_key" ON "Member"("number");

-- CreateIndex
CREATE INDEX "Member_fullName_idx" ON "Member"("fullName");

-- CreateIndex
CREATE INDEX "Member_status_idx" ON "Member"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Borrowing_borrowingNumber_key" ON "Borrowing"("borrowingNumber");

-- CreateIndex
CREATE INDEX "Borrowing_memberId_idx" ON "Borrowing"("memberId");

-- CreateIndex
CREATE INDEX "Borrowing_status_idx" ON "Borrowing"("status");

-- CreateIndex
CREATE INDEX "Borrowing_borrowingNumber_idx" ON "Borrowing"("borrowingNumber");

-- CreateIndex
CREATE INDEX "BorrowingItem_borrowingId_idx" ON "BorrowingItem"("borrowingId");

-- CreateIndex
CREATE INDEX "BorrowingItem_bookCopyId_idx" ON "BorrowingItem"("bookCopyId");

-- CreateIndex
CREATE INDEX "BorrowingItem_status_idx" ON "BorrowingItem"("status");

-- CreateIndex
CREATE INDEX "Return_borrowingId_idx" ON "Return"("borrowingId");
