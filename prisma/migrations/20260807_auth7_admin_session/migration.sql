-- Auth context - session admin yang di-persist (RFC_AUTH_SESSION_PERSISTENCE.md, AUTH-7).
-- Opsi A: tabel SQLite agar session bertahan setelah restart aplikasi (TTL 24 jam absolute).
-- Additive: tabel baru AdminSession, tanpa ALTER tabel eksisting.
-- Single admin -> maksimal satu baris valid per admin (open() mengganti row lama).
-- logout menghapus baris; row yang expire di-prune (deleteExpired) saat login.

-- CreateTable
CREATE TABLE "AdminSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "AdminSession_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminSession_sessionId_key" ON "AdminSession"("sessionId");

-- CreateIndex
CREATE INDEX "AdminSession_adminId_idx" ON "AdminSession"("adminId");

-- CreateIndex
CREATE INDEX "AdminSession_expiresAt_idx" ON "AdminSession"("expiresAt");
