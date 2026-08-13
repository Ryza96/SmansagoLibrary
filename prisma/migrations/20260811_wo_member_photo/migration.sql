-- WO MEMBER PHOTO — kolom photoPath untuk gambar/foto anggota.
-- Path relatif di dalam direktori aset (assets/member-photos/), bukan absolut.
-- Manual ALTER TABLE ADD COLUMN (data-preserving) — nilai opsional.
ALTER TABLE "Member" ADD COLUMN "photoPath" TEXT;
