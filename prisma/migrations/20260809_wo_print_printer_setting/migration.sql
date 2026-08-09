-- WO CETAK KARTU PEMINJAMAN — printer default untuk kartu peminjaman.
-- Manual ALTER TABLE ADD COLUMN (data-preserving) — nilai default '' artinya
-- "deteksi otomatis" (printer A6 heuristic → printer default sistem).
ALTER TABLE "Setting" ADD COLUMN "borrowCardPrinter" TEXT NOT NULL DEFAULT '';
