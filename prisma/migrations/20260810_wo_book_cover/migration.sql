-- WO SAM: SAMPUL BUKU — kolom coverImagePath untuk gambar sampul buku.
-- Path relatif di dalam direktori aset (assets/book-covers/), bukan absolut.
-- Manual ALTER TABLE ADD COLUMN (data-preserving) — nilai opsional.
ALTER TABLE "Book" ADD COLUMN "coverImagePath" TEXT;
