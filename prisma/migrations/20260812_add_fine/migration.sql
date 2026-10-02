-- Fine context — denda keterlambatan / kerusakan / kehilangan (LATE | HEAVY_DAMAGE | LOST).
-- Additive: tabel baru Fine, tanpa ALTER tabel eksisting.

-- CreateTable
CREATE TABLE "Fine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "borrowId" TEXT NOT NULL,
    "borrowDetailId" TEXT,
    "type" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "lateDays" INTEGER,
    "ratePerDay" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'UNPAID',
    "waivedReason" TEXT,
    "paidAt" DATETIME,
    "dedupeKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Fine_borrowId_fkey" FOREIGN KEY ("borrowId") REFERENCES "Borrow" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Fine_borrowDetailId_fkey" FOREIGN KEY ("borrowDetailId") REFERENCES "BorrowDetail" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Fine_dedupeKey_key" ON "Fine"("dedupeKey");

-- CreateIndex
CREATE INDEX "Fine_borrowId_idx" ON "Fine"("borrowId");

-- CreateIndex
CREATE INDEX "Fine_status_idx" ON "Fine"("status");
