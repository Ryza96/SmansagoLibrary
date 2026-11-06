-- Peminjaman kolektif Fase 1: guru meminjam banyak eksemplar dalam satu transaksi.
-- Additive: kolom baru nullable/default, data lama otomatis menjadi INDIVIDUAL.

-- AlterTable
ALTER TABLE "Borrow" ADD COLUMN "borrowType" TEXT NOT NULL DEFAULT 'INDIVIDUAL';

-- AlterTable
ALTER TABLE "Borrow" ADD COLUMN "purpose" TEXT;

-- AlterTable
ALTER TABLE "Borrow" ADD COLUMN "collectiveClassId" TEXT CONSTRAINT "Borrow_collectiveClassId_fkey" REFERENCES "Class" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Borrow" ADD COLUMN "collectiveClassName" TEXT;

-- CreateIndex
CREATE INDEX "Borrow_borrowType_idx" ON "Borrow"("borrowType");
