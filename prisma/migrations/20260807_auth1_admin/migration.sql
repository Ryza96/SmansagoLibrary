-- Auth context — identitas admin tunggal (RFC_AUTH_ARCHITECTURE.md §2).
-- Additive: tabel baru Admin, tanpa ALTER tabel eksisting.
-- Invariant "satu admin" dijaga di Service layer (SQLite tanpa partial unique).

-- CreateTable
CREATE TABLE "Admin" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "passwordChangedAt" DATETIME,
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Admin_username_key" ON "Admin"("username");

-- CreateIndex
CREATE INDEX "Admin_username_idx" ON "Admin"("username");
