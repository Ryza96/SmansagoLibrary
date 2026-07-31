-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BookCopy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bookId" TEXT NOT NULL,
    "inventoryNumber" TEXT NOT NULL,
    "barcode" TEXT,
    "shelfLocation" TEXT,
    "condition" TEXT NOT NULL DEFAULT 'Baik',
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "acquisitionDate" DATETIME,
    "acquisitionPrice" REAL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BookCopy_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_BookCopy" ("acquisitionDate", "acquisitionPrice", "barcode", "bookId", "createdAt", "id", "inventoryNumber", "notes", "status", "updatedAt") SELECT "acquisitionDate", "acquisitionPrice", "barcode", "bookId", "createdAt", "id", "inventoryNumber", "notes", "status", "updatedAt" FROM "BookCopy";
DROP TABLE "BookCopy";
ALTER TABLE "new_BookCopy" RENAME TO "BookCopy";
CREATE UNIQUE INDEX "BookCopy_inventoryNumber_key" ON "BookCopy"("inventoryNumber");
CREATE UNIQUE INDEX "BookCopy_barcode_key" ON "BookCopy"("barcode");
CREATE INDEX "BookCopy_status_idx" ON "BookCopy"("status");
CREATE INDEX "BookCopy_shelfLocation_idx" ON "BookCopy"("shelfLocation");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
