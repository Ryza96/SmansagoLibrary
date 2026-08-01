# SPRINT10 — WO-2 Technical Debt Register (Revisi)
**Import Commit**

| ID | Item | Dampak | Rencana | Prioritas |
|----|------|--------|---------|-----------|
| TD-1 | Tidak ada **summary resmi hasil import** dari backend (`imports:match` mengembalikan `MatchedWorkbook` mentah; renderer dilarang menghitung) | UI hanya menampilkan "Import selesai." tanpa angka Buku/Eksemplar/Author/Publisher/Category yang dibuat | WO lanjutan: backend mengembalikan `ImportResult` terstruktur (count + failed rows + reason) sebagai kontrak IPC formal; renderer hanya render | Sedang |
| TD-2 | AutoCreateService membuat Author/Publisher/Category untuk baris yang nantinya GAGAL dibuat bukunya (alur `match → autoCreate → importBooks`) | Entitas yatim (tanpa buku) bisa masuk DB | Keputusan PO + WO tersendiri untuk reorder pipeline atau transaksi per baris | Sedang |
| TD-3 | Tidak ada proteksi "import ulang" (double submit) di sisi server | 2 klik cepat / invoke manual bisa menjalankan pipeline dua kali (ISBN duplikat per row dicegah via `bookImport.isbnDuplicate`, tapi entitas bisa dibuat dua kali jika nama beda) | Guard idempotency (session/request token) bila PO menginginkan import massal & concurrent | Rendah |
| TD-4 | Detail baris gagal (ambiguitas/ISBN duplikat/judul kosong) tidak tampil di UI | Pengguna tidak tahu baris mana yang gagal & kenapa | Tersedia bila backend menyediakan failed rows sebagai kontrak (lihat TD-1) | Sedang |
| TD-5 | Tidak ada smoke renderer (UI) otomatis untuk alur commit | Verifikasi = lint + build + review kode; perilaku UI (loading, pesan sukses/error) belum otomatis teruji | Framework UI test (Vitest + Testing Library / Playwright) bila diadopsi | Rendah |

## Catatan
- **Revisi PO menghapus TD lama** terkait `buildImportSummary`/messageKey di renderer (TD-2 & TD-5
  iterasi pertama) — utang tersebut **tidak lagi ada** karena komputasi dihapus.
- TD-1 sekarang mencatat gap utama: statistik hasil import memerlukan summary resmi dari backend
  (di luar scope WO-2 yang melarang perubahan backend & kontrak IPC baru).
- TD-2 (entitas yatim) adalah perilaku backend eksisting yang **sengaja tidak diubah**.
- WO-2 tidak menambah dependency baru dan tidak mengubah schema; `git status` menunjukkan hanya
  file WO-2 + laporan yang berubah (di atas working tree WO-BR-99/WO13 yang tidak disentuh).
