-- CreateEnum

-- CreateTable
CREATE TABLE "Setting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "libraryName" TEXT NOT NULL DEFAULT 'APLibrary',
    "schoolName" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "website" TEXT NOT NULL DEFAULT '',
    "logoPath" TEXT NOT NULL DEFAULT '',
    "principalName" TEXT NOT NULL DEFAULT '',
    "principalNip" TEXT NOT NULL DEFAULT '',
    "librarianName" TEXT NOT NULL DEFAULT '',
    "librarianNip" TEXT NOT NULL DEFAULT '',
    "defaultBorrowDays" INTEGER NOT NULL DEFAULT 7,
    "maxBorrowBooks" INTEGER NOT NULL DEFAULT 5,
    "lateFee" INTEGER NOT NULL DEFAULT 1000,
    "allowRenewal" BOOLEAN NOT NULL DEFAULT true,
    "inventoryPrefix" TEXT NOT NULL DEFAULT 'INV',
    "defaultShelfLocation" TEXT NOT NULL DEFAULT '',
    "barcodeFormat" TEXT NOT NULL DEFAULT 'BC-XXXXXXXXXX',
    "reportPaperSize" TEXT NOT NULL DEFAULT 'A4',
    "reportDateFormat" TEXT NOT NULL DEFAULT 'DD/MM/YYYY',
    "reportSigner" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
